import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { userDisplay, settleBalanceWithFriend } from './people.js'

const router = Router()

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

interface PendingBalance { friend_user_id: string; name?: string; username?: string; currency: string; amount: number }

// Saldo pendente com CADA amigo (positivo = amigo deve pro usuário, negativo =
// usuário deve pro amigo) somando todos os Momentos compartilhados — mesma
// matemática da seção 5.5 de GET /api/people, mas agregada por amigo pra exibir
// e depois quitar tudo de uma vez na exclusão de conta.
async function computePendingBalances(userId: string): Promise<PendingBalance[]> {
  const { data: ownedMoments } = await supabaseAdmin.from('finance_moments').select('id').eq('user_id', userId)
  const { data: memberMoments } = await supabaseAdmin.from('finance_moment_members').select('moment_id').eq('user_id', userId).eq('status', 'active')
  const allMomentIds = [...new Set([...(ownedMoments ?? []).map(m => m.id), ...(memberMoments ?? []).map((m: any) => m.moment_id)])]
  if (!allMomentIds.length) return []

  const { data: expenseRows } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('paid_by_user_id, currency, finance_moment_expense_shares(user_id, share_amount)')
    .in('moment_id', allMomentIds)

  const balanceByUser: Record<string, Record<string, number>> = {}
  for (const e of expenseRows ?? []) {
    const payer = (e as any).paid_by_user_id as string
    const currency = (e as any).currency as string
    const shares = ((e as any).finance_moment_expense_shares ?? []) as { user_id: string; share_amount: number }[]
    const applyDelta = (otherUserId: string, delta: number) => {
      balanceByUser[otherUserId] ??= {}
      balanceByUser[otherUserId][currency] = (balanceByUser[otherUserId][currency] ?? 0) + delta
    }
    if (payer === userId) {
      for (const s of shares) { if (s.user_id !== userId) applyDelta(s.user_id, s.share_amount) }
    } else {
      const mine = shares.find(s => s.user_id === userId)
      if (mine) applyDelta(payer, -mine.share_amount)
    }
  }

  const result: PendingBalance[] = []
  for (const [friendUserId, byCurrency] of Object.entries(balanceByUser)) {
    const display = await userDisplay(friendUserId)
    for (const [currency, amount] of Object.entries(byCurrency)) {
      const rounded = Math.round(amount * 100) / 100
      if (Math.abs(rounded) >= 0.01) result.push({ friend_user_id: friendUserId, name: display.name, username: display.username, currency, amount: rounded })
    }
  }
  return result
}

// Todo mundo que compartilha algo com o usuário (amigo ativo, viagem, categoria
// compartilhada ou Momento financeiro, em qualquer direção) — usado pra notificar
// antes de apagar a conta, já que depois do delete essas linhas somem via cascade
// e não dá mais pra descobrir quem foi afetado.
async function computeAffectedUserIds(userId: string): Promise<string[]> {
  const ids = new Set<string>()

  const { data: friendsOwned } = await supabaseAdmin.from('user_friends').select('friend_user_id').eq('owner_user_id', userId).eq('status', 'active')
  for (const f of friendsOwned ?? []) if (f.friend_user_id) ids.add(f.friend_user_id)
  const { data: friendsOfMine } = await supabaseAdmin.from('user_friends').select('owner_user_id').eq('friend_user_id', userId).eq('status', 'active')
  for (const f of friendsOfMine ?? []) ids.add(f.owner_user_id)

  const { data: ownedTrips } = await supabaseAdmin.from('voyage_trips').select('id').eq('user_id', userId)
  const ownedTripIds = (ownedTrips ?? []).map(t => t.id)
  if (ownedTripIds.length) {
    const { data: members } = await supabaseAdmin.from('voyage_trip_members').select('user_id').in('trip_id', ownedTripIds).not('user_id', 'is', null)
    for (const m of members ?? []) if (m.user_id) ids.add(m.user_id)
  }
  const { data: myTripMemberships } = await supabaseAdmin.from('voyage_trip_members').select('trip_id').eq('user_id', userId)
  const myTripIds = (myTripMemberships ?? []).map((m: any) => m.trip_id)
  if (myTripIds.length) {
    const { data: trips } = await supabaseAdmin.from('voyage_trips').select('user_id').in('id', myTripIds)
    for (const t of trips ?? []) ids.add(t.user_id)
  }

  const { data: ownedGroups } = await supabaseAdmin.from('shared_groups').select('id').eq('created_by', userId)
  const ownedGroupIds = (ownedGroups ?? []).map(g => g.id)
  if (ownedGroupIds.length) {
    const { data: members } = await supabaseAdmin.from('shared_group_members').select('user_id').in('group_id', ownedGroupIds).not('user_id', 'is', null)
    for (const m of members ?? []) if (m.user_id) ids.add(m.user_id)
  }
  const { data: myGroupMemberships } = await supabaseAdmin.from('shared_group_members').select('group_id').eq('user_id', userId)
  const myGroupIds = (myGroupMemberships ?? []).map((m: any) => m.group_id)
  if (myGroupIds.length) {
    const { data: groups } = await supabaseAdmin.from('shared_groups').select('created_by').in('id', myGroupIds)
    for (const g of groups ?? []) ids.add(g.created_by)
  }

  const { data: ownedMoments } = await supabaseAdmin.from('finance_moments').select('id').eq('user_id', userId)
  const ownedMomentIds = (ownedMoments ?? []).map(m => m.id)
  if (ownedMomentIds.length) {
    const { data: members } = await supabaseAdmin.from('finance_moment_members').select('user_id').in('moment_id', ownedMomentIds).not('user_id', 'is', null)
    for (const m of members ?? []) if (m.user_id) ids.add(m.user_id)
  }
  const { data: myMomentMemberships } = await supabaseAdmin.from('finance_moment_members').select('moment_id').eq('user_id', userId)
  const myMomentIds = (myMomentMemberships ?? []).map((m: any) => m.moment_id)
  if (myMomentIds.length) {
    const { data: moments } = await supabaseAdmin.from('finance_moments').select('user_id').in('id', myMomentIds)
    for (const m of moments ?? []) ids.add(m.user_id)
  }

  ids.delete(userId)
  return [...ids]
}

