import { Router, Response } from 'express'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

const DEFAULT_NAMES: Record<string, { income: string; transfer: string; salary: string; essential: string; investment: string; savings: string; free: string }> = {
  pt: { income: 'Rendas',  transfer: 'Transferência', salary: 'Salário',  essential: 'Gastos Essenciais',      investment: 'Investimentos',    savings: 'Reserva', free: 'Lazer'    },
  en: { income: 'Income',  transfer: 'Transfer',      salary: 'Salary',   essential: 'Essential Expenses',     investment: 'Investments',      savings: 'Savings', free: 'Fun Money' },
  fr: { income: 'Revenus', transfer: 'Virement',      salary: 'Salaire',  essential: 'Dépenses Essentielles',  investment: 'Investissements',  savings: 'Épargne', free: 'Loisirs'  },
}

const DEFAULT_CAT_NAMES: Record<string, Record<string, { name: string; icon: string; color: string }[]>> = {
  pt: {
    envelopeEssential:  [
      { name: 'Moradia',        icon: '🏠', color: '#3b82f6' },
      { name: 'Alimentação',    icon: '🛒', color: '#10b981' },
      { name: 'Transporte',     icon: '🚗', color: '#f59e0b' },
      { name: 'Saúde',          icon: '💊', color: '#ef4444' },
      { name: 'Utilidades',     icon: '💡', color: '#6366f1' },
    ],
    envelopeInvestment: [
      { name: 'Ações / FII',    icon: '📈', color: '#10b981' },
      { name: 'Renda Fixa',     icon: '📄', color: '#06b6d4' },
    ],
    envelopeSavings:    [{ name: 'Emergência',    icon: '🏦', color: '#f59e0b' }],
    envelopeFree:       [
      { name: 'Restaurante',    icon: '🍽️', color: '#f97316' },
      { name: 'Viagem',         icon: '✈️', color: '#8b5cf6' },
      { name: 'Entretenimento', icon: '🎬', color: '#ec4899' },
    ],
  },
  en: {
    envelopeEssential:  [
      { name: 'Housing',        icon: '🏠', color: '#3b82f6' },
      { name: 'Food',           icon: '🛒', color: '#10b981' },
      { name: 'Transport',      icon: '🚗', color: '#f59e0b' },
      { name: 'Health',         icon: '💊', color: '#ef4444' },
      { name: 'Utilities',      icon: '💡', color: '#6366f1' },
    ],
    envelopeInvestment: [
      { name: 'Stocks / ETF',   icon: '📈', color: '#10b981' },
      { name: 'Fixed Income',   icon: '📄', color: '#06b6d4' },
    ],
    envelopeSavings:    [{ name: 'Emergency',     icon: '🏦', color: '#f59e0b' }],
    envelopeFree:       [
      { name: 'Restaurants',    icon: '🍽️', color: '#f97316' },
      { name: 'Travel',         icon: '✈️', color: '#8b5cf6' },
      { name: 'Entertainment',  icon: '🎬', color: '#ec4899' },
    ],
  },
  fr: {
    envelopeEssential:  [
      { name: 'Logement',       icon: '🏠', color: '#3b82f6' },
      { name: 'Alimentation',   icon: '🛒', color: '#10b981' },
      { name: 'Transport',      icon: '🚗', color: '#f59e0b' },
      { name: 'Santé',          icon: '💊', color: '#ef4444' },
      { name: 'Services',       icon: '💡', color: '#6366f1' },
    ],
    envelopeInvestment: [
      { name: 'Actions / ETF',  icon: '📈', color: '#10b981' },
      { name: 'Revenu fixe',    icon: '📄', color: '#06b6d4' },
    ],
    envelopeSavings:    [{ name: 'Urgence',        icon: '🏦', color: '#f59e0b' }],
    envelopeFree:       [
      { name: 'Restaurants',    icon: '🍽️', color: '#f97316' },
      { name: 'Voyages',        icon: '✈️', color: '#8b5cf6' },
      { name: 'Divertissement', icon: '🎬', color: '#ec4899' },
    ],
  },
}

// ── Income ────────────────────────────────────────────────────────────────────

// GET /api/finances/income
router.get('/income', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('finance_income')
    .select('monthly_net, currency')
    .eq('user_id', userId)
    .single()
  res.json(data ?? { monthly_net: 0, currency: 'EUR' })
})

