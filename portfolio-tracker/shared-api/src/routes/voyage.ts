import { Router, Response } from 'express'
import { randomBytes } from 'crypto'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { cache } from '../lib/cache.js'
import { canAutoAccept } from './people.js'
import { isAdmin, pickUtm, backfillSignupSource, slugifyLabel, type UtmFields } from '../lib/leads.js'
import { checkQuota } from '../lib/entitlements.js'

const router = Router()

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// Cota trips_own (period 'live'): conta viagens PRÓPRIAS (user_id = userId).
// Viagens onde é membro convidado não contam. Usado por POST /trips e
// POST /from-moment (ambos criam um voyage_trips do próprio usuário).
async function checkOwnTripsQuota(userId: string): Promise<{ ok: true } | { ok: false; status: number; payload: any }> {
  const { count } = await supabaseAdmin
    .from('voyage_trips').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  const quota = await checkQuota(userId, 'trips_own', count ?? 0)
  if (!quota.ok) return { ok: false, status: 403, payload: quota.payload }
  return { ok: true }
}

async function userDisplay(userId: string): Promise<{ name: string; email: string; avatar_url?: string }> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = data?.user?.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || data?.user?.email || userId
  return { name, email: data?.user?.email ?? '', avatar_url: meta.avatar_url }
}

// Quando alguém vira colaborador ATIVO de uma viagem, ele também deve virar
// colaborador ativo de qualquer Momento financeiro vinculado a ela (voyage_trip_moments)
// — sem isso o usuário precisa ser convidado DUAS vezes (viagem + momento) só pra poder
// atribuir uma despesa dividida à viagem, o que é confuso e foi pedido explicitamente
// pra ser unificado.
async function syncTripMemberToLinkedMoments(tripId: number, targetUserId: string, inviteEmail: string | null, role: string) {
  const { data: links } = await supabaseAdmin.from('voyage_trip_moments').select('moment_id').eq('trip_id', tripId)
  const momentIds = (links ?? []).map((l: any) => l.moment_id as number)
  if (momentIds.length === 0) return

  for (const momentId of momentIds) {
    const { data: moment } = await supabaseAdmin.from('finance_moments').select('user_id').eq('id', momentId).single()
    if (!moment || moment.user_id === targetUserId) continue // já é o dono do momento

    const { data: existing } = await supabaseAdmin
      .from('finance_moment_members').select('id, status').eq('moment_id', momentId).eq('user_id', targetUserId).maybeSingle()
    if (existing) {
      if (existing.status !== 'active') {
        await supabaseAdmin.from('finance_moment_members')
          .update({ status: 'active', joined_at: new Date().toISOString() }).eq('id', existing.id)
      }
      continue
    }

    await supabaseAdmin.from('finance_moment_members').insert({
      moment_id: momentId,
      user_id: targetUserId,
      invite_email: inviteEmail,
      role: role === 'viewer' ? 'viewer' : 'editor',
      status: 'active',
      joined_at: new Date().toISOString(),
    })
  }
}

// Direção inversa da anterior: quando um Momento é vinculado a uma viagem que JÁ tem
// colaboradores ativos (attach-moment / create-moment), esses colaboradores devem
// entrar no Momento também — senão só quem entrar na viagem DEPOIS do vínculo ganha
// acesso automático ao Momento, o que é inconsistente.
async function syncAllTripMembersToLinkedMoments(tripId: number) {
  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('user_id').eq('id', tripId).single()
  const { data: tripMembers } = await supabaseAdmin
    .from('voyage_trip_members').select('user_id, invite_email, role').eq('trip_id', tripId).eq('status', 'active')
  for (const tm of tripMembers ?? []) {
    if (!tm.user_id || tm.user_id === trip?.user_id) continue
    await syncTripMemberToLinkedMoments(tripId, tm.user_id, tm.invite_email, tm.role)
  }
}

// ── Cost helper ────────────────────────────────────────────────────────────────
// Filtro de compartilhamento parcial aplicado nas visões EXTERNAS (link
// público, gate e comunidade — todas via buildPublicTripPayload): categorias e
// transações ocultas saem dos agregados E dos totais (senão o valor vazaria
// pelo total), e lugares com shared=false saem do breakdown por lugar.
// Membros da viagem nunca passam por aqui — continuam vendo tudo.
export interface ShareFilter {
  hiddenCategoryIds: number[]
  hiddenTransactionIds: number[]
  sharedPlacesOnly: boolean
}

function isTxHidden(tx: { id: number; category_id: number | null }, filter?: ShareFilter): boolean {
  if (!filter) return false
  if (filter.hiddenTransactionIds.includes(tx.id)) return true
  if (tx.category_id != null && filter.hiddenCategoryIds.includes(tx.category_id)) return true
  return false
}

// Agrega custo de todos os momentos vinculados à viagem.
// Retorna total + breakdown por usuário (split-ready para V2).
export async function buildCostSummary(tripId: number, requestingUserId: string, shareFilter?: ShareFilter) {
  // Busca os momentos vinculados (service_role — valida membership via código)
  const { data: tripMoments } = await supabaseAdmin
    .from('voyage_trip_moments')
    .select('moment_id, user_id')
    .eq('trip_id', tripId)

  if (!tripMoments || tripMoments.length === 0) {
    return { total: 0, budget: null, currency: 'EUR', moments: [], by_user: [], by_category: [], by_place: await buildByPlace(tripId, shareFilter) }
  }

  const momentIds = tripMoments.map(m => m.moment_id)

  // Busca os momentos para nome/ícone/budget
  const { data: moments } = await supabaseAdmin
    .from('finance_moments')
    .select('id, name, icon, color, budget, start_date, end_date')
    .in('id', momentIds)

  // Busca transações de todos os momentos (via tabela junction)
  const { data: txRows } = await supabaseAdmin
    .from('finance_transaction_moments')
    .select('moment_id, finance_transactions(id, amount, currency, is_internal_transfer, exclude_from_stats, category_id)')
    .in('moment_id', momentIds)

  // Agrega por momento e por categoria
  const momentTotals: Record<number, number> = {}
  const categoryTotals: Record<number, number> = {}
  const currency = 'EUR'
  for (const row of txRows ?? []) {
    const tx = (row as any).finance_transactions
    if (!tx) continue
    if (tx.is_internal_transfer || tx.exclude_from_stats) continue
    if (isTxHidden(tx, shareFilter)) continue
    if (tx.amount >= 0) continue // só despesas (negativos)
    const mid = (row as any).moment_id
    momentTotals[mid] = (momentTotals[mid] ?? 0) + Math.abs(tx.amount)
    if (tx.category_id) {
      categoryTotals[tx.category_id] = (categoryTotals[tx.category_id] ?? 0) + Math.abs(tx.amount)
    }
  }

  // Busca nomes/ícones das categorias encontradas
  const catIds = Object.keys(categoryTotals).map(Number)
  const { data: categories } = catIds.length > 0
    ? await supabaseAdmin.from('finance_categories').select('id, name, name_key, icon, color').in('id', catIds)
    : { data: [] as any[] }

  // Agrupa por usuário para o split
  const byUser: Record<string, { user_id: string; total: number; moment_ids: number[] }> = {}
  for (const tm of tripMoments) {
    const total = momentTotals[tm.moment_id] ?? 0
    if (!byUser[tm.user_id]) byUser[tm.user_id] = { user_id: tm.user_id, total: 0, moment_ids: [] }
    byUser[tm.user_id].total += total
    byUser[tm.user_id].moment_ids.push(tm.moment_id)
  }

  // Total budget (soma dos momentos do usuário requisitante, se existir)
  const myMoments = tripMoments.filter(m => m.user_id === requestingUserId)
  const myMomentIds = myMoments.map(m => m.moment_id)
  const budgetTotal = (moments ?? [])
    .filter(m => myMomentIds.includes(m.id))
    .reduce((s, m) => s + (m.budget ?? 0), 0)

  const grandTotal = Object.values(byUser).reduce((s, u) => s + u.total, 0)
  const byUserEntries = Object.values(byUser)
  const displays = await Promise.all(byUserEntries.map(u => userDisplay(u.user_id)))

  const by_category = (categories ?? [])
    .map(c => ({ ...c, total: Math.round((categoryTotals[c.id] ?? 0) * 100) / 100 }))
    .sort((a: any, b: any) => b.total - a.total)

  return {
    total: Math.round(grandTotal * 100) / 100,
    budget: budgetTotal > 0 ? Math.round(budgetTotal * 100) / 100 : null,
    currency,
    by_category,
    by_place: await buildByPlace(tripId, shareFilter),
    moments: (moments ?? []).map(m => ({
      ...m,
      spent: Math.round((momentTotals[m.id] ?? 0) * 100) / 100,
    })),
    by_user: byUserEntries.map((u, i) => ({
      ...u,
      total: Math.round(u.total * 100) / 100,
      display: displays[i],
    })),
  }
}

// Totais leves para a LISTA de viagens — sem breakdown/by_place/userDisplay.
// Faz ~3 queries no total (não N×6), agregando todas as viagens de uma vez.
async function buildCostTotals(
  tripIds: number[],
  requestingUserId: string,
): Promise<Record<number, { total: number; budget: number | null }>> {
  const out: Record<number, { total: number; budget: number | null }> = {}
  for (const id of tripIds) out[id] = { total: 0, budget: null }
  if (tripIds.length === 0) return out

  // 1) Todos os vínculos momento↔viagem de uma vez
  const { data: tripMoments } = await supabaseAdmin
    .from('voyage_trip_moments')
    .select('trip_id, moment_id, user_id')
    .in('trip_id', tripIds)

  const links = tripMoments ?? []
  const momentIds = [...new Set(links.map(m => m.moment_id))]
  if (momentIds.length === 0) return out

  // 2) Transações de todos os momentos de uma vez
  const { data: txRows } = await supabaseAdmin
    .from('finance_transaction_moments')
    .select('moment_id, finance_transactions(amount, is_internal_transfer, exclude_from_stats)')
    .in('moment_id', momentIds)

  const momentTotals: Record<number, number> = {}
  for (const row of (txRows ?? []) as any[]) {
    const tx = row.finance_transactions
    if (!tx || tx.is_internal_transfer || tx.exclude_from_stats) continue
    if (tx.amount >= 0) continue
    momentTotals[row.moment_id] = (momentTotals[row.moment_id] ?? 0) + Math.abs(tx.amount)
  }

  // 3) Budgets dos momentos do usuário requisitante de uma vez
  const myMomentIds = [...new Set(links.filter(l => l.user_id === requestingUserId).map(l => l.moment_id))]
  const { data: budgetRows } = myMomentIds.length > 0
    ? await supabaseAdmin.from('finance_moments').select('id, budget').in('id', myMomentIds)
    : { data: [] as any[] }
  const budgetByMoment: Record<number, number> = {}
  for (const b of (budgetRows ?? []) as any[]) budgetByMoment[b.id] = b.budget ?? 0

  for (const l of links) {
    out[l.trip_id].total += momentTotals[l.moment_id] ?? 0
    if (l.user_id === requestingUserId) {
      out[l.trip_id].budget = (out[l.trip_id].budget ?? 0) + (budgetByMoment[l.moment_id] ?? 0)
    }
  }
  for (const id of tripIds) {
    out[id].total = Math.round(out[id].total * 100) / 100
    out[id].budget = out[id].budget && out[id].budget! > 0 ? Math.round(out[id].budget! * 100) / 100 : null
  }
  return out
}

// ── Place-expense helpers ────────────────────────────────────────────────────
// Soma das despesas vinculadas a cada lugar da viagem.
// Modelo v1: apenas o dono da viagem cria vínculos, então não filtramos por user.
async function placeExpenseTotals(placeIds: number[], shareFilter?: ShareFilter): Promise<Record<number, { total: number; count: number }>> {
  const out: Record<number, { total: number; count: number }> = {}
  if (placeIds.length === 0) return out
  const { data } = await supabaseAdmin
    .from('voyage_place_expenses')
    .select('trip_place_id, finance_transactions(id, amount, category_id)')
    .in('trip_place_id', placeIds)
  for (const row of (data ?? []) as any[]) {
    const tx = row.finance_transactions
    if (!tx) continue
    // Visão externa: transação/categoria oculta não pode vazar pelo total do lugar
    if (isTxHidden(tx, shareFilter)) continue
    const pid = row.trip_place_id as number
    if (!out[pid]) out[pid] = { total: 0, count: 0 }
    out[pid].total += Math.abs(Number(tx.amount))
    out[pid].count += 1
  }
  for (const k of Object.keys(out)) out[Number(k)].total = Math.round(out[Number(k)].total * 100) / 100
  return out
}

