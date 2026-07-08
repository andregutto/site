import { Router } from 'express'
import { randomBytes, randomUUID } from 'crypto'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { cache } from '../lib/cache.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// `getUserById` is a real network round-trip to Supabase Auth (not the DB), and this
// function used to get called once per contact per request with no de-dupe/cache —
// on pages listing many contacts (Pessoas, friend-invite overlays) that meant dozens
// of sequential ~150-300ms admin API calls, which is what made those screens feel slow.
// A short TTL is enough since name/avatar/username rarely change mid-session.
const USER_DISPLAY_TTL_MS = 5 * 60 * 1000
export async function userDisplay(userId: string): Promise<{ email: string; name?: string; avatar_url?: string; username?: string }> {
  return cache.getOrFetch(`userDisplay:${userId}`, USER_DISPLAY_TTL_MS, async () => {
    const [{ data }, { data: handle }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from('user_handles').select('username').eq('user_id', userId).maybeSingle(),
    ])
    const meta = data?.user?.user_metadata ?? {}
    const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || undefined
    return { email: data?.user?.email ?? userId, name, avatar_url: meta.avatar_url, username: handle?.username }
  })
}

// Checks whether `inviteeUserId` has opted in to auto-accepting invites sent
// by `inviterUserId` (a per-friend preference set on the invitee's own
// user_friends row — see migration 054_friend_auto_accept.sql). Used by the
// voyage/finance-moments/shared-categories invite endpoints to decide
// whether a found user is activated immediately or goes through the normal
// pending+accept flow.
export async function canAutoAccept(inviteeUserId: string, inviterUserId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('user_friends')
    .select('auto_accept_invites')
    .eq('owner_user_id', inviteeUserId)
    .eq('friend_user_id', inviterUserId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data?.auto_accept_invites
}

// Checks mutual active friendship between two users, in either direction
// (a friend row can be owned by either side of the pair) — used by
// messaging.ts to gate DM conversation creation/sending.
export async function areActiveFriends(userA: string, userB: string): Promise<boolean> {
  const { data: forward } = await supabaseAdmin
    .from('user_friends')
    .select('id')
    .eq('owner_user_id', userA)
    .eq('friend_user_id', userB)
    .eq('status', 'active')
    .maybeSingle()
  if (forward) return true
  const { data: backward } = await supabaseAdmin
    .from('user_friends')
    .select('id')
    .eq('owner_user_id', userB)
    .eq('friend_user_id', userA)
    .eq('status', 'active')
    .maybeSingle()
  return !!backward
}

// Status de amizade em lote entre `userId` e cada id de `otherIds`, em uma
// query só — extraído do handler GET /messages/friendship-status pra ser
// reaproveitado pelo perfil público (/community/users/:username) sem
// duplicar a lógica. 'pending' cobre convite em qualquer direção.
export type FriendshipStatus = 'self' | 'active' | 'pending' | 'none'
export async function getFriendshipStatuses(userId: string, otherIds: string[]): Promise<Record<string, FriendshipStatus>> {
  const uniqueIds = [...new Set(otherIds)]
  const statuses: Record<string, FriendshipStatus> = {}

  const others = uniqueIds.filter(id => id !== userId)
  for (const id of uniqueIds) if (id === userId) statuses[id] = 'self'
  if (others.length === 0) return statuses

  const { data: rows } = await supabaseAdmin
    .from('user_friends')
    .select('owner_user_id, friend_user_id, status')
    .or(`and(owner_user_id.eq.${userId},friend_user_id.in.(${others.join(',')})),and(friend_user_id.eq.${userId},owner_user_id.in.(${others.join(',')}))`)

  for (const id of others) statuses[id] = 'none'
  for (const row of rows ?? []) {
    const otherId = row.owner_user_id === userId ? row.friend_user_id : row.owner_user_id
    if (!otherId || !others.includes(otherId)) continue
    if (row.status === 'active') statuses[otherId] = 'active'
    else if (row.status === 'pending' && statuses[otherId] !== 'active') statuses[otherId] = 'pending'
  }
  return statuses
}

interface PendingFriendInvite {
  key: string
  token: string
  inviter_name: string
  inviter_username?: string
  occurred_at: string
}

// Convites de amizade pendentes endereçados ao e-mail do usuário logado —
// usado pelo feed de notificações (mirrors getPendingTripInvites/getPendingGroupInvites).
export async function getPendingFriendInvites(userId: string): Promise<PendingFriendInvite[]> {
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  if (!email) return []

  const { data } = await supabaseAdmin
    .from('user_friends')
    .select('id, invite_token, owner_user_id, created_at')
    .eq('status', 'pending')
    .eq('invite_email', email)
    .not('invite_token', 'is', null)
  if (!data?.length) return []

  return Promise.all(data.map(async (row: any) => {
    const owner = await userDisplay(row.owner_user_id)
    return {
      key: `friend_invite:${row.invite_token}`,
      token: row.invite_token as string,
      inviter_name: owner.name ?? owner.email,
      inviter_username: owner.username,
      occurred_at: row.created_at,
    }
  }))
}

interface RecentFriendAcceptance {
  key: string
  friend_name: string
  friend_username?: string
  occurred_at: string
}

// Conexões de amizade que acabaram de virar 'active' — usado para notificar
// quem enviou o convite original.
export async function getRecentFriendAcceptances(userId: string): Promise<RecentFriendAcceptance[]> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('user_friends')
    .select('id, friend_user_id, joined_at')
    .eq('owner_user_id', userId)
    .eq('status', 'active')
    .not('joined_at', 'is', null)
    .gte('joined_at', since)
  if (!data?.length) return []

  return Promise.all(data.map(async (row: any) => {
    const friend = row.friend_user_id ? await userDisplay(row.friend_user_id) : null
    return {
      key: `friend_accepted:${row.id}`,
      friend_name: friend?.name ?? friend?.email ?? 'Alguém',
      friend_username: friend?.username,
      occurred_at: row.joined_at,
    }
  }))
}