// PATCH /api/finances/income
router.patch('/income', requireAuth, async (req, res: Response) => {
  const { userId, userLocale } = req as AuthRequest
  const names = DEFAULT_NAMES[userLocale] ?? DEFAULT_NAMES.pt
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const { monthly_net, currency } = req.body as { monthly_net: number; currency: string }
  if (!monthly_net || monthly_net <= 0) { res.status(400).json({ error: 'monthly_net required' }); return }
  const { error } = await supabaseAdmin
    .from('finance_income')
    .upsert({ user_id: userId, monthly_net, currency: currency ?? 'EUR', updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { res.status(500).json({ error: error.message }); return }

  // Also seed salary category with budget_monthly so planning reflects onboarding value
  const [envelopesRes, categoriesRes] = await Promise.all([
    supabaseAdmin.from('finance_envelopes').select('id').eq('user_id', userId).eq('type', 'income').single(),
    supabaseAdmin.from('finance_categories').select('id, name, name_key').eq('user_id', userId),
  ])
  let incomeEnvId: number | null = envelopesRes.data?.id ?? null
  if (!incomeEnvId) {
    const { data: newEnv } = await supabaseAdmin.from('finance_envelopes').insert({
      user_id: userId, name: names.income, name_key: 'envelopeIncome', pct_target: 0,
      color: '#10b981', type: 'income', icon: '💰', sort_order: 999,
    }).select('id').single()
    incomeEnvId = newEnv?.id ?? null
  }
  if (incomeEnvId) {
    const cats = (categoriesRes.data ?? []) as { id: number; name: string; name_key?: string }[]
    const salaryCat = cats.find(c => c.name_key === 'categorySalary' || norm(c.name).includes('salari') || norm(c.name).includes('salary') || norm(c.name).includes('salaire'))
    if (salaryCat) {
      await supabaseAdmin.from('finance_categories').update({ budget_monthly: monthly_net }).eq('id', salaryCat.id).eq('user_id', userId)
    } else {
      await supabaseAdmin.from('finance_categories').insert({
        user_id: userId, name: names.salary, name_key: 'categorySalary', icon: '💼', color: '#3b82f6',
        keyword_rules: [], envelope_id: incomeEnvId, budget_monthly: monthly_net,
      })
    }
  }

  res.json({ ok: true })
})

// ── Budget (envelopes + categories + income) ──────────────────────────────────

// GET /api/finances/budget
router.get('/budget', requireAuth, async (req, res: Response) => {
  const { userId, userLocale } = req as AuthRequest
  const names = DEFAULT_NAMES[userLocale] ?? DEFAULT_NAMES.pt
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const [incomeRes, envelopesRes, categoriesRes] = await Promise.all([
    supabaseAdmin.from('finance_income').select('monthly_net, currency').eq('user_id', userId).single(),
    supabaseAdmin.from('finance_envelopes').select('*').eq('user_id', userId).order('sort_order'),
    supabaseAdmin.from('finance_categories').select('*').eq('user_id', userId).order('name'),
  ])
  const income = incomeRes.data ?? { monthly_net: 0, currency: 'EUR' }
  let envelopes  = envelopesRes.data ?? []
  let categories = categoriesRes.data ?? []

  // Ensure income envelope + default income categories exist
  const incomeEnv = envelopes.find(e => e.type === 'income')
  let incomeEnvId: number | null = incomeEnv?.id ?? null
  if (!incomeEnvId) {
    const { data: newEnv } = await supabaseAdmin.from('finance_envelopes').insert({
      user_id: userId, name: names.income, name_key: 'envelopeIncome', pct_target: 0,
      color: '#10b981', type: 'income', icon: '💰', sort_order: 999,
    }).select('*').single()
    if (newEnv) { incomeEnvId = newEnv.id; envelopes = [...envelopes, newEnv] }
  }
  if (incomeEnvId) {
    const hasTransfer = categories.some(c => { const n = norm(c.name); return n.includes('transfer') || n.includes('virement') })
    const hasSalario  = categories.some(c => norm(c.name).includes('salari') || norm(c.name).includes('salary'))
    const toCreate = [
      ...(!hasTransfer ? [{ user_id: userId, name: names.transfer, name_key: 'categoryTransfer', icon: '↔️', color: '#6B7280', keyword_rules: [], envelope_id: incomeEnvId }] : []),
      ...(!hasSalario  ? [{ user_id: userId, name: names.salary,   name_key: 'categorySalary',   icon: '💼', color: '#3b82f6', keyword_rules: [], envelope_id: incomeEnvId }] : []),
    ]
    if (toCreate.length > 0) {
      const { data: created } = await supabaseAdmin.from('finance_categories').insert(toCreate).select('*')
      if (created) categories = [...categories, ...created]
    }
  }

  // Ensure default expense envelopes exist for first-time users
  if (!envelopes.some(e => e.type !== 'income')) {
    const defaultExpense = [
      { user_id: userId, name: names.essential,  name_key: 'envelopeEssential',  icon: '🏠', color: '#3b82f6', type: 'essential',  pct_target: 50, sort_order: 1 },
      { user_id: userId, name: names.investment, name_key: 'envelopeInvestment', icon: '📈', color: '#10b981', type: 'investment', pct_target: 30, sort_order: 2 },
      { user_id: userId, name: names.savings,    name_key: 'envelopeSavings',    icon: '🏦', color: '#f59e0b', type: 'savings',    pct_target: 10, sort_order: 3 },
      { user_id: userId, name: names.free,       name_key: 'envelopeFree',       icon: '🎉', color: '#a855f7', type: 'free',       pct_target: 10, sort_order: 4 },
    ]
    const { data: newExpEnvs } = await supabaseAdmin.from('finance_envelopes').insert(defaultExpense).select('*')
    if (newExpEnvs) {
      envelopes = [...envelopes, ...newExpEnvs]
      const catLocale = DEFAULT_CAT_NAMES[userLocale] ?? DEFAULT_CAT_NAMES.pt
      const catsToCreate = (newExpEnvs as { id: number; name_key: string }[]).flatMap(env => {
        const defs = catLocale[env.name_key] ?? []
        return defs.map(c => ({ user_id: userId, name: c.name, icon: c.icon, color: c.color, keyword_rules: [], envelope_id: env.id }))
      })
      if (catsToCreate.length > 0) {
        const { data: newCats } = await supabaseAdmin.from('finance_categories').insert(catsToCreate).select('*')
        if (newCats) categories = [...categories, ...newCats]
      }
    }
  }

  // Derive effective monthly income from income category budgets (sum of budget_monthly)
  const incomeEnvId2 = envelopes.find(e => e.type === 'income')?.id ?? null
  const incomeCatTotal = categories
    .filter(c => c.envelope_id === incomeEnvId2 && c.budget_monthly != null)
    .reduce((s, c) => s + (c.budget_monthly as number), 0)
  const effectiveIncome = incomeCatTotal > 0 ? incomeCatTotal : income.monthly_net
  const fromCategories  = incomeCatTotal > 0

  // Attach categories to envelopes; expense envelopes use effective income for budget_amount
  const result = envelopes.map(env => ({
    ...env,
    budget_amount: env.type === 'income' ? 0 : effectiveIncome * (env.pct_target / 100),
    categories: categories.filter(c => c.envelope_id === env.id),
  }))

  res.json({ income: { ...income, monthly_net: effectiveIncome, from_categories: fromCategories }, envelopes: result })
})

// ── Envelopes CRUD ─────────────────────────────────────────────────────────────

// GET /api/finances/envelopes
router.get('/envelopes', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('finance_envelopes')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

// POST /api/finances/envelopes
router.post('/envelopes', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, pct_target, color, type, icon, sort_order } = req.body
  if (!name || pct_target == null) { res.status(400).json({ error: 'name and pct_target required' }); return }
  const { data, error } = await supabaseAdmin
    .from('finance_envelopes')
    .insert({ user_id: userId, name, pct_target, color: color ?? '#6366f1', type: type ?? 'essential', icon: icon ?? '📦', sort_order: sort_order ?? 99 })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /api/finances/envelopes/:id
router.patch('/envelopes/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { name, pct_target, color, type, icon, sort_order, description } = req.body
  const update: Record<string, unknown> = {}
  if (name        != null) update.name        = name
  if (pct_target  != null) update.pct_target  = pct_target
  if (color       != null) update.color       = color
  if (type        != null) update.type        = type
  if (icon        != null) update.icon        = icon
  if (sort_order  != null) update.sort_order  = sort_order
  if (description != null) update.description = description
  const { error } = await supabaseAdmin
    .from('finance_envelopes')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// DELETE /api/finances/envelopes/:id
router.delete('/envelopes/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { error } = await supabaseAdmin
    .from('finance_envelopes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── Categories CRUD ─────────────────────────────────────────────────────────────

// GET /api/finances/categories — all categories regardless of envelope
router.get('/categories', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('finance_categories')
    .select('id, name, icon, color')
    .eq('user_id', userId)
    .order('name')
  res.json(data ?? [])
})

// POST /api/finances/categories
router.post('/categories', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, envelope_id, color, icon, budget_monthly, keyword_rules } = req.body
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const { data, error } = await supabaseAdmin
    .from('finance_categories')
    .insert({ user_id: userId, name, envelope_id: envelope_id ?? null, color: color ?? '#94a3b8', icon: icon ?? '🏷️', budget_monthly: budget_monthly ?? null, keyword_rules: keyword_rules ?? [] })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /api/finances/categories/:id
router.patch('/categories/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { name, envelope_id, color, icon, budget_monthly, keyword_rules } = req.body
  const update: Record<string, unknown> = {}
  if (name           != null) update.name           = name
  if (envelope_id    !== undefined) update.envelope_id    = envelope_id
  if (color          != null) update.color          = color
  if (icon           != null) update.icon           = icon
  if (budget_monthly !== undefined) update.budget_monthly = budget_monthly
  if (keyword_rules  != null) update.keyword_rules  = keyword_rules
  const { error } = await supabaseAdmin
    .from('finance_categories')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// DELETE /api/finances/categories/:id
router.delete('/categories/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { error } = await supabaseAdmin
    .from('finance_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── Spending Summary ──────────────────────────────────────────────────────────

// GET /api/finances/spending-summary?months=6|12|24
router.get('/spending-summary', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const months = Math.min(parseInt(req.query.months as string) || 6, 120)

  // Date range: from the start of (months) months ago to today
  const since = new Date()
  since.setMonth(since.getMonth() - months + 1)
  since.setDate(1)
  const sinceStr = since.toISOString().slice(0, 10)

  const [txnRes, catRes, envRes, incomeRes] = await Promise.all([
    supabaseAdmin
      .from('finance_transactions')
      .select('date, amount, category_id, is_internal_transfer, exclude_from_stats')
      .eq('user_id', userId)
      .gte('date', sinceStr)
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('finance_categories')
      .select('id, name, name_key, icon, color, envelope_id, budget_monthly')
      .eq('user_id', userId),
    supabaseAdmin
      .from('finance_envelopes')
      .select('id, name, name_key, color, icon, pct_target, sort_order, type')
      .eq('user_id', userId)
      .order('sort_order'),
    supabaseAdmin
      .from('finance_income')
      .select('monthly_net, currency')
      .eq('user_id', userId)
      .single(),
  ])

  const txns    = txnRes.data ?? []
  const cats    = (catRes.data ?? []) as { id: number; name: string; name_key: string | null; icon: string; color: string; envelope_id: number | null; budget_monthly: number | null }[]
  const allEnvs = envRes.data ?? []
  const envs    = allEnvs.filter(e => e.type !== 'income')
  const incomeRaw = incomeRes.data ?? { monthly_net: 0, currency: 'EUR' }
  const incomeEnvId = allEnvs.find(e => e.type === 'income')?.id ?? null
  const incomeCatSum = cats
    .filter(c => c.envelope_id === incomeEnvId && c.budget_monthly != null)
    .reduce((s, c) => s + (c.budget_monthly as number), 0)
  const income = { ...incomeRaw, monthly_net: incomeCatSum > 0 ? incomeCatSum : incomeRaw.monthly_net }

  const catToEnv     = new Map(cats.map(c => [c.id, c.envelope_id]))
  const envCatBudget = new Map<number, number>()
  for (const c of cats) {
    if (c.envelope_id != null && c.budget_monthly != null) {
      envCatBudget.set(c.envelope_id, (envCatBudget.get(c.envelope_id) ?? 0) + c.budget_monthly)
    }
  }

  // Aggregate transactions by month → envelope and category
  type MonthData = { income: number; expenses: number; byEnv: Map<number | null, number>; byCat: Map<number | null, number> }
  const monthMap = new Map<string, MonthData>()

  for (const tx of txns) {
    const m = (tx.date as string).slice(0, 7)
    if (!monthMap.has(m)) monthMap.set(m, { income: 0, expenses: 0, byEnv: new Map(), byCat: new Map() })
    const md = monthMap.get(m)!
    if (tx.is_internal_transfer || tx.exclude_from_stats) continue
    if (tx.amount > 0) {
      md.income += tx.amount
    } else {
      md.expenses += Math.abs(tx.amount)
      const envId = tx.category_id ? (catToEnv.get(tx.category_id) ?? null) : null
      md.byEnv.set(envId, (md.byEnv.get(envId) ?? 0) + Math.abs(tx.amount))
      md.byCat.set(tx.category_id, (md.byCat.get(tx.category_id) ?? 0) + Math.abs(tx.amount))
    }
  }

  // Build response months
  const resultMonths = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    d.setDate(1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const md = monthMap.get(m) ?? { income: 0, expenses: 0, byEnv: new Map(), byCat: new Map() }

    const byEnv = envs.map(env => {
      const envCats = cats
        .filter(c => c.envelope_id === env.id)
        .map(c => ({ id: c.id, name: c.name, name_key: c.name_key ?? null, icon: c.icon, color: c.color, actual: Math.round((md.byCat.get(c.id) ?? 0) * 100) / 100, budget: Math.round((c.budget_monthly ?? 0) * 100) / 100 }))
        .filter(c => c.actual > 0)
        .sort((a, b) => b.actual - a.actual)
      return {
        envelope_id: env.id,
        name:        env.name,
        name_key:    (env as { name_key?: string | null }).name_key ?? null,
        type:        env.type,
        color:       env.color,
        icon:        env.icon,
        actual:      Math.round((md.byEnv.get(env.id) ?? 0) * 100) / 100,
        budget:      Math.round((envCatBudget.get(env.id) ?? 0) * 100) / 100,
        categories:  envCats,
      }
    })

    const uncategorized = md.byEnv.get(null) ?? 0
    if (uncategorized > 0) {
      byEnv.push({ envelope_id: -1, name: 'Não categorizado', name_key: 'categoryUncategorized', type: '', color: '#9CA3AF', icon: '❓', actual: Math.round(uncategorized * 100) / 100, budget: 0, categories: [] })
    }

    resultMonths.push({
      month:       m,
      income:      Math.round(md.income * 100) / 100,
      expenses:    Math.round(md.expenses * 100) / 100,
      by_envelope: byEnv,
    })
  }

  res.json({
    months:        resultMonths,
    income_config: income,
    envelopes:     envs.map(e => ({ ...e, budget: envCatBudget.get(e.id) ?? 0 })),
  })
})

// ── Finance Accounts ──────────────────────────────────────────────────────────

// GET /api/finances/accounts
router.get('/accounts', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const [acctRes, connRes] = await Promise.all([
    supabaseAdmin.from('finance_accounts').select('*').eq('user_id', userId).eq('is_active', true).order('created_at'),
    supabaseAdmin.from('finance_bank_connections').select('id, display_name, last_synced_at, finance_account_id').eq('user_id', userId),
  ])

  // Paginate to bypass PostgREST's server-side max_rows cap (default 1,000 rows).
  // .limit(50000) is silently capped, causing wrong balances for accounts with >1,000 transactions.
  const balanceMap = new Map<number, number>()
  let offset = 0
  while (true) {
    const { data: page } = await supabaseAdmin
      .from('finance_transactions')
      .select('account_id, amount')
      .eq('user_id', userId)
      .not('account_id', 'is', null)
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    for (const tx of page) {
      if (tx.account_id != null) balanceMap.set(tx.account_id, (balanceMap.get(tx.account_id) ?? 0) + Number(tx.amount))
    }
    if (page.length < 1000) break
    offset += 1000
  }
  const connMap = new Map<number, { id: number; display_name: string | null; last_synced_at: string | null }>()
  for (const c of connRes.data ?? []) {
    if (c.finance_account_id != null) connMap.set(c.finance_account_id, c)
  }

  const result = (acctRes.data ?? []).map(a => ({
    ...a,
    balance: Math.round((balanceMap.get(a.id) ?? 0) * 100) / 100,
    bank_connection: connMap.get(a.id) ?? null,
  }))
  res.json(result)
})

const KNOWN_INSTITUTIONS = [
  'BNP Paribas', 'Société Générale', 'Crédit Agricole', 'LCL', 'Caisse d\'Épargne', 'Banque Populaire',
  'La Banque Postale', 'Crédit Mutuel', 'CIC', 'HSBC France', 'ING France', 'Boursorama',
  'Fortuneo', 'Hello bank!', 'Monabanq', 'N26', 'Revolut', 'Wise',
  'Degiro', 'Trade Republic', 'eToro',
  'Charles Schwab', 'Fidelity', 'Vanguard', 'TD Ameritrade', 'E*TRADE', 'Robinhood',
  'Interactive Brokers', 'Merrill Lynch', 'Morgan Stanley', 'JPMorgan Chase',
  'Bank of America', 'Wells Fargo', 'Citibank', 'Goldman Sachs',
  'XP Investimentos', 'Rico', 'Clear', 'BTG Pactual', 'Itaú', 'Bradesco', 'Santander',
  'Banco do Brasil', 'Caixa Econômica Federal', 'Nubank', 'C6 Bank', 'Inter',
  'Avenue', 'Órama', 'Genial', 'Warren', 'Vitreo', 'Kinea',
]
// GET /api/finances/accounts/portfolio-institutions
router.get('/accounts/portfolio-institutions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const [assetsRes, acctRes] = await Promise.all([
    supabaseAdmin.from('assets').select('exchange').eq('user_id', userId).not('exchange', 'is', null),
    supabaseAdmin.from('finance_accounts').select('institution_name').eq('user_id', userId).not('institution_name', 'is', null),
  ])
  const linked = new Set((acctRes.data ?? []).map(a => a.institution_name!.toLowerCase()))
  const allInstitutions = [...new Set((assetsRes.data ?? []).map(a => a.exchange as string).filter(Boolean))]
    .filter(ex => !linked.has(ex.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
  res.json(allInstitutions)
})

// POST /api/finances/accounts
router.post('/accounts', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, currency, institution_name, color, icon, create_asset } = req.body
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const { data: account, error } = await supabaseAdmin.from('finance_accounts').insert({
    user_id: userId, name, currency: currency ?? 'EUR',
    institution_name: institution_name ?? null,
    color: color ?? '#6366f1', icon: icon ?? '🏦',
  }).select('id').single()
  if (error || !account) { res.status(500).json({ error: error?.message }); return }
  if (create_asset) {
    const code = name.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-]/g, '').slice(0, 20) || `CASH-${Date.now().toString(36).toUpperCase().slice(-4)}`
    const { data: asset } = await supabaseAdmin.from('assets').insert({
      user_id: userId, code, name: name.trim(), asset_type: 'manual',
      currency: currency ?? 'EUR', exchange: institution_name?.trim() ?? null, active: true,
    }).select('id').single()
    if (asset) {
      await supabaseAdmin.from('finance_accounts').update({ linked_asset_id: asset.id }).eq('id', account.id)
    }
  }
  res.status(201).json({ id: account.id })
})

// PATCH /api/finances/accounts/:id
router.patch('/accounts/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  const { name, currency, institution_name, color, icon, linked_asset_id } = req.body
  const update: Record<string, unknown> = {}
  if (name             != null) update.name             = name
  if (currency         != null) update.currency         = currency
  if (institution_name !== undefined) update.institution_name = institution_name
  if (color            != null) update.color            = color
  if (icon             != null) update.icon             = icon
  if (linked_asset_id  !== undefined) update.linked_asset_id = linked_asset_id
  const { error } = await supabaseAdmin.from('finance_accounts').update(update).eq('id', id).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// DELETE /api/finances/accounts/:id
router.delete('/accounts/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  await supabaseAdmin.from('finance_transactions').update({ account_id: null }).eq('account_id', id).eq('user_id', userId)
  const { error } = await supabaseAdmin.from('finance_accounts').delete().eq('id', id).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// GET /api/finances/accounts/linked?asset_id=X
// Returns the finance account that has linked_asset_id = X for the current user, or null
router.get('/accounts/linked', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.query.asset_id)
  if (!assetId) { res.json(null); return }
  const { data, error } = await supabaseAdmin
    .from('finance_accounts')
    .select('id, name, currency')
    .eq('user_id', userId)
    .eq('linked_asset_id', assetId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? null)
})

// POST /api/finances/accounts/:id/sync-portfolio
// Reads account balance and upserts a manual_value for the linked asset
router.post('/accounts/:id/sync-portfolio', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const accountId = Number(req.params.id)
  const { data: account, error: accErr } = await supabaseAdmin
    .from('finance_accounts')
    .select('id, name, currency, linked_asset_id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()
  if (accErr || !account) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (!account.linked_asset_id) { res.status(400).json({ error: 'Conta não vinculada a nenhum ativo' }); return }
  let balance = 0
  let syncOffset = 0
  while (true) {
    const { data: page } = await supabaseAdmin
      .from('finance_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .range(syncOffset, syncOffset + 999)
    if (!page || page.length === 0) break
    balance += page.reduce((s, t) => s + Number(t.amount), 0)
    if (page.length < 1000) break
    syncOffset += 1000
  }
  balance = Math.round(balance * 100) / 100
  const today = new Date().toISOString().split('T')[0]
  const { error: mvErr } = await supabaseAdmin
    .from('manual_values')
    .upsert(
      { asset_id: account.linked_asset_id, ref_date: today, value: balance, currency: account.currency, notes: `Sincronizado de ${account.name}` },
      { onConflict: 'asset_id,ref_date' }
    )
  if (mvErr) { res.status(500).json({ error: mvErr.message }); return }
  res.json({ ok: true, value: balance, currency: account.currency })
})

// ── Transactions ───────────────────────────────────────────────────────────────

// GET /api/finances/transactions?month=2026-05&category_id=3&limit=1
router.get('/transactions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { month, category_id, account_id, limit, date_from, date_to, moment_id } = req.query as Record<string, string>

  let query = supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, category_id, account_id, is_internal_transfer, linked_transfer_id, exclude_from_stats, reimbursement_group_id, source, moment_id, notes, finance_categories(id, name, icon, color), finance_transaction_moments(moment_id, finance_moments(id, name, icon, color))')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end   = new Date(y, m, 0).toISOString().split('T')[0]
    query = query.gte('date', start).lte('date', end)
  } else if (date_from && date_to) {
    query = query.gte('date', date_from).lte('date', date_to)
  }
  if (category_id)            query = query.eq('category_id', category_id)
  if (moment_id)              query = query.eq('moment_id', moment_id)
  if (account_id === 'unassigned') query = query.is('account_id', null)
  else if (account_id)        query = query.eq('account_id', account_id)
  if (limit)                  query = query.limit(Number(limit))

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  const result = (data ?? []).map((tx: any) => {
    const { finance_transaction_moments, ...rest } = tx
    return {
      ...rest,
      moments: (finance_transaction_moments ?? [])
        .map((m: any) => m.finance_moments)
        .filter(Boolean),
    }
  })
  res.json(result)
})