// Breakdown por lugar para o CostCard (ordenado desc, só lugares com gasto).
async function buildByPlace(tripId: number, shareFilter?: ShareFilter): Promise<{ trip_place_id: number; name: string; total: number }[]> {
  let query = supabaseAdmin
    .from('voyage_trip_places').select('id, name').eq('trip_id', tripId)
  // Visão externa: lugar oculto sai do breakdown por lugar também
  if (shareFilter?.sharedPlacesOnly) query = query.eq('shared', true)
  const { data: places } = await query
  const placeIds = (places ?? []).map(p => p.id)
  const totals = await placeExpenseTotals(placeIds, shareFilter)
  return (places ?? [])
    .map(p => ({ trip_place_id: p.id, name: p.name, total: totals[p.id]?.total ?? 0 }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.total - a.total)
}

// Mescla expense_total/expense_count em uma lista de places (in-place, sem N+1).
async function attachPlaceExpenses<T extends { id: number }>(places: T[], shareFilter?: ShareFilter): Promise<(T & { expense_total: number; expense_count: number })[]> {
  const totals = await placeExpenseTotals(places.map(p => p.id), shareFilter)
  return places.map(p => ({
    ...p,
    expense_total: totals[p.id]?.total ?? 0,
    expense_count: totals[p.id]?.count ?? 0,
  }))
}

// ── Destinations (multi-destino / Eurotrip) ──────────────────────────────────
interface TripDestination {
  id: number
  trip_id: number
  city: string | null
  country: string | null
  day_start: number | null
  day_end: number | null
  sort_order: number
}

async function getDestinations(tripId: number): Promise<TripDestination[]> {
  const { data } = await supabaseAdmin
    .from('voyage_trip_destinations').select('*').eq('trip_id', tripId).order('sort_order')
  return data ?? []
}

// ── GET /api/voyage/trips/:id/destinations ───────────────────────────────────
router.get('/trips/:id/destinations', requireAuth, async (req, res: Response) => {
  res.json({ destinations: await getDestinations(Number(req.params.id)) })
})

// ── POST /api/voyage/trips/:id/destinations ──────────────────────────────────
router.post('/trips/:id/destinations', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const { city, country, day_start, day_end } = req.body as { city?: string; country?: string; day_start?: number; day_end?: number }

  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) { res.status(403).json({ error: 'Apenas o owner pode editar destinos' }); return }

  const { count } = await supabaseAdmin.from('voyage_trip_destinations').select('id', { count: 'exact', head: true }).eq('trip_id', tripId)

  const { data, error } = await supabaseAdmin.from('voyage_trip_destinations').insert({
    trip_id: tripId, city: city?.trim() || null, country: country?.trim() || null,
    day_start: day_start ?? null, day_end: day_end ?? null, sort_order: count ?? 0,
  }).select('*').single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ destination: data })
})

// ── PATCH /api/voyage/trips/:id/destinations/:destId ─────────────────────────
router.patch('/trips/:id/destinations/:destId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const destId = Number(req.params.destId)
  const { city, country, day_start, day_end } = req.body as { city?: string | null; country?: string | null; day_start?: number | null; day_end?: number | null }

  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) { res.status(403).json({ error: 'Apenas o owner pode editar destinos' }); return }

  const update: Record<string, unknown> = {}
  if (city !== undefined) update.city = city?.trim() || null
  if (country !== undefined) update.country = country?.trim() || null
  if (day_start !== undefined) update.day_start = day_start
  if (day_end !== undefined) update.day_end = day_end

  const { data, error } = await supabaseAdmin.from('voyage_trip_destinations')
    .update(update).eq('id', destId).eq('trip_id', tripId).select('*').single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ destination: data })
})

// ── DELETE /api/voyage/trips/:id/destinations/:destId ────────────────────────
router.delete('/trips/:id/destinations/:destId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const destId = Number(req.params.destId)

  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) { res.status(403).json({ error: 'Apenas o owner pode editar destinos' }); return }

  // Itens que apontavam pra esse destino voltam a inferir pelo dia (não ficam órfãos)
  await supabaseAdmin.from('voyage_trip_places').update({ destination_id: null }).eq('destination_id', destId)
  await supabaseAdmin.from('voyage_trip_destinations').delete().eq('id', destId).eq('trip_id', tripId)
  res.json({ ok: true })
})

// ── Cards de informações úteis (agência, transporte, passeio, hospedagem…) ───
// Membros da viagem veem todos (inclusive os ocultos do compartilhamento);
// só o dono cria/edita/exclui. As visões externas recebem só shared=true,
// com campos públicos (kind/title/body/phone/url) — sem id/sort interno.
interface TripInfoCard {
  id: number
  trip_id: number
  kind: string
  title: string
  body: string | null
  phone: string | null
  url: string | null
  shared: boolean
  sort_order: number
  icon_key: string | null
}

async function getInfoCards(tripId: number): Promise<TripInfoCard[]> {
  const { data } = await supabaseAdmin
    .from('voyage_trip_info_cards').select('*').eq('trip_id', tripId)
    .order('sort_order').order('created_at')
  return data ?? []
}

// Guarda comum do CRUD de cards: só o dono da viagem
async function requireTripOwner(tripId: number, userId: string, res: Response): Promise<boolean> {
  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return false }
  if (trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return false }
  return true
}

// ── POST /api/voyage/trips/:id/info-cards ─────────────────────────────────────
router.post('/trips/:id/info-cards', requireAuth, async (req, res: Response) => {
  const tripId = Number(req.params.id)
  if (!(await requireTripOwner(tripId, uid(req), res))) return

  const { kind, title, body, phone, url, shared, icon_key } = req.body as {
    kind?: string; title?: string; body?: string; phone?: string; url?: string; shared?: boolean; icon_key?: string | null
  }
  if (!title?.trim()) { res.status(400).json({ error: 'Título obrigatório' }); return }

  const { count } = await supabaseAdmin
    .from('voyage_trip_info_cards').select('id', { count: 'exact', head: true }).eq('trip_id', tripId)

  const { data, error } = await supabaseAdmin.from('voyage_trip_info_cards').insert({
    trip_id: tripId,
    kind: kind?.trim().slice(0, 40) || 'other',
    title: title.trim(),
    body: body?.trim() || null,
    phone: phone?.trim().slice(0, 40) || null,
    url: url?.trim().slice(0, 500) || null,
    shared: shared ?? true,
    sort_order: count ?? 0,
    // Só faz sentido pro tipo livre; o cliente decide e manda null nos pré-definidos
    icon_key: icon_key?.trim().slice(0, 40) || null,
  }).select('*').single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ card: data })
})

// ── PATCH /api/voyage/trips/:id/info-cards/:cardId ────────────────────────────
router.patch('/trips/:id/info-cards/:cardId', requireAuth, async (req, res: Response) => {
  const tripId = Number(req.params.id)
  const cardId = Number(req.params.cardId)
  if (!(await requireTripOwner(tripId, uid(req), res))) return

  const update: Record<string, unknown> = {}
  const b = req.body as Record<string, unknown>
  if ('kind'   in b) update.kind   = String(b.kind ?? '').trim().slice(0, 40) || 'other'
  if ('title'  in b) {
    const title = String(b.title ?? '').trim()
    if (!title) { res.status(400).json({ error: 'Título obrigatório' }); return }
    update.title = title
  }
  if ('body'   in b) update.body   = String(b.body ?? '').trim() || null
  if ('phone'  in b) update.phone  = String(b.phone ?? '').trim().slice(0, 40) || null
  if ('url'    in b) update.url    = String(b.url ?? '').trim().slice(0, 500) || null
  if ('shared' in b) update.shared = !!b.shared
  if ('sort_order' in b) update.sort_order = Number(b.sort_order) || 0
  // icon_key só faz sentido pro tipo livre; o cliente decide isso (envia null
  // nos 5 tipos pré-definidos) — o backend só persiste o que veio, sem inferir
  // a partir do texto de "kind" (que pode ser qualquer string customizada).
  if ('icon_key' in b) update.icon_key = String(b.icon_key ?? '').trim().slice(0, 40) || null
  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'No fields' }); return }

  const { data, error } = await supabaseAdmin
    .from('voyage_trip_info_cards').update(update)
    .eq('id', cardId).eq('trip_id', tripId).select('*').single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ card: data })
})

// ── DELETE /api/voyage/trips/:id/info-cards/:cardId ───────────────────────────
router.delete('/trips/:id/info-cards/:cardId', requireAuth, async (req, res: Response) => {
  const tripId = Number(req.params.id)
  if (!(await requireTripOwner(tripId, uid(req), res))) return
  await supabaseAdmin.from('voyage_trip_info_cards')
    .delete().eq('id', Number(req.params.cardId)).eq('trip_id', tripId)
  res.json({ ok: true })
})

// ── Pending trip invites (exported for notifications.ts) ─────────────────────
export interface PendingTripInvite {
  key: string
  trip_title: string
  inviter_name: string
  token: string
  occurred_at: string
}

export interface RecentTripAddition {
  key: string
  trip_id: number
  trip_title: string
  inviter_name: string
  occurred_at: string
}

// Membros adicionados direto (via @username ou e-mail já cadastrado) não passam
// por token/link — sem isso eles nunca saberiam que foram incluídos na viagem.
export async function getRecentTripAdditions(userId: string): Promise<RecentTripAddition[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('voyage_trip_members')
    .select('id, joined_at, voyage_trips(id, title, user_id)')
    .eq('user_id', userId).eq('status', 'active')
    .is('invite_token', null)
    .gte('joined_at', since)

  const result: RecentTripAddition[] = []
  for (const row of (data ?? []) as any[]) {
    const trip = row.voyage_trips
    if (!trip || trip.user_id === userId) continue
    const inviter = await userDisplay(trip.user_id)
    result.push({
      key: `trip_added:${row.id}`,
      trip_id: trip.id,
      trip_title: trip.title,
      inviter_name: inviter.name,
      occurred_at: row.joined_at,
    })
  }
  return result
}

