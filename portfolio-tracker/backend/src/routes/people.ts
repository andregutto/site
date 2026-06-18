import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// ── GET /api/people ────────────────────────────────────────────────────────────
router.get('/', async (req: any, res: any) => {
  const userId = uid(req)

  try {
    const contactMap = new Map<string, any>()

    // ── 1. Viagens que o usuário é dono ────────────────────────────────────────
    const { data: ownedTrips, error: tripErr } = await supabaseAdmin
      .from('voyage_trips')
      .select('id, title')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (tripErr) throw tripErr

    const tripIds = (ownedTrips ?? []).map((t: any) => t.id)
    const tripMap: Record<number, string> = Object.fromEntries(
      (ownedTrips ?? []).map((t: any) => [t.id, t.title])
    )

    if (tripIds.length > 0) {
      const { data: members, error: memErr } = await supabaseAdmin
        .from('voyage_members')
        .select('id, email, role, status, user_id, trip_id')
        .in('trip_id', tripIds)
        .order('email')
      if (memErr) throw memErr

      for (const m of members ?? []) {
        if (!m.email) continue
        if (!contactMap.has(m.email)) {
          contactMap.set(m.email, { email: m.email, user_id: m.user_id ?? null, status: 'pending', contexts: [] })
        }
        const c = contactMap.get(m.email)!
        if (m.status === 'active') c.status = 'active'
        c.contexts.push({
          type: 'voyage_trip',
          trip_id: m.trip_id,
          trip_title: tripMap[m.trip_id] ?? '',
          role: m.role,
          member_id: m.id,
          member_status: m.status,
        })
      }
    }

    // ── 2. Grupos de finanças compartilhadas criados pelo usuário ──────────────
    const { data: ownedGroups, error: groupErr } = await supabaseAdmin
      .from('shared_groups')
      .select('id, name')
      .eq('created_by', userId)

    if (groupErr) throw groupErr

    const groupIds = (ownedGroups ?? []).map((g: any) => g.id)
    const groupMap: Record<number, string> = Object.fromEntries(
      (ownedGroups ?? []).map((g: any) => [g.id, g.name])
    )

    if (groupIds.length > 0) {
      const { data: gMembers, error: gmErr } = await supabaseAdmin
        .from('shared_group_members')
        .select('id, group_id, user_id, invite_email, status')
        .in('group_id', groupIds)
        .not('invite_email', 'is', null) // exclui o próprio criador (auto-join sem invite_email)
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
          type: 'shared_finance',
          group_id: m.group_id,
          group_name: groupMap[m.group_id] ?? '',
          member_id: m.id,
          member_status: m.status,
        })
      }
    }

    res.json({ contacts: Array.from(contactMap.values()) })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