// ── GET /api/people ────────────────────────────────────────────────────────────
router.get('/', async (req: any, res: any) => {
  const userId = uid(req)

  try {
    const contactMap = new Map<string, any>()
    // Momento vinculado a uma viagem (voyage_trip_moments) não vira um contexto
    // "Momento" separado — compartilhar a viagem já compartilha o momento dela
    // junto, então mostrar os dois é a mesma relação duas vezes (ver conversa em
    // docs/SHARED_EXPENSES_MODEL.md sobre esse tipo de duplicação).
    const tripLinkedMomentIds = new Set<number>()

    // ── 1. Viagens que o usuário é DONO (outbound) ─────────────────────────────
    const { data: ownedTrips, error: tripErr } = await supabaseAdmin
      .from('voyage_trips')
      .select('id, title')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (tripErr) throw tripErr

    const ownedTripIds = (ownedTrips ?? []).map((t: any) => t.id)
    const ownedTripMap: Record<number, string> = Object.fromEntries(
      (ownedTrips ?? []).map((t: any) => [t.id, t.title])
    )

    if (ownedTripIds.length > 0) {
      const { data: members, error: memErr } = await supabaseAdmin
        .from('voyage_trip_members')
        .select('id, invite_email, role, status, user_id, trip_id')
        .in('trip_id', ownedTripIds)
        .order('invite_email')
      if (memErr) throw memErr

      for (const m of members ?? []) {
        const email: string = m.invite_email
        if (!email) continue
        if (!contactMap.has(email)) {
          contactMap.set(email, { email, user_id: m.user_id ?? null, status: 'pending', contexts: [] })
        }
        const c = contactMap.get(email)!
        if (m.status === 'active') c.status = 'active'
        c.contexts.push({
          type: 'voyage_trip', direction: 'owned_by_me',
          trip_id: m.trip_id, trip_title: ownedTripMap[m.trip_id] ?? '',
          role: m.role, member_id: m.id, member_status: m.status,
        })
      }
    }

    // ── 2. Viagens onde o usuário é MEMBRO (inbound) ───────────────────────────
    const { data: myMemberships } = await supabaseAdmin
      .from('voyage_trip_members')
      .select('id, trip_id, role, status')
      .eq('user_id', userId)

    if ((myMemberships ?? []).length > 0) {
      const inboundTripIds = (myMemberships!).map((m: any) => m.trip_id)
      const { data: inboundTrips } = await supabaseAdmin
        .from('voyage_trips')
        .select('id, title, user_id')
        .in('id', inboundTripIds)
        .neq('user_id', userId)

      const inboundTripMap: Record<number, { title: string; owner_id: string }> = Object.fromEntries(
        (inboundTrips ?? []).map((t: any) => [t.id, { title: t.title, owner_id: t.user_id }])
      )
      const ownerIds = [...new Set((inboundTrips ?? []).map((t: any) => t.user_id as string))]
      const ownerDisplays = await Promise.all(ownerIds.map(id => userDisplay(id).then(d => ({ id, ...d }))))
      const ownerMap: Record<string, { email: string; name?: string }> = Object.fromEntries(
        ownerDisplays.map(o => [o.id, { email: o.email, name: o.name }])
      )

      for (const m of myMemberships ?? []) {
        const tripInfo = inboundTripMap[m.trip_id]
        if (!tripInfo) continue
        const owner = ownerMap[tripInfo.owner_id]
        if (!owner) continue
        const email = owner.email
        if (!contactMap.has(email)) {
          contactMap.set(email, { email, name: owner.name, user_id: tripInfo.owner_id, status: 'active', contexts: [] })
        }
        const c = contactMap.get(email)!
        c.contexts.push({
          type: 'voyage_trip', direction: 'shared_with_me',
          trip_id: m.trip_id, trip_title: tripInfo.title,
          role: m.role, member_id: m.id, member_status: m.status,
        })
      }
    }

    // ── 3. Grupos de finanças que o usuário CRIOU (outbound) ───────────────────
    const { data: ownedGroups, error: groupErr } = await supabaseAdmin
      .from('shared_groups')
      .select('id, name')
      .eq('created_by', userId)
    if (groupErr) throw groupErr

    const ownedGroupIds = (ownedGroups ?? []).map((g: any) => g.id)
    const ownedGroupMap: Record<number, string> = Object.fromEntries(
      (ownedGroups ?? []).map((g: any) => [g.id, g.name])
    )

    if (ownedGroupIds.length > 0) {
      const { data: gMembers, error: gmErr } = await supabaseAdmin
        .from('shared_group_members')
        .select('id, group_id, user_id, invite_email, status')
        .in('group_id', ownedGroupIds)
        .not('invite_email', 'is', null)
      if (gmErr) throw gmErr

      for (const m of gMembers ?? []) {
        const email: string = m.invite_email
        if (!email) continue
        if (!contactMap.has(email)) {
          contactMap.set(email, { email, user_id: m.user_id ?? null, status: 'pending', contexts: [] })
        }
        const c = contactMap.get(email)!
        if (m.status === 'active') c.status = 'active'
        c.contexts.push({
          type: 'shared_finance', direction: 'owned_by_me',
          group_id: m.group_id, group_name: ownedGroupMap[m.group_id] ?? '',
          member_id: m.id, member_status: m.status,
        })
      }
    }

    // ── 4. Grupos de finanças onde o usuário é MEMBRO (inbound) ───────────────
    const { data: myGroupMemberships } = await supabaseAdmin
      .from('shared_group_members')
      .select('id, group_id, status')
      .eq('user_id', userId)

    if ((myGroupMemberships ?? []).length > 0) {
      const myGroupIds = (myGroupMemberships!).map((m: any) => m.group_id)
      const { data: inboundGroups } = await supabaseAdmin
        .from('shared_groups')
        .select('id, name, created_by')
        .in('id', myGroupIds)
        .neq('created_by', userId)

      const inboundGroupMap: Record<number, { name: string; created_by: string }> = Object.fromEntries(
        (inboundGroups ?? []).map((g: any) => [g.id, { name: g.name, created_by: g.created_by }])
      )
      const creatorIds = [...new Set((inboundGroups ?? []).map((g: any) => g.created_by as string))]
      const creatorDisplays = await Promise.all(creatorIds.map(id => userDisplay(id).then(d => ({ id, ...d }))))
      const creatorMap: Record<string, { email: string; name?: string }> = Object.fromEntries(
        creatorDisplays.map(o => [o.id, { email: o.email, name: o.name }])
      )

      for (const m of myGroupMemberships ?? []) {
        const groupInfo = inboundGroupMap[m.group_id]
        if (!groupInfo) continue
        const creator = creatorMap[groupInfo.created_by]
        if (!creator) continue
        const email = creator.email
        if (!contactMap.has(email)) {
          contactMap.set(email, { email, name: creator.name, user_id: groupInfo.created_by, status: 'active', contexts: [] })
        }
        const c = contactMap.get(email)!
        c.contexts.push({
          type: 'shared_finance', direction: 'shared_with_me',
          group_id: m.group_id, group_name: groupInfo.name,
          member_id: m.id, member_status: m.status,
        })
      }
    }

    // ── 4.5 Momentos financeiros que o usuário CRIOU (outbound) ────────────────
    const { data: ownedMoments, error: momentErr } = await supabaseAdmin
      .from('finance_moments')
      .select('id, name, is_pair_default, shared_group_id')
      .eq('user_id', userId)
    if (momentErr) throw momentErr

    const ownedMomentIds = (ownedMoments ?? []).map((m: any) => m.id)
    const ownedMomentMap: Record<number, string> = Object.fromEntries(
      (ownedMoments ?? []).map((m: any) => [m.id, m.name])
    )
    // is_pair_default também é usado pro Momento padrão de um GRUPO compartilhado
    // (getOrCreateDefaultGroupMoment também seta is_pair_default=true) — só
    // shared_group_id distingue "1:1 puro" de "padrão de grupo". Precisamos dos dois
    // pra a Hoje/PeoplePage saberem quando mostrar um Momento como opção de grupo em
    // vez de assumir que já está coberto pelo 1:1 oculto.
    const momentGroupIdMap: Record<number, number | null> = Object.fromEntries(
      (ownedMoments ?? []).map((m: any) => [m.id, m.shared_group_id ?? null])
    )
    // Momentos 1:1 ocultos nunca viram um "contexto" visível de relacionamento —
    // só entram no cálculo de saldo (balanceByUserMoment), abaixo.
    const pairDefaultIds = new Set<number>((ownedMoments ?? []).filter((m: any) => m.is_pair_default).map((m: any) => m.id))

    if (ownedMomentIds.length > 0) {
      const { data: linkedTrips } = await supabaseAdmin
        .from('voyage_trip_moments').select('moment_id').in('moment_id', ownedMomentIds)
      for (const l of linkedTrips ?? []) tripLinkedMomentIds.add((l as any).moment_id)
    }

    if (ownedMomentIds.length > 0) {
      const { data: mMembers, error: mmErr } = await supabaseAdmin
        .from('finance_moment_members')
        .select('id, moment_id, invite_email, role, status, user_id')
        .in('moment_id', ownedMomentIds)
        .order('invite_email')
      if (mmErr) throw mmErr

      for (const m of mMembers ?? []) {
        if (pairDefaultIds.has(m.moment_id) || tripLinkedMomentIds.has(m.moment_id)) continue
        const email: string = m.invite_email
        if (!email) continue
        if (!contactMap.has(email)) {
          contactMap.set(email, { email, user_id: m.user_id ?? null, status: 'pending', contexts: [] })
        }
        const c = contactMap.get(email)!
        if (m.status === 'active') c.status = 'active'
        c.contexts.push({
          type: 'finance_moment', direction: 'owned_by_me',
          moment_id: m.moment_id, moment_name: ownedMomentMap[m.moment_id] ?? '',
          role: m.role, member_id: m.id, member_status: m.status,
        })
      }
    }

    // ── 4.6 Momentos financeiros onde o usuário é MEMBRO (inbound) ─────────────
    const { data: myMomentMemberships } = await supabaseAdmin
      .from('finance_moment_members')
      .select('id, moment_id, role, status')
      .eq('user_id', userId)

    if ((myMomentMemberships ?? []).length > 0) {
      const inboundMomentIds = (myMomentMemberships!).map((m: any) => m.moment_id)
      const { data: inboundLinkedTrips } = await supabaseAdmin
        .from('voyage_trip_moments').select('moment_id').in('moment_id', inboundMomentIds)
      for (const l of inboundLinkedTrips ?? []) tripLinkedMomentIds.add((l as any).moment_id)
      const { data: inboundMoments } = await supabaseAdmin
        .from('finance_moments')
        .select('id, name, user_id, is_pair_default, shared_group_id')
        .in('id', inboundMomentIds)
        .neq('user_id', userId)

      const inboundMomentMap: Record<number, { name: string; owner_id: string }> = Object.fromEntries(
        (inboundMoments ?? []).map((m: any) => [m.id, { name: m.name, owner_id: m.user_id }])
      )
      for (const m of inboundMoments ?? []) {
        if ((m as any).is_pair_default) pairDefaultIds.add((m as any).id)
        momentGroupIdMap[(m as any).id] = (m as any).shared_group_id ?? null
      }
      const momentOwnerIds = [...new Set((inboundMoments ?? []).map((m: any) => m.user_id as string))]
      const momentOwnerDisplays = await Promise.all(momentOwnerIds.map(id => userDisplay(id).then(d => ({ id, ...d }))))
      const momentOwnerMap: Record<string, { email: string; name?: string }> = Object.fromEntries(
        momentOwnerDisplays.map(o => [o.id, { email: o.email, name: o.name }])
      )

      for (const m of myMomentMemberships ?? []) {
        if (pairDefaultIds.has(m.moment_id) || tripLinkedMomentIds.has(m.moment_id)) continue
        const momentInfo = inboundMomentMap[m.moment_id]
        if (!momentInfo) continue
        const owner = momentOwnerMap[momentInfo.owner_id]
        if (!owner) continue
        const email = owner.email
        if (!contactMap.has(email)) {
          contactMap.set(email, { email, name: owner.name, user_id: momentInfo.owner_id, status: 'active', contexts: [] })
        }
        const c = contactMap.get(email)!
        c.contexts.push({
          type: 'finance_moment', direction: 'shared_with_me',
          moment_id: m.moment_id, moment_name: momentInfo.name,
          role: m.role, member_id: m.id, member_status: m.status,
        })
      }
    }

    // ── 5. Amigos cadastrados diretamente (sem viagem/categoria compartilhada) ──
    const me = await userDisplay(userId)

    const { data: myOwnedFriends } = await supabaseAdmin
      .from('user_friends')
      .select('id, invite_email, friend_user_id, status, invite_token, auto_accept_invites')
      .eq('owner_user_id', userId)
    for (const f of myOwnedFriends ?? []) {
      const email: string = f.invite_email
      if (!contactMap.has(email)) {
        contactMap.set(email, { email, user_id: f.friend_user_id ?? null, status: f.status, contexts: [] })
      }
      const c = contactMap.get(email)!
      if (f.status === 'active') c.status = 'active'
      c.contexts.push({ type: 'friend', direction: 'owned_by_me', friend_id: f.id, friend_status: f.status, auto_accept_invites: f.auto_accept_invites })
    }

    const { data: friendsOfMine } = await supabaseAdmin
      .from('user_friends')
      .select('id, owner_user_id, status')
      .eq('friend_user_id', userId)
      .eq('status', 'active')
    for (const f of friendsOfMine ?? []) {
      const owner = await userDisplay(f.owner_user_id)
      if (!contactMap.has(owner.email)) {
        contactMap.set(owner.email, { email: owner.email, name: owner.name, user_id: f.owner_user_id, status: 'active', contexts: [] })
      }
      const c = contactMap.get(owner.email)!
      c.contexts.push({ type: 'friend', direction: 'shared_with_me', friend_id: f.id, friend_status: 'active' })
    }

    // Convites de amizade pendentes endereçados a mim (ainda sem friend_user_id resolvido)
    const { data: pendingForMe } = await supabaseAdmin
      .from('user_friends')
      .select('id, owner_user_id, invite_token, status')
      .eq('invite_email', me.email)
      .eq('status', 'pending')
      .neq('owner_user_id', userId)
    for (const f of pendingForMe ?? []) {
      const owner = await userDisplay(f.owner_user_id)
      if (!contactMap.has(owner.email)) {
        contactMap.set(owner.email, { email: owner.email, name: owner.name, user_id: f.owner_user_id, status: 'pending', contexts: [] })
      }
      const c = contactMap.get(owner.email)!
      c.contexts.push({
        type: 'friend', direction: 'shared_with_me', friend_id: f.id,
        friend_status: 'pending', accept_token: f.invite_token,
      })
    }

    // ── 5.5 Saldo agregado por amigo (Splitwise-lite) ──────────────────────────
    // Soma finance_moment_expense_shares de TODOS os Momentos compartilhados com o
    // usuário (donos ou membros) — não só o momento aberto no momento — pra responder
    // "quanto eu devo/me devem no total com essa pessoa" na página Pessoas.
    const allMomentIds = [...new Set([...ownedMomentIds, ...(myMomentMemberships ?? []).map((m: any) => m.moment_id)])]
    // balanceByUser[otherUserId][currency]: positivo = a pessoa me deve, negativo = eu devo a ela
    const balanceByUser: Record<string, Record<string, number>> = {}
    // balanceByUserMoment[otherUserId][momentId][currency] — mesmo saldo, mas granular por
    // Momento, pra a página Pessoas mostrar "com quem devo o quê" além do total agregado.
    const balanceByUserMoment: Record<string, Record<number, Record<string, number>>> = {}
    const momentNameMap: Record<number, string> = { ...ownedMomentMap }
    if (allMomentIds.length > 0) {
      const { data: expenseRows } = await supabaseAdmin
        .from('finance_moment_expenses')
        .select('moment_id, paid_by_user_id, currency, finance_moment_expense_shares(user_id, share_amount)')
        .in('moment_id', allMomentIds)

      const missingNameIds = allMomentIds.filter(id => !(id in momentNameMap))
      if (missingNameIds.length > 0) {
        const { data: names } = await supabaseAdmin.from('finance_moments').select('id, name, shared_group_id').in('id', missingNameIds)
        for (const m of names ?? []) {
          momentNameMap[m.id] = m.name
          momentGroupIdMap[m.id] = (m as any).shared_group_id ?? null
        }
      }

      for (const e of expenseRows ?? []) {
        const momentId = (e as any).moment_id as number
        const payer = (e as any).paid_by_user_id as string
        const currency = (e as any).currency as string
        const shares = ((e as any).finance_moment_expense_shares ?? []) as { user_id: string; share_amount: number }[]
        const applyDelta = (otherUserId: string, delta: number) => {
          balanceByUser[otherUserId] ??= {}
          balanceByUser[otherUserId][currency] = (balanceByUser[otherUserId][currency] ?? 0) + delta
          balanceByUserMoment[otherUserId] ??= {}
          balanceByUserMoment[otherUserId][momentId] ??= {}
          balanceByUserMoment[otherUserId][momentId][currency] = (balanceByUserMoment[otherUserId][momentId][currency] ?? 0) + delta
        }
        if (payer === userId) {
          for (const s of shares) {
            if (s.user_id === userId) continue
            applyDelta(s.user_id, s.share_amount)
          }
        } else {
          const mine = shares.find(s => s.user_id === userId)
          if (mine) applyDelta(payer, -mine.share_amount)
        }
      }
    }

    // ── 6. Enriquecer com avatar_url (e nome, se faltar) para contatos com user_id ──
    const contacts = Array.from(contactMap.values())
    const idsNeedingDisplay = [...new Set(contacts.filter(c => c.user_id).map(c => c.user_id as string))]
    if (idsNeedingDisplay.length > 0) {
      const displays = await Promise.all(idsNeedingDisplay.map(id => userDisplay(id).then(d => ({ id, ...d }))))
      const displayMap: Record<string, { name?: string; avatar_url?: string; username?: string }> = Object.fromEntries(
        displays.map(d => [d.id, { name: d.name, avatar_url: d.avatar_url, username: d.username }])
      )
      for (const c of contacts) {
        if (c.user_id && displayMap[c.user_id]) {
          c.avatar_url = displayMap[c.user_id].avatar_url
          c.username = displayMap[c.user_id].username
          if (!c.name) c.name = displayMap[c.user_id].name
        }
      }
    }

    for (const c of contacts) {
      const perMoment = c.user_id ? balanceByUserMoment[c.user_id] : undefined
      c.balancesByMoment = perMoment
        ? Object.entries(perMoment)
            .map(([momentId, perCurrency]) => ({
              moment_id: Number(momentId),
              moment_name: momentNameMap[Number(momentId)] ?? '',
              is_pair_default: pairDefaultIds.has(Number(momentId)),
              shared_group_id: momentGroupIdMap[Number(momentId)] ?? null,
              balances: Object.entries(perCurrency)
                .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
                .filter(b => Math.abs(b.amount) >= 0.01),
            }))
            .filter(m => m.balances.length > 0)
        : []
      const perCurrency = c.user_id ? balanceByUser[c.user_id] : undefined
      c.balances = perCurrency
        ? Object.entries(perCurrency)
            .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
            .filter(b => Math.abs(b.amount) >= 0.01)
        : []
    }

    res.json({ contacts })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/people/invite  (cadastrar amigo por e-mail) ───────────────────────
router.post('/invite', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { email: rawEmail, username: rawUsername } = req.body as { email?: string; username?: string }

    let email = rawEmail?.trim()
    let targetUserId: string | null = null

    if (!email && rawUsername) {
      const username = rawUsername.trim().toLowerCase().replace(/^@/, '')
      const { data: handle } = await supabaseAdmin
        .from('user_handles').select('user_id').eq('username', username).maybeSingle()
      if (!handle) { res.status(404).json({ error: 'Nenhum usuário com esse @' }); return }
      targetUserId = handle.user_id
      email = (await userDisplay(handle.user_id)).email
    }

    if (!email?.includes('@')) { res.status(400).json({ error: 'E-mail ou @ inválido' }); return }
    if (email.toLowerCase() === (await userDisplay(userId)).email?.toLowerCase()) {
      res.status(400).json({ error: 'Você não pode se adicionar como amigo' }); return
    }

    if (!targetUserId) {
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
      targetUserId = authList?.users?.find(u => u.email?.toLowerCase() === email!.toLowerCase())?.id ?? null
    }

    const token = randomBytes(24).toString('hex')
    const { data, error } = await supabaseAdmin
      .from('user_friends')
      .upsert(
        { owner_user_id: userId, invite_email: email, friend_user_id: targetUserId, invite_token: token, status: 'pending' },
        { onConflict: 'owner_user_id,invite_email' }
      )
      .select('id')
      .single()
    if (error) { res.status(500).json({ error: error.message }); return }

    res.json({ id: data.id, token })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao convidar' })
  }
})

// ── GET /api/people/search?q=  (autocomplete por @username) ─────────────────────
router.get('/search', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const q = String(req.query.q ?? '').trim().toLowerCase().replace(/^@/, '')
    if (q.length < 2) { res.json([]); return }

    const { data: handles, error } = await supabaseAdmin
      .from('user_handles')
      .select('user_id, username')
      .like('username', `${q}%`)
      .neq('user_id', userId)
      .limit(8)
    if (error) { res.status(500).json({ error: error.message }); return }
    if (!handles?.length) { res.json([]); return }

    const results = await Promise.all(handles.map(async (h: any) => {
      const d = await userDisplay(h.user_id)
      return { user_id: h.user_id, username: h.username, name: d.name, avatar_url: d.avatar_url }
    }))
    res.json(results)
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro na busca' })
  }
})

