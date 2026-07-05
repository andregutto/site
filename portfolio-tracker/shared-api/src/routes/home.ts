import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay } from './people.js'
import { getCurrentMonthFinance } from './finances.js'
import { getRecentCommunityReplies } from './community.js'

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
      if (ongoing) { nextTrip = { ...t, ongoing: true, past: false }; break }
      if (t.start_date >= todayStr) { nextTrip = { ...t, ongoing: false, past: false }; break }
    }
    if (!nextTrip) {
      // sem viagem futura: relembra a última (mantém o card vivo)
      const past = (trips ?? []).filter((t: any) => t.start_date < todayStr)
      if (past.length) nextTrip = { ...past[past.length - 1], ongoing: false, past: true }
    }

    // Momento do card: nunca os ocultos de par/grupo (is_pair_default). Só surge
    // um momento com DATA — 1) em andamento agora, 2) o próximo futuro. Momento
    // sem data não é "próximo" nem "em andamento", então não vira card (evita o
    // rótulo falso "Próximo momento" num momento que nem tem quando).
    const { data: moments } = await supabaseAdmin
      .from('finance_moments')
      .select('id, name, icon, color, start_date, end_date, created_at')
      .eq('user_id', userId)
      .eq('is_pair_default', false)
      .not('start_date', 'is', null)
      .order('start_date', { ascending: true })

    let activeMoment: any = null
    for (const m of moments ?? []) {
      const ongoing = m.start_date <= todayStr && (!m.end_date || m.end_date >= todayStr)
      if (ongoing) { activeMoment = { ...m, ongoing: true }; break }
      if (m.start_date >= todayStr) { activeMoment = { ...m, ongoing: false }; break }
    }

    // Finanças do mês: mesma base da página Finanças (só despesa, sem receita)
    const monthSummary = await getCurrentMonthFinance(userId).catch(() => null)

    // Comunidade: respostas em tópicos meus que eu ainda não vi (mesmo critério
    // do sino — respostas recentes menos as já dispensadas). Vira ponto vermelho.
    let communityUnseen = 0
    try {
      const replies = await getRecentCommunityReplies(userId)
      if (replies.length) {
        const keys = replies.map(r => r.key)
        const { data: dism } = await supabaseAdmin
          .from('notification_dismissals').select('key').eq('user_id', userId).in('key', keys)
        const dismissed = new Set((dism ?? []).map((d: any) => d.key))
        communityUnseen = replies.filter(r => !dismissed.has(r.key)).length
      }
    } catch { /* ponto vermelho é opcional */ }

    res.json({
      first_name: firstName,
      hot_topics: hotTopics,
      next_trip: nextTrip,
      active_moment: activeMoment,
      month_summary: monthSummary,
      community_unseen: communityUnseen,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