// GET /api/finances/transactions/months — distinct YYYY-MM months with data, desc
router.get('/transactions/months', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('finance_transactions')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  const seen = new Set<string>()
  for (const r of (data ?? [])) seen.add((r.date as string).slice(0, 7))
  res.json([...seen])
})

// POST /api/finances/transactions — create manual
router.post('/transactions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { date, description, amount, currency, category_id, account_id, is_internal_transfer, notes } = req.body
  if (!date || amount == null) { res.status(400).json({ error: 'date and amount required' }); return }
  const { data, error } = await supabaseAdmin
    .from('finance_transactions')
    .insert({
      user_id: userId,
      date, description: description ?? '',
      amount: Number(amount),
      currency: currency ?? 'EUR',
      category_id: category_id ?? null,
      account_id: account_id ?? null,
      is_internal_transfer: is_internal_transfer ?? false,
      notes: notes ?? null,
      source: 'manual',
    })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /api/finances/transactions/bulk-category
router.patch('/transactions/bulk-category', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { description, category_id } = req.body as { description: string; category_id: number | null }
  if (!description) { res.status(400).json({ error: 'description required' }); return }
  const { error } = await supabaseAdmin
    .from('finance_transactions')
    .update({ category_id: category_id ?? null })
    .eq('user_id', userId)
    .eq('description', description)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// PATCH /api/finances/transactions/bulk-assign-account
router.patch('/transactions/bulk-assign-account', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { transaction_ids, account_id } = req.body as { transaction_ids: number[]; account_id: number | null }
  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    res.status(400).json({ error: 'transaction_ids array required' }); return
  }
  const { error } = await supabaseAdmin
    .from('finance_transactions')
    .update({ account_id: account_id ?? null })
    .in('id', transaction_ids)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true, updated: transaction_ids.length })
})

