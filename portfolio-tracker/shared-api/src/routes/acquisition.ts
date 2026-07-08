import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { isAdmin } from '../lib/leads.js'

// Aquisição de leads consolidada — GET /api/admin/acquisition, a fonte única
// da aba Aquisição do /admin: KPIs, série mensal (12 meses) e a lista
// unificada de ímãs (recursos + viagens compartilhadas) com quebra por
// campanha. Substitui as métricas que viviam espalhadas em
// /resources/admin/list (stats por recurso) e /voyage/admin/acquisition
// (funil por viagem) — ambas aposentadas quando esta rota virou o único
// lugar que monta funil.

const router = Router()

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

interface EventRow {
  event_type: string
  utm_source: string | null
  utm_campaign: string | null
  utm_content: string | null
  created_at: string
}

// Mesmo agrupamento de origem usado desde o /resources/admin/list original:
// campanha/conteúdo identificam o vídeo específico; utm_source sozinho
// ('youtube' pra todo mundo) não diferencia nada.
function campaignKey(e: EventRow): string {
  const video = e.utm_campaign || e.utm_content
  return video ? (e.utm_source ? `${e.utm_source}/${video}` : video) : (e.utm_source || 'sem_origem')
}

// Supabase corta em 1000 linhas por request; pagina até esgotar pra série
// mensal não "encolher" silenciosamente quando os eventos passarem disso.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

// created_at é timestamptz (UTC) — a chave de mês usa o próprio ISO.
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

// Últimos 12 meses (incluindo o corrente), em ordem cronológica.
function last12Months(): string[] {
  const now = new Date()
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
  }
  return months
}

