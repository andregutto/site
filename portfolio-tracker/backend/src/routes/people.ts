import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
router.use(requireAuth)

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

// ── GET /api/people ────────────────────────────────────────────────────────────
// Retorna todos os contatos do usuário, derivados dos contextos de compartilhamento.
// V1: apenas outbound (pessoas convidadas para viagens do usuário).
// Futuramente: finance shared, inbound (viagens de outros das quais é membro).
router.get('/', async (req: any, res: any) => {
  const userId = uid(req)

  try {
    // 1. Viagens que o usuário é dono
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

    // 2. Membros dessas viagens
    let members: any[] = []
    if (tripIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('voyage_members')
        .select('id, email, role, status, user_id, trip_id')
        .in('trip_id', tripIds)
        .order('email')
      if (error) throw error
      members = data ?? []
    }

    // 3. Agrupa por e-mail para montar contatos
    const contactMap = new Map<string, any>()
    for (const m of members) {
      if (!contactMap.has(m.email)) {
        contactMap.set(m.email, {
          email: m.email,
          user_id: m.user_id ?? null,
          status: 'pending',
          contexts: [],
        })
      }
      const contact = contactMap.get(m.email)!
      if (m.status === 'active') contact.status = 'active'
      contact.contexts.push({
        type: 'voyage_trip',
        trip_id: m.trip_id,
        trip_title: tripMap[m.trip_id] ?? '',
        role: m.role,
        member_id: m.id,
        member_status: m.status,
      })
    }

    res.json({ contacts: Array.from(contactMap.values()) })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

export default router