// PATCH /api/finances/transactions/:id
router.patch('/transactions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { category_id, is_internal_transfer, description, amount, notes, moment_id, moment_ids, exclude_from_stats, reimbursement_group_id } = req.body
  const update: Record<string, unknown> = {}
  if (category_id          !== undefined) update.category_id          = category_id
  if (is_internal_transfer !== undefined) update.is_internal_transfer  = is_internal_transfer
  if (exclude_from_stats   !== undefined) update.exclude_from_stats    = exclude_from_stats
  if (reimbursement_group_id !== undefined) update.reimbursement_group_id = reimbursement_group_id
  if (description          != null) update.description = description
  if (amount               != null) update.amount      = amount
  if (notes                !== undefined) update.notes = notes ?? null

  if (moment_ids !== undefined || moment_id !== undefined) {
    const ids: number[] = moment_ids !== undefined
      ? moment_ids
      : (moment_id === null ? [] : [moment_id])
    await supabaseAdmin.from('finance_transaction_moments')
      .delete().eq('transaction_id', id).eq('user_id', userId)
    if (ids.length > 0) {
      await supabaseAdmin.from('finance_transaction_moments')
        .insert(ids.map((mid: number) => ({ transaction_id: Number(id), moment_id: mid, user_id: userId })))
    }
    update.moment_id = ids[0] ?? null
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabaseAdmin
      .from('finance_transactions')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
  }
  res.json({ ok: true })
})