// ── POST /api/people/invite/accept  (aceitar convite de amizade) ────────────────
router.post('/invite/accept', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { token } = req.body as { token?: string }
    if (!token) { res.status(400).json({ error: 'Token obrigatório' }); return }

    const { data: row } = await supabaseAdmin
      .from('user_friends')
      .select('id, status, owner_user_id')
      .eq('invite_token', token)
      .maybeSingle()
    if (!row) { res.status(404).json({ error: 'Convite não encontrado' }); return }
    if (row.status !== 'pending') { res.status(409).json({ error: 'Convite já utilizado' }); return }

    const { error } = await supabaseAdmin
      .from('user_friends')
      .update({ friend_user_id: userId, status: 'active', joined_at: new Date().toISOString(), invite_token: null })
      .eq('id', row.id)
    if (error) { res.status(500).json({ error: error.message }); return }

    // Registra no histórico de notificações de quem aceitou — sem isso, o
    // item simplesmente desaparecia (deixava de ser 'pending' e nunca
    // tinha sido dismissed, então não aparecia em active nem em history).
    const owner = await userDisplay(row.owner_user_id)
    await supabaseAdmin.from('notification_dismissals').upsert({
      user_id: userId,
      key: `friend_invite:${token}`,
      type: 'friend_invite_accepted',
      params: { inviter_name: owner.name ?? owner.email, inviter_username: owner.username },
      severity: 'success',
      link: '/people',
      occurred_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' })

    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao aceitar convite' })
  }
})

