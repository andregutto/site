import { Router, Response } from 'express'
import { randomBytes } from 'crypto'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

async function userDisplay(userId: string): Promise<{ name: string; email: string; avatar_url?: string }> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = data?.user?.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || data?.user?.email || userId
  return { name, email: data?.user?.email ?? '', avatar_url: meta.avatar_url }
}

// ── Cost helper ────────────────────────────────────────────────────────────────
// Agrega custo de todos os momentos vinculados à viagem.
// Retorna total + breakdown por usuário (split-ready para V2).
async function buildCostSummary(tripId: number, requestingUserId: string) {
  // Busca os momentos vinculados (service_role — valida membership via código)
  const { data: tripMoments } = await supabaseAdmin
    .from('voyage_trip_moments')
    .select('moment_id, user_id')
    .eq('trip_id', tripId)

  if (!tripMoments || tripMoments.length === 0) {
    return { total: 0, currency: 'EUR', moments: [], by_user: [] }
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
    .select('moment_id, finance_transactions(amount, currency, is_internal_transfer, exclude_from_stats)')
    .in('moment_id', momentIds)

  // Agrega por momento
  const momentTotals: Record<number, number> = {}
  const currency = 'EUR'
  for (const row of txRows ?? []) {
    const tx = (row as any).finance_transactions
    if (!tx) continue
    if (tx.is_internal_transfer || tx.exclude_from_stats) continue
    if (tx.amount >= 0) continue // só despesas (negativos)
    const mid = (row as any).moment_id
    momentTotals[mid] = (momentTotals[mid] ?? 0) + Math.abs(tx.amount)
  }

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

  return {
    total: Math.round(grandTotal * 100) / 100,
    budget: budgetTotal > 0 ? Math.round(budgetTotal * 100) / 100 : null,
    currency,
    moments: (moments ?? []).map(m => ({
      ...m,
      spent: Math.round((momentTotals[m.id] ?? 0) * 100) / 100,
    })),
    by_user: Object.values(byUser).map(u => ({
      ...u,
      total: Math.round(u.total * 100) / 100,
    })),
  }
}

// ── Pending trip invites (exported for notifications.ts) ─────────────────────
export interface PendingTripInvite {
  key: string
  trip_title: string
  inviter_name: string
  token: string
  occurred_at: string
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

  // Custo rápido (totais apenas, sem breakdown)
  const withCost = await Promise.all(trips.map(async t => {
    const cost = await buildCostSummary(t.id, userId)
    return { ...t, cost_total: cost.total, cost_budget: cost.budget }
  }))

  res.json({ trips: withCost })
})

// ── POST /api/voyage/trips ────────────────────────────────────────────────────
router.post('/trips', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { title, destination, country, cover_image_url, cover_image_position, start_date, end_date, summary, status } = req.body

  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return }

  const { data: trip, error } = await supabaseAdmin
    .from('voyage_trips')
    .insert({
      user_id: userId,
      title: title.trim(),
      destination: destination ?? null,
      country: country ?? null,
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

  const [cost, placesRes, membersRes] = await Promise.all([
    buildCostSummary(tripId, userId),
    supabaseAdmin.from('voyage_trip_places').select('*').eq('trip_id', tripId).order('day_number', { ascending: true, nullsFirst: false }).order('sort_order'),
    supabaseAdmin.from('voyage_trip_members').select('id, user_id, invite_email, role, status, joined_at').eq('trip_id', tripId),
  ])

  res.json({ trip, cost, places: placesRes.data ?? [], members: membersRes.data ?? [] })
})

// ── PATCH /api/voyage/trips/:id ───────────────────────────────────────────────
router.patch('/trips/:id', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const allowed = ['title', 'destination', 'country', 'cover_image_url', 'cover_image_position',
                   'start_date', 'end_date', 'summary', 'status']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in req.body) update[k] = req.body[k] ?? null

  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'No fields' }); return }

  const { data, error } = await supabaseAdmin
    .from('voyage_trips')
    .update(update)
    .eq('id', tripId)
    .or(`user_id.eq.${userId}`)
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

  res.status(201).json({ trip, already_existed: false })
})

