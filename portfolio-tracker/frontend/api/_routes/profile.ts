import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
  const meta = user.user_metadata ?? {}
  const { data: handle } = await supabaseAdmin
    .from('user_handles').select('username').eq('user_id', userId).single()
  res.json({
    email:                user.email ?? '',
    username:             handle?.username ?? '',
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
  })
})

router.patch('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    first_name, last_name, country, tax_country, birthdate, default_currency,
    portfolio_start_date, allocation_targets, institution_data, avatar_url, default_section,
    month_cycle_day, saida_fiscal_brasil,
  } = req.body as {
    first_name?: string; last_name?: string; country?: string
    tax_country?: string; birthdate?: string; default_currency?: string
    portfolio_start_date?: string; allocation_targets?: Record<string, number>
    institution_data?: Record<string, Record<string, string>>; avatar_url?: string
    default_section?: string; month_cycle_day?: number; saida_fiscal_brasil?: boolean
  }
  const { data: { user: current } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = {
    ...(current?.user_metadata ?? {}),
    ...Object.fromEntries(
      Object.entries({
        first_name, last_name, country, tax_country, birthdate, default_currency,
        portfolio_start_date, allocation_targets, institution_data, avatar_url, default_section,
        month_cycle_day, saida_fiscal_brasil,
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
