import { Router } from 'express'
import { randomBytes } from 'crypto'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

async function userDisplay(userId: string): Promise<{ email: string; name?: string; avatar_url?: string; username?: string }> {
  const [{ data }, { data: handle }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('user_handles').select('username').eq('user_id', userId).maybeSingle(),
  ])
  const meta = data?.user?.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || undefined
  return { email: data?.user?.email ?? userId, name, avatar_url: meta.avatar_url, username: handle?.username }
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

    // ── 5. Amigos cadastrados diretamente (sem viagem/categoria compartilhada) ──
    const me = await userDisplay(userId)

    const { data: myOwnedFriends } = await supabaseAdmin
      .from('user_friends')
      .select('id, invite_email, friend_user_id, status, invite_token')
      .eq('owner_user_id', userId)
    for (const f of myOwnedFriends ?? []) {
      const email: string = f.invite_email
      if (!contactMap.has(email)) {
        contactMap.set(email, { email, user_id: f.friend_user_id ?? null, status: f.status, contexts: [] })
      }
      const c = contactMap.get(email)!
      if (f.status === 'active') c.status = 'active'
      c.contexts.push({ type: 'friend', direction: 'owned_by_me', friend_id: f.id, friend_status: f.status })
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

    // ── 6. Enriquecer com avatar_url (e nome, se faltar) para contatos com user_id ──
    const contacts = Array.from(contactMap.values())
    const idsNeedingDisplay = [...new Set(contacts.filter(c => c.user_id).map(c => c.user_id as string))]
    if (idsNeedingDisplay.length > 0) {
      const displays = await Promise.all(idsNeedingDisplay.map(id => userDisplay(id).then(d => ({ id, ...d }))))
      const displayMap: Record<string, { name?: string; avatar_url?: string }> = Object.fromEntries(
        displays.map(d => [d.id, { name: d.name, avatar_url: d.avatar_url }])
      )
      for (const c of contacts) {
        if (c.user_id && displayMap[c.user_id]) {
          c.avatar_url = displayMap[c.user_id].avatar_url
          if (!c.name) c.name = displayMap[c.user_id].name
        }
      }
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

    await supabaseAdmin.from('user_friends').delete().eq('id', id)
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao remover' })
  }
})

export default router