// DELETE /api/finances/transactions/:id
router.delete('/transactions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { error } = await supabaseAdmin
    .from('finance_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── CSV helpers ────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  if (!raw) return 0
  const s = raw.trim().replace(/\s/g, '')
  // Brazilian: "1.234,56" or "-1.234,56"
  if (/\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  // European: "1 234,56" or "1.234,56"
  if (/,\d{1,2}$/.test(s) && !s.includes('.')) return parseFloat(s.replace(',', '.'))
  // Strip currency symbols and parse standard float
  return parseFloat(s.replace(/[^0-9.\-+]/g, '')) || 0
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  // ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  // MM/DD/YYYY (US)
  const mdy = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`
  return null
}

function detectColumn(headers: string[], keywords: string[]): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  for (const kw of keywords) {
    const idx = headers.findIndex(h => norm(h).includes(norm(kw)))
    if (idx >= 0) return idx
  }
  return -1
}

function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return []
  const sample = lines.slice(0, 5).join('\n')
  const delim = sample.includes('\t') ? '\t' : sample.includes(';') ? ';' : ','
  const rows: string[][] = []
  for (const line of lines) {
    if (delim === '\t') {
      rows.push(line.split('\t').map(c => c.trim().replace(/^"|"$/g, '')))
    } else {
      const cells: string[] = []
      let cur = '', inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') { inQ = !inQ }
        else if (ch === delim && !inQ) { cells.push(cur.trim()); cur = '' }
        else cur += ch
      }
      cells.push(cur.trim())
      rows.push(cells)
    }
  }
  return rows
}

const BROKER_KEYWORDS = [
  'interactive brokers', 'bourse direct', 'trade republic', 'trading 212', 'degiro',
  'xp invest', 'clear corretora', 'btg pactual', 'avenue securities', 'nu invest',
  'rico invest', 'modal mais', 'genial invest', 'guide invest', 'orama invest',
  'toro invest', 'c6 invest', 'itau corretora', 'bradesco corretora', 'bb dtvm',
  'revolut securities', 'scalable capital', 'etoro', 'saxo bank', 'swissquote',
  'fortuneo', 'lynx broker', 'boursorama',
]

type CatRow = { id: number; name: string; icon: string; color: string }

const AI_BATCH_SIZE = 30

interface AiItem { description: string; sign: '+' | '-' }

async function aiCategorizeBatch(
  items: AiItem[],
  categories: CatRow[],
  offset: number
): Promise<Record<string, number | null>> {
  const catList  = categories.map(c => `${c.id}: ${c.name}`).join('\n')
  const descList = items.map((it, i) =>
    `${offset + i}: [${it.sign === '+' ? 'INCOME' : 'EXPENSE'}] ${it.description}`
  ).join('\n')

  const prompt = `You are a financial transaction categorizer for a personal finance app. Each transaction is labeled [INCOME] or [EXPENSE]. Use this to improve accuracy (e.g. a payment FROM a company = salary/income, not an expense; a transport company = transport, not personal care).

Assign the most appropriate category from the list below to each transaction. Reply with ONLY a valid JSON object mapping each index (string key) to the category id (integer) or null if truly no category fits. No extra text.

Categories:
${catList}

Transactions:
${descList}`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages:   [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return {}
  return JSON.parse(jsonMatch[0]) as Record<string, number | null>
}

function friendlyAiError(e: unknown): string {
  const status = (e as { status?: number }).status
  if (status === 529) return 'API sobrecarregada — tente novamente em alguns segundos'
  if (status === 401) return 'API key inválida'
  if (status === 429) return 'Limite de requisições atingido — tente novamente'
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/\{[\s\S]*\}/, '').trim().slice(0, 120) || 'Erro desconhecido'
}

async function aiCategorize(
  items: AiItem[],
  categories: CatRow[],
  deadline: number
): Promise<{ map: Record<string, number | null>; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { map: {}, error: 'no_key' }
  if (items.length === 0 || categories.length === 0) return { map: {} }

  const result: Record<string, number | null> = {}
  try {
    for (let i = 0; i < items.length; i += AI_BATCH_SIZE) {
      const remaining = deadline - Date.now()
      if (remaining <= 1000) break
      const batch = items.slice(i, i + AI_BATCH_SIZE)
      const batchResult = await Promise.race([
        aiCategorizeBatch(batch, categories, i),
        new Promise<Record<string, number | null>>(resolve =>
          setTimeout(() => resolve({}), remaining - 500)
        ),
      ])
      Object.assign(result, batchResult)
    }
    return { map: result }
  } catch (e) {
    return { map: result, error: friendlyAiError(e) }
  }
}

function detectBroker(description: string): string | null {
  const d = description.toLowerCase()
  return BROKER_KEYWORDS.find(b => d.includes(b)) ?? null
}

// ── Transfer pair detection ────────────────────────────────────────────────────

const TRANSFER_KWS = [
  'virement','vir sepa','sepa','topup','top-up','top up',
  'transferencia','transferência','ted ','doc ','pix ','tef ',
  'transfer','wire',
  'revolut','wise','n26','bnp','lydia','paypal','c6 bank','nubank',
  'inter ','itaú','itau','bradesco','boursorama','fortuneo',
]

function hasTransferKw(desc: string): boolean {
  const d = desc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return TRANSFER_KWS.some(kw => d.includes(kw))
}

type TxRow = { id: number; date: string; amount: number; description: string; account_id: number | null }

async function detectTransferPairs(userId: string): Promise<number> {
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 2)

  const { data } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, date, amount, description, account_id')
    .eq('user_id', userId)
    .is('linked_transfer_id', null)
    .gte('date', cutoff.toISOString().slice(0, 10))
    .order('date', { ascending: true })

  const txns = (data ?? []) as TxRow[]
  if (txns.length < 2) return 0

  const negMap = new Map<string, TxRow[]>()
  for (const tx of txns) {
    if (tx.amount >= 0) continue
    const key = Math.abs(tx.amount).toFixed(2)
    if (!negMap.has(key)) negMap.set(key, [])
    negMap.get(key)!.push(tx)
  }

  const usedIds = new Set<number>()
  const pairs: [number, number][] = []

  for (const pos of txns) {
    if (pos.amount <= 0 || usedIds.has(pos.id)) continue
    const candidates = negMap.get(pos.amount.toFixed(2)) ?? []
    for (const neg of candidates) {
      if (usedIds.has(neg.id)) continue
      if (neg.account_id !== null && pos.account_id !== null && neg.account_id === pos.account_id) continue
      const dayDiff = Math.abs((new Date(pos.date).getTime() - new Date(neg.date).getTime()) / 86400000)
      if (dayDiff > 3) continue
      if (!hasTransferKw(pos.description) && !hasTransferKw(neg.description)) continue
      pairs.push([pos.id, neg.id])
      usedIds.add(pos.id)
      usedIds.add(neg.id)
      break
    }
  }

  if (pairs.length > 0) {
    await Promise.all(pairs.flatMap(([a, b]) => [
      supabaseAdmin.from('finance_transactions').update({ linked_transfer_id: b, is_internal_transfer: true }).eq('id', a).eq('user_id', userId),
      supabaseAdmin.from('finance_transactions').update({ linked_transfer_id: a, is_internal_transfer: true }).eq('id', b).eq('user_id', userId),
    ]))
  }
  return pairs.length
}

// POST /api/finances/transactions/csv-parse
// Parses CSV text and returns preview rows with auto-suggested categories
router.post('/transactions/csv-parse', requireAuth, async (req, res: Response) => {
  const { userId, userLocale } = req as AuthRequest
  const csvNames = DEFAULT_NAMES[userLocale] ?? DEFAULT_NAMES.pt
  const reqDeadline = Date.now() + 25_000 // 25s budget — 5s buffer before Cloudflare's 30s wall
  const { csv, currency = 'EUR' } = req.body as { csv: string; currency?: string }
  if (!csv) { res.status(400).json({ error: 'csv required' }); return }

  // Load user categories for keyword matching
  const { data: cats } = await supabaseAdmin
    .from('finance_categories')
    .select('id, name, icon, color, keyword_rules')
    .eq('user_id', userId)

  let categories = (cats ?? []) as { id: number; name: string; icon: string; color: string; keyword_rules: string[] }[]

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  let transferCat = categories.find(c => { const n = norm(c.name); return n.includes('transfer') || n.includes('virement') })
  // Ensure transfer category exists — create it if not
  if (!transferCat) {
    const { data: incomeEnv } = await supabaseAdmin
      .from('finance_envelopes').select('id').eq('user_id', userId).eq('type', 'income').maybeSingle()
    const { data: newCat } = await supabaseAdmin.from('finance_categories').insert({
      user_id: userId, name: csvNames.transfer, icon: '↔️', color: '#6B7280',
      keyword_rules: [], envelope_id: incomeEnv?.id ?? null,
    }).select('id, name, icon, color, keyword_rules').single()
    if (newCat) { transferCat = newCat; categories = [...categories, newCat] }
  }

  function matchCategory(description: string): { id: number; name: string; icon: string; color: string } | null {
    const d = norm(description)
    // Pass 1: category name appears in description — direct name match wins over keyword rules
    // (prevents a "Viagem" keyword "airbnb" from overriding the "Airbnb" income category)
    for (const cat of categories) {
      const catName = norm(cat.name)
      if (catName.length >= 4 && d.includes(catName)) return cat
    }
    // Pass 2: explicit keyword rules
    for (const cat of categories) {
      const rules: string[] = Array.isArray(cat.keyword_rules) ? cat.keyword_rules : []
      if (rules.some(kw => d.includes(norm(kw)))) return cat
    }
    return null
  }

  // Revolut-style type column values that indicate internal operations
  const TRANSFER_TYPE_PATTERNS = ['topup', 'top-up', 'savings', 'exchange']
  // P2P by description: require salutation for bare "to/à" to avoid catching company names
  const P2P_DESC_RE = /^(?:to\s+(?:m|mr|mrs|ms|mme|dr)\.?\s+|(?:à|a)\s+(?!l[ae]?\s|l'|les\s)|para\s+|envoyé\s+à\s+|envoye\s+a\s+|paiement\s+envoyé\s+à\s+|enviado\s+para\s+|transferido\s+para\s+|pix\s+para\s+|ted\s+para\s+|virement\s+(?:vers|(?:à|a))\s+|envoi\s+(?:à|a)\s+)[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ]/i
  // SEPA / FR banking viremennts (BNP, Boursorama, etc.) and BR bank transfers (TED, PIX, DOC, TEF)
  // "VIREMENT INSTANTANE" is BNP's instant SEPA transfer — always bank-to-bank
  // Bare "VIREMENT /DE SPB" (income/salary) intentionally NOT matched
  const SEPA_VIREMENT_RE = /^(?:vir(?:ement)?\s+instantane\b|vir(?:ement)?\s+(?:sepa|interne|permanent|euros?|emis|recu|vers\b)|ted\s|pix\s|doc\s|tef\s)/i

  const rows = parseCSV(csv)
  if (rows.length < 2) { res.status(400).json({ error: 'CSV must have at least a header row and one data row' }); return }

  const DATE_KWS   = ['date','data','fecha','datum']
  const AMT_KWS    = ['amount','valor','importe','betrag','montant','value','credit','debito','credito','charge']
  let headerRowIdx = 0
  for (let r = 0; r < Math.min(rows.length - 1, 5); r++) {
    const hasDate = detectColumn(rows[r], DATE_KWS) >= 0
    const hasAmt  = detectColumn(rows[r], AMT_KWS)  >= 0
    if (hasDate && hasAmt) { headerRowIdx = r; break }
  }

  const headers = rows[headerRowIdx]
  const dateIdx  = detectColumn(headers, DATE_KWS)
  const descIdx  = detectColumn(headers, ['description','descricao','historico','lancamento','memo','libelle','beneficiary','name','merchant'])
  const amtIdx   = detectColumn(headers, AMT_KWS)
  const feeIdx   = detectColumn(headers, ['frais','fee','fees','taxa','tarifa','commission','gebühr'])
  const typeIdx  = detectColumn(headers, ['type','tipo','transaction type'])
  const stateIdx = detectColumn(headers, ['état','etat','state','status','estado','estatuto'])

  if (dateIdx < 0 || amtIdx < 0) {
    res.status(422).json({ error: 'Could not detect date or amount columns', headers, detected: { dateIdx, descIdx, amtIdx } })
    return
  }

  const SKIP_STATUSES = new Set(['renvoyé', 'renvoye', 'annulé', 'annule', 'cancelled', 'canceled', 'declined', 'failed', 'reverted', 'en attente', 'pending'])

  const transactions = []
  let skippedInvalid = 0
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(c => !c.trim())) continue

    if (stateIdx >= 0) {
      const state = norm(row[stateIdx] ?? '')
      if (SKIP_STATUSES.has(state)) { skippedInvalid++; continue }
    }

    const rawDate = row[dateIdx] ?? ''
    const rawAmt  = row[amtIdx]  ?? ''
    const rawDesc = descIdx >= 0 ? (row[descIdx] ?? '') : ''
    const rawType = typeIdx >= 0 ? (row[typeIdx] ?? '') : ''
    const rawTypeNorm = norm(rawType)
    const rawDescNorm = norm(rawDesc)

    const date   = parseDate(rawDate)
    if (!date) continue
    let amount = parseAmount(rawAmt)
    if (!amount) continue

    if (rawTypeNorm.includes('debit'))  amount = -Math.abs(amount)
    if (rawTypeNorm.includes('credit')) amount =  Math.abs(amount)

    const isTransferByType = TRANSFER_TYPE_PATTERNS.some(t => rawTypeNorm.includes(t))
    const isTransferByP2P  = P2P_DESC_RE.test(rawDesc) || P2P_DESC_RE.test(rawDescNorm)
    const isTransferBySEPA = SEPA_VIREMENT_RE.test(rawDesc)
    const isTransfer = isTransferByType || isTransferByP2P || isTransferBySEPA

    const broker = detectBroker(rawDesc)

    const keywordCat = matchCategory(rawDesc)
    // SEPA viremements always win — description may contain bank/person names that match a user
    // category (e.g. "REVOLUT" in a Transport rule). Ambiguous transfers let keyword win.
    const effectiveIsTransfer = isTransferBySEPA || ((isTransferByType || isTransferByP2P) && !keywordCat)
    const category = effectiveIsTransfer ? (transferCat ?? null) : (keywordCat ?? null)

    transactions.push({
      date,
      description: rawDesc,
      amount,
      currency,
      suggested_category: category,
      suggested_by: category ? (effectiveIsTransfer ? 'transfer' : 'keyword') : null,
      is_broker_transfer: !!broker,
      is_internal_transfer: effectiveIsTransfer,
      broker_name: broker,
    })

    if (feeIdx >= 0) {
      const feeAmount = parseAmount(row[feeIdx] ?? '')
      if (feeAmount > 0) {
        transactions.push({
          date,
          description: `Frais: ${rawDesc}`,
          amount: -feeAmount,
          currency,
          suggested_category: null,
          suggested_by: null,
          is_broker_transfer: false,
          is_internal_transfer: false,
          broker_name: null,
        })
      }
    }
  }

  // Mark already-imported rows so the frontend can hide them from preview.
  // Paginated fetch to bypass PostgREST 1000-row cap.
  const existingSet = new Set<string>()
  let csvOffset = 0
  while (true) {
    const { data: page } = await supabaseAdmin
      .from('finance_transactions')
      .select('source')
      .eq('user_id', userId)
      .like('source', 'csv:%')
      .range(csvOffset, csvOffset + 999)
    if (!page || page.length === 0) break
    for (const r of page) existingSet.add(r.source)
    if (page.length < 1000) break
    csvOffset += 1000
  }
  const sourceKeys = assignSourceKeys(transactions)
  const taggedTransactions = transactions.map((t, i) => {
    const source = sourceKeys[i]
    return { ...t, source, is_duplicate: existingSet.has(source) }
  })
  const duplicateCount = taggedTransactions.filter(t => t.is_duplicate).length

  // AI runs separately via /transactions/ai-categorize — just report how many need it
  const unmatchedCount = taggedTransactions.filter(t => !t.is_duplicate && !t.suggested_category && !t.is_broker_transfer && !t.is_internal_transfer).length

  res.json({ transactions: taggedTransactions, total: taggedTransactions.length, duplicate_count: duplicateCount, skipped_invalid: skippedInvalid, headers, detected: { dateIdx, descIdx, amtIdx, stateIdx }, ai_debug: { ran: false, assigned: 0, unmatched: unmatchedCount, error: null } })
})

// POST /api/finances/transactions/ai-categorize
// Separate endpoint so AI can have its own 25s budget independent of the parse request
router.post('/transactions/ai-categorize', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const reqDeadline = Date.now() + 25_000
  const { items } = req.body as { items: AiItem[] }
  if (!items || !Array.isArray(items) || items.length === 0) { res.json({ map: {}, error: null }); return }

  const { data: cats } = await supabaseAdmin
    .from('finance_categories')
    .select('id, name, icon, color')
    .eq('user_id', userId)
  const categories = (cats ?? []) as CatRow[]

  const { map, error } = await aiCategorize(items, categories, reqDeadline)
  res.json({ map, error: error ?? null })
})

function csvSourceKey(t: { date: string; description: string; amount: number; currency: string }, seq = 1): string {
  const base = `${t.date}|${t.description}|${t.amount}|${t.currency}`
  const payload = seq > 1 ? `${base}|#${seq}` : base
  return 'csv:' + crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

function assignSourceKeys(transactions: { date: string; description: string; amount: number; currency: string }[]): string[] {
  const seqMap = new Map<string, number>()
  return transactions.map(t => {
    const base = `${t.date}|${t.description}|${t.amount}|${t.currency}`
    const n = (seqMap.get(base) ?? 0) + 1
    seqMap.set(base, n)
    return csvSourceKey(t, n)
  })
}

// POST /api/finances/transactions/csv-import — insert parsed rows, skipping duplicates
router.post('/transactions/csv-import', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { transactions, learn_rules } = req.body as {
    transactions: { date: string; description: string; amount: number; currency: string; category_id?: number | null; account_id?: number | null; is_internal_transfer?: boolean; source?: string }[]
    learn_rules?: { category_id: number; keyword: string }[]
  }
  if (!Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: 'transactions array required' }); return
  }

  const sourceKeys = assignSourceKeys(transactions)
  const rows = transactions.map((t, i) => ({
    user_id: userId,
    date:        t.date,
    description: t.description ?? '',
    amount:      t.amount,
    currency:    t.currency ?? 'EUR',
    category_id: t.category_id ?? null,
    account_id:  t.account_id  ?? null,
    is_internal_transfer: t.is_internal_transfer ?? false,
    source: t.source ?? sourceKeys[i],
  }))

  // Deduplicate: paginated fetch to bypass PostgREST 1000-row cap
  const existingSet = new Set<string>()
  let csvOffset2 = 0
  while (true) {
    const { data: page } = await supabaseAdmin
      .from('finance_transactions')
      .select('source')
      .eq('user_id', userId)
      .like('source', 'csv:%')
      .range(csvOffset2, csvOffset2 + 999)
    if (!page || page.length === 0) break
    for (const r of page) existingSet.add(r.source)
    if (page.length < 1000) break
    csvOffset2 += 1000
  }
  const dbNewRows = rows.filter(r => !existingSet.has(r.source))

  // Deduplicate within the incoming rows themselves (identical source hash → unique index
  // rejects entire INSERT batch silently)
  const seenSources = new Set<string>()
  const newRows = dbNewRows.filter(r => {
    if (seenSources.has(r.source)) return false
    seenSources.add(r.source)
    return true
  })

  let imported = 0
  let skipped = rows.length - newRows.length
  const BATCH = 500
  for (let i = 0; i < newRows.length; i += BATCH) {
    const chunk = newRows.slice(i, i + BATCH)
    const { data, error } = await supabaseAdmin
      .from('finance_transactions')
      .insert(chunk)
      .select('id')
    if (error) {
      console.error('[csv-import] insert error:', error.message, 'chunk size:', chunk.length)
      skipped += chunk.length
    } else {
      imported += (data ?? []).length
    }
  }

  // Learn category rules from manual assignments in preview
  if (Array.isArray(learn_rules) && learn_rules.length > 0) {
    const grouped = new Map<number, string[]>()
    for (const rule of learn_rules) {
      const kw = rule.keyword?.toLowerCase().trim()
      if (!rule.category_id || !kw) continue
      if (!grouped.has(rule.category_id)) grouped.set(rule.category_id, [])
      grouped.get(rule.category_id)!.push(kw)
    }
    for (const [catId, newKws] of grouped) {
      const { data: cat } = await supabaseAdmin
        .from('finance_categories')
        .select('keyword_rules')
        .eq('id', catId)
        .eq('user_id', userId)
        .single()
      if (!cat) continue
      const existing: string[] = Array.isArray(cat.keyword_rules) ? cat.keyword_rules : []
      const toAdd = newKws.filter(kw => !existing.some(e => e.toLowerCase() === kw))
      if (toAdd.length === 0) continue
      await supabaseAdmin
        .from('finance_categories')
        .update({ keyword_rules: [...existing, ...toAdd] })
        .eq('id', catId)
        .eq('user_id', userId)
    }
  }

  detectTransferPairs(userId).catch(() => {})

  res.json({ imported, skipped, total: transactions.length })
})