export async function getPendingTripInvites(userId: string): Promise<PendingTripInvite[]> {
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  const nowIso = new Date().toISOString()
  const select = 'invite_token, created_at, voyage_trips(title, user_id)'

  const [byUser, byEmail] = await Promise.all([
    supabaseAdmin.from('voyage_trip_members').select(select)
      .eq('status', 'pending').eq('user_id', userId)
      .not('invite_token', 'is', null).gte('invite_expires_at', nowIso),
    email
      ? supabaseAdmin.from('voyage_trip_members').select(select)
          .eq('status', 'pending').eq('invite_email', email)
          .not('invite_token', 'is', null).gte('invite_expires_at', nowIso)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const seen = new Set<string>()
  const result: PendingTripInvite[] = []
  for (const row of [...(byUser.data ?? []), ...(byEmail.data ?? [])] as any[]) {
    const trip = row.voyage_trips
    if (!trip || seen.has(row.invite_token)) continue
    seen.add(row.invite_token)
    const inviter = await userDisplay(trip.user_id)
    result.push({
      key: `trip_invite:${row.invite_token}`,
      trip_title: trip.title,
      inviter_name: inviter.name,
      token: row.invite_token,
      occurred_at: row.created_at,
    })
  }
  return result
}

// ── GET /api/voyage/trips ─────────────────────────────────────────────────────
router.get('/trips', requireAuth, async (req, res: Response) => {
  const userId = uid(req)

  // Trips onde é owner
  const { data: ownedTrips } = await supabaseAdmin
    .from('voyage_trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // Trips onde é membro ativo/pending
  const { data: memberRows } = await supabaseAdmin
    .from('voyage_trip_members')
    .select('trip_id, role, status')
    .eq('user_id', userId)
    .in('status', ['active', 'pending'])

  const memberTripIds = (memberRows ?? []).map(m => m.trip_id)
  let memberTrips: any[] = []
  if (memberTripIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('voyage_trips')
      .select('*')
      .in('id', memberTripIds)
      .not('user_id', 'eq', userId)
    memberTrips = data ?? []
  }

  // Merge e dedup
  const all = [...(ownedTrips ?? []), ...memberTrips]
  const seen = new Set<number>()
  const trips = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Custo rápido (totais apenas, batched — ~3 queries no total, não N×6)
  const totals = await buildCostTotals(trips.map(t => t.id), userId)

  // Destinos de todas as viagens de uma vez (pro card da lista mostrar os
  // destinos atuais, não só o destino legado single).
  const { data: allDests } = trips.length > 0
    ? await supabaseAdmin.from('voyage_trip_destinations')
        .select('id, trip_id, city, country, day_start, day_end, sort_order')
        .in('trip_id', trips.map(t => t.id))
        .order('sort_order')
    : { data: [] as any[] }
  const destsByTrip: Record<number, any[]> = {}
  for (const d of allDests ?? []) (destsByTrip[d.trip_id] ??= []).push(d)

  const withCost = trips.map(t => ({
    ...t,
    cost_total: totals[t.id]?.total ?? 0,
    cost_budget: totals[t.id]?.budget ?? null,
    destinations: destsByTrip[t.id] ?? [],
  }))

  res.json({ trips: withCost })
})

// ── POST /api/voyage/trips ────────────────────────────────────────────────────
router.post('/trips', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { title, destination, country, cover_image_url, cover_image_position, start_date, end_date, summary, status, dest_lat, dest_lng, destinations } = req.body as {
    title: string; destination?: string; country?: string; cover_image_url?: string; cover_image_position?: string
    start_date?: string; end_date?: string; summary?: string; status?: string; dest_lat?: number; dest_lng?: number
    destinations?: { city?: string; country?: string; day_start?: number; day_end?: number }[]
  }

  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return }

  const quota = await checkOwnTripsQuota(userId)
  if (!quota.ok) { res.status(quota.status).json(quota.payload); return }

  // Compat: campo único destination/country mostrado em listas/cards reflete
  // o primeiro destino quando a viagem já nasce com vários (Eurotrip).
  const firstDest = destinations?.[0]

  const { data: trip, error } = await supabaseAdmin
    .from('voyage_trips')
    .insert({
      user_id: userId,
      title: title.trim(),
      destination: firstDest?.city ?? destination ?? null,
      country: firstDest?.country ?? country ?? null,
      dest_lat: dest_lat ?? null,
      dest_lng: dest_lng ?? null,
      cover_image_url: cover_image_url ?? null,
      cover_image_position: cover_image_position ?? '50% 50%',
      start_date: start_date ?? null,
      end_date: end_date ?? null,
      summary: summary ?? null,
      status: status ?? 'planning',
    })
    .select('*')
    .single()

  if (error || !trip) { res.status(500).json({ error: error?.message }); return }

  // Seed do owner como membro ativo
  await supabaseAdmin.from('voyage_trip_members').insert({
    trip_id: trip.id,
    user_id: userId,
    role: 'owner',
    status: 'active',
    joined_at: new Date().toISOString(),
  })

  if (destinations && destinations.length > 0) {
    await supabaseAdmin.from('voyage_trip_destinations').insert(
      destinations.map((d, i) => ({
        trip_id: trip.id, city: d.city?.trim() || null, country: d.country?.trim() || null,
        day_start: d.day_start ?? null, day_end: d.day_end ?? null, sort_order: i,
      }))
    )
  }

  res.status(201).json({ trip })
})

// ── GET /api/voyage/trips/:id ─────────────────────────────────────────────────
router.get('/trips/:id', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const { data: trip, error } = await supabaseAdmin
    .from('voyage_trips')
    .select('*')
    .eq('id', tripId)
    .single()

  if (error || !trip) { res.status(404).json({ error: 'Not found' }); return }

  // Valida acesso
  const isOwner = trip.user_id === userId
  if (!isOwner) {
    const { data: member } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('status')
      .eq('trip_id', tripId)
      .eq('user_id', userId)
      .in('status', ['active', 'pending'])
      .maybeSingle()
    if (!member) { res.status(403).json({ error: 'Forbidden' }); return }
  }

  const [cost, placesRes, membersRes, destinations, infoCards] = await Promise.all([
    buildCostSummary(tripId, userId),
    supabaseAdmin.from('voyage_trip_places').select('*').eq('trip_id', tripId).order('day_number', { ascending: true, nullsFirst: false }).order('sort_order'),
    supabaseAdmin.from('voyage_trip_members').select('id, user_id, invite_email, role, status, joined_at').eq('trip_id', tripId),
    getDestinations(tripId),
    getInfoCards(tripId),
  ])

  // Agrega gasto por lugar (dono sempre; membros só se show_place_expenses)
  const places = (isOwner || trip.show_place_expenses)
    ? await attachPlaceExpenses(placesRes.data ?? [])
    : (placesRes.data ?? [])

  res.json({ trip, cost, places, members: membersRes.data ?? [], destinations, info_cards: infoCards })
})

// ── PATCH /api/voyage/trips/:id ───────────────────────────────────────────────
router.patch('/trips/:id', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const allowed = ['title', 'destination', 'country', 'cover_image_url', 'cover_image_position',
                   'start_date', 'end_date', 'summary', 'status', 'show_place_expenses',
                   'dest_lat', 'dest_lng']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in req.body) update[k] = req.body[k] ?? null

  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'No fields' }); return }

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }

  const isOwner = trip.user_id === userId
  if (!isOwner) {
    const { data: member } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('id').eq('trip_id', tripId).eq('user_id', userId).eq('role', 'editor').eq('status', 'active').maybeSingle()
    if (!member) { res.status(403).json({ error: 'Sem permissão para editar esta viagem' }); return }
  }

  const { data, error } = await supabaseAdmin
    .from('voyage_trips')
    .update(update)
    .eq('id', tripId)
    .select('*')
    .single()

  if (error || !data) { res.status(404).json({ error: error?.message ?? 'Not found' }); return }
  res.json({ trip: data })
})

// ── DELETE /api/voyage/trips/:id ──────────────────────────────────────────────
router.delete('/trips/:id', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  await supabaseAdmin.from('voyage_trips').delete().eq('id', tripId).eq('user_id', userId)
  res.status(204).send()
})

// ── POST /api/voyage/trips/:id/moments  (vincular momento existente) ──────────
router.post('/trips/:id/moments', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const { moment_id } = req.body
  if (!moment_id) { res.status(400).json({ error: 'moment_id required' }); return }

  // Valida que o momento pertence ao usuário
  const { data: moment } = await supabaseAdmin
    .from('finance_moments').select('id').eq('id', moment_id).eq('user_id', userId).maybeSingle()
  if (!moment) { res.status(404).json({ error: 'Moment not found' }); return }

  await supabaseAdmin.from('voyage_trip_moments')
    .upsert({ trip_id: tripId, moment_id: Number(moment_id), user_id: userId }, { onConflict: 'trip_id,moment_id' })
  await syncAllTripMembersToLinkedMoments(tripId)

  const cost = await buildCostSummary(tripId, userId)
  res.json({ ok: true, cost })
})

// ── POST /api/voyage/trips/:id/create-moment  (criar + vincular) ──────────────
router.post('/trips/:id/create-moment', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  // Verifica acesso à viagem
  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('title, start_date, end_date').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Trip not found' }); return }

  const { name, icon, color, budget } = req.body

  const { data: moment, error } = await supabaseAdmin
    .from('finance_moments')
    .insert({
      user_id: userId,
      name: name ?? trip.title,
      icon: icon ?? '✈️',
      color: color ?? '#D63B2F',
      start_date: trip.start_date ?? null,
      end_date: trip.end_date ?? null,
      budget: budget ?? null,
    })
    .select('*')
    .single()

  if (error || !moment) { res.status(500).json({ error: error?.message }); return }

  await supabaseAdmin.from('voyage_trip_moments')
    .insert({ trip_id: tripId, moment_id: moment.id, user_id: userId })
  await syncAllTripMembersToLinkedMoments(tripId)

  const cost = await buildCostSummary(tripId, userId)
  res.status(201).json({ moment, cost })
})

// ── DELETE /api/voyage/trips/:id/moments/:momentId  (desvincular) ─────────────
router.delete('/trips/:id/moments/:momentId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const momentId = Number(req.params.momentId)

  await supabaseAdmin.from('voyage_trip_moments')
    .delete().eq('trip_id', tripId).eq('moment_id', momentId).eq('user_id', userId)

  const cost = await buildCostSummary(tripId, userId)
  res.json({ ok: true, cost })
})

// ── GET /api/voyage/trips/:id/transactions ────────────────────────────────────
// Lista todas as transações dos momentos vinculados à viagem — o CostCard só mostra
// agregados (por categoria/pessoa/lugar), sem visão das transações em si.
router.get('/trips/:id/transactions', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }
  const isOwner = trip.user_id === userId
  if (!isOwner) {
    const { data: member } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('status').eq('trip_id', tripId).eq('user_id', userId).in('status', ['active', 'pending']).maybeSingle()
    if (!member) { res.status(403).json({ error: 'Sem permissão' }); return }
  }

  const { data: tripMoments } = await supabaseAdmin
    .from('voyage_trip_moments').select('moment_id').eq('trip_id', tripId)
  const momentIds = (tripMoments ?? []).map(m => m.moment_id)
  if (momentIds.length === 0) { res.json({ transactions: [], reimbursement_groups: {} }); return }

  const { data: ftmRows } = await supabaseAdmin
    .from('finance_transaction_moments')
    .select('finance_transactions(id, date, description, amount, currency, notes, reimbursement_group_id, finance_categories(id, name, name_key, icon, color))')
    .in('moment_id', momentIds)

  const transactions = (ftmRows ?? [])
    .map((r: any) => r.finance_transactions)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : -1))

  const groupIds = [...new Set(transactions.map((tx: any) => tx.reimbursement_group_id).filter(Boolean))]
  const { data: groupRows } = groupIds.length > 0
    ? await supabaseAdmin.from('reimbursement_groups').select('id, name').in('id', groupIds)
    : { data: [] as { id: string; name: string }[] }
  const reimbursement_groups = Object.fromEntries((groupRows ?? []).map((g: any) => [g.id, g.name]))

  res.json({ transactions, reimbursement_groups })
})

// ── POST /api/voyage/from-moment/:momentId  (Fluxo B: momento → viagem) ───────
router.post('/from-moment/:momentId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const momentId = Number(req.params.momentId)

  const { data: moment } = await supabaseAdmin
    .from('finance_moments')
    .select('id, name, start_date, end_date, cover_image_url')
    .eq('id', momentId).eq('user_id', userId).maybeSingle()
  if (!moment) { res.status(404).json({ error: 'Moment not found' }); return }

  // Verifica se já existe uma viagem vinculada a este momento
  const { data: existing } = await supabaseAdmin
    .from('voyage_trip_moments')
    .select('trip_id')
    .eq('moment_id', momentId)
    .maybeSingle()
  if (existing) {
    const { data: existingTrip } = await supabaseAdmin
      .from('voyage_trips').select('*').eq('id', existing.trip_id).single()
    res.json({ trip: existingTrip, already_existed: true })
    return
  }

  // Só consome cota quando de fato cria uma viagem nova (o retorno acima reusa
  // a viagem já vinculada, sem criar nada).
  const quota = await checkOwnTripsQuota(userId)
  if (!quota.ok) { res.status(quota.status).json(quota.payload); return }

  // Cria nova viagem com dados do momento
  const { data: trip, error } = await supabaseAdmin
    .from('voyage_trips')
    .insert({
      user_id: userId,
      title: moment.name,
      cover_image_url: moment.cover_image_url ?? null,
      start_date: moment.start_date ?? null,
      end_date: moment.end_date ?? null,
      status: 'planning',
    })
    .select('*')
    .single()

  if (error || !trip) { res.status(500).json({ error: error?.message }); return }

  await Promise.all([
    supabaseAdmin.from('voyage_trip_members').insert({
      trip_id: trip.id, user_id: userId, role: 'owner', status: 'active', joined_at: new Date().toISOString(),
    }),
    supabaseAdmin.from('voyage_trip_moments').insert({
      trip_id: trip.id, moment_id: momentId, user_id: userId,
    }),
  ])

  // Direção momento→viagem: quem já colaborava no Momento entra direto na viagem
  // recém-criada também, mesma lógica unificada do lado viagem→momento.
  const { data: momentMembers } = await supabaseAdmin
    .from('finance_moment_members').select('user_id, invite_email, role').eq('moment_id', momentId).eq('status', 'active')
  for (const mm of momentMembers ?? []) {
    if (!mm.user_id || mm.user_id === userId) continue
    await supabaseAdmin.from('voyage_trip_members').insert({
      trip_id: trip.id, user_id: mm.user_id, invite_email: mm.invite_email,
      role: mm.role === 'viewer' ? 'viewer' : 'editor', status: 'active', joined_at: new Date().toISOString(),
    })
  }

  res.status(201).json({ trip, already_existed: false })
})