// GET /api/admin/acquisition
router.get('/acquisition', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  if (!(await isAdmin(userId))) { res.status(403).json({ error: 'admin only' }); return }

  const [{ data: resources }, { data: trips }] = await Promise.all([
    // Inclui rascunhos: um recurso despublicado pode ter histórico de views
    // e cadastros que continua valendo no acumulado.
    supabaseAdmin
      .from('resources')
      .select('id, slug, title, is_published')
      .order('created_at', { ascending: false }),
    // Viagens do admin com gate ativo — mesmo critério do getGatedTrip de
    // voyage.ts: share habilitado por token OU exposta na galeria da
    // Comunidade (dois consentimentos independentes).
    supabaseAdmin
      .from('voyage_trips')
      .select('id, title, destination, country')
      .eq('user_id', userId)
      .or('share_token.not.is.null,community_visible.eq.true')
      .order('created_at', { ascending: false }),
  ])

  const tripIds = (trips ?? []).map(t => t.id as number)

  const [profileRows, resourceEvents, tripEvents] = await Promise.all([
    // Cadastros atribuídos: um SELECT só, agrupado em memória — substitui os
    // counts por recurso/viagem que as rotas antigas faziam em loop.
    fetchAll<{ signup_source: string | null; created_at: string }>((from, to) =>
      supabaseAdmin
        .from('profiles')
        .select('signup_source, created_at')
        .or('signup_source.like.resource:*,signup_source.like.trip:*')
        .range(from, to)),
    fetchAll<EventRow & { resource_id: number }>((from, to) =>
      supabaseAdmin
        .from('resource_events')
        .select('resource_id, event_type, utm_source, utm_campaign, utm_content, created_at')
        .range(from, to)),
    tripIds.length
      ? fetchAll<EventRow & { trip_id: number }>((from, to) =>
          supabaseAdmin
            .from('trip_share_events')
            .select('trip_id, event_type, utm_source, utm_campaign, utm_content, created_at')
            .in('trip_id', tripIds)
            .range(from, to))
      : Promise.resolve([] as (EventRow & { trip_id: number })[]),
  ])

  const months = last12Months()
  const monthly = new Map<string, { resource_signups: number; trip_signups: number; views: number }>()
  for (const m of months) monthly.set(m, { resource_signups: 0, trip_signups: 0, views: 0 })

  // ── Cadastros por ímã e por mês ────────────────────────────────────────────
  const signupsByResourceSlug = new Map<string, number>()
  const signupsByTripId = new Map<number, number>()
  let resourceLeads = 0
  let tripLeads = 0

  for (const p of profileRows) {
    const src = p.signup_source ?? ''
    const bucket = monthly.get(monthKey(p.created_at))
    if (src.startsWith('resource:')) {
      resourceLeads += 1
      const slug = src.slice('resource:'.length)
      signupsByResourceSlug.set(slug, (signupsByResourceSlug.get(slug) ?? 0) + 1)
      if (bucket) bucket.resource_signups += 1
    } else if (src.startsWith('trip:')) {
      tripLeads += 1
      const id = Number(src.slice('trip:'.length))
      signupsByTripId.set(id, (signupsByTripId.get(id) ?? 0) + 1)
      if (bucket) bucket.trip_signups += 1
    }
  }

  // ── Views e quebra por campanha ────────────────────────────────────────────
  let resourceViews = 0
  let tripViews = 0

  const resourceAgg = new Map<number, { views: number; unlocks: number; by_campaign: Record<string, number> }>()
  for (const e of resourceEvents) {
    const agg = resourceAgg.get(e.resource_id) ?? { views: 0, unlocks: 0, by_campaign: {} }
    if (e.event_type === 'view') {
      agg.views += 1
      resourceViews += 1
      const bucket = monthly.get(monthKey(e.created_at))
      if (bucket) bucket.views += 1
    } else if (e.event_type === 'unlock') {
      // Nos recursos a origem se mede no 'unlock' — o evento que vale como
      // "gerou lead", não a view de quem só passou de raspão.
      agg.unlocks += 1
      const key = campaignKey(e)
      agg.by_campaign[key] = (agg.by_campaign[key] ?? 0) + 1
    }
    resourceAgg.set(e.resource_id, agg)
  }

  const tripAgg = new Map<number, { views: number; by_campaign: Record<string, number> }>()
  for (const e of tripEvents) {
    // Nas viagens o gate só registra 'view' — o "unlock" é o próprio
    // cadastro, então a origem se mede na visita.
    if (e.event_type !== 'view') continue
    const agg = tripAgg.get(e.trip_id) ?? { views: 0, by_campaign: {} }
    agg.views += 1
    tripViews += 1
    const bucket = monthly.get(monthKey(e.created_at))
    if (bucket) bucket.views += 1
    const key = campaignKey(e)
    agg.by_campaign[key] = (agg.by_campaign[key] ?? 0) + 1
    tripAgg.set(e.trip_id, agg)
  }

  // ── Lista unificada de ímãs, ordenada por cadastros ────────────────────────
  const magnets = [
    ...(resources ?? []).map(r => {
      const agg = resourceAgg.get(r.id)
      return {
        type: 'resource' as const,
        id: r.id as number,
        slug: r.slug as string,
        title: r.title as string,
        subtitle: `/resources/${r.slug}`,
        is_published: !!r.is_published,
        views: agg?.views ?? 0,
        unlocks: agg?.unlocks ?? 0,
        signups: signupsByResourceSlug.get(r.slug) ?? 0,
        by_campaign: agg?.by_campaign ?? {},
      }
    }),
    ...(trips ?? []).map(t => {
      const agg = tripAgg.get(t.id)
      return {
        type: 'trip' as const,
        id: t.id as number,
        slug: null,
        title: t.title as string,
        subtitle: [t.destination, t.country].filter(Boolean).join(', ') || `/voyage/shared/${t.id}`,
        is_published: true,
        views: agg?.views ?? 0,
        unlocks: null,
        signups: signupsByTripId.get(t.id) ?? 0,
        by_campaign: agg?.by_campaign ?? {},
      }
    }),
  ].sort((a, b) => (b.signups - a.signups) || (b.views - a.views))

  const current = monthly.get(months[months.length - 1])!

  res.json({
    totals: {
      leads: resourceLeads + tripLeads,
      leads_this_month: current.resource_signups + current.trip_signups,
      views: resourceViews + tripViews,
      resources: { leads: resourceLeads, views: resourceViews },
      trips: { leads: tripLeads, views: tripViews },
    },
    monthly: months.map(m => ({ month: m, ...monthly.get(m)! })),
    magnets,
  })
})

export default router