// POST /api/finances/detect-transfers
router.post('/detect-transfers', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const linked = await detectTransferPairs(userId)
  res.json({ linked })
})

// POST /api/finances/transactions/:id/unlink-transfer
router.post('/transactions/:id/unlink-transfer', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  const { data: tx } = await supabaseAdmin
    .from('finance_transactions').select('linked_transfer_id').eq('id', id).eq('user_id', userId).single()
  if (!tx) { res.status(404).json({ error: 'Not found' }); return }
  await Promise.all([
    supabaseAdmin.from('finance_transactions').update({ linked_transfer_id: null }).eq('id', id).eq('user_id', userId),
    tx.linked_transfer_id
      ? supabaseAdmin.from('finance_transactions').update({ linked_transfer_id: null }).eq('id', tx.linked_transfer_id).eq('user_id', userId)
      : Promise.resolve(),
  ])
  res.json({ ok: true })
})

// ── Reimbursement groups ───────────────────────────────────────────────────────

router.get('/reimbursement-groups', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const [groupsRes, txRes] = await Promise.all([
    supabaseAdmin.from('reimbursement_groups').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabaseAdmin.from('finance_transactions').select('id, date, description, amount, currency, reimbursement_group_id').eq('user_id', userId).not('reimbursement_group_id', 'is', null),
  ])
  const txByGroup = new Map<string, { id: number; date: string; description: string; amount: number; currency: string }[]>()
  for (const tx of txRes.data ?? []) {
    const gid = tx.reimbursement_group_id as string
    if (!txByGroup.has(gid)) txByGroup.set(gid, [])
    txByGroup.get(gid)!.push(tx)
  }
  const result = (groupsRes.data ?? []).map(g => ({
    ...g,
    transactions: txByGroup.get(g.id) ?? [],
    net: (txByGroup.get(g.id) ?? []).reduce((s, t) => s + Number(t.amount), 0),
  }))
  res.json(result)
})