// ── GET /api/voyage/moments-for-picker  (reusar endpoint de finanças) ─────────
router.get('/moments-for-picker', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  // Same fix as /finances/moments-for-picker: include moments the user is an active
  // collaborator on, not just ones they own.
  const { data: memberRows } = await supabaseAdmin
    .from('finance_moment_members').select('moment_id').eq('user_id', userId).eq('status', 'active')
  const sharedIds = (memberRows ?? []).map(m => m.moment_id)
  const { data } = await supabaseAdmin
    .from('finance_moments')
    .select('id, name, icon, color, start_date, end_date, budget')
    .or(`user_id.eq.${userId}${sharedIds.length > 0 ? `,id.in.(${sharedIds.join(',')})` : ''}`)
    .order('created_at', { ascending: false })
  res.json({ moments: data ?? [] })
})

// ══════════════════════════════════════════════════════════════════════════════
// V3 — Lugares (biblioteca pessoal + trip places)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/voyage/places  (biblioteca do user; ?city=Lisboa) ────────────────
router.get('/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { city, q } = req.query as { city?: string; q?: string }

  let query = supabaseAdmin
    .from('voyage_places')
    .select('*')
    .eq('user_id', userId)
    .order('name')

  if (city) query = query.ilike('city', `%${city}%`)
  if (q)    query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ places: data ?? [] })
})

// ── POST /api/voyage/places  (adicionar lugar manualmente) ───────────────────
router.post('/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const body = req.body as {
    name: string; category?: string; lat?: number; lng?: number
    address?: string; city?: string; google_place_id?: string
    google_maps_url?: string; notes?: string
  }
  if (!body.name?.trim()) { res.status(400).json({ error: 'Nome obrigatório' }); return }

  const { data, error } = await supabaseAdmin
    .from('voyage_places')
    .insert({ ...body, user_id: userId, source: 'manual' })
    .select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ place: data })
})

// ── DELETE /api/voyage/places/:id  ───────────────────────────────────────────
router.delete('/places/:id', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const placeId = Number(req.params.id)

  // Itens de roteiro que referenciam esse lugar da biblioteca não são
  // apagados (library_place_id é ON DELETE SET NULL) — o item continua na
  // viagem com os dados já copiados, só perde o vínculo. Conta antes de
  // apagar pra avisar o usuário, que esperava ser perguntado sobre isso.
  const { count } = await supabaseAdmin
    .from('voyage_trip_places').select('id', { count: 'exact', head: true }).eq('library_place_id', placeId)

  await supabaseAdmin.from('voyage_places')
    .delete().eq('id', placeId).eq('user_id', userId)
  res.json({ ok: true, usedInTrips: count ?? 0 })
})

// Extrai cidade do endereço do Takeout sem network calls.
function cityFromAddress(address: string | null): string | null {
  if (!address) return null
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const candidate = parts[parts.length - 2]
  return candidate.replace(/^\d[\d\s-]*\s*/, '').trim() || null
}

// Extrai nome do lugar a partir de uma URL do Google Maps.
// Ex: https://www.google.com/maps/place/Curry+36/@52.5... → "Curry 36"
function nameFromMapsUrl(url: string | null): string | null {
  if (!url) return null
  const placeMatch = url.match(/\/maps\/place\/([^/@?]+)/)
  if (placeMatch) {
    const candidate = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim()
    // Descartar se parecer coordenada ou for vazio
    if (candidate && !/^[\d.,\-\s]+$/.test(candidate)) return candidate
  }
  const qMatch = url.match(/[?&]q=([^&]+)/)
  if (qMatch) {
    const candidate = decodeURIComponent(qMatch[1].replace(/\+/g, ' ')).trim()
    if (candidate && !/^[\d.,\-\s]+$/.test(candidate)) return candidate
  }
  return null
}

// Extrai nome e coordenadas de uma URL do Google Maps
function parseMapsUrl(url: string): { name: string | null; lat: number | null; lng: number | null } {
  let name: string | null = null
  let lat: number | null = null
  let lng: number | null = null
  try {
    const placeMatch = url.match(/\/maps\/place\/([^/@?]+)/)
    if (placeMatch) {
      const candidate = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim()
      if (candidate && !/^[\d.,\-\s]+$/.test(candidate)) name = candidate
    }
    // !3d<lat>!4d<lng> é o pino real do lugar (mais preciso que @ que é o centro do viewport)
    const pinMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    if (pinMatch) {
      lat = parseFloat(pinMatch[1]); lng = parseFloat(pinMatch[2])
    } else {
      const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (atMatch) { lat = parseFloat(atMatch[1]); lng = parseFloat(atMatch[2]) }
      else {
        // ?q=lat,lng  ou  ?ll=lat,lng  ou  /search/lat,lng
        const qll = url.match(/[?&](?:q|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/)
        if (qll) { lat = parseFloat(qll[1]); lng = parseFloat(qll[2]) }
      }
    }
    if (!name) {
      const qMatch = url.match(/[?&]q=([^&]+)/)
      if (qMatch) {
        const candidate = decodeURIComponent(qMatch[1].replace(/\+/g, ' ')).trim()
        if (candidate && !/^[\d.,\-\s]+$/.test(candidate)) name = candidate
      }
    }
  } catch {}
  return { name, lat, lng }
}

// Mapeia o tipo de estabelecimento do Google para a categoria (pasta) do Voyage.
// A string retornada casa com os ícones de categoria (emoji) usados no mapa/biblioteca.
function googleTypeToCategory(primaryType: string | undefined, types: string[] = []): string | null {
  // Um supermercado pode ter "bakery" entre os types secundários (padaria
  // interna) — sem priorizar o primaryType, isso fazia mercados grandes
  // caírem em "Padarias". Resolve pelo primaryType primeiro; só cai pra
  // varredura da lista completa (ordem de prioridade) se ele não bater
  // com nenhuma categoria conhecida.
  const order: [string, string[]][] = [
    ['Mercados', ['supermarket', 'grocery_store', 'grocery_or_supermarket', 'market']],
    ['Padarias', ['bakery']],
    ['Cafés', ['cafe', 'coffee_shop']],
    ['Bares', ['bar', 'night_club', 'pub', 'wine_bar']],
    // 'food' não entra aqui — é um tipo guarda-chuva do Google que aparece
    // em qualquer lugar que venda algo comestível (lojas de variedades,
    // postos de gasolina etc.), não é exclusivo de restaurante. Causava
    // lojas como "Action" (discount_store) caindo em Restaurantes.
    ['Restaurantes', ['restaurant', 'meal_takeaway', 'meal_delivery', 'fine_dining_restaurant']],
    ['Museus', ['museum', 'art_gallery']],
    ['Hotéis', ['lodging', 'hotel', 'resort_hotel', 'bed_and_breakfast', 'guest_house', 'hostel']],
    ['Aluguel de carro', ['car_rental']],
    ['Parques', ['park', 'national_park', 'state_park', 'garden', 'dog_park']],
    ['Compras', ['store', 'shopping_mall', 'clothing_store', 'department_store', 'shoe_store', 'book_store',
      'jewelry_store', 'discount_store', 'warehouse_store', 'general_store', 'variety_store', 'gift_shop',
      'pet_store', 'home_goods_store', 'electronics_store', 'furniture_store', 'hardware_store', 'convenience_store']],
    ['Praias', ['beach', 'natural_feature']],
    ['Pontos turísticos', ['tourist_attraction', 'landmark', 'historical_landmark', 'historical_place', 'point_of_interest']],
  ]
  if (primaryType) {
    const byPrimary = order.find(([, ks]) => ks.includes(primaryType))
    if (byPrimary) return byPrimary[0]
  }
  const all = [primaryType, ...types].filter(Boolean) as string[]
  const has = (...ks: string[]) => all.some(t => ks.includes(t))
  for (const [category, ks] of order) if (has(...ks)) return category
  return null
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Geocodifica um texto (nome/endereço) via Places API (New) Text Search.
// Retorna coordenadas + nome/endereço + categoria + horário de funcionamento.
async function geocodePlace(
  query: string,
  bias?: { lat: number; lng: number },
): Promise<{ lat: number; lng: number; name?: string; address?: string; city?: string | null; category?: string | null; opening_hours?: string[] | null; place_id?: string | null } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || !query.trim()) return null
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.primaryType,places.types,places.regularOpeningHours',
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        // Sem isso, uma rede com várias unidades (ex: "E.Leclerc") pode
        // casar com a unidade errada em qualquer lugar do mundo — já vimos
        // isso resolver pra uma loja na Reunião quando o pin original (vindo
        // da própria URL do Maps) estava na Europa continental. O bias não
        // restringe, só prioriza resultados perto do pin original.
        ...(bias && {
          locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 2000 } },
        }),
      }),
    })
    if (!r.ok) return null
    const data = await r.json() as any
    const p = data.places?.[0]
    if (!p?.location) return null
    // Sem isso, lugares importados por link nunca tinham "city" preenchido
    // (só o endereço completo), o que quebrava o filtro de destino na
    // biblioteca pra qualquer viagem com mais de um destino.
    const comps = p.addressComponents ?? []
    const city = comps.find((c: any) => (c.types ?? []).includes('locality'))?.longText
      ?? comps.find((c: any) => (c.types ?? []).includes('postal_town'))?.longText
      ?? comps.find((c: any) => (c.types ?? []).includes('administrative_area_level_2'))?.longText
      ?? null
    return {
      lat: p.location.latitude,
      lng: p.location.longitude,
      name: p.displayName?.text,
      address: p.formattedAddress,
      city,
      category: googleTypeToCategory(p.primaryType, p.types),
      opening_hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
      place_id: p.id ?? null,
    }
  } catch {
    return null
  }
}

