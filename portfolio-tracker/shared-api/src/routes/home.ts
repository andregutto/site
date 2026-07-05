import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay } from './people.js'

/* Página "Hoje": abertura genérica do app, sem valores financeiros.
   Um único endpoint leve agrega saudação, tópicos quentes da comunidade,
   próxima viagem e momento em andamento. */

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

router.get('/today', async (req: any, res: any) => {
  const userId = uid(req)
  const todayStr = new Date().toISOString().split('T')[0]

  try {
    const display = await userDisplay(userId)
    const firstName = (display.name ?? display.email).split(' ')[0]

    // Tópicos quentes: atividade mais recente primeiro
    const { data: topics } = await supabaseAdmin
      .from('community_topics')
      .select('id, title, category_id, reply_count, last_post_at')
      .is('deleted_at', null)
      .order('last_post_at', { ascending: false })
      .limit(3)

    const catIds = [...new Set((topics ?? []).map((t: any) => t.category_id))]
    const { data: cats } = catIds.length
      ? await supabaseAdmin.from('community_categories').select('id, slug, name_key, name').in('id', catIds)
      : { data: [] as any[] }
    const catById = new Map((cats ?? []).map((c: any) => [c.id, c]))

    const hotTopics = (topics ?? []).map((t: any) => {
      const c = catById.get(t.category_id)
      return {
        id: t.id,
        title: t.title,
        category_slug: c?.slug ?? '',
        category_name: c?.name ?? null,
        reply_count: t.reply_count,
        last_post_at: t.last_post_at,
      }
    })

    // Próxima viagem: em andamento primeiro, senão a mais próxima no futuro
    // (viagens onde o usuário é dono ou membro ativo)
    const { data: memberRows } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('trip_id')
      .eq('user_id', userId)
      .eq('status', 'active')
    const memberTripIds = (memberRows ?? []).map((r: any) => r.trip_id)

    const orFilter = memberTripIds.length
      ? `user_id.eq.${userId},id.in.(${memberTripIds.join(',')})`
      : `user_id.eq.${userId}`
    const { data: trips } = await supabaseAdmin
      .from('voyage_trips')
      .select('id, title, destination, start_date, end_date')
      .or(orFilter)
      .not('start_date', 'is', null)
      .order('start_date', { ascending: true })

    let nextTrip: any = null
    for (const t of trips ?? []) {
      const ongoing = t.start_date <= todayStr && (!t.end_date || t.end_date >= todayStr)
      if (ongoing) { nextTrip = { ...t, ongoing: true }; break }
      if (t.start_date >= todayStr) { nextTrip = { ...t, ongoing: false }; break }
    }

    // Momento do card: nunca os ocultos de par/grupo (is_pair_default); prioridade
    // 1) em andamento pelas datas, 2) o próximo futuro, 3) o momento real mais
    // recente sem datas (um evento ainda sem período definido).
    const { data: moments } = await supabaseAdmin
      .from('finance_moments')
      .select('id, name, icon, color, start_date, end_date, created_at')
      .eq('user_id', userId)
      .eq('is_pair_default', false)
      .order('created_at', { ascending: false })

    let activeMoment: any = null
    const dated = (moments ?? []).filter((m: any) => m.start_date)
      .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date))
    for (const m of dated) {
      const ongoing = m.start_date <= todayStr && (!m.end_date || m.end_date >= todayStr)
      if (ongoing) { activeMoment = { ...m, ongoing: true }; break }
      if (m.start_date >= todayStr) { activeMoment = { ...m, ongoing: false }; break }
    }
    if (!activeMoment) {
      const dateless = (moments ?? []).find((m: any) => !m.start_date && !m.end_date)
      if (dateless) activeMoment = { ...dateless, ongoing: false }
    }

    res.json({
      first_name: firstName,
      hot_topics: hotTopics,
      next_trip: nextTrip,
      active_moment: activeMoment,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
