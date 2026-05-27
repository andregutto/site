import { Router, Response } from 'express'
import { randomBytes } from 'crypto'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()
router.use(requireAuth)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(req: Parameters<typeof requireAuth>[0]): string {
  return (req as AuthRequest).userId
}

async function userDisplay(userId: string): Promise<{ name: string; email: string; avatar_url?: string }> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = data?.user?.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || data?.user?.email || userId
  return { name, email: data?.user?.email ?? '', avatar_url: meta.avatar_url }
}

// ─── Groups ──────────────────────────────────────────────────────────────────

// GET /api/shared/groups
router.get('/groups', async (req, res: Response) => {
  const userId = uid(req)

  // Groups where user is creator or active/pending member
  const { data: memberRows } = await supabaseAdmin
    .from('shared_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .in('status', ['active', 'pending'])

  const { data: createdRows } = await supabaseAdmin
    .from('shared_groups')
    .select('id')
    .eq('created_by', userId)

  const groupIds = [...new Set([
    ...(memberRows ?? []).map(r => r.group_id),
    ...(createdRows ?? []).map(r => r.id),
  ])]

  if (!groupIds.length) { res.json([]); return }

  const { data: groups, error } = await supabaseAdmin
    .from('shared_groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }

  // Enrich with members and categories
  const result = await Promise.all((groups ?? []).map(async g => {
    const { data: members } = await supabaseAdmin
      .from('shared_group_members')
      .select('*')
      .eq('group_id', g.id)
      .neq('status', 'left')

    const enrichedMembers = await Promise.all((members ?? []).map(async m => {
      if (!m.user_id) return { ...m, display: { name: m.invite_email, email: m.invite_email } }
      const display = await userDisplay(m.user_id)
      return { ...m, display }
    }))

    const { data: categories } = await supabaseAdmin
      .from('shared_categories')
      .select('*')
      .eq('group_id', g.id)
      .order('created_at', { ascending: true })

    return { ...g, members: enrichedMembers, categories: categories ?? [] }
  }))

  res.json(result)
})

// POST /api/shared/groups
router.post('/groups', async (req, res: Response) => {
  const userId = uid(req)
  const { name } = req.body as { name: string }
  if (!name?.trim()) { res.status(400).json({ error: 'Nome obrigatório' }); return }

  const { data: group, error } = await supabaseAdmin
    .from('shared_groups')
    .insert({ name: name.trim(), created_by: userId })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }

  // Creator auto-joins as active member
  await supabaseAdmin.from('shared_group_members').insert({
    group_id: group.id,
    user_id: userId,
    status: 'active',
    joined_at: new Date().toISOString(),
    share_pct: 50,
  })

  res.json(group)
})

// PATCH /api/shared/groups/:id
router.patch('/groups/:id', async (req, res: Response) => {
  const userId = uid(req)
  const { name } = req.body as { name: string }
  const { data, error } = await supabaseAdmin
    .from('shared_groups')
    .update({ name: name.trim() })
    .eq('id', req.params.id)
    .eq('created_by', userId)
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// DELETE /api/shared/groups/:id
router.delete('/groups/:id', async (req, res: Response) => {
  const userId = uid(req)
  const { error } = await supabaseAdmin
    .from('shared_groups')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ─── Invites ─────────────────────────────────────────────────────────────────

// POST /api/shared/groups/:id/invite
router.post('/groups/:id/invite', async (req, res: Response) => {
  const userId = uid(req)
  const groupId = Number(req.params.id)
  const { email } = req.body as { email: string }

  if (!email?.includes('@')) { res.status(400).json({ error: 'E-mail inválido' }); return }

  // Must be active member of this group
  const { data: myMember } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!myMember) { res.status(403).json({ error: 'Sem acesso a este grupo' }); return }

  // Check if already a member (by email lookup)
  const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
  const targetUser = existingUser?.users?.find(u => u.email === email)

  // Check if already in group
  if (targetUser) {
    const { data: existing } = await supabaseAdmin
      .from('shared_group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', targetUser.id)
      .single()
    if (existing?.status === 'active') { res.status(409).json({ error: 'Já é membro deste grupo' }); return }
  }

  // Remove any existing pending invite for this email in this group
  await supabaseAdmin
    .from('shared_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('invite_email', email)
    .eq('status', 'pending')

  const token = randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const { error } = await supabaseAdmin.from('shared_group_members').insert({
    group_id: groupId,
    user_id: targetUser?.id ?? null,
    invite_email: email,
    invite_token: token,
    invite_expires_at: expires,
    status: 'pending',
    share_pct: 50,
  })

  if (error) { res.status(500).json({ error: error.message }); return }

  const baseUrl = process.env.FRONTEND_ORIGIN?.split(',')[0] ?? 'https://arvo.andregutto.com'
  res.json({ token, invite_url: `${baseUrl}/invite/${token}` })
})

// GET /api/shared/invite/:token  (preview — no auth required)
router.get('/invite/:token', async (req, res: Response) => {
  const { data: member, error } = await supabaseAdmin
    .from('shared_group_members')
    .select('*, shared_groups(name, created_by)')
    .eq('invite_token', req.params.token)
    .single()

  if (error || !member) { res.status(404).json({ error: 'Convite inválido ou expirado' }); return }
  if (new Date(member.invite_expires_at) < new Date()) { res.status(410).json({ error: 'Convite expirado' }); return }

  const group = member.shared_groups as { name: string; created_by: string }
  const inviter = await userDisplay(group.created_by)

  res.json({
    group_name: group.name,
    inviter_name: inviter.name,
    inviter_avatar: inviter.avatar_url,
    status: member.status,
  })
})

// POST /api/shared/invite/accept
router.post('/invite/accept', async (req, res: Response) => {
  const userId = uid(req)
  const { token } = req.body as { token: string }

  const { data: member, error } = await supabaseAdmin
    .from('shared_group_members')
    .select('*, shared_groups(name)')
    .eq('invite_token', token)
    .single()

  if (error || !member) { res.status(404).json({ error: 'Convite inválido' }); return }
  if (new Date(member.invite_expires_at) < new Date()) { res.status(410).json({ error: 'Convite expirado' }); return }
  if (member.status === 'active') { res.status(409).json({ error: 'Convite já aceito' }); return }

  // Check user isn't already active in this group
  const { data: existing } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', member.group_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()
  if (existing) { res.status(409).json({ error: 'Você já é membro deste grupo' }); return }

  const { error: updErr } = await supabaseAdmin
    .from('shared_group_members')
    .update({
      user_id: userId,
      status: 'active',
      joined_at: new Date().toISOString(),
      invite_token: null,
    })
    .eq('id', member.id)

  if (updErr) { res.status(500).json({ error: updErr.message }); return }

  res.json({ ok: true, group_id: member.group_id, group_name: (member.shared_groups as { name: string }).name })
})

// ─── Members ─────────────────────────────────────────────────────────────────

// PATCH /api/shared/groups/:groupId/members/:memberId  (update share settings)
router.patch('/groups/:groupId/members/:memberId', async (req, res: Response) => {
  const userId = uid(req)
  const { share_pct, share_mode, salary_authorized } = req.body as {
    share_pct?: number
    share_mode?: string
    salary_authorized?: boolean
  }

  // Can only update own membership
  const updates: Record<string, unknown> = {}
  if (share_pct !== undefined) updates.share_pct = share_pct
  if (share_mode !== undefined) updates.share_mode = share_mode
  if (salary_authorized !== undefined) updates.salary_authorized = salary_authorized

  // Recalculate if salary_based and both members authorize
  if (salary_authorized === true || share_mode === 'salary_based') {
    const groupId = Number(req.params.groupId)
    const { data: members } = await supabaseAdmin
      .from('shared_group_members')
      .select('user_id, salary_authorized')
      .eq('group_id', groupId)
      .eq('status', 'active')

    const authorizedMembers = (members ?? []).filter(m => m.salary_authorized || m.user_id === userId)
    if (authorizedMembers.length >= 2) {
      const incomes: { user_id: string; income: number }[] = []
      for (const m of authorizedMembers) {
        if (!m.user_id) continue
        const { data: inc } = await supabaseAdmin
          .from('finance_income')
          .select('monthly_net')
          .eq('user_id', m.user_id)
          .single()
        if (inc) incomes.push({ user_id: m.user_id, income: Number(inc.monthly_net) })
      }
      const total = incomes.reduce((s, i) => s + i.income, 0)
      if (total > 0) {
        for (const i of incomes) {
          const pct = Math.round((i.income / total) * 100 * 100) / 100
          await supabaseAdmin
            .from('shared_group_members')
            .update({ share_pct: pct, share_mode: 'salary_based' })
            .eq('group_id', groupId)
            .eq('user_id', i.user_id)
        }
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('shared_group_members')
    .update(updates)
    .eq('id', req.params.memberId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// DELETE /api/shared/groups/:groupId/members/:memberId  (leave or remove)
router.delete('/groups/:groupId/members/:memberId', async (req, res: Response) => {
  const userId = uid(req)
  const groupId = Number(req.params.groupId)
  const memberId = Number(req.params.memberId)

  // Find the member row
  const { data: member } = await supabaseAdmin
    .from('shared_group_members')
    .select('user_id')
    .eq('id', memberId)
    .eq('group_id', groupId)
    .single()

  if (!member) { res.status(404).json({ error: 'Membro não encontrado' }); return }

  // Allow if removing self OR if group creator
  const { data: group } = await supabaseAdmin
    .from('shared_groups')
    .select('created_by')
    .eq('id', groupId)
    .single()

  const isCreator = group?.created_by === userId
  const isSelf = member.user_id === userId

  if (!isCreator && !isSelf) { res.status(403).json({ error: 'Sem permissão' }); return }

  await supabaseAdmin
    .from('shared_group_members')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('id', memberId)

  res.json({ ok: true })
})

// ─── Shared Categories ────────────────────────────────────────────────────────

// GET /api/shared/categories
router.get('/categories', async (req, res: Response) => {
  const userId = uid(req)

  // All groups user is active in
  const { data: memberRows } = await supabaseAdmin
    .from('shared_group_members')
    .select('group_id, share_pct, share_mode, salary_authorized')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!memberRows?.length) { res.json([]); return }

  const groupIds = memberRows.map(r => r.group_id)
  const memberMap = Object.fromEntries(memberRows.map(r => [r.group_id, r]))

  const { data: categories, error } = await supabaseAdmin
    .from('shared_categories')
    .select('*')
    .in('group_id', groupIds)

  if (error) { res.status(500).json({ error: error.message }); return }

  // Attach user's share_pct and my_goal for each category
  const result = (categories ?? []).map(c => {
    const m = memberMap[c.group_id]
    return {
      ...c,
      my_share_pct: m?.share_pct ?? 50,
      my_goal: Math.round(Number(c.total_goal) * (m?.share_pct ?? 50) / 100 * 100) / 100,
    }
  })

  res.json(result)
})

// POST /api/shared/categories
router.post('/categories', async (req, res: Response) => {
  const userId = uid(req)
  const { group_id, name, icon, color, total_goal, currency } = req.body as {
    group_id: number; name: string; icon?: string; color?: string; total_goal?: number; currency?: string
  }

  // Must be active member
  const { data: m } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', group_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!m) { res.status(403).json({ error: 'Sem acesso a este grupo' }); return }

  const { data, error } = await supabaseAdmin
    .from('shared_categories')
    .insert({ group_id, name, icon: icon ?? '🏷️', color: color ?? '#6366f1', total_goal: total_goal ?? 0, currency: currency ?? 'EUR', created_by: userId })
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /api/shared/categories/:id
router.patch('/categories/:id', async (req, res: Response) => {
  const userId = uid(req)
  const { name, icon, color, total_goal, currency } = req.body as {
    name?: string; icon?: string; color?: string; total_goal?: number; currency?: string
  }

  // Verify active membership
  const { data: cat } = await supabaseAdmin
    .from('shared_categories')
    .select('group_id')
    .eq('id', req.params.id)
    .single()

  if (!cat) { res.status(404).json({ error: 'Categoria não encontrada' }); return }

  const { data: m } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', cat.group_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!m) { res.status(403).json({ error: 'Sem acesso' }); return }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (icon !== undefined) updates.icon = icon
  if (color !== undefined) updates.color = color
  if (total_goal !== undefined) updates.total_goal = total_goal
  if (currency !== undefined) updates.currency = currency

  const { data, error } = await supabaseAdmin
    .from('shared_categories')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// DELETE /api/shared/categories/:id
router.delete('/categories/:id', async (req, res: Response) => {
  const userId = uid(req)
  const { error } = await supabaseAdmin
    .from('shared_categories')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// GET /api/shared/categories/:id/detail
// Returns category + member contributions (actual vs goal)
router.get('/categories/:id/detail', async (req, res: Response) => {
  const userId = uid(req)
  const catId = Number(req.params.id)

  const { data: cat } = await supabaseAdmin
    .from('shared_categories')
    .select('*')
    .eq('id', catId)
    .single()

  if (!cat) { res.status(404).json({ error: 'Categoria não encontrada' }); return }

  // Verify access
  const { data: myMember } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', cat.group_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!myMember) { res.status(403).json({ error: 'Sem acesso' }); return }

  // All active members
  const { data: members } = await supabaseAdmin
    .from('shared_group_members')
    .select('*')
    .eq('group_id', cat.group_id)
    .eq('status', 'active')

  // Transactions for this shared category (current month)
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const { data: txns } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, user_id, date, description, amount, currency')
    .eq('shared_category_id', catId)
    .gte('date', monthStart)
    .order('date', { ascending: false })

  // Build per-member summary
  const memberDetails = await Promise.all((members ?? []).map(async m => {
    if (!m.user_id) return null
    const display = await userDisplay(m.user_id)
    const myTxns = (txns ?? []).filter(t => t.user_id === m.user_id)
    const spent = myTxns.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    const goal = Math.round(Number(cat.total_goal) * Number(m.share_pct) / 100 * 100) / 100
    return {
      member_id: m.id,
      user_id: m.user_id,
      display,
      share_pct: m.share_pct,
      goal,
      spent,
      is_me: m.user_id === userId,
    }
  }))

  // Build overspent alerts
  const alerts = memberDetails
    .filter(Boolean)
    .filter(m => m!.spent > m!.goal && m!.goal > 0)
    .map(m => ({ user_id: m!.user_id, name: m!.display.name, overspent_by: m!.spent - m!.goal }))

  res.json({
    category: cat,
    members: memberDetails.filter(Boolean),
    transactions: txns ?? [],
    alerts,
    total_spent: (txns ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
  })
})

export default router
