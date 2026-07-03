import { Router, Response } from 'express'
import { randomBytes } from 'crypto'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { revertSharedCategory, getOrCreateDefaultGroupMoment } from './finances.js'
import { canAutoAccept } from './people.js'

const router = Router()
// NOTE: GET /invite/:token is intentionally public (no requireAuth)

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

export interface PendingGroupInvite {
  key: string
  group_name: string
  inviter_name: string
  token: string
  occurred_at: string
}

// Pending invites addressed to this user, either by user_id (set if the
// invitee already had an account when the invite was created) or by
// invite_email (matched once the invitee signs up / for not-yet-detected accounts).
export async function getPendingGroupInvites(userId: string): Promise<PendingGroupInvite[]> {
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  const nowIso = new Date().toISOString()
  const select = 'invite_token, created_at, shared_groups(name, created_by)'

  const [byUser, byEmail] = await Promise.all([
    supabaseAdmin.from('shared_group_members').select(select)
      .eq('status', 'pending').eq('user_id', userId)
      .not('invite_token', 'is', null).gte('invite_expires_at', nowIso),
    email
      ? supabaseAdmin.from('shared_group_members').select(select)
          .eq('status', 'pending').eq('invite_email', email)
          .not('invite_token', 'is', null).gte('invite_expires_at', nowIso)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const seen = new Set<string>()
  const result: PendingGroupInvite[] = []
  for (const row of [...(byUser.data ?? []), ...(byEmail.data ?? [])] as any[]) {
    const group = row.shared_groups
    if (!group || seen.has(row.invite_token)) continue
    seen.add(row.invite_token)
    const inviter = await userDisplay(group.created_by)
    result.push({
      key: `shared_group_invite:${row.invite_token}`,
      group_name: group.name,
      inviter_name: inviter.name,
      token: row.invite_token,
      occurred_at: row.created_at,
    })
  }
  return result
}

// ─── Groups ──────────────────────────────────────────────────────────────────

// GET /api/shared/groups
router.get('/groups', requireAuth, async (req, res: Response) => {
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

  // Pre-fetch all shared category IDs in these groups for envelope mapping lookup
  const { data: allSharedCats } = await supabaseAdmin
    .from('shared_categories')
    .select('id')
    .in('group_id', groupIds)
  const allCatIds = (allSharedCats ?? []).map(c => c.id)

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [envResult, txnResult] = await Promise.all([
    allCatIds.length > 0
      ? supabaseAdmin
          .from('shared_category_user_settings')
          .select('shared_category_id, local_envelope_id')
          .eq('user_id', userId)
          .in('shared_category_id', allCatIds)
      : Promise.resolve({ data: [] }),
    allCatIds.length > 0
      ? supabaseAdmin
          .from('finance_transactions')
          .select('shared_category_id, amount, user_id')
          .in('shared_category_id', allCatIds)
          .gte('date', monthStart)
      : Promise.resolve({ data: [] }),
  ])

  const envMap = new Map((envResult.data ?? []).map((s: { shared_category_id: number; local_envelope_id: number }) => [s.shared_category_id, s.local_envelope_id]))

  const spentMap = new Map<number, number>()
  const memberCatMap = new Map<number, Map<string, number>>()
  for (const t of (txnResult.data ?? []) as Array<{ shared_category_id: number | null; amount: number; user_id: string | null }>) {
    if (t.shared_category_id == null) continue
    const catId = t.shared_category_id
    const amt = Math.abs(Number(t.amount))
    spentMap.set(catId, (spentMap.get(catId) ?? 0) + amt)
    if (t.user_id) {
      if (!memberCatMap.has(catId)) memberCatMap.set(catId, new Map())
      const m = memberCatMap.get(catId)!
      m.set(t.user_id, (m.get(t.user_id) ?? 0) + amt)
    }
  }

  // Saldo do "momento oculto do grupo" (ver docs/SHARED_EXPENSES_MODEL.md) — despesas
  // avulsas divididas com a galera do grupo, sem virar categoria de orçamento. É um
  // saldo real (positivo = me devem, negativo = eu devo), diferente da meta das
  // categorias abaixo, que é só referência e nunca gera dívida.
  const { data: defaultMoments } = await supabaseAdmin
    .from('finance_moments').select('id, shared_group_id').in('shared_group_id', groupIds).eq('is_pair_default', true)
  const defaultMomentByGroup = new Map((defaultMoments ?? []).map(m => [m.shared_group_id as number, m.id as number]))
  const defaultMomentIds = [...defaultMomentByGroup.values()]

  const balanceByMoment = new Map<number, Record<string, number>>()
  if (defaultMomentIds.length > 0) {
    const { data: expenseRows } = await supabaseAdmin
      .from('finance_moment_expenses')
      .select('moment_id, paid_by_user_id, currency, finance_moment_expense_shares(user_id, share_amount)')
      .in('moment_id', defaultMomentIds)
    for (const e of expenseRows ?? []) {
      const momentId = (e as any).moment_id as number
      const payer = (e as any).paid_by_user_id as string
      const currency = (e as any).currency as string
      const shares = ((e as any).finance_moment_expense_shares ?? []) as { user_id: string; share_amount: number }[]
      const perCur = balanceByMoment.get(momentId) ?? {}
      if (payer === userId) {
        for (const s of shares) { if (s.user_id !== userId) perCur[currency] = (perCur[currency] ?? 0) + s.share_amount }
      } else {
        const mine = shares.find(s => s.user_id === userId)
        if (mine) perCur[currency] = (perCur[currency] ?? 0) - mine.share_amount
      }
      balanceByMoment.set(momentId, perCur)
    }
  }

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

    const categoriesWithEnv = (categories ?? []).map(c => ({
      ...c,
      local_envelope_id: envMap.get(c.id) ?? null,
      total_spent: Math.round((spentMap.get(c.id) ?? 0) * 100) / 100,
      member_spent: Object.fromEntries(memberCatMap.get(c.id) ?? new Map()),
    }))

    const defaultMomentId = defaultMomentByGroup.get(g.id) ?? null
    const rawBalance = defaultMomentId ? (balanceByMoment.get(defaultMomentId) ?? {}) : {}
    const balance = Object.entries(rawBalance)
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      .filter(b => Math.abs(b.amount) >= 0.01)

    return { ...g, members: enrichedMembers, categories: categoriesWithEnv, default_moment_id: defaultMomentId, balance }
  }))

  res.json(result)
})

