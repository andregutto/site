import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
  const meta = user.user_metadata ?? {}
  res.json({
    email:                user.email ?? '',
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
    avatar_position:      meta.avatar_position       ?? 50,
  })
})

router.patch('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    first_name, last_name, country, tax_country, birthdate, default_currency,
    portfolio_start_date, allocation_targets, institution_data, avatar_url, avatar_position,
  } = req.body as {
    first_name?: string; last_name?: string; country?: string
    tax_country?: string; birthdate?: string; default_currency?: string
    portfolio_start_date?: string; allocation_targets?: Record<string, number>
    institution_data?: Record<string, Record<string, string>>
    avatar_url?: string; avatar_position?: number
  }
  const { data: { user: current } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = {
    ...(current?.user_metadata ?? {}),
    ...Object.fromEntries(
      Object.entries({
        first_name, last_name, country, tax_country, birthdate, default_currency,
        portfolio_start_date, allocation_targets, institution_data, avatar_url, avatar_position,
      }).filter(([, v]) => v !== undefined)
    ),
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: meta })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
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
    exported_at:           new Date().toISOString(),
    assets:                assets           ?? [],
    contributions:         contributions    ?? [],
    dividends:             dividends        ?? [],
    manual_values:         manualValues     ?? [],
    finance_transactions:  transactions     ?? [],
    finance_accounts:      accounts         ?? [],
    finance_income:        income           ?? [],
    finance_envelopes:     envelopes        ?? [],
    finance_categories:    categories       ?? [],
    finance_freedom_plans: freedomPlans     ?? [],
    finance_moments:       moments          ?? [],
    shared_groups:         sharedGroups     ?? [],
    shared_categories:     sharedCategories ?? [],
  })
})

router.delete('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  // Before deleting: handle shared groups this user created
  // If other active members exist, transfer ownership to the oldest active member
  // If no other members exist, the group will be deleted by cascade
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
      // If no other active member, group will be cascade-deleted when user is deleted
    }
  }

  // Mark user's own group memberships as left
  await supabaseAdmin
    .from('shared_group_members')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