// ── GET /api/profile/delete-preview  (o que muda pros outros ao apagar a conta) ──
router.get('/delete-preview', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = req as AuthRequest
    const [pendingBalances, affectedUserIds] = await Promise.all([
      computePendingBalances(userId),
      computeAffectedUserIds(userId),
    ])
    res.json({ pending_balances: pendingBalances, affected_count: affectedUserIds.length })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao calcular impacto da exclusão' })
  }
})

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
  const meta = user.user_metadata ?? {}
  const [{ data: handle }, { data: profileRow }] = await Promise.all([
    supabaseAdmin.from('user_handles').select('username').eq('user_id', userId).single(),
    // Visibilidade do perfil público (migration 077) — linha pode não existir
    // em contas antigas, e aí vale o default (true)
    supabaseAdmin.from('profiles').select('public_profile').eq('id', userId).maybeSingle(),
  ])
  res.json({
    email:                user.email ?? '',
    username:             handle?.username ?? '',
    public_profile:       profileRow?.public_profile !== false,
    first_name:           meta.first_name           ?? '',
    last_name:            meta.last_name             ?? '',
    country:              meta.country               ?? '',
    tax_country:          meta.tax_country           ?? '',
    birthdate:            meta.birthdate             ?? '',
    default_currency:     meta.default_currency      ?? '',
    portfolio_start_date: meta.portfolio_start_date  ?? '',
    allocation_targets:   meta.allocation_targets    ?? {},
    institution_data:     meta.institution_data      ?? {},
    avatar_url:           meta.avatar_url            ?? '',
    default_section:      meta.default_section       ?? '',
    saida_fiscal_brasil:  meta.saida_fiscal_brasil   ?? false,
    month_cycle_day:      meta.month_cycle_day       ?? 1,
    budget_reminder_freq: meta.budget_reminder_freq  ?? 0,
    home_card_order:      meta.home_card_order       ?? [],
    preferred_locale:     meta.preferred_locale      ?? '',
  })
})