// Cria/reaproveita o momento oculto do grupo pra dividir uma despesa avulsa com
// todos os membros ativos, sem precisar transformar isso numa categoria de
// orçamento — ver docs/SHARED_EXPENSES_MODEL.md.
router.post('/groups/:id/default-moment', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const groupId = Number(req.params.id)
  const { data: membership } = await supabaseAdmin
    .from('shared_group_members').select('id').eq('group_id', groupId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  if (!membership) { res.status(403).json({ error: 'Você não é membro ativo deste grupo' }); return }
  try {
    const momentId = await getOrCreateDefaultGroupMoment(userId, groupId)
    res.json({ moment_id: momentId })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/shared/groups
router.post('/groups', requireAuth, async (req, res: Response) => {
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
router.patch('/groups/:id', requireAuth, async (req, res: Response) => {
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
router.delete('/groups/:id', requireAuth, async (req, res: Response) => {
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

// POST /api/shared/groups/:id/invite  (convidar por e-mail ou @username)
router.post('/groups/:id/invite', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const groupId = Number(req.params.id)
  const { email: rawEmail, username } = req.body as { email?: string; username?: string }

  if (!rawEmail?.includes('@') && !username?.trim()) {
    res.status(400).json({ error: 'Informe um e-mail ou @usuário' }); return
  }

  // Must be active member of this group
  const { data: myMember } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!myMember) { res.status(403).json({ error: 'Sem acesso a este grupo' }); return }

  // Resolve @username to a user_id + e-mail, or use the e-mail as given
  let email = rawEmail?.trim() ?? null
  let resolvedUserId: string | null = null
  if (username) {
    const handle = username.trim().toLowerCase().replace(/^@/, '')
    const { data: handleRow } = await supabaseAdmin
      .from('user_handles').select('user_id').eq('username', handle).maybeSingle()
    if (!handleRow) { res.status(404).json({ error: 'Nenhum usuário com esse @' }); return }
    resolvedUserId = handleRow.user_id
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(handleRow.user_id)
    email = u?.user?.email ?? null
  }
  if (!email?.includes('@')) { res.status(400).json({ error: 'E-mail inválido' }); return }

  // Check if already a member (by email lookup, or by the resolved @username user_id)
  const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
  const targetUser = resolvedUserId
    ? { id: resolvedUserId }
    : existingUser?.users?.find(u => u.email === email)

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

  // Usuário já cadastrado E optou por aceitar convites automaticamente de
  // quem está convidando: entra direto como membro ativo. Caso contrário,
  // mesmo sendo amigo, sempre passa pelo aceite explícito — mesmo
  // comportamento de Voyage/Momentos.
  if (targetUser && await canAutoAccept(targetUser.id, userId)) {
    const { error } = await supabaseAdmin.from('shared_group_members').insert({
      group_id: groupId,
      user_id: targetUser.id,
      invite_email: email,
      status: 'active',
      share_pct: 50,
      joined_at: new Date().toISOString(),
    })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ direct: true })
    return
  }

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
router.post('/invite/accept', requireAuth, async (req, res: Response) => {
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

  // 4.2 — registrar conexão bidirecional
  try {
    const { data: group } = await supabaseAdmin
      .from('shared_groups').select('created_by').eq('id', member.group_id).single()
    if (group && group.created_by !== userId) {
      const [myInfo, ownerInfo] = await Promise.all([
        userDisplay(userId),
        userDisplay(group.created_by),
      ])
      const now = new Date().toISOString()
      await supabaseAdmin.from('arvo_connections').upsert([
        { user_id: userId,         connected_user_id: group.created_by, connected_email: ownerInfo.email, connected_name: ownerInfo.name, status: 'active', source: 'finances', updated_at: now },
        { user_id: group.created_by, connected_user_id: userId,         connected_email: myInfo.email,    connected_name: myInfo.name,    status: 'active', source: 'finances', updated_at: now },
      ], { onConflict: 'user_id,connected_email' })
    }
  } catch { /* non-fatal */ }

  res.json({ ok: true, group_id: member.group_id, group_name: (member.shared_groups as { name: string }).name })
})

// ─── Members ─────────────────────────────────────────────────────────────────

// PATCH /api/shared/groups/:groupId/members/:memberId  (update share settings)
//
// share_pct pode ser ajustado por QUALQUER membro ativo do grupo, não só o
// dono da linha — numa divisão de 2 pessoas, exigir que cada um edite só a
// própria % deixava a soma sempre desbalanceada (a outra pessoa nunca entrava
// pra corrigir manualmente). share_mode/salary_authorized continuam restritos
// à própria linha, porque "autorizar meu salário" é uma decisão pessoal.
router.patch('/groups/:groupId/members/:memberId', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const groupIdParam = Number(req.params.groupId)
  const { share_pct, share_mode, salary_authorized } = req.body as {
    share_pct?: number
    share_mode?: string
    salary_authorized?: boolean
  }

  const updates: Record<string, unknown> = {}
  if (share_pct !== undefined) {
    const { data: caller } = await supabaseAdmin
      .from('shared_group_members').select('id').eq('group_id', groupIdParam).eq('user_id', userId).eq('status', 'active').maybeSingle()
    if (!caller) { res.status(403).json({ error: 'Você não é membro ativo deste grupo' }); return }
    updates.share_pct = share_pct
    // Editar manualmente sempre derruba o modo salário — senão o próximo
    // recálculo automático sobrescreveria o valor que a pessoa acabou de definir.
    updates.share_mode = 'manual'
  }
  if (share_mode !== undefined) updates.share_mode = share_mode
  if (salary_authorized !== undefined) updates.salary_authorized = salary_authorized

  const ownRowOnly = share_mode !== undefined || salary_authorized !== undefined

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

  let query = supabaseAdmin.from('shared_group_members').update(updates).eq('id', req.params.memberId)
  if (ownRowOnly) query = query.eq('user_id', userId)
  const { data, error } = await query.select().single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// DELETE /api/shared/groups/:groupId/members/:memberId  (leave or remove)
router.delete('/groups/:groupId/members/:memberId', requireAuth, async (req, res: Response) => {
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

  // Se não restar mais ninguém além do criador, categorias promovidas a
  // partir de uma categoria pessoal voltam a ser pessoais automaticamente —
  // não faz sentido continuar "compartilhada" sem compartilhar com alguém.
  const { data: remaining } = await supabaseAdmin
    .from('shared_group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .neq('user_id', group?.created_by ?? '')
  if (!remaining?.length) {
    const { data: promotedCats } = await supabaseAdmin
      .from('shared_categories')
      .select('id')
      .eq('group_id', groupId)
      .not('source_category_id', 'is', null)
    for (const c of promotedCats ?? []) {
      await revertSharedCategory(c.id)
    }
  }

  res.json({ ok: true })
})

// ─── Shared Categories ────────────────────────────────────────────────────────

// GET /api/shared/categories
router.get('/categories', requireAuth, async (req, res: Response) => {
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
router.post('/categories', requireAuth, async (req, res: Response) => {
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
router.patch('/categories/:id', requireAuth, async (req, res: Response) => {
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
router.delete('/categories/:id', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const { error } = await supabaseAdmin
    .from('shared_categories')
    .delete()
    .eq('id', req.params.id)
    .eq('created_by', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// PATCH /api/shared/categories/:id/envelope — set (or clear) user's local envelope for a shared category
router.patch('/categories/:id/envelope', requireAuth, async (req, res: Response) => {
  const userId = uid(req)
  const catId = Number(req.params.id)
  const { envelope_id } = req.body as { envelope_id: number | null }

  if (envelope_id == null) {
    await supabaseAdmin
      .from('shared_category_user_settings')
      .delete()
      .eq('user_id', userId)
      .eq('shared_category_id', catId)
    res.json({ ok: true }); return
  }

  const { error } = await supabaseAdmin
    .from('shared_category_user_settings')
    .upsert({ user_id: userId, shared_category_id: catId, local_envelope_id: envelope_id }, { onConflict: 'user_id,shared_category_id' })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// GET /api/shared/categories/:id/detail
// Returns category + member contributions (actual vs goal)
router.get('/categories/:id/detail', requireAuth, async (req, res: Response) => {
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
    let monthly_income: number | null = null
    if (m.salary_authorized) {
      const { data: inc } = await supabaseAdmin.from('finance_income').select('monthly_net').eq('user_id', m.user_id).single()
      if (inc) monthly_income = Number(inc.monthly_net)
    }
    return {
      member_id: m.id,
      user_id: m.user_id,
      display,
      share_pct: m.share_pct,
      share_mode: m.share_mode,
      goal,
      spent,
      is_me: m.user_id === userId,
      monthly_income,
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
