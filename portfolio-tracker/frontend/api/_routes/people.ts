import { Router } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

async function userDisplay(userId: string): Promise<{ email: string; name?: string; avatar_url?: string }> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = data?.user?.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || undefined
  return { email: data?.user?.email ?? userId, name, avatar_url: meta.avatar_url }
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

    // ── 5. Enriquecer com avatar_url (e nome, se faltar) para contatos com user_id ──
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

export default router
