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

interface HomeFriendEntry { type: 'friend'; user_id: string; name: string; avatar_url?: string; balance: { currency: string; amount: number } | null; last_activity: string | null }
interface HomeGroupEntry {
  type: 'group'; id: number; name: string; balance: { currency: string; amount: number } | null; last_activity: string | null
  members: { name?: string; avatar_url?: string }[] // até 4, pra pilha de avatares no card — ver member_count pro total
  member_count: number
}

function topBalance(balance: Map<string, number>): { currency: string; amount: number } | null {
  let best: { currency: string; amount: number } | null = null
  for (const [currency, amount] of balance) {
    const rounded = Math.round(amount * 100) / 100
    if (Math.abs(rounded) < 0.01) continue
    if (!best || Math.abs(rounded) > Math.abs(best.amount)) best = { currency, amount: rounded }
  }
  return best
}

// Amigos e grupos pro card "Entre amigos" da Hoje, ordenados por atividade
// recente (não por saldo) — reflete quem/o que o usuário tem usado, não só
// quem deve mais. "Atividade" = despesa de Momento mais recente (amigo ou
// grupo) ou transação em categoria compartilhada mais recente (só grupo,
// cobre o uso mais comum — orçamento recorrente — que não passa pelo Momento
// oculto do grupo). Quem nunca teve atividade ainda entra no fim da lista
// (sem data), pra amigo/grupo recém-criado não sumir da Hoje.
async function computeFriendsAndGroups(userId: string): Promise<{ friends: HomeFriendEntry[]; groups: HomeGroupEntry[] }> {
  const [{ data: friendRowsA }, { data: friendRowsB }] = await Promise.all([
    supabaseAdmin.from('user_friends').select('friend_user_id').eq('owner_user_id', userId).eq('status', 'active'),
    supabaseAdmin.from('user_friends').select('owner_user_id').eq('friend_user_id', userId).eq('status', 'active'),
  ])
  const friendIds = new Set<string>([
    ...(friendRowsA ?? []).map((r: any) => r.friend_user_id).filter(Boolean),
    ...(friendRowsB ?? []).map((r: any) => r.owner_user_id).filter(Boolean),
  ])

  const [{ data: memberRows }, { data: createdRows }] = await Promise.all([
    supabaseAdmin.from('shared_group_members').select('group_id').eq('user_id', userId).eq('status', 'active'),
    supabaseAdmin.from('shared_groups').select('id, name').eq('created_by', userId),
  ])
  const memberGroupIds = (memberRows ?? []).map((r: any) => r.group_id)
  const { data: memberGroupsRaw } = memberGroupIds.length
    ? await supabaseAdmin.from('shared_groups').select('id, name').in('id', memberGroupIds)
    : { data: [] as any[] }
  const groupMap = new Map<number, { id: number; name: string }>()
  for (const g of [...(createdRows ?? []), ...(memberGroupsRaw ?? [])]) groupMap.set(g.id, g)

  if (friendIds.size === 0 && groupMap.size === 0) return { friends: [], groups: [] }

  const [{ data: ownedMoments }, { data: memberMomentRows }] = await Promise.all([
    supabaseAdmin.from('finance_moments').select('id, shared_group_id, is_pair_default').eq('user_id', userId),
    supabaseAdmin.from('finance_moment_members').select('moment_id').eq('user_id', userId).eq('status', 'active'),
  ])
  const memberMomentIds = (memberMomentRows ?? []).map((m: any) => m.moment_id).filter((id: number) => !(ownedMoments ?? []).some((m: any) => m.id === id))
  const { data: extraMoments } = memberMomentIds.length
    ? await supabaseAdmin.from('finance_moments').select('id, shared_group_id, is_pair_default').in('id', memberMomentIds)
    : { data: [] as any[] }
  const allMoments = [...(ownedMoments ?? []), ...(extraMoments ?? [])]
  const allMomentIds = allMoments.map((m: any) => m.id)
  const momentInfo = new Map(allMoments.map((m: any) => [m.id, { groupId: m.shared_group_id as number | null, isPairDefault: !!m.is_pair_default }]))

  const friendAgg = new Map<string, { balance: Map<string, number>; lastActivity: string }>()
  const groupAgg = new Map<number, { balance: Map<string, number>; lastActivity: string }>()
  function touchFriend(id: string, createdAt: string): { balance: Map<string, number>; lastActivity: string } {
    const e = friendAgg.get(id) ?? { balance: new Map<string, number>(), lastActivity: createdAt }
    if (createdAt > e.lastActivity) e.lastActivity = createdAt
    friendAgg.set(id, e)
    return e
  }
  function touchGroup(id: number, createdAt: string): { balance: Map<string, number>; lastActivity: string } {
    const e = groupAgg.get(id) ?? { balance: new Map<string, number>(), lastActivity: createdAt }
    if (createdAt > e.lastActivity) e.lastActivity = createdAt
    groupAgg.set(id, e)
    return e
  }

  if (allMomentIds.length > 0) {
    const { data: expenseRows } = await supabaseAdmin
      .from('finance_moment_expenses')
      .select('moment_id, paid_by_user_id, currency, created_at, finance_moment_expense_shares(user_id, share_amount)')
      .in('moment_id', allMomentIds)

    for (const e of expenseRows ?? []) {
      const info = momentInfo.get((e as any).moment_id)
      const payer = (e as any).paid_by_user_id as string
      const currency = (e as any).currency as string
      const createdAt = (e as any).created_at as string
      const shares = ((e as any).finance_moment_expense_shares ?? []) as { user_id: string; share_amount: number }[]

      const applyFriendDelta = (otherUserId: string, delta: number) => {
        if (!friendIds.has(otherUserId)) return
        const agg = touchFriend(otherUserId, createdAt)
        agg.balance.set(currency, (agg.balance.get(currency) ?? 0) + delta)
      }
      if (payer === userId) {
        for (const s of shares) { if (s.user_id !== userId) applyFriendDelta(s.user_id, s.share_amount) }
      } else {
        const mine = shares.find(s => s.user_id === userId)
        if (mine) applyFriendDelta(payer, -mine.share_amount)
      }

      if (info?.groupId != null && groupMap.has(info.groupId)) {
        const agg = touchGroup(info.groupId, createdAt)
        if (info.isPairDefault) {
          if (payer === userId) {
            for (const s of shares) { if (s.user_id !== userId) agg.balance.set(currency, (agg.balance.get(currency) ?? 0) + s.share_amount) }
          } else {
            const mine = shares.find(s => s.user_id === userId)
            if (mine) agg.balance.set(currency, (agg.balance.get(currency) ?? 0) - mine.share_amount)
          }
        }
      }
    }
  }

  if (groupMap.size > 0) {
    const { data: sharedCats } = await supabaseAdmin.from('shared_categories').select('id, group_id').in('group_id', [...groupMap.keys()])
    const catGroupMap = new Map((sharedCats ?? []).map((c: any) => [c.id, c.group_id]))
    const catIds = [...catGroupMap.keys()]
    if (catIds.length > 0) {
      const { data: txns } = await supabaseAdmin
        .from('finance_transactions')
        .select('shared_category_id, date')
        .eq('user_id', userId)
        .in('shared_category_id', catIds)
        .order('date', { ascending: false })
        .limit(500)
      for (const t of txns ?? []) {
        const gid = catGroupMap.get((t as any).shared_category_id)
        if (gid != null) touchGroup(gid, (t as any).date)
      }
    }
  }

  // Membros ativos de cada grupo — pra pilha de avatares no card (2 avatares
  // + "+N" quando tem mais). Não limita a query: precisa da contagem total
  // (member_count) mesmo mostrando só os 4 primeiros em `members`.
  const membersByGroup = new Map<number, string[]>()
  if (groupMap.size > 0) {
    const { data: groupMemberRows } = await supabaseAdmin
      .from('shared_group_members').select('group_id, user_id')
      .in('group_id', [...groupMap.keys()]).eq('status', 'active').not('user_id', 'is', null)
    for (const m of groupMemberRows ?? []) {
      const gid = (m as any).group_id as number
      const list = membersByGroup.get(gid) ?? []
      list.push((m as any).user_id as string)
      membersByGroup.set(gid, list)
    }
  }

  const allDisplayIds = new Set<string>([...friendIds, ...[...membersByGroup.values()].flat()])
  const displays = await Promise.all([...allDisplayIds].map(id => userDisplay(id).then(d => ({ id, ...d }))))
  const displayMap = new Map(displays.map(d => [d.id, d]))

  const friends: HomeFriendEntry[] = [...friendIds].map(id => {
    const d = displayMap.get(id)
    const agg = friendAgg.get(id)
    return {
      type: 'friend' as const, user_id: id, name: d?.name ?? d?.email ?? '?', avatar_url: d?.avatar_url,
      balance: agg ? topBalance(agg.balance) : null, last_activity: agg?.lastActivity ?? null,
    }
  }).sort((a, b) => (b.last_activity ?? '').localeCompare(a.last_activity ?? ''))

  const groups: HomeGroupEntry[] = [...groupMap.entries()].map(([id, g]) => {
    const agg = groupAgg.get(id)
    const memberIds = membersByGroup.get(id) ?? []
    return {
      type: 'group' as const, id, name: g.name,
      balance: agg ? topBalance(agg.balance) : null, last_activity: agg?.lastActivity ?? null,
      members: memberIds.slice(0, 4).map(mid => { const d = displayMap.get(mid); return { name: d?.name ?? d?.email, avatar_url: d?.avatar_url } }),
      member_count: memberIds.length,
    }
  }).sort((a, b) => (b.last_activity ?? '').localeCompare(a.last_activity ?? ''))

  return { friends, groups }
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
      .limit(5)

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
      .select('id, title, destination, start_date, end_date, cover_image_url')
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

    // Momento do card: nunca os ocultos de par/grupo (is_pair_default) nem os que
    // têm uma VIAGEM associada (moment_type 'trip' ou ligados via voyage_trip_moments)
    // — a viagem já os representa, senão duplicaria "última viagem" + "último momento"
    // logo abaixo. Só surge momento avulso COM data: em andamento, próximo, ou o último.
    const { data: tripMomentRows } = await supabaseAdmin
      .from('voyage_trip_moments').select('moment_id').eq('user_id', userId)
    const tripMomentIds = new Set((tripMomentRows ?? []).map((r: any) => r.moment_id))

    const { data: momentsRaw } = await supabaseAdmin
      .from('finance_moments')
      .select('id, name, icon, color, start_date, end_date, cover_image_url, moment_type')
      .eq('user_id', userId)
      .eq('is_pair_default', false)
      .not('start_date', 'is', null)
      .order('start_date', { ascending: true })
    const moments = (momentsRaw ?? []).filter((m: any) => m.moment_type !== 'trip' && !tripMomentIds.has(m.id))

    let activeMoment: any = null
    for (const m of moments) {
      const ongoing = m.start_date <= todayStr && (!m.end_date || m.end_date >= todayStr)
      if (ongoing) { activeMoment = { ...m, ongoing: true, past: false }; break }
      if (m.start_date >= todayStr) { activeMoment = { ...m, ongoing: false, past: false }; break }
    }
    if (!activeMoment) {
      // sem momento atual nem futuro: relembra o último (mais recente no passado)
      const past = moments.filter((m: any) => m.start_date < todayStr)
      if (past.length) activeMoment = { ...past[past.length - 1], ongoing: false, past: true }
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

    // Amigos e grupos pro card "Entre amigos" — calculado aqui (não em /people
    // nem num hook separado) pra chegar junto com o resto da Hoje numa resposta
    // só, evitando a tela decidir o que mostrar antes de todo mundo carregar.
    const { friends: topFriends, groups: topGroups } = await computeFriendsAndGroups(userId).catch(() => ({ friends: [], groups: [] }))

    res.json({
      first_name: firstName,
      hot_topics: hotTopics,
      next_trip: nextTrip,
      active_moment: activeMoment,
      month_summary: monthSummary,
      community_unseen: communityUnseen,
      top_friends: topFriends,
      top_groups: topGroups,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