// ── GET /api/voyage/moments-for-picker  (reusar endpoint de finanças) ─────────
router.get('/moments-for-picker', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { data } = await supabaseAdmin
    .from('finance_moments')
    .select('id, name, icon, color, start_date, end_date, budget')
    .eq('user_id', userId)
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
  await supabaseAdmin.from('voyage_places')
    .delete().eq('id', Number(req.params.id)).eq('user_id', userId)
  res.json({ ok: true })
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

  for (const { list_name, geojson } of files) {
    const features: any[] = geojson?.features ?? []
    for (const f of features) {
      const props = f.properties ?? {}
      const loc   = props.Location ?? {}
      const geo   = loc['Geo Coordinates'] ?? {}
      const coords = f.geometry?.coordinates // [lng, lat]

      const lat = geo.Latitude  ?? coords?.[1] ?? null
      const lng = geo.Longitude ?? coords?.[0] ?? null
      const name = props.Title || loc['Business Name'] || 'Sem nome'

      // Reverse geocoding via Nominatim para obter cidade
      let city: string | null = null
      if (lat && lng) {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt`,
            { headers: { 'User-Agent': 'Arvo/1.0 (arvo.andregutto.com)' } }
          )
          const nm = await r.json() as any
          city = nm.address?.city || nm.address?.town || nm.address?.village || nm.address?.county || null
        } catch { /* silencioso */ }
      }

      toInsert.push({
        user_id: userId,
        name,
        category: list_name || null,
        lat,
        lng,
        address: loc.Address || null,
        city,
        google_maps_url: props['Google Maps URL'] || null,
        source: 'takeout',
      })
    }
  }

  if (toInsert.length === 0) {
    res.status(400).json({ error: 'Nenhum lugar encontrado nos arquivos' }); return
  }

  // Upsert por (user_id, google_maps_url) para não duplicar em re-imports
  const { data, error } = await supabaseAdmin
    .from('voyage_places')
    .upsert(toInsert, { onConflict: 'user_id,google_maps_url', ignoreDuplicates: true })
    .select()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ imported: (data ?? []).length, total_in_files: toInsert.length })
})

// ── GET /api/voyage/trips/:id/places  ────────────────────────────────────────
router.get('/trips/:id/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips').select('user_id').eq('id', tripId).single()
  if (!trip) { res.status(404).json({ error: 'Viagem não encontrada' }); return }

  const isMember = trip.user_id === userId ||
    !!(await supabaseAdmin.from('voyage_trip_members')
      .select('id').eq('trip_id', tripId).eq('user_id', userId).eq('status', 'active').single()).data

  if (!isMember) { res.status(403).json({ error: 'Sem acesso' }); return }

  const { data } = await supabaseAdmin
    .from('voyage_trip_places')
    .select('*')
    .eq('trip_id', tripId)
    .order('sort_order')

  res.json({ places: data ?? [] })
})

// ── POST /api/voyage/trips/:id/places  (adicionar lugar à trip) ──────────────
router.post('/trips/:id/places', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const body = req.body as {
    library_place_id?: number; name: string; category?: string
    lat?: number; lng?: number; address?: string
    google_place_id?: string; google_maps_url?: string
    day_number?: number; is_highlight?: boolean
  }

  if (!body.name?.trim()) { res.status(400).json({ error: 'Nome obrigatório' }); return }

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
  const { visited, trip_note, day_number, is_highlight, rating, sort_order } = req.body

  const update: Record<string, unknown> = {}
  if (visited    !== undefined) update.visited     = visited
  if (trip_note  !== undefined) update.trip_note   = trip_note
  if (day_number !== undefined) update.day_number  = day_number
  if (is_highlight !== undefined) update.is_highlight = is_highlight
  if (rating     !== undefined) update.rating      = rating
  if (sort_order !== undefined) update.sort_order  = sort_order

  const { data, error } = await supabaseAdmin
    .from('voyage_trip_places')
    .update(update)
    .eq('id', placeId).eq('trip_id', tripId)
    .select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
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

// ── POST /api/voyage/trips/:id/invite  (convidar por e-mail) ─────────────────
router.post('/trips/:id/invite', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const tripId = Number(req.params.id)
  const { email, role = 'editor' } = req.body as { email: string; role?: string }

  if (!email?.includes('@')) { res.status(400).json({ error: 'E-mail inválido' }); return }

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

  const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
  const targetUser = authList?.users?.find(u => u.email === email)

  if (targetUser) {
    const { data: existing } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('id, status').eq('trip_id', tripId).eq('user_id', targetUser.id).single()
    if (existing?.status === 'active') {
      res.status(409).json({ error: 'Já é membro desta viagem' }); return
    }
  }

  await supabaseAdmin
    .from('voyage_trip_members')
    .delete()
    .eq('trip_id', tripId).eq('invite_email', email).eq('status', 'pending')

  const token = randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const { error } = await supabaseAdmin.from('voyage_trip_members').insert({
    trip_id: tripId,
    user_id: targetUser?.id ?? null,
    invite_email: email,
    invite_token: token,
    invite_expires_at: expires,
    role,
    status: 'pending',
  })
  if (error) { res.status(500).json({ error: error.message }); return }

  const baseUrl = process.env.FRONTEND_ORIGIN?.split(',')[0] ?? 'https://arvo.andregutto.com'
  res.json({ token, invite_url: `${baseUrl}/voyage/invite/${token}` })
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
    .select('id, trip_id, status, invite_email')
    .eq('invite_token', token)
    .single()

  if (!member) { res.status(404).json({ error: 'Convite não encontrado' }); return }
  if (member.status !== 'pending') { res.status(409).json({ error: 'Convite já utilizado' }); return }

  await supabaseAdmin
    .from('voyage_trip_members')
    .update({ user_id: userId, status: 'active', joined_at: new Date().toISOString(), invite_token: null })
    .eq('id', member.id)

  res.json({ trip_id: member.trip_id })
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

// ── GET /api/voyage/public/:token  (página pública — sem auth) ───────────────
router.get('/public/:token', async (req, res: Response) => {
  const { token } = req.params

  const { data: trip } = await supabaseAdmin
    .from('voyage_trips')
    .select('id, title, destination, country, cover_image_url, cover_image_position, start_date, end_date, summary, status, share_hide_cost, share_expires_at, user_id')
    .eq('share_token', token)
    .single()

  if (!trip) { res.status(404).json({ error: 'Página não encontrada' }); return }
  if (trip.share_expires_at && new Date(trip.share_expires_at) < new Date()) {
    res.status(410).json({ error: 'Link expirado' }); return
  }

  const [placesRes, costRes, ownerRes] = await Promise.all([
    supabaseAdmin.from('voyage_trip_places')
      .select('id, name, category, address, lat, lng, google_place_id, google_maps_url, day_number, sort_order, is_highlight, visited, trip_note')
      .eq('trip_id', trip.id)
      .order('sort_order'),
    !trip.share_hide_cost ? buildCostSummary(trip.id, trip.user_id) : Promise.resolve(null),
    supabaseAdmin.auth.admin.getUserById(trip.user_id),
  ])

  const ownerMeta = ownerRes.data?.user?.user_metadata ?? {}
  const ownerName = [ownerMeta.first_name, ownerMeta.last_name].filter(Boolean).join(' ') || ownerRes.data?.user?.email || 'Arvo'

  res.json({
    trip: {
      title: trip.title, destination: trip.destination, country: trip.country,
      cover_image_url: trip.cover_image_url, cover_image_position: trip.cover_image_position,
      start_date: trip.start_date, end_date: trip.end_date,
      summary: trip.summary, status: trip.status,
    },
    owner_name: ownerName,
    places: placesRes.data ?? [],
    cost: costRes,
  })
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

  const { data: places } = await supabaseAdmin
    .from('voyage_trip_places')
    .select('name, category, address, lat, lng, trip_note, google_maps_url, is_highlight')
    .eq('trip_id', trip.id)
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

function escapeXml(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default router