// Geocodificação reversa (lat/lng → endereço) — usada como fallback quando um
// link do Google Maps não traz nome de estabelecimento (ex: pin solto numa
// casa/endereço residencial, sem ficha de negócio). Sem isso a importação
// rejeitava esses links; agora usa o endereço como nome provisório editável.
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`)
    if (!r.ok) return null
    const data = await r.json() as any
    return data.results?.[0]?.formatted_address ?? null
  } catch {
    return null
  }
}

// ── POST /api/voyage/places/from-url  (importar lugar por link do Google Maps) ─
router.post('/places/from-url', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { url, trip_id, destination_id } = req.body as { url: string; trip_id?: number; destination_id?: number | null }
  if (!url?.trim()) { res.status(400).json({ error: 'URL obrigatória' }); return }

  let resolvedUrl = url.trim()
  if (/goo\.gl|maps\.app\.goo\.gl/.test(resolvedUrl)) {
    try {
      const r = await fetch(resolvedUrl, { redirect: 'follow' })
      resolvedUrl = r.url
    } catch { /* mantém original */ }
  }

  let { name, lat, lng } = parseMapsUrl(resolvedUrl)
  let address: string | null = null
  let city: string | null = null
  let category: string | null = null
  let openingHours: string[] | null = null
  let isAddressFallback = false
  let placeId: string | null = null
  if (!name) {
    // No business name in the URL (common for a pin dropped on a house/
    // address with no listing) — fall back to the reverse-geocoded address
    // as a provisional name instead of rejecting the import outright. The
    // user can rename it afterward (PATCH .../places/:placeId now accepts name).
    if (lat != null && lng != null) name = await reverseGeocode(lat, lng)
    if (!name) {
      res.status(400).json({ error: 'Não foi possível extrair o nome ou endereço do lugar. Use a URL completa do Google Maps (google.com/maps/place/…).' })
      return
    }
    isAddressFallback = true
    address = name
  }

  // Enriquece via Places API: coordenadas (quando a URL não traz), nome/endereço
  // limpos, categoria (tipo do estabelecimento → pasta + emoji no mapa) e horário.
  // Pulado no fallback de endereço: já temos as coordenadas exatas do pin da
  // URL, e uma busca textual pelo endereço poderia trazer um ponto ligeiramente
  // diferente (ou nenhum resultado, por não ser um nome de estabelecimento).
  if (!isAddressFallback) {
    // Passa o pin original (já extraído da própria URL) como bias — sem
    // isso, nomes de rede (ex: "E.Leclerc") podiam casar com uma unidade
    // do outro lado do mundo. Só sobrescreve lat/lng com o resultado da
    // busca se ele cair perto do pin original; senão mantém o da URL.
    const geo = await geocodePlace(name, lat != null && lng != null ? { lat, lng } : undefined)
    // Se o resultado da busca cair longe do pin original, é provavelmente
    // outra unidade da mesma rede (ou outro lugar homônimo) — descartamos
    // o enriquecimento inteiro (nome/endereço/categoria/horário) em vez de
    // confiar parcialmente nele, e mantemos só o que veio da própria URL.
    const farFromOriginal = !!geo && lat != null && lng != null && geo.lat != null && geo.lng != null
      && haversineKm(lat, lng, geo.lat, geo.lng) > 5
    if (geo && !farFromOriginal) {
      if (geo.lat != null && geo.lng != null) { lat = geo.lat; lng = geo.lng }
      if (geo.name) name = geo.name
      if (geo.address) address = geo.address
      if (geo.city) city = geo.city
      if (geo.category) category = geo.category
      if (geo.opening_hours) openingHours = geo.opening_hours
      if (geo.place_id) placeId = geo.place_id
    }
  }

  // Fallback final pra city: se o geocode não trouxe (ou foi descartado por
  // cair longe do pin original), extrai do próprio endereço — sem isso o
  // filtro de destino na biblioteca ficava sem dado pra usar nesses casos.
  const finalCity = city ?? cityFromAddress(address)

  const insertData: Record<string, unknown> = {
    user_id: userId, name, source: 'manual', google_maps_url: resolvedUrl,
    ...(lat !== null && { lat }), ...(lng !== null && { lng }),
    ...(address && { address }),
    ...(finalCity && { city: finalCity }),
    ...(category && { category }),
    ...(openingHours && { opening_hours: openingHours }),
    ...(placeId && { google_place_id: placeId }),
  }

  // Dedupe primarily by google_place_id (stable regardless of which URL
  // format the user pasted — full link, shortened goo.gl, different zoom/
  // viewport params all resolve to the same place via the Places API), since
  // the google_maps_url-based upsert below only catches an exact repeat of
  // the same URL string, not "same real place, different link format".
  let place: { id: number; name: string; category: string | null; lat: number | null; lng: number | null; address: string | null; google_maps_url: string | null; opening_hours: string[] | null } | null = null
  if (placeId) {
    const { data: existing } = await supabaseAdmin
      .from('voyage_places').select('*')
      .eq('user_id', userId).eq('google_place_id', placeId).maybeSingle()
    if (existing) {
      const { data: updated } = await supabaseAdmin
        .from('voyage_places').update(insertData).eq('id', existing.id).select().single()
      place = updated ?? existing
    }
  }
  if (!place) {
    const { data: upserted, error } = await supabaseAdmin
      .from('voyage_places')
      .upsert(insertData, { onConflict: 'user_id,google_maps_url', ignoreDuplicates: false })
      .select().single()
    if (error || !upserted) { res.status(500).json({ error: error?.message ?? 'Erro ao salvar' }); return }
    place = upserted
  }
  if (!place) { res.status(500).json({ error: 'Erro ao salvar' }); return }

  let trip_place = null
  if (trip_id) {
    // Same google link/place pasted twice for the same trip — return the
    // existing itinerary entry instead of inserting a duplicate.
    const { data: existingTripPlace } = await supabaseAdmin
      .from('voyage_trip_places').select('*')
      .eq('trip_id', trip_id).eq('library_place_id', place.id).maybeSingle()
    if (existingTripPlace) {
      trip_place = existingTripPlace
    } else {
      const { count } = await supabaseAdmin
        .from('voyage_trip_places').select('sort_order', { count: 'exact', head: true }).eq('trip_id', trip_id)
      const { data: tp } = await supabaseAdmin
        .from('voyage_trip_places')
        .insert({
          trip_id, library_place_id: place.id, name: place.name,
          category: place.category, lat: place.lat, lng: place.lng, address: place.address,
          google_maps_url: place.google_maps_url, opening_hours: place.opening_hours,
          sort_order: (count ?? 0) + 1, added_by: userId, destination_id: destination_id ?? null,
        })
        .select().single()
      trip_place = tp
    }
  }

  res.json({ place, trip_place })
})

// ── POST /api/voyage/places/import-takeout  (importar JSON do Takeout) ────────
// Aceita um array de GeoJSON FeatureCollections (um por lista do Google Maps)
// Body: { files: [{ list_name: string, geojson: object }] }
router.post('/places/import-takeout', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { files } = req.body as {
    files: Array<{ list_name: string; geojson: any }>
  }

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'Nenhum arquivo enviado' }); return
  }

  const toInsert: any[] = []
  let skipped = 0

  for (const { list_name, geojson } of files) {
    const features: any[] = geojson?.features ?? []
    for (const f of features) {
      const props = f.properties ?? {}
      const loc   = props.Location ?? {}
      const geo   = loc['Geo Coordinates'] ?? {}
      const coords = f.geometry?.coordinates // GeoJSON: [lng, lat]

      const lat = geo.Latitude  ?? coords?.[1] ?? null
      const lng = geo.Longitude ?? coords?.[0] ?? null

      // Ignorar entradas sem coordenadas válidas
      if (!lat || !lng || (lat === 0 && lng === 0)) { skipped++; continue }

      // Nome: tenta todos os campos disponíveis, incluindo a URL do Maps
      const rawTitle = props.Title || props.title || props.name || props.Name
        || loc['Business Name'] || loc.name || null
      const isUrl = rawTitle && /^https?:\/\//i.test(rawTitle)
      const googleMapsUrl = props['Google Maps URL'] || props['google_maps_url'] || null
      const address = loc.Address || props.address || null
      const name = (!isUrl && rawTitle)
        || nameFromMapsUrl(googleMapsUrl)
        || (address ? address.split(',')[0].trim() : null)

      // Pular entradas sem nome identificável — são pins sem dados
      if (!name) { skipped++; continue }

      const city = cityFromAddress(address)

      toInsert.push({
        user_id: userId,
        name,
        category: list_name || null,
        lat,
        lng,
        address,
        city,
        google_maps_url: googleMapsUrl,
        source: 'takeout',
      })
    }
  }

  if (toInsert.length === 0) {
    res.status(400).json({ error: `Nenhum lugar com nome identificável encontrado. ${skipped} entradas puladas (sem nome, endereço ou URL).` }); return
  }

  // Upsert com google_maps_url quando disponível; insert direto quando não
  const withUrl    = toInsert.filter(p => p.google_maps_url)
  const withoutUrl = toInsert.filter(p => !p.google_maps_url)

  const [r1, r2] = await Promise.all([
    withUrl.length > 0
      ? supabaseAdmin.from('voyage_places')
          .upsert(withUrl, { onConflict: 'user_id,google_maps_url', ignoreDuplicates: true })
          .select()
      : Promise.resolve({ data: [] as any[], error: null }),
    withoutUrl.length > 0
      ? supabaseAdmin.from('voyage_places').insert(withoutUrl).select()
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  const error = r1.error || r2.error
  const data  = [...(r1.data ?? []), ...(r2.data ?? [])]

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ imported: (data ?? []).length, total_in_files: toInsert.length, skipped })
})

// ── DELETE /api/voyage/places/all  (apagar toda a biblioteca) ────────────────
router.delete('/places/all', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { error } = await supabaseAdmin
    .from('voyage_places').delete().eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── GET /api/voyage/map/places  (mapa geral — todas as viagens ou filtrada) ───
router.get('/map/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = req.query.trip_id ? Number(req.query.trip_id) : null

  const [ownedRes, memberRes] = await Promise.all([
    supabaseAdmin.from('voyage_trips').select('id, title, destination, show_place_expenses').eq('user_id', userId),
    supabaseAdmin.from('voyage_trip_members').select('trip_id').eq('user_id', userId).eq('status', 'active'),
  ])

  const ownedTrips = ownedRes.data ?? []
  const ownedTripIds = new Set(ownedTrips.map(t => t.id))
  const memberTripIds = (memberRes.data ?? []).map(m => m.trip_id)
  const allTripIds = [...new Set([...ownedTrips.map(t => t.id), ...memberTripIds])]

  if (allTripIds.length === 0) { res.json({ places: [], trips: [] }); return }

  const targetIds = (tripId && allTripIds.includes(tripId)) ? [tripId] : allTripIds

  const [placesRes, tripsRes] = await Promise.all([
    supabaseAdmin
      .from('voyage_trip_places')
      .select('id, name, category, address, lat, lng, google_maps_url, opening_hours, day_number, is_highlight, trip_note, trip_id')
      .in('trip_id', targetIds)
      .not('lat', 'is', null).not('lng', 'is', null),
    supabaseAdmin
      .from('voyage_trips')
      .select('id, title, destination, show_place_expenses')
      .in('id', allTripIds)
      .order('created_at', { ascending: false }),
  ])

  // Gasto por lugar: dono sempre; viagens de membro só se show_place_expenses
  const showExpenseTrips = new Set(
    (tripsRes.data ?? [])
      .filter(t => ownedTripIds.has(t.id) || t.show_place_expenses)
      .map(t => t.id)
  )
  const allPlaces = placesRes.data ?? []
  const visiblePlaces = allPlaces.filter(p => showExpenseTrips.has(p.trip_id))
  const withExpenses = await attachPlaceExpenses(visiblePlaces)
  const expenseById = new Map(withExpenses.map(p => [p.id, p]))
  const places = allPlaces.map(p => expenseById.get(p.id) ?? { ...p, expense_total: 0, expense_count: 0 })

  res.json({ places, trips: tripsRes.data ?? [] })
})

// ── GET /api/voyage/trips/:id/places  ────────────────────────────────────────
router.get('/trips/:id/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id, show_place_expenses').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }

  const isOwner = trip.user_id === userId
  const isMember = isOwner ||
    !!(await supabaseAdmin.from('voyage_trip_members')
      .select('id').eq('trip_id', tripId).eq('user_id', userId).eq('status', 'active').single()).data

  if (!isMember) { res.status(403).json({ error: 'Sem acesso' }); return }

  const { data } = await supabaseAdmin
    .from('voyage_trip_places')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order')

  const places = (isOwner || trip.show_place_expenses)
    ? await attachPlaceExpenses(data ?? [])
    : (data ?? [])

  res.json({ places })
})

// ── POST /api/voyage/trips/:id/places  (adicionar lugar à trip) ──────────────
router.post('/trips/:id/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const body = req.body as {
    library_place_id?: number; name: string; category?: string
    lat?: number; lng?: number; address?: string
    google_place_id?: string; google_maps_url?: string
    opening_hours?: string[] | null
    day_number?: number; is_highlight?: boolean
    kind?: 'place' | 'note' | 'transport'
    transport_mode?: string; transport_note?: string
    arrive_time?: string; depart_time?: string; trip_note?: string
    checkin_day?: number; checkout_day?: number
  }

  if (!body.name?.trim()) { res.status(400).json({ error: 'Nome obrigatório' }); return }

  // A library place can legitimately be visited more than once during a trip (e.g. the
  // same restaurant on two different days), so it's intentionally NOT deduplicated here —
  // each "Adicionar" creates its own itinerary entry (voyage_trip_places row) pointing at
  // the same library_place_id. Deduplication only applies to the place LIBRARY itself
  // (voyage_places), which is handled where places are searched/created, not here.

  const { data: existingPlaces } = await supabaseAdmin
    .from('voyage_trip_places').select('sort_order').eq('trip_id', tripId)
    .order('sort_order', { ascending: false }).limit(1)
  const nextOrder = ((existingPlaces?.[0]?.sort_order ?? -1) + 1)

  const { data, error } = await supabaseAdmin
    .from('voyage_trip_places')
    .insert({ ...body, trip_id: tripId, added_by: userId, sort_order: nextOrder })
    .select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ place: data })
})

// ── PATCH /api/voyage/trips/:id/places/:placeId  (marcar visitado, nota, etc) ─
router.patch('/trips/:id/places/:placeId', requireAuth, async (req, res: Response) => {
  const tripId = Number(req.params.id)
  const placeId = Number(req.params.placeId)
  const { visited, trip_note, day_number, is_highlight, rating, sort_order,
          arrive_time, depart_time, transport_mode, transport_note,
          name, checkin_day, checkout_day, destination_id, shared } = req.body

  const update: Record<string, unknown> = {}
  if (visited        !== undefined) update.visited        = visited
  if (trip_note      !== undefined) update.trip_note      = trip_note
  if (day_number     !== undefined) update.day_number     = day_number
  if (is_highlight   !== undefined) update.is_highlight   = is_highlight
  if (rating         !== undefined) update.rating         = rating
  if (sort_order     !== undefined) update.sort_order     = sort_order
  if (arrive_time    !== undefined) update.arrive_time    = arrive_time
  if (depart_time    !== undefined) update.depart_time    = depart_time
  if (transport_mode !== undefined) update.transport_mode = transport_mode
  if (transport_note !== undefined) update.transport_note = transport_note
  if (name           !== undefined) update.name           = name
  if (checkin_day    !== undefined) update.checkin_day    = checkin_day
  if (checkout_day   !== undefined) update.checkout_day   = checkout_day
  if (destination_id !== undefined) update.destination_id = destination_id
  if (shared         !== undefined) update.shared         = !!shared

  const { data, error } = await supabaseAdmin
    .from('voyage_trip_places')
    .update(update)
    .eq('id', placeId).eq('trip_id', tripId)
    .select().single()

  if (error) { res.status(500).json({ error: error.message }); return }

  // Renomear sincroniza com a biblioteca — o usuário esperava que o nome
  // não ficasse "preso" só nesta viagem, já que o lugar vem de lá.
  if (name !== undefined && data?.library_place_id) {
    await supabaseAdmin.from('voyage_places').update({ name }).eq('id', data.library_place_id)
  }

  res.json({ place: data })
})

// ── DELETE /api/voyage/trips/:id/places/:placeId  ────────────────────────────
router.delete('/trips/:id/places/:placeId', requireAuth, async (req, res: Response) => {
  const tripId = Number(req.params.id)
  const placeId = Number(req.params.placeId)
  await supabaseAdmin.from('voyage_trip_places')
    .delete().eq('id', placeId).eq('trip_id', tripId)
  res.json({ ok: true })
})

// ── Despesas por lugar ───────────────────────────────────────────────────────
// Modelo v1: apenas o dono da viagem gerencia os vínculos (fonte única de verdade).

// Enriquece transações com a categoria (name/icon/color).
async function enrichTxCategories(rows: any[]): Promise<any[]> {
  const catIds = [...new Set(rows.map(r => r.category_id).filter(Boolean))] as number[]
  const catMap = new Map<number, { name: string; icon: string; color: string }>()
  if (catIds.length > 0) {
    const { data: cats } = await supabaseAdmin
      .from('finance_categories').select('id, name, icon, color').in('id', catIds)
    for (const c of cats ?? []) catMap.set(c.id, { name: c.name, icon: c.icon, color: c.color })
  }
  return rows.map(r => ({
    id: r.id, transaction_id: r.id, date: r.date, amount: r.amount,
    currency: r.currency, description: r.description,
    category: r.category_id ? catMap.get(r.category_id) ?? null : null,
  }))
}

// GET — lista as despesas vinculadas a um lugar (dono apenas)
router.get('/trips/:id/places/:placeId/expenses', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const placeId = Number(req.params.placeId)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }
  if (trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }

  const { data: links } = await supabaseAdmin
    .from('voyage_place_expenses')
    .select('transaction_id, finance_transactions(id, date, amount, currency, description, category_id)')
    .eq('trip_place_id', placeId)

  const txRows = (links ?? []).map((l: any) => l.finance_transactions).filter(Boolean)
  const expenses = await enrichTxCategories(txRows)
  expenses.sort((a, b) => (a.date < b.date ? 1 : -1))
  const total = Math.round(expenses.reduce((s, e) => s + Math.abs(Number(e.amount)), 0) * 100) / 100

  res.json({ expenses, total })
})

// POST — vincula uma ou mais transações a um lugar (dono apenas)
router.post('/trips/:id/places/:placeId/expenses', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const placeId = Number(req.params.placeId)
  const ids: number[] = Array.isArray(req.body?.transaction_ids) ? req.body.transaction_ids.map(Number) : []
  if (ids.length === 0) { res.status(400).json({ error: 'transaction_ids obrigatório' }); return }

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }
  if (trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }

  // Valida que o lugar pertence à viagem
  const { data: place } = await supabaseAdmin
    .from('voyage_trip_places').select('id').eq('id', placeId).eq('trip_id', tripId).maybeSingle()
  if (!place) { res.status(404).json({ error: 'Lugar não encontrado' }); return }

  // Valida que as transações pertencem ao usuário
  const { data: txs } = await supabaseAdmin
    .from('finance_transactions').select('id').eq('user_id', userId).in('id', ids)
  const validIds = (txs ?? []).map(t => t.id)
  if (validIds.length === 0) { res.status(400).json({ error: 'Nenhuma transação válida' }); return }

  await supabaseAdmin.from('voyage_place_expenses')
    .upsert(
      validIds.map(tid => ({ trip_place_id: placeId, transaction_id: tid, user_id: userId })),
      { onConflict: 'trip_place_id,transaction_id', ignoreDuplicates: true }
    )

  res.json({ ok: true, linked: validIds.length })
})

// DELETE — desvincula uma transação de um lugar (dono apenas)
router.delete('/trips/:id/places/:placeId/expenses/:transactionId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const placeId = Number(req.params.placeId)
  const transactionId = Number(req.params.transactionId)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }
  if (trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }

  await supabaseAdmin.from('voyage_place_expenses')
    .delete().eq('trip_place_id', placeId).eq('transaction_id', transactionId).eq('user_id', userId)
  res.json({ ok: true })
})

// GET — candidatos a vincular: transações dos momentos da viagem (ou busca livre)
// Normaliza pra comparação fuzzy: minúsculas, sem acento, só tokens com 3+
// letras (evita "de", "da", "do" inflando o score de qualquer transação).
function nameTokens(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(t => t.length >= 3)
}

router.get('/trips/:id/transactions/candidates', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const q = (req.query.q as string | undefined)?.trim()
  const placeName = (req.query.place_name as string | undefined)?.trim()
  const limit = Math.min(Number(req.query.limit) || 30, 100)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id, start_date, end_date').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }
  if (trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }

  // Transações já vinculadas a qualquer lugar desta viagem (para excluir)
  const { data: places } = await supabaseAdmin
    .from('voyage_trip_places').select('id').eq('trip_id', tripId)
  const placeIds = (places ?? []).map(p => p.id)
  let linkedTxIds: number[] = []
  if (placeIds.length > 0) {
    const { data: linked } = await supabaseAdmin
      .from('voyage_place_expenses').select('transaction_id').in('trip_place_id', placeIds)
    linkedTxIds = (linked ?? []).map(l => l.transaction_id)
  }

  let rows: any[] = []
  if (q) {
    // Busca livre: transações do user no range de datas da viagem
    let query = supabaseAdmin
      .from('finance_transactions')
      .select('id, date, amount, currency, description, category_id')
      .eq('user_id', userId)
      .lt('amount', 0)
      .ilike('description', `%${q}%`)
      .order('date', { ascending: false })
      .limit(limit + linkedTxIds.length)
    if (trip.start_date) query = query.gte('date', trip.start_date)
    if (trip.end_date) query = query.lte('date', trip.end_date)
    const { data } = await query
    rows = data ?? []
  } else {
    // Default: transações dos momentos da viagem (do dono)
    const { data: tripMoments } = await supabaseAdmin
      .from('voyage_trip_moments').select('moment_id').eq('trip_id', tripId).eq('user_id', userId)
    const momentIds = (tripMoments ?? []).map(m => m.moment_id)
    if (momentIds.length > 0) {
      const { data: txm } = await supabaseAdmin
        .from('finance_transaction_moments')
        .select('finance_transactions(id, date, amount, currency, description, category_id)')
        .in('moment_id', momentIds)
      rows = (txm ?? []).map((r: any) => r.finance_transactions)
        .filter((t: any) => t && Number(t.amount) < 0)
      // dedup
      const seen = new Set<number>()
      rows = rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })

      // Sugestão por nome do lugar: não exige match exato, só algum token
      // (3+ letras) do nome aparecendo na descrição da transação — sobe pro
      // topo, mas sem nenhum match a lista cai pro fallback (mais recentes).
      const placeTokens = placeName ? nameTokens(placeName) : []
      if (placeTokens.length > 0) {
        const score = (desc: string) => {
          const d = desc.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
          return placeTokens.filter(tok => d.includes(tok)).length
        }
        rows = rows
          .map(r => ({ r, s: score(r.description ?? '') }))
          .sort((a, b) => b.s - a.s || (a.r.date < b.r.date ? 1 : -1))
          .map(x => x.r)
      } else {
        rows = rows.sort((a, b) => (a.date < b.date ? 1 : -1))
      }
    }
  }

  const linkedSet = new Set(linkedTxIds)
  const candidates = await enrichTxCategories(rows.filter(r => !linkedSet.has(r.id)).slice(0, limit))
  res.json({ candidates })
})

// ── GET /api/voyage/trips/:id/members  ───────────────────────────────────────
router.get('/trips/:id/members', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }

  const isOwner = trip.user_id === userId
  const { data: myMember } = !isOwner
    ? await supabaseAdmin.from('voyage_trip_members')
        .select('id').eq('trip_id', tripId).eq('user_id', userId).eq('status', 'active').single()
    : { data: true }
  if (!myMember) { res.status(403).json({ error: 'Sem acesso' }); return }

  const { data: members } = await supabaseAdmin
    .from('voyage_trip_members')
    .select('id, user_id, invite_email, role, status, joined_at, created_at')
    .eq('trip_id', tripId)
    .order('created_at')

  const enriched = await Promise.all((members ?? []).map(async m => {
    if (!m.user_id) return { ...m, display: { name: m.invite_email, email: m.invite_email } }
    const d = await userDisplay(m.user_id)
    return { ...m, display: d }
  }))

  res.json({ members: enriched })
})

// ── POST /api/voyage/trips/:id/invite  (convidar por e-mail ou @username) ────
router.post('/trips/:id/invite', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const { email, username, role = 'editor' } = req.body as { email?: string; username?: string; role?: string }

  if (!email?.includes('@') && !username?.trim()) {
    res.status(400).json({ error: 'Informe um e-mail ou @usuário' }); return
  }

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id, title').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }

  const isOwner = trip.user_id === userId
  const { data: myMember } = !isOwner
    ? await supabaseAdmin.from('voyage_trip_members')
        .select('id, role').eq('trip_id', tripId).eq('user_id', userId).eq('status', 'active').single()
    : { data: { role: 'owner' } }
  if (!myMember || !['owner', 'editor'].includes((myMember as any).role)) {
    res.status(403).json({ error: 'Sem permissão para convidar' }); return
  }

  let targetUserId: string | null = null
  let targetEmail: string | null = email?.trim() || null

  if (username) {
    const handle = username.trim().toLowerCase().replace(/^@/, '')
    const { data: handleRow } = await supabaseAdmin
      .from('user_handles').select('user_id').eq('username', handle).maybeSingle()
    if (!handleRow) { res.status(404).json({ error: 'Nenhum usuário com esse @' }); return }
    targetUserId = handleRow.user_id
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(handleRow.user_id)
    targetEmail = u?.user?.email ?? null
  } else if (targetEmail) {
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
    const targetUser = authList?.users?.find(u => u.email === targetEmail)
    targetUserId = targetUser?.id ?? null
  }

  if (targetUserId) {
    const { data: existing } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('id, status').eq('trip_id', tripId).eq('user_id', targetUserId).single()
    if (existing?.status === 'active') {
      res.status(409).json({ error: 'Já é membro desta viagem' }); return
    }
  }

  await supabaseAdmin
    .from('voyage_trip_members')
    .delete()
    .eq('trip_id', tripId).eq('invite_email', targetEmail).eq('status', 'pending')

  // Usuário já tem conta na plataforma E optou por aceitar convites
  // automaticamente de quem está convidando agora: entra direto como membro
  // ativo, sem precisar clicar em nada. Caso contrário (mesmo sendo amigo),
  // sempre passa pelo fluxo normal de convite com aceite explícito — ninguém
  // é adicionado a uma viagem sem consentir, mesmo que o @ seja conhecido.
  if (targetUserId && await canAutoAccept(targetUserId, userId)) {
    const { error } = await supabaseAdmin.from('voyage_trip_members').insert({
      trip_id: tripId,
      user_id: targetUserId,
      invite_email: targetEmail,
      role,
      status: 'active',
      joined_at: new Date().toISOString(),
    })
    if (error) { res.status(500).json({ error: error.message }); return }
    await syncTripMemberToLinkedMoments(tripId, targetUserId, targetEmail, role)
    res.json({ direct: true })
    return
  }

  const token = randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const { error } = await supabaseAdmin.from('voyage_trip_members').insert({
    trip_id: tripId,
    user_id: targetUserId,
    invite_email: targetEmail,
    invite_token: token,
    invite_expires_at: expires,
    role,
    status: 'pending',
  })
  if (error) { res.status(500).json({ error: error.message }); return }

  const baseUrl = process.env.FRONTEND_ORIGIN?.split(',')[0] ?? 'https://arvo.andregutto.com'
  res.json({ direct: false, token, invite_url: `${baseUrl}/voyage/invite/${token}` })
})

// ── PATCH /api/voyage/trips/:id/members/:memberId  (alterar role) ────────────
router.patch('/trips/:id/members/:memberId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const memberId = Number(req.params.memberId)
  const { role } = req.body as { role: string }

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) {
    res.status(403).json({ error: 'Apenas o owner pode alterar roles' }); return
  }

  await supabaseAdmin
    .from('voyage_trip_members')
    .update({ role })
    .eq('id', memberId).eq('trip_id', tripId)

  res.json({ ok: true })
})

// ── DELETE /api/voyage/trips/:id/members/:memberId  (remover membro) ─────────
router.delete('/trips/:id/members/:memberId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const memberId = Number(req.params.memberId)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  const { data: member } = await supabaseAdmin
    .from('voyage_trip_members').select('user_id').eq('id', memberId).single()

  const isOwner = trip?.user_id === userId
  const isSelf = member?.user_id === userId
  if (!isOwner && !isSelf) { res.status(403).json({ error: 'Sem permissão' }); return }

  await supabaseAdmin
    .from('voyage_trip_members')
    .delete()
    .eq('id', memberId).eq('trip_id', tripId)

  res.json({ ok: true })
})

// ── GET /api/voyage/invite/:token  (preview público do convite) ───────────────
router.get('/invite/:token', async (req, res: Response) => {
  const { token } = req.params
  const { data: member } = await supabaseAdmin
    .from('voyage_trip_members')
    .select('id, status, invite_email, voyage_trips(title, user_id)')
    .eq('invite_token', token)
    .single()

  if (!member) { res.status(404).json({ error: 'Convite não encontrado ou expirado' }); return }
  if (member.status !== 'pending') { res.status(410).json({ error: 'Convite já utilizado' }); return }

  const trip = member.voyage_trips as any
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('display_name, full_name').eq('id', trip?.user_id).single()
  const inviterName = (profile as any)?.display_name ?? (profile as any)?.full_name ?? 'Arvo'

  res.json({ trip_title: trip?.title ?? '—', inviter_name: inviterName, status: member.status })
})

// ── POST /api/voyage/invite/accept  (aceitar convite de viagem) ───────────────
router.post('/invite/accept', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { token } = req.body as { token: string }

  const { data: member } = await supabaseAdmin
    .from('voyage_trip_members')
    .select('id, trip_id, status, invite_email, role')
    .eq('invite_token', token)
    .single()

  if (!member) { res.status(404).json({ error: 'Convite não encontrado' }); return }
  if (member.status !== 'pending') { res.status(409).json({ error: 'Convite já utilizado' }); return }

  await supabaseAdmin
    .from('voyage_trip_members')
    .update({ user_id: userId, status: 'active', joined_at: new Date().toISOString(), invite_token: null })
    .eq('id', member.id)

  await syncTripMemberToLinkedMoments(member.trip_id, userId, member.invite_email, member.role)

  // 4.2 — registrar conexão bidirecional
  try {
    const { data: trip } = await supabaseAdmin
      .from('voyage_trips').select('user_id').eq('id', member.trip_id).single()
    if (trip && trip.user_id !== userId) {
      const [myInfo, ownerInfo] = await Promise.all([
        userDisplay(userId),
        userDisplay(trip.user_id),
      ])
      const now = new Date().toISOString()
      await supabaseAdmin.from('arvo_connections').upsert([
        { user_id: userId,      connected_user_id: trip.user_id, connected_email: ownerInfo.email, connected_name: ownerInfo.name, status: 'active', source: 'voyage', updated_at: now },
        { user_id: trip.user_id, connected_user_id: userId,      connected_email: myInfo.email,    connected_name: myInfo.name,    status: 'active', source: 'voyage', updated_at: now },
      ], { onConflict: 'user_id,connected_email' })
    }
  } catch { /* non-fatal */ }

  res.json({ trip_id: member.trip_id })
})

// ── GET /api/voyage/trips/:id/kml  (download KML autenticado) ────────────────
router.get('/trips/:id/kml', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('id, title, user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).send('Not found'); return }

  if (trip.user_id !== userId) {
    const { data: member } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('id').eq('trip_id', tripId).eq('user_id', userId).eq('status', 'active').single()
    if (!member) { res.status(403).send('Forbidden'); return }
  }

  const { data: places } = await supabaseAdmin
    .from('voyage_trip_places')
    .select('name, category, address, lat, lng, trip_note, google_maps_url, is_highlight')
    .eq('trip_id', tripId)
    .not('lat', 'is', null).not('lng', 'is', null)

  const placemarks = (places ?? []).map(p => `
  <Placemark>
    <name>${escapeXml(p.name)}</name>
    <description>${escapeXml([p.address, p.trip_note, p.google_maps_url].filter(Boolean).join('\n'))}</description>
    ${p.is_highlight ? '<styleUrl>#highlight</styleUrl>' : ''}
    <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
  </Placemark>`).join('')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(trip.title)}</name>
  <Style id="highlight">
    <IconStyle><color>ff2f3bd6</color><scale>1.2</scale></IconStyle>
  </Style>
  ${placemarks}
</Document>
</kml>`

  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml')
  res.setHeader('Content-Disposition', `attachment; filename="${trip.title.replace(/[^a-z0-9]/gi, '_')}.kml"`)
  res.send(kml)
})