router.post('/reimbursement-groups', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, transaction_ids } = req.body as { name: string; transaction_ids?: number[] }
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const { data: group, error } = await supabaseAdmin.from('reimbursement_groups').insert({ user_id: userId, name }).select().single()
  if (error || !group) { res.status(500).json({ error: error?.message }); return }
  if (Array.isArray(transaction_ids) && transaction_ids.length > 0) {
    await supabaseAdmin.from('finance_transactions')
      .update({ reimbursement_group_id: group.id, exclude_from_stats: true })
      .in('id', transaction_ids).eq('user_id', userId)
  }
  res.json(group)
})

router.patch('/reimbursement-groups/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { add_ids, remove_ids, name } = req.body as { add_ids?: number[]; remove_ids?: number[]; name?: string }
  if (name) await supabaseAdmin.from('reimbursement_groups').update({ name }).eq('id', id).eq('user_id', userId)
  if (Array.isArray(add_ids) && add_ids.length > 0)
    await supabaseAdmin.from('finance_transactions').update({ reimbursement_group_id: id, exclude_from_stats: true }).in('id', add_ids).eq('user_id', userId)
  if (Array.isArray(remove_ids) && remove_ids.length > 0)
    await supabaseAdmin.from('finance_transactions').update({ reimbursement_group_id: null }).in('id', remove_ids).eq('user_id', userId)
  res.json({ ok: true })
})