router.patch('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    first_name, last_name, country, tax_country, birthdate, default_currency,
    portfolio_start_date, allocation_targets, institution_data, avatar_url, default_section,
    month_cycle_day, saida_fiscal_brasil, budget_reminder_freq, home_card_order, preferred_locale,
  } = req.body as {
    first_name?: string; last_name?: string; country?: string
    tax_country?: string; birthdate?: string; default_currency?: string
    portfolio_start_date?: string; allocation_targets?: Record<string, number>
    institution_data?: Record<string, Record<string, string>>; avatar_url?: string
    default_section?: string; month_cycle_day?: number; saida_fiscal_brasil?: boolean
    budget_reminder_freq?: number; home_card_order?: string[]; preferred_locale?: string
  }

  // Idioma persistido no perfil (não só localStorage) — no login em novo
  // dispositivo, vence o idioma do navegador. Valida contra a lista suportada.
  if (preferred_locale !== undefined && !['pt', 'en', 'fr', ''].includes(preferred_locale)) {
    res.status(400).json({ error: 'preferred_locale inválido' }); return
  }

  // avatar_url vai pro JWT (user_metadata) em toda sessão — um data: URI aqui
  // já inchou o token o suficiente pra estourar o limite de header HTTP (431)
  // em todas as chamadas de API. Só aceita URL de arquivo hospedado (Storage).
  if (avatar_url && (avatar_url.startsWith('data:') || avatar_url.length > 500)) {
    res.status(400).json({ error: 'avatar_url deve ser uma URL de arquivo hospedado, não uma imagem embutida' }); return
  }

  const { data: { user: current } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = {
    ...(current?.user_metadata ?? {}),
    ...Object.fromEntries(
      Object.entries({
        first_name, last_name, country, tax_country, birthdate, default_currency,
        portfolio_start_date, allocation_targets, institution_data, avatar_url, default_section,
        month_cycle_day, saida_fiscal_brasil, budget_reminder_freq, home_card_order, preferred_locale,
      }).filter(([, v]) => v !== undefined)
    ),
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: meta })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── GET /api/profile/username/check?value=  (disponibilidade, sem reservar) ─────
router.get('/username/check', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = req as AuthRequest
    const value = String(req.query.value ?? '').toLowerCase()
    if (!USERNAME_RE.test(value)) { res.json({ available: false, reason: 'invalid_format' }); return }

    const { data } = await supabaseAdmin
      .from('user_handles').select('user_id').eq('username', value).maybeSingle()
    const available = !data || data.user_id === userId
    res.json({ available })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao checar @' })
  }
})

// ── PATCH /api/profile/username  (definir/alterar @username) ────────────────────
router.patch('/username', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = req as AuthRequest
    const username = String((req.body as { username?: string }).username ?? '').toLowerCase()
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({ error: 'Use 3-20 letras minúsculas, números ou _' }); return
    }

    const { error } = await supabaseAdmin
      .from('user_handles')
      .upsert({ user_id: userId, username, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) {
      if (error.code === '23505') { res.status(409).json({ error: 'Esse @ já está em uso' }); return }
      res.status(500).json({ error: error.message }); return
    }
    res.json({ ok: true, username })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao salvar @' })
  }
})