// ══════════════════════════════════════════════════════════════════════════════
// V5 — Compartilhamento público
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/voyage/trips/:id/share  (gerar/atualizar token) ─────────────────
router.post('/trips/:id/share', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const { hide_cost = false, expires_in_days = null } = req.body as {
    hide_cost?: boolean; expires_in_days?: number | null
  }

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id, share_token').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }

  const token = trip.share_token ?? randomBytes(16).toString('hex')
  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 24 * 3600 * 1000).toISOString()
    : null

  await supabaseAdmin.from('voyage_trips').update({
    share_token: token,
    share_expires_at: expiresAt,
    share_hide_cost: hide_cost,
  }).eq('id', tripId)

  const baseUrl = process.env.FRONTEND_ORIGIN?.split(',')[0] ?? 'https://arvo.andregutto.com'
  res.json({ token, share_url: `${baseUrl}/trip/${token}` })
})

// ── DELETE /api/voyage/trips/:id/share  (revogar) ────────────────────────────
router.delete('/trips/:id/share', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }
  await supabaseAdmin.from('voyage_trips').update({
    share_token: null, share_expires_at: null,
  }).eq('id', tripId)
  res.json({ ok: true })
})

// ── PATCH /api/voyage/trips/:id/share-visibility  (compartilhamento parcial) ──
// Listas trip-scoped de categorias/transações de custo ocultas das visões
// EXTERNAS (público, gate, comunidade — um flag vale pra todas). Só o dono:
// é configuração de compartilhamento, mesma regra do modal Compartilhar.
router.patch('/trips/:id/share-visibility', requireAuth, async (req, res: Response) => {
  const tripId = Number(req.params.id)
  if (!(await requireTripOwner(tripId, uid(req), res))) return

  const update: Record<string, unknown> = {}
  const { hidden_category_ids, hidden_transaction_ids } = req.body as {
    hidden_category_ids?: unknown; hidden_transaction_ids?: unknown
  }
  if (hidden_category_ids !== undefined) {
    update.share_hidden_category_ids = Array.isArray(hidden_category_ids)
      ? hidden_category_ids.map(Number).filter(Number.isInteger) : []
  }
  if (hidden_transaction_ids !== undefined) {
    update.share_hidden_transaction_ids = Array.isArray(hidden_transaction_ids)
      ? hidden_transaction_ids.map(Number).filter(Number.isInteger) : []
  }
  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'No fields' }); return }

  const { data, error } = await supabaseAdmin
    .from('voyage_trips').update(update).eq('id', tripId)
    .select('share_hidden_category_ids, share_hidden_transaction_ids').single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({
    share_hidden_category_ids: data.share_hidden_category_ids,
    share_hidden_transaction_ids: data.share_hidden_transaction_ids,
  })
})