router.delete('/reimbursement-groups/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  await supabaseAdmin.from('finance_transactions').update({ reimbursement_group_id: null }).eq('reimbursement_group_id', id).eq('user_id', userId)
  const { error } = await supabaseAdmin.from('reimbursement_groups').delete().eq('id', id).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /api/finances/detect-reimbursements — finds same-day, same-account, exact-amount-pair transactions and auto-groups them
router.post('/detect-reimbursements', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  type TxRow = { id: number; date: string; amount: number; description: string; currency: string; account_id: number | null }
  // Paginate to bypass Supabase PostgREST default 1000-row limit
  const PAGE_SIZE = 1000
  const allTxs: TxRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabaseAdmin
      .from('finance_transactions')
      .select('id, date, amount, description, currency, account_id')
      .eq('user_id', userId)
      .is('reimbursement_group_id', null)
      .range(from, from + PAGE_SIZE - 1)
    if (!data?.length) break
    allTxs.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  if (!allTxs.length) { res.json({ created: 0 }); return }

  // Normalize: cast amount to Number (Supabase returns NUMERIC as string), trim date to YYYY-MM-DD
  const normalized = allTxs.map(tx => ({
    ...tx,
    amount: Number(tx.amount),
    date: String(tx.date).slice(0, 10),
  }))

  // Group by date+currency only — account_id is not required to match
  // (transactions imported before accounts were set up have account_id=null)
  const byKey = new Map<string, TxRow[]>()
  for (const tx of normalized) {
    const key = `${tx.date}|${tx.currency}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(tx)
  }

  const RETRO_PREFIXES = ['retrocession', 'remise', 'remboursement', 'regularisation', 'regularization', 'refund', 'credit note']

  const usedIds = new Set<number>()
  const groupsToCreate: { name: string; ids: [number, number] }[] = []

  // Strip retro prefix + any separator/parenthetical (e.g. "RETROCESSION - (REMISE) COTISATION..." → "COTISATION...")
  const getDescBase = (desc: string): string | null => {
    const lower = desc.toLowerCase()
    for (const p of RETRO_PREFIXES) {
      if (lower.startsWith(p)) {
        return desc.slice(p.length).trimStart().replace(/^[-–:]?\s*(\([^)]+\))?\s*/, '').trim()
      }
    }
    return null
  }

  // Pass 1: pair RETRO_PREFIX transactions with description-similar partners first,
  // preventing greedy same-amount pairing from stealing a fee's match
  for (const [, dayTxs] of byKey) {
    for (let i = 0; i < dayTxs.length; i++) {
      if (usedIds.has(dayTxs[i].id)) continue
      const a = dayTxs[i]
      const aBase = getDescBase(a.description)
      if (aBase === null || aBase.length < 4) continue
      for (let j = 0; j < dayTxs.length; j++) {
        if (j === i || usedIds.has(dayTxs[j].id)) continue
        const b = dayTxs[j]
        if (Math.abs(a.amount + b.amount) >= 0.02) continue
        if (!b.description.toLowerCase().includes(aBase.toLowerCase())) continue
        usedIds.add(a.id); usedIds.add(b.id)
        groupsToCreate.push({ name: `auto: ${b.description.slice(0, 80)}`, ids: [a.id, b.id] })
        break
      }
    }
  }

  // Pass 2: generic same-amount matching for any remaining unmatched pairs
  for (const [, dayTxs] of byKey) {
    for (let i = 0; i < dayTxs.length; i++) {
      if (usedIds.has(dayTxs[i].id)) continue
      for (let j = i + 1; j < dayTxs.length; j++) {
        if (usedIds.has(dayTxs[j].id)) continue
        const a = dayTxs[i], b = dayTxs[j]
        if (Math.abs(a.amount + b.amount) >= 0.02) continue
        usedIds.add(a.id); usedIds.add(b.id)
        const aLower = a.description.toLowerCase()
        const bLower = b.description.toLowerCase()
        let baseName: string
        if (RETRO_PREFIXES.some(p => aLower.startsWith(p))) {
          baseName = b.description
        } else if (RETRO_PREFIXES.some(p => bLower.startsWith(p))) {
          baseName = a.description
        } else {
          baseName = (a.amount < 0 ? a : b).description
        }
        groupsToCreate.push({ name: `auto: ${baseName.slice(0, 80)}`, ids: [a.id, b.id] })
        break
      }
    }
  }

  let created = 0
  for (const g of groupsToCreate) {
    const { data: group, error } = await supabaseAdmin
      .from('reimbursement_groups').insert({ user_id: userId, name: g.name }).select().single()
    if (!error && group) {
      await supabaseAdmin.from('finance_transactions')
        .update({ reimbursement_group_id: group.id, exclude_from_stats: true })
        .in('id', g.ids).eq('user_id', userId)
      created++
    }
  }

  res.json({ created, _debug: { fetched: allTxs.length, candidates: groupsToCreate.length } })
})

// ── Financial Freedom Plans ────────────────────────────────────────────────────

router.get('/freedom-plans', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('finance_freedom_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

router.post('/freedom-plans', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    name, initial_capital, monthly_contribution, monthly_return_rate,
    monthly_income_rate, target_amount, currency, horizon_years, notes, start_date,
  } = req.body as {
    name: string; initial_capital: number; monthly_contribution: number
    monthly_return_rate: number; monthly_income_rate: number; target_amount: number
    currency: string; horizon_years: number; notes?: string; start_date?: string
  }
  if (!name || !initial_capital || !target_amount) {
    res.status(400).json({ error: 'name, initial_capital, target_amount required' }); return
  }
  await supabaseAdmin
    .from('finance_freedom_plans')
    .update({ is_active: false })
    .eq('user_id', userId)
  const { data, error } = await supabaseAdmin
    .from('finance_freedom_plans')
    .insert({
      user_id: userId, name, is_active: true,
      initial_capital, monthly_contribution, monthly_return_rate,
      monthly_income_rate: monthly_income_rate ?? 0.005,
      target_amount, currency: currency ?? 'EUR',
      horizon_years, notes: notes ?? null,
      start_date: start_date ?? null,
    })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.patch('/freedom-plans/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const planId = Number(req.params.id)
  const updates = req.body as Record<string, unknown>
  if (updates.is_active === true) {
    await supabaseAdmin
      .from('finance_freedom_plans')
      .update({ is_active: false })
      .eq('user_id', userId)
  }
  const { data, error } = await supabaseAdmin
    .from('finance_freedom_plans')
    .update(updates)
    .eq('id', planId)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/freedom-plans/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const planId = Number(req.params.id)
  const { error } = await supabaseAdmin
    .from('finance_freedom_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── Momentos ──────────────────────────────────────────────────────────────────

router.get('/moments', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('finance_moments').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/moments-for-picker', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('finance_moments').select('id, name, icon, color').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/moments/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const [momentRes, txRes] = await Promise.all([
    supabaseAdmin.from('finance_moments').select('*').eq('id', momentId).eq('user_id', userId).single(),
    supabaseAdmin.from('finance_transactions')
      .select('id, date, description, amount, currency, notes, finance_categories(id, name, name_key, icon, color)')
      .eq('moment_id', momentId).eq('user_id', userId).order('date', { ascending: false }),
  ])
  if (momentRes.error || !momentRes.data) { res.status(404).json({ error: 'Not found' }); return }
  const transactions = txRes.data ?? []
  const total = transactions.reduce((sum, tx) => sum + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0)
  const catMap: Record<string, { name: string; name_key: string | null; icon: string; color: string; total: number }> = {}
  for (const tx of transactions) {
    if (tx.amount >= 0) continue
    const cat = tx.finance_categories as unknown as { id: number; name: string; name_key: string | null; icon: string; color: string } | null
    const key = cat ? String(cat.id) : 'none'
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Sem categoria', name_key: cat?.name_key ?? null, icon: cat?.icon ?? '❓', color: cat?.color ?? '#9CA3AF', total: 0 }
    catMap[key].total += Math.abs(tx.amount)
  }
  res.json({ moment: momentRes.data, transactions, summary: { total: Math.round(total * 100) / 100, by_category: Object.values(catMap).sort((a, b) => b.total - a.total) } })
})

router.post('/moments', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, description, icon, color, start_date, end_date, cover_image_url } = req.body
  const { data, error } = await supabaseAdmin
    .from('finance_moments')
    .insert({ user_id: userId, name, description, icon: icon ?? '✨', color: color ?? '#7C3AED', start_date: start_date ?? null, end_date: end_date ?? null, cover_image_url: cover_image_url ?? null })
    .select().single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.patch('/moments/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const { data, error } = await supabaseAdmin
    .from('finance_moments').update(req.body).eq('id', momentId).eq('user_id', userId).select().single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/moments/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  await supabaseAdmin.from('finance_transactions').update({ moment_id: null }).eq('moment_id', momentId).eq('user_id', userId)
  const { error } = await supabaseAdmin.from('finance_moments').delete().eq('id', momentId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /finances/moments/:id/share
router.post('/moments/:id/share', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  const { hide_descriptions = false, expires_in_days = 30 } = req.body ?? {}
  const expiresAt = expires_in_days === null ? null : new Date(Date.now() + Number(expires_in_days) * 86_400_000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('finance_moments')
    .update({ share_token: crypto.randomUUID(), share_expires_at: expiresAt, share_hide_descriptions: hide_descriptions })
    .eq('id', id).eq('user_id', userId)
    .select('share_token, share_expires_at, share_hide_descriptions').single()
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return }
  res.json(data)
})

// PATCH /finances/moments/:id/share
router.patch('/moments/:id/share', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  const { hide_descriptions, expires_in_days } = req.body ?? {}
  const updates: Record<string, unknown> = {}
  if (hide_descriptions !== undefined) updates.share_hide_descriptions = hide_descriptions
  if (expires_in_days !== undefined) updates.share_expires_at = expires_in_days === null ? null : new Date(Date.now() + Number(expires_in_days) * 86_400_000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('finance_moments').update(updates).eq('id', id).eq('user_id', userId)
    .select('share_token, share_expires_at, share_hide_descriptions').single()
  if (error || !data) { res.status(404).json({ error: 'Not found' }); return }
  res.json(data)
})

// DELETE /finances/moments/:id/share
router.delete('/moments/:id/share', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  await supabaseAdmin.from('finance_moments').update({ share_token: null, share_expires_at: null }).eq('id', id).eq('user_id', userId)
  res.json({ ok: true })
})

export default router