// ── PATCH /api/people/friends/auto-accept  (aceitar convites automaticamente de alguém) ──
// Upsert porque o convidado pode nunca ter criado sua própria linha em
// user_friends ainda (ex.: a amizade só existe do ponto de vista do outro,
// que o convidou) — o toggle precisa funcionar mesmo assim.
router.patch('/friends/auto-accept', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { friend_user_id, auto_accept_invites } = req.body as { friend_user_id?: string; auto_accept_invites?: boolean }
    if (!friend_user_id) { res.status(400).json({ error: 'friend_user_id obrigatório' }); return }

    const friend = await userDisplay(friend_user_id)
    const { error } = await supabaseAdmin
      .from('user_friends')
      .upsert(
        {
          owner_user_id: userId,
          friend_user_id,
          invite_email: friend.email,
          status: 'active',
          joined_at: new Date().toISOString(),
          auto_accept_invites: !!auto_accept_invites,
        },
        { onConflict: 'owner_user_id,invite_email' }
      )
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao atualizar' })
  }
})

// ── POST /api/people/settle  ("acertar contas" com um amigo) ───────────────────
// Zera o saldo pendente com um amigo em CADA Momento compartilhado onde há
// pendência (não um registro global à parte) — assim o próprio Momento também
// mostra zerado, não só o agregado da tela Pessoas. Cria uma linha de
// finance_moment_expenses marcada is_settlement=true por Momento/moeda pendente,
// todas com o mesmo settlement_batch_id pra virar UMA notificação só pro amigo.
router.post('/settle', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const { friend_user_id, moment_id } = req.body as { friend_user_id?: string; moment_id?: number }
    if (!friend_user_id) { res.status(400).json({ error: 'friend_user_id obrigatório' }); return }

    const result = await settleBalanceWithFriend(userId, friend_user_id, moment_id)
    res.json(result)
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao acertar contas' })
  }
})