// Campos que os dois endpoints de leitura pública (por token e por trip id
// gated) precisam da voyage_trips pra montar o payload.
const PUBLIC_TRIP_FIELDS = 'id, title, destination, country, cover_image_url, cover_image_position, start_date, end_date, summary, status, share_hide_cost, show_place_expenses, share_token, share_expires_at, community_visible, user_id, share_hidden_category_ids, share_hidden_transaction_ids'

interface PublicTripRow {
  id: number
  title: string
  destination: string | null
  country: string | null
  cover_image_url: string | null
  cover_image_position: string
  start_date: string | null
  end_date: string | null
  summary: string | null
  status: string
  share_hide_cost: boolean
  show_place_expenses: boolean
  share_token: string | null
  share_expires_at: string | null
  community_visible: boolean
  user_id: string
  share_hidden_category_ids: number[]
  share_hidden_transaction_ids: number[]
}

// Monta o payload público da viagem (roteiro, mapa, custo se permitido) —
// compartilhado entre GET /public/:token (visitante com o link) e
// GET /shared/:tripId (usuário logado que veio do gate de cadastro).
async function buildPublicTripPayload(trip: PublicTripRow) {
  // Compartilhamento parcial: um flag por item vale pra TODAS as superfícies
  // externas (link público, gate e comunidade) — lugares shared=false saem do
  // roteiro, e categorias/transações ocultas saem dos agregados E dos totais.
  const shareFilter: ShareFilter = {
    hiddenCategoryIds: trip.share_hidden_category_ids ?? [],
    hiddenTransactionIds: trip.share_hidden_transaction_ids ?? [],
    sharedPlacesOnly: true,
  }

  const [placesRes, costRes, ownerRes, ownerHandleRes, ownerProfileRes, destinations, infoCards] = await Promise.all([
    supabaseAdmin.from('voyage_trip_places')
      .select('id, kind, name, category, address, lat, lng, google_place_id, google_maps_url, opening_hours, day_number, sort_order, is_highlight, visited, rating, trip_note, arrive_time, depart_time, transport_mode, transport_note, checkin_day, checkout_day, destination_id')
      .eq('trip_id', trip.id)
      .eq('shared', true)
      .order('day_number', { ascending: true, nullsFirst: false })
      .order('sort_order'),
    !trip.share_hide_cost ? buildCostSummary(trip.id, trip.user_id, shareFilter) : Promise.resolve(null),
    supabaseAdmin.auth.admin.getUserById(trip.user_id),
    // @username e public_profile do dono — pro avatar/link inline no hero da
    // página pública (só aparece se o dono tiver optado por perfil público).
    supabaseAdmin.from('user_handles').select('username').eq('user_id', trip.user_id).maybeSingle(),
    supabaseAdmin.from('profiles').select('public_profile').eq('id', trip.user_id).maybeSingle(),
    getDestinations(trip.id),
    getInfoCards(trip.id),
  ])

  // Gasto por lugar na página pública só quando o dono ativou
  const publicPlaces = (trip.show_place_expenses && !trip.share_hide_cost)
    ? await attachPlaceExpenses(placesRes.data ?? [], shareFilter)
    : (placesRes.data ?? [])

  const ownerMeta = ownerRes.data?.user?.user_metadata ?? {}
  const ownerName = [ownerMeta.first_name, ownerMeta.last_name].filter(Boolean).join(' ') || ownerRes.data?.user?.email || 'Arvo'
  // public_profile default é true (mesma regra de community.ts/profile.ts:
  // só false quando explicitamente desativado) — mas o avatar só aparece se
  // também houver @username, senão não há pra onde linkar.
  const ownerPublicProfile = (ownerProfileRes.data?.public_profile !== false) && !!ownerHandleRes.data?.username

  return {
    trip: {
      title: trip.title, destination: trip.destination, country: trip.country,
      cover_image_url: trip.cover_image_url, cover_image_position: trip.cover_image_position,
      start_date: trip.start_date, end_date: trip.end_date,
      summary: trip.summary, status: trip.status,
    },
    owner_name: ownerName,
    owner_username: ownerHandleRes.data?.username ?? null,
    owner_avatar_url: ownerMeta.avatar_url ?? null,
    owner_public_profile: ownerPublicProfile,
    places: publicPlaces,
    cost: costRes,
    destinations,
    // Só os cards que o dono deixou no compartilhamento, com campos públicos
    info_cards: infoCards
      .filter(c => c.shared)
      .map(c => ({ id: c.id, kind: c.kind, title: c.title, body: c.body, phone: c.phone, url: c.url, icon_key: c.icon_key })),
  }
}