router.patch('/password', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { password } = req.body as { password: string }
  if (!password || password.length < 6) {
    res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' }); return
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.get('/export', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const [
    { data: assets },
    { data: contributions },
    { data: dividends },
    { data: manualValues },
    { data: transactions },
    { data: accounts },
    { data: income },
    { data: envelopes },
    { data: categories },
    { data: freedomPlans },
    { data: moments },
    { data: sharedGroups },
    { data: sharedCategories },
  ] = await Promise.all([
    supabaseAdmin.from('assets').select('code, name, asset_type, currency, is_active, created_at').eq('user_id', userId).order('code'),
    supabaseAdmin.from('contributions').select('date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, profit_brl, assets(code, name)').eq('user_id', userId).order('date', { ascending: false }),
    supabaseAdmin.from('dividends').select('ex_date, pay_date, dividend_type, amount_per_share, currency, amount_brl, assets(code)').eq('user_id', userId).order('ex_date', { ascending: false }),
    supabaseAdmin.from('manual_values').select('ref_date, value, currency, notes, assets(code, name)').eq('user_id', userId).order('ref_date', { ascending: false }),
    supabaseAdmin.from('finance_transactions').select('date, description, amount, currency, notes, is_internal_transfer, exclude_from_stats, finance_categories(name), finance_accounts(name), finance_moments(name)').eq('user_id', userId).order('date', { ascending: false }),
    supabaseAdmin.from('finance_accounts').select('name, institution_name, currency, icon, color, is_active, created_at').eq('user_id', userId),
    supabaseAdmin.from('finance_income').select('monthly_net, currency, updated_at').eq('user_id', userId),
    supabaseAdmin.from('finance_envelopes').select('name, pct_target, color, icon, type, sort_order').eq('user_id', userId).order('sort_order'),
    supabaseAdmin.from('finance_categories').select('name, icon, color, budget_monthly, finance_envelopes(name)').eq('user_id', userId).order('name'),
    supabaseAdmin.from('finance_freedom_plans').select('name, is_active, initial_capital, monthly_contribution, monthly_return_rate, monthly_income_rate, target_amount, currency, horizon_years, notes, created_at').eq('user_id', userId).order('created_at'),
    supabaseAdmin.from('finance_moments').select('name, description, icon, color, start_date, end_date, created_at').eq('user_id', userId).order('start_date', { ascending: false }),
    supabaseAdmin.from('shared_groups').select('name, created_at, shared_group_members(invite_email, status, share_pct, joined_at)').eq('created_by', userId),
    supabaseAdmin.from('shared_categories').select('name, icon, color, total_goal, currency, shared_groups(name)').eq('created_by', userId),
  ])

  res.json({
    exported_at:          new Date().toISOString(),
    assets:               assets          ?? [],
    contributions:        contributions   ?? [],
    dividends:            dividends       ?? [],
    manual_values:        manualValues    ?? [],
    finance_transactions: transactions    ?? [],
    finance_accounts:     accounts        ?? [],
    finance_income:       income          ?? [],
    finance_envelopes:    envelopes       ?? [],
    finance_categories:   categories      ?? [],
    finance_freedom_plans: freedomPlans   ?? [],
    finance_moments:      moments         ?? [],
    shared_groups:        sharedGroups    ?? [],
    shared_categories:    sharedCategories ?? [],
  })
})

router.delete('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  // Quita todo saldo pendente (com cada amigo, em todos os Momentos compartilhados)
  // antes de apagar — sem isso a dívida simplesmente desaparece sem registro pro
  // outro lado. Recalcula do zero (não confia em nada vindo do preview do cliente).
  const pendingBalances = await computePendingBalances(userId)
  const friendsWithBalance = [...new Set(pendingBalances.map(b => b.friend_user_id))]
  for (const friendUserId of friendsWithBalance) {
    await settleBalanceWithFriend(userId, friendUserId)
  }

  // Captura quem é afetado E o nome de quem está saindo ANTES de apagar —
  // depois do delete essas linhas somem via cascade e não dá mais pra descobrir.
  const [affectedUserIds, deletingUserDisplay] = await Promise.all([
    computeAffectedUserIds(userId),
    userDisplay(userId),
  ])
  if (affectedUserIds.length > 0) {
    const occurredAt = new Date().toISOString()
    await supabaseAdmin.from('notification_dismissals').insert(
      affectedUserIds.map(otherUserId => ({
        user_id: otherUserId,
        key: `friend_account_deleted:${userId}:${occurredAt}`,
        type: 'friend_account_deleted',
        params: { friend_name: deletingUserDisplay.name ?? deletingUserDisplay.email, friend_username: deletingUserDisplay.username },
        severity: 'warning',
        link: '/people',
        occurred_at: occurredAt,
      }))
    )
  }

  // Transfer ownership of owned groups to another active member before deleting
  const { data: ownedGroups } = await supabaseAdmin
    .from('shared_groups')
    .select('id')
    .eq('created_by', userId)

  if (ownedGroups && ownedGroups.length > 0) {
    for (const group of ownedGroups) {
      const { data: otherMembers } = await supabaseAdmin
        .from('shared_group_members')
        .select('user_id')
        .eq('group_id', group.id)
        .eq('status', 'active')
        .neq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)

      const newOwner = otherMembers?.[0]?.user_id
      if (newOwner) {
        await supabaseAdmin
          .from('shared_groups')
          .update({ created_by: newOwner })
          .eq('id', group.id)
      }
    }
  }

  // Mark user's memberships as left
  await supabaseAdmin
    .from('shared_group_members')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')

  // Clean up friend connections — FK cascade only covers owner_user_id/friend_user_id
  // columns; pending invites addressed to this user's email (not yet linked to a
  // user_id) would otherwise be inherited by any future signup reusing that email.
  const { data: deletedUserData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const deletedEmail = deletedUserData?.user?.email
  await supabaseAdmin
    .from('user_friends')
    .delete()
    .or(`owner_user_id.eq.${userId},friend_user_id.eq.${userId}${deletedEmail ? `,invite_email.eq.${deletedEmail}` : ''}`)

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