// Zera o saldo pendente entre `userId` e `friendUserId` em todos os Momentos
// compartilhados (ou só em `momentId`, se informado). Extraído do handler de
// POST /settle pra ser reaproveitado pelo fluxo de exclusão de conta, que precisa
// quitar TODOS os saldos pendentes do usuário (com cada amigo) antes de apagar.
export async function settleBalanceWithFriend(userId: string, friendUserId: string, momentIdFilter?: number): Promise<{ ok: true; settled: { currency: string; amount: number }[] }> {
  // Momentos onde AMBOS (eu e o amigo) são participantes (dono ou membro ativo) —
  // só nesses pode haver despesa dividida entre nós dois.
  const { data: ownerRows } = await supabaseAdmin
    .from('finance_moments').select('id, user_id').in('user_id', [userId, friendUserId])
  const ownerMap = new Map((ownerRows ?? []).map((r: any) => [r.id as number, r.user_id as string]))

  const { data: memberRows } = await supabaseAdmin
    .from('finance_moment_members').select('moment_id, user_id')
    .eq('status', 'active').in('user_id', [userId, friendUserId])
  const memberSet = new Set((memberRows ?? []).map((r: any) => `${r.moment_id}:${r.user_id}`))

  const candidateIds = new Set<number>([...ownerMap.keys(), ...(memberRows ?? []).map((r: any) => r.moment_id as number)])
  const isParticipant = (momentId: number, u: string) => ownerMap.get(momentId) === u || memberSet.has(`${momentId}:${u}`)
  // `momentIdFilter` scopes the settle-up to a single Momento — used by the "acertar contas"
  // action inside a Momento's expense list, as opposed to the Pessoas page (or account
  // deletion) which settles across every shared Momento at once.
  let sharedMomentIds = [...candidateIds].filter(id => isParticipant(id, userId) && isParticipant(id, friendUserId))
  if (momentIdFilter != null) sharedMomentIds = sharedMomentIds.filter(id => id === momentIdFilter)

  if (sharedMomentIds.length === 0) return { ok: true, settled: [] }

  const { data: expenseRows } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('moment_id, currency, paid_by_user_id, finance_moment_expense_shares(user_id, share_amount)')
    .in('moment_id', sharedMomentIds)

  // balancePerMoment[momentId][currency]: positivo = amigo me deve, negativo = eu devo a ele
  const balancePerMoment: Record<number, Record<string, number>> = {}
  for (const e of expenseRows ?? []) {
    const momentId = (e as any).moment_id as number
    const payer = (e as any).paid_by_user_id as string
    const currency = (e as any).currency as string
    const shares = ((e as any).finance_moment_expense_shares ?? []) as { user_id: string; share_amount: number }[]
    if (payer === userId) {
      const s = shares.find(s => s.user_id === friendUserId)
      if (s) {
        balancePerMoment[momentId] ??= {}
        balancePerMoment[momentId][currency] = (balancePerMoment[momentId][currency] ?? 0) + s.share_amount
      }
    } else if (payer === friendUserId) {
      const mine = shares.find(s => s.user_id === userId)
      if (mine) {
        balancePerMoment[momentId] ??= {}
        balancePerMoment[momentId][currency] = (balancePerMoment[momentId][currency] ?? 0) - mine.share_amount
      }
    }
  }

  const batchId = randomUUID()
  const inserts: Record<string, unknown>[] = []
  const totals: Record<string, number> = {}
  for (const [momentIdStr, byCurrency] of Object.entries(balancePerMoment)) {
    const momentId = Number(momentIdStr)
    for (const [currency, bal] of Object.entries(byCurrency)) {
      const rounded = Math.round(bal * 100) / 100
      if (Math.abs(rounded) < 0.01) continue
      // Cancela o saldo: quem estava em débito "paga" o valor total pro outro,
      // registrado como uma despesa cujo pagador é o credor e cuja única parte é
      // o devedor — mesma mecânica que o Splitwise usa pra um "payment".
      const paidBy = rounded > 0 ? friendUserId : userId
      const owesUser = rounded > 0 ? userId : friendUserId
      const amount = Math.abs(rounded)
      inserts.push({
        moment_id: momentId, description: 'Acerto de contas', amount, currency,
        paid_by_user_id: paidBy, split_type: 'custom', is_settlement: true,
        settlement_batch_id: batchId, created_by: userId,
      })
      totals[currency] = (totals[currency] ?? 0) + amount
      ;(inserts[inserts.length - 1] as any)._owesUser = owesUser
    }
  }

  if (inserts.length === 0) return { ok: true, settled: [] }

  for (const row of inserts) {
    const owesUser = (row as any)._owesUser as string
    delete (row as any)._owesUser
    const { data: expense, error } = await supabaseAdmin
      .from('finance_moment_expenses').insert(row).select().single()
    if (error) throw new Error(error.message)
    const { error: shareErr } = await supabaseAdmin
      .from('finance_moment_expense_shares')
      .insert({ expense_id: expense.id, user_id: owesUser, share_amount: row.amount })
    if (shareErr) {
      await supabaseAdmin.from('finance_moment_expenses').delete().eq('id', expense.id)
      throw new Error(shareErr.message)
    }
  }

  return { ok: true, settled: Object.entries(totals).map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })) }
}