// ── GET /api/voyage/public/:token  (página pública — sem auth) ───────────────
router.get('/public/:token', async (req, res: Response) => {
  const { token } = req.params

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips')
    .select(PUBLIC_TRIP_FIELDS)
    .eq('share_token', token)
    .single<PublicTripRow>()

  if (!trip) { res.status(404).json({ error: 'Página não encontrada' }); return }
  if (trip.share_expires_at && new Date(trip.share_expires_at) < new Date()) {
    res.status(410).json({ error: 'Link expirado' }); return
  }

  res.json(await buildPublicTripPayload(trip))
})

// ── GET /api/voyage/public/:token/kml  (download KML para Google Maps) ────────
router.get('/public/:token/kml', async (req, res: Response) => {
  const { token } = req.params

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips')
    .select('id, title, share_expires_at')
    .eq('share_token', token).single()

  if (!trip) { res.status(404).send('Not found'); return }
  if (trip.share_expires_at && new Date(trip.share_expires_at) < new Date()) {
    res.status(410).send('Expired'); return
  }

  // Superfície externa: lugares ocultos do compartilhamento ficam fora do KML também
  const { data: places } = await supabaseAdmin
    .from('voyage_trip_places')
    .select('name, category, address, lat, lng, trip_note, google_maps_url, is_highlight')
    .eq('trip_id', trip.id)
    .eq('shared', true)
    .not('lat', 'is', null).not('lng', 'is', null)

  const placemarks = (places ?? []).map(p => `
  <Placemark>
    <name>${escapeXml(p.name)}</name>
    <description>${escapeXml([p.address, p.trip_note, p.google_maps_url].filter(Boolean).join('\n'))}</description>
    ${p.is_highlight ? '<styleUrl>#highlight</styleUrl>' : ''}
    <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
  </Placemark>`).join('')

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(trip.title)}</name>
  <Style id="highlight">
    <IconStyle><color>ff2f3bd6</color><scale>1.2</scale></IconStyle>
  </Style>
  ${placemarks}
</Document>
</kml>`

  res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml')
  res.setHeader('Content-Disposition', `attachment; filename="${trip.title.replace(/[^a-z0-9]/gi, '_')}.kml"`)
  res.send(kml)
})

// ══════════════════════════════════════════════════════════════════════════════
// Lead magnet do YouTube — gate de cadastro por viagem (migration 074)
// ══════════════════════════════════════════════════════════════════════════════
// Espelho do mecanismo de Recursos (resources.ts + lib/leads.ts): a rota
// /voyage/shared/:tripId no frontend mostra o gate de cadastro pro visitante
// deslogado e o roteiro completo pra quem está logado. Existe quando o dono
// habilitou o compartilhamento (share_token não nulo) OU disponibilizou a
// viagem pra galeria da Comunidade (community_visible, migration 075) — são
// dois consentimentos independentes. O link público por token
// (/public/:token) continua intocado e independente.

// Busca comum dos endpoints do gate: viagem por id, exigindo share habilitado
// (por token ou pela galeria) e não expirado. 'expired' vira 410 nos
// handlers, null vira 404.
async function getGatedTrip(tripId: number): Promise<PublicTripRow | 'expired' | null> {
  if (!Number.isInteger(tripId)) return null
  const { data: trip } = await supabaseAdmin
    .from('voyage_trips')
    .select(PUBLIC_TRIP_FIELDS)
    .eq('id', tripId)
    .or('share_token.not.is.null,community_visible.eq.true')
    .maybeSingle<PublicTripRow>()
  if (!trip) return null
  // A validade configurada no modal se aplica só ao link por token; o
  // consentimento da galeria não expira — enquanto ele estiver ligado, a
  // página continua acessível mesmo com o link público vencido.
  if (trip.community_visible) return trip
  if (trip.share_expires_at && new Date(trip.share_expires_at) < new Date()) return 'expired'
  return trip
}

// Nunca lança: perder um evento de métrica não pode derrubar o request.
async function recordGateEvent(tripId: number, userId: string | null, utm: UtmFields): Promise<void> {
  try {
    await supabaseAdmin.from('trip_share_events').insert({
      trip_id: tripId,
      user_id: userId,
      event_type: 'view',
      ...utm,
    })
  } catch (err) {
    console.warn('[voyage] failed to record gate event:', err)
  }
}

// ── GET /api/voyage/gate/:tripId  (preview do gate — sem auth) ────────────────
// Só o que o card de convite mostra: capa, título, destino, datas, resumo e
// um teaser quantitativo ("12 lugares"). Sem roteiro, sem custos. Registra o
// evento 'view' com os utm_* da query string.
router.get('/gate/:tripId', async (req, res: Response) => {
  const trip = await getGatedTrip(Number(req.params.tripId))
  if (!trip) { res.status(404).json({ error: 'Página não encontrada' }); return }
  if (trip === 'expired') { res.status(410).json({ error: 'Link expirado' }); return }

  const [placesCountRes, ownerRes, destinations] = await Promise.all([
    // kind null = lugar (linhas anteriores à migration 042), igual ao
    // fallback (p.kind ?? 'place') que o frontend usa. O teaser também
    // respeita o compartilhamento parcial (não conta lugar oculto).
    supabaseAdmin.from('voyage_trip_places')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('shared', true)
      .or('kind.is.null,kind.eq.place'),
    supabaseAdmin.auth.admin.getUserById(trip.user_id),
    getDestinations(trip.id),
  ])

  await recordGateEvent(trip.id, null, pickUtm({ ...req.query, referrer: req.headers.referer }))

  const ownerMeta = ownerRes.data?.user?.user_metadata ?? {}
  const ownerName = [ownerMeta.first_name, ownerMeta.last_name].filter(Boolean).join(' ') || ownerRes.data?.user?.email || 'Arvo'

  res.json({
    title: trip.title,
    destination: trip.destination,
    country: trip.country,
    cover_image_url: trip.cover_image_url,
    cover_image_position: trip.cover_image_position,
    start_date: trip.start_date,
    end_date: trip.end_date,
    summary: trip.summary,
    owner_name: ownerName,
    place_count: placesCountRes.count ?? 0,
    destinations: destinations.map(d => ({ city: d.city, country: d.country })),
  })
})

// ── GET /api/voyage/shared/:tripId  (visão logada do gate) ────────────────────
// Mesmo payload do /public/:token (mesmo builder), mas keyed por trip id e
// atrás de login — é a recompensa do cadastro. share_token vai junto só pro
// download do KML (o endpoint de KML é público por token).
router.get('/shared/:tripId', requireAuth, async (req, res: Response) => {
  const trip = await getGatedTrip(Number(req.params.tripId))
  if (!trip) { res.status(404).json({ error: 'Página não encontrada' }); return }
  if (trip === 'expired') { res.status(410).json({ error: 'Link expirado' }); return }

  // Mesma rede de segurança do unlock de recursos: garante que o cadastro
  // recém-criado tenha signup_source copiado pro perfil.
  await backfillSignupSource(uid(req))

  res.json({ ...(await buildPublicTripPayload(trip)), share_token: trip.share_token })
})

// ── PATCH /api/voyage/trips/:id/community  (galeria da Comunidade) ────────────
// Consentimento separado do link público (share_token): o dono decide expor a
// viagem na galeria de viagens da Comunidade (frente C). Só o dono — nem
// editores podem ligar/desligar a exposição pública da viagem de outra pessoa.
router.patch('/trips/:id/community', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const visible = !!req.body?.visible

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip || trip.user_id !== userId) { res.status(403).json({ error: 'Sem permissão' }); return }

  const { error } = await supabaseAdmin
    .from('voyage_trips').update({ community_visible: visible }).eq('id', tripId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true, community_visible: visible })
})

// ── Links de divulgação (admin, espelho dos de resources.ts) ──────────────────

// GET /api/voyage/trips/:id/share-links — o modal Compartilhar consulta se o
// usuário é admin e quais links existem. Não devolve 403 pra não-admin: o
// modal abre pra qualquer dono de viagem e só esconde o bloco.
router.get('/trips/:id/share-links', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.json({ is_admin: false, links: [] }); return }
  const { data: links } = await supabaseAdmin
    .from('trip_share_links').select('id, label, utm_campaign, created_at')
    .eq('trip_id', Number(req.params.id))
    .order('created_at', { ascending: false })
  res.json({ is_admin: true, links: links ?? [] })
})

// POST /api/voyage/trips/:id/share-links — gera um link de divulgação (UTM
// pronto pra colar na descrição de um vídeo) com um rótulo de referência.
router.post('/trips/:id/share-links', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }
  const tripId = Number(req.params.id)
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : ''
  if (!label) { res.status(400).json({ error: 'Rótulo obrigatório' }); return }

  const { data: trip } = await supabaseAdmin.from('voyage_trips').select('id').eq('id', tripId).maybeSingle()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }

  let campaign = slugifyLabel(label) || 'video'
  // Garante utm_campaign único dentro da viagem — duas campanhas iguais se
  // misturariam nas estatísticas de origem.
  const { count } = await supabaseAdmin
    .from('trip_share_links').select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId).eq('utm_campaign', campaign)
  if (count && count > 0) campaign = `${campaign}-${count + 1}`

  const { data: link, error } = await supabaseAdmin
    .from('trip_share_links')
    .insert({ trip_id: tripId, label, utm_campaign: campaign })
    .select('id, label, utm_campaign, created_at')
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(link)
})

// DELETE /api/voyage/trips/:id/share-links/:linkId
router.delete('/trips/:id/share-links/:linkId', requireAuth, async (req, res: Response) => {
  if (!(await isAdmin(uid(req)))) { res.status(403).json({ error: 'admin only' }); return }
  await supabaseAdmin.from('trip_share_links').delete()
    .eq('id', Number(req.params.linkId)).eq('trip_id', Number(req.params.id))
  res.json({ ok: true })
})

// O GET /api/voyage/admin/acquisition (funil por viagem compartilhada) que
// vivia aqui foi aposentado: a montagem migrou pro GET /admin/acquisition
// (routes/acquisition.ts), que consolida recursos + viagens pra aba
// Aquisição do /admin. Os links de divulgação continuam acima.

function escapeXml(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Google Places (New) proxy — autocomplete de cidades para o destino ────────
// Key server-side; sem key configurada, degrada para lista vazia (texto livre).
const GEO_TTL = 10 * 60 * 1000

// GET /voyage/geo/autocomplete?q=&session=
router.get('/geo/autocomplete', requireAuth, async (req, res: Response) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  const input = (req.query.q as string | undefined)?.trim()
  const session = (req.query.session as string | undefined) ?? ''
  if (!apiKey || !input || input.length < 2) { res.json({ suggestions: [] }); return }

  try {
    const suggestions = await cache.getOrFetch(`geo:ac:${input.toLowerCase()}`, GEO_TTL, async () => {
      const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
        body: JSON.stringify({
          input,
          includedPrimaryTypes: ['(cities)'],
          ...(session ? { sessionToken: session } : {}),
        }),
      })
      if (!r.ok) return []
      const data = await r.json() as any
      return (data.suggestions ?? [])
        .map((s: any) => s.placePrediction)
        .filter(Boolean)
        .map((p: any) => ({
          place_id: p.placeId,
          main_text: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          secondary_text: p.structuredFormat?.secondaryText?.text ?? '',
        }))
    })
    res.json({ suggestions })
  } catch {
    res.json({ suggestions: [] })
  }
})

// GET /voyage/geo/details?place_id=&session=
router.get('/geo/details', requireAuth, async (req, res: Response) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  const placeId = (req.query.place_id as string | undefined)?.trim()
  if (!apiKey || !placeId) { res.json({ place: null }); return }

  try {
    const place = await cache.getOrFetch(`geo:det:${placeId}`, GEO_TTL, async () => {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'displayName,addressComponents,location',
        },
      })
      if (!r.ok) return null
      const data = await r.json() as any
      const country = (data.addressComponents ?? [])
        .find((c: any) => (c.types ?? []).includes('country'))?.longText ?? null
      return {
        city: data.displayName?.text ?? null,
        country,
        lat: data.location?.latitude ?? null,
        lng: data.location?.longitude ?? null,
      }
    })
    res.json({ place })
  } catch {
    res.json({ place: null })
  }
})

export default router
