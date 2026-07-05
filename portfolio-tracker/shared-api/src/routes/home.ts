import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay } from './people.js'
import { financialMonthKey, financialMonthRange, getUserCycleDay } from './finances.js'

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

    // Finanças do mês (ciclo financeiro do usuário): gasto x orçado
    let monthSummary: { spent: number; budget: number; currency: string } | null = null
    try {
      const cycleDay = await getUserCycleDay(userId)
      const fm = financialMonthKey(todayStr, cycleDay)
      const { start, end } = financialMonthRange(fm, cycleDay)
      const [txRes, catRes, incRes] = await Promise.all([
        supabaseAdmin
          .from('finance_transactions')
          .select('amount, is_internal_transfer, exclude_from_stats')
          .eq('user_id', userId)
          .gte('date', start)
          .lte('date', end),
        supabaseAdmin.from('finance_categories').select('budget_monthly').eq('user_id', userId),
        supabaseAdmin.from('finance_income').select('currency').eq('user_id', userId).maybeSingle(),
      ])
      const spent = (txRes.data ?? [])
        .filter((t: any) => !t.is_internal_transfer && !t.exclude_from_stats && Number(t.amount) < 0)
        .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount)), 0)
      const budget = (catRes.data ?? []).reduce((sum: number, c: any) => sum + (Number(c.budget_monthly) || 0), 0)
      if (spent > 0 || budget > 0) {
        monthSummary = {
          spent: Math.round(spent * 100) / 100,
          budget: Math.round(budget * 100) / 100,
          currency: incRes.data?.currency ?? 'EUR',
        }
      }
    } catch { /* card opcional: sem finanças configuradas, não aparece */ }

    res.json({
      first_name: firstName,
      hot_topics: hotTopics,
      next_trip: nextTrip,
      active_moment: activeMoment,
      month_summary: monthSummary,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