// ── DELETE /api/people/friends/:id  (desfazer conexão de amizade) ───────────────
router.delete('/friends/:id', async (req: any, res: any) => {
  try {
    const userId = uid(req)
    const id = Number(req.params.id)

    const { data: row } = await supabaseAdmin
      .from('user_friends')
      .select('owner_user_id, friend_user_id')
      .eq('id', id)
      .maybeSingle()
    if (!row) { res.status(404).json({ error: 'Não encontrado' }); return }
    if (row.owner_user_id !== userId && row.friend_user_id !== userId) {
      res.status(403).json({ error: 'Sem permissão' }); return
    }

    const otherUserId = row.owner_user_id === userId ? row.friend_user_id : row.owner_user_id
    await supabaseAdmin.from('user_friends').delete().eq('id', id)

    // Desfazer a amizade revoga todo compartilhamento entre os dois — em
    // ambas as direções (cada um pode ter convidado o outro pra coisas
    // diferentes). Sem isso a pessoa removida continuaria vendo/editando
    // viagens, momentos e categorias do outro mesmo depois de "desconectados".
    if (otherUserId) await revokeAllSharingBetween(userId, otherUserId)

    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao remover' })
  }
})

// Revoga, nas duas direções, todo compartilhamento entre userA e userB:
// viagens, momentos financeiros e categorias compartilhadas onde um convidou
// o outro. Chamado ao desfazer uma conexão de amizade.
// NÃO apaga conversas/mensagens de DM (dm_conversations/dm_messages) — o
// histórico permanece intacto; messaging.ts revalida areActiveFriends() a
// cada envio, então o par simplesmente não consegue mais trocar mensagens.
async function revokeAllSharingBetween(userA: string, userB: string) {
  for (const [ownerId, memberId] of [[userA, userB], [userB, userA]] as const) {
    // Viagens: hard delete da linha de membro (mesma semântica do botão "Remover" da Voyage)
    const { data: ownedTrips } = await supabaseAdmin.from('voyage_trips').select('id').eq('user_id', ownerId)
    const tripIds = (ownedTrips ?? []).map(t => t.id)
    if (tripIds.length > 0) {
      await supabaseAdmin.from('voyage_trip_members').delete().in('trip_id', tripIds).eq('user_id', memberId)
    }

    // Categorias compartilhadas: hard delete (mesma semântica do "Remover" existente)
    const { data: ownedGroups } = await supabaseAdmin.from('shared_groups').select('id').eq('created_by', ownerId)
    const groupIds = (ownedGroups ?? []).map(g => g.id)
    if (groupIds.length > 0) {
      await supabaseAdmin.from('shared_group_members').delete().in('group_id', groupIds).eq('user_id', memberId)
    }

    // Momentos financeiros: status='left' + apaga só as transações do membro
    // removido naquele momento (mesma semântica do endpoint de revoke).
    const { data: ownedMoments } = await supabaseAdmin.from('finance_moments').select('id').eq('user_id', ownerId)
    const momentIds = (ownedMoments ?? []).map(m => m.id)
    if (momentIds.length > 0) {
      await supabaseAdmin.from('finance_moment_members')
        .update({ status: 'left' })
        .in('moment_id', momentIds).eq('user_id', memberId)
      const { data: txLinks } = await supabaseAdmin
        .from('finance_transaction_moments')
        .select('transaction_id, moment_id')
        .in('moment_id', momentIds).eq('user_id', memberId)
      const txIds = (txLinks ?? []).map(t => t.transaction_id)
      if (txIds.length > 0) {
        await supabaseAdmin.from('finance_transactions').delete().in('id', txIds).eq('user_id', memberId)
      }
    }
  }
}

export default router
