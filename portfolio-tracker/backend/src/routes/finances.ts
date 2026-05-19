import { Router, Response } from 'express'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

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
  const { userId } = req as AuthRequest
  const { monthly_net, currency } = req.body as { monthly_net: number; currency: string }
  if (!monthly_net || monthly_net <= 0) { res.status(400).json({ error: 'monthly_net required' }); return }
  const { error } = await supabaseAdmin
    .from('finance_income')
    .upsert({ user_id: userId, monthly_net, currency: currency ?? 'EUR', updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// ── Budget (envelopes + categories + income) ──────────────────────────────────

// GET /api/finances/budget
router.get('/budget', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const [incomeRes, envelopesRes, categoriesRes] = await Promise.all([
    supabaseAdmin.from('finance_income').select('monthly_net, currency').eq('user_id', userId).single(),
    supabaseAdmin.from('finance_envelopes').select('*').eq('user_id', userId).order('sort_order'),
    supabaseAdmin.from('finance_categories').select('*').eq('user_id', userId).order('name'),
  ])
  const income = incomeRes.data ?? { monthly_net: 0, currency: 'EUR' }
  let envelopes  = envelopesRes.data ?? []
  let categories = categoriesRes.data ?? []

  // Ensure "Rendas" income envelope + default income categories exist
  const incomeEnv = envelopes.find(e => e.type === 'income')
  let incomeEnvId: number | null = incomeEnv?.id ?? null
  if (!incomeEnvId) {
    const { data: newEnv } = await supabaseAdmin.from('finance_envelopes').insert({
      user_id: userId, name: 'Rendas', pct_target: 0,
      color: '#10b981', type: 'income', icon: '💰', sort_order: 999,
    }).select('*').single()
    if (newEnv) { incomeEnvId = newEnv.id; envelopes = [...envelopes, newEnv] }
  }
  if (incomeEnvId) {
    const hasTransfer = categories.some(c => norm(c.name).includes('transfer'))
    const hasSalario  = categories.some(c => norm(c.name).includes('salari') || norm(c.name).includes('salary'))
    const toCreate = [
      ...(!hasTransfer ? [{ user_id: userId, name: 'Transferência', icon: '↔️', color: '#6B7280', keyword_rules: [], envelope_id: incomeEnvId }] : []),
      ...(!hasSalario  ? [{ user_id: userId, name: 'Salário',       icon: '💼', color: '#3b82f6', keyword_rules: [], envelope_id: incomeEnvId }] : []),
    ]
    if (toCreate.length > 0) {
      const { data: created } = await supabaseAdmin.from('finance_categories').insert(toCreate).select('*')
      if (created) categories = [...categories, ...created]
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
  const { name, pct_target, color, type, icon, sort_order } = req.body
  const update: Record<string, unknown> = {}
  if (name       != null) update.name        = name
  if (pct_target != null) update.pct_target  = pct_target
  if (color      != null) update.color       = color
  if (type       != null) update.type        = type
  if (icon       != null) update.icon        = icon
  if (sort_order != null) update.sort_order  = sort_order
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

router.get('/spending-summary', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const months = Math.min(parseInt(req.query.months as string) || 6, 24)

  const since = new Date()
  since.setMonth(since.getMonth() - months + 1)
  since.setDate(1)
  const sinceStr = since.toISOString().slice(0, 10)

  const [txnRes, catRes, envRes, incomeRes] = await Promise.all([
    supabaseAdmin
      .from('finance_transactions')
      .select('date, amount, category_id, is_internal_transfer')
      .eq('user_id', userId)
      .gte('date', sinceStr)
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('finance_categories')
      .select('id, envelope_id, budget_monthly')
      .eq('user_id', userId),
    supabaseAdmin
      .from('finance_envelopes')
      .select('id, name, color, icon, pct_target, sort_order, type')
      .eq('user_id', userId)
      .order('sort_order'),
    supabaseAdmin
      .from('finance_income')
      .select('monthly_net, currency')
      .eq('user_id', userId)
      .single(),
  ])

  const txns    = txnRes.data ?? []
  const cats    = catRes.data ?? []
  const allEnvs = envRes.data ?? []
  const envs      = allEnvs.filter(e => e.type !== 'income')
  const incomeRaw = incomeRes.data ?? { monthly_net: 0, currency: 'EUR' }
  // Use sum of income category budgets as effective income (same logic as /budget)
  const incomeEnvIdSS = allEnvs.find((e: { type: string }) => e.type === 'income')?.id ?? null
  const incomeCatSum  = (cats as { envelope_id: number | null; budget_monthly: number | null }[])
    .filter(c => c.envelope_id === incomeEnvIdSS && c.budget_monthly != null)
    .reduce((s, c) => s + (c.budget_monthly as number), 0)
  const income = { ...incomeRaw, monthly_net: incomeCatSum > 0 ? incomeCatSum : incomeRaw.monthly_net }

  const catToEnv     = new Map(cats.map((c: { id: number; envelope_id: number | null; budget_monthly: number | null }) => [c.id, c.envelope_id]))
  const envMap       = new Map(envs.map((e: { id: number; name: string; color: string; icon: string; pct_target: number; sort_order: number }) => [e.id, e]))
  const envCatBudget = new Map<number, number>()
  for (const c of cats as { id: number; envelope_id: number | null; budget_monthly: number | null }[]) {
    if (c.envelope_id != null && c.budget_monthly != null) {
      envCatBudget.set(c.envelope_id, (envCatBudget.get(c.envelope_id) ?? 0) + c.budget_monthly)
    }
  }

  void envMap

  type MonthData = { income: number; expenses: number; byEnv: Map<number | null, number> }
  const monthMap = new Map<string, MonthData>()

  for (const tx of txns as { date: string; amount: number; category_id: number | null; is_internal_transfer: boolean }[]) {
    const m = tx.date.slice(0, 7)
    if (!monthMap.has(m)) monthMap.set(m, { income: 0, expenses: 0, byEnv: new Map() })
    const md = monthMap.get(m)!
    if (tx.is_internal_transfer) continue
    if (tx.amount > 0) {
      md.income += tx.amount
    } else {
      md.expenses += Math.abs(tx.amount)
      const envId = tx.category_id ? (catToEnv.get(tx.category_id) ?? null) : null
      md.byEnv.set(envId, (md.byEnv.get(envId) ?? 0) + Math.abs(tx.amount))
    }
  }

  const resultMonths = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    d.setDate(1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const md = monthMap.get(m) ?? { income: 0, expenses: 0, byEnv: new Map() }
    const byEnv = (envs as { id: number; name: string; color: string; icon: string; pct_target: number; sort_order: number }[]).map(env => ({
      envelope_id: env.id,
      name:  env.name,
      color: env.color,
      icon:  env.icon,
      actual: Math.round((md.byEnv.get(env.id) ?? 0) * 100) / 100,
      budget: Math.round((envCatBudget.get(env.id) ?? 0) * 100) / 100,
    }))
    const uncategorized = md.byEnv.get(null) ?? 0
    if (uncategorized > 0) {
      byEnv.push({ envelope_id: -1, name: 'Não categorizado', color: '#9CA3AF', icon: '❓', actual: Math.round(uncategorized * 100) / 100, budget: 0 })
    }
    resultMonths.push({ month: m, income: Math.round(md.income * 100) / 100, expenses: Math.round(md.expenses * 100) / 100, by_envelope: byEnv })
  }

  res.json({
    months:        resultMonths,
    income_config: income,
    envelopes:     (envs as { id: number; name: string; color: string; icon: string; pct_target: number; sort_order: number }[]).map(e => ({ ...e, budget: envCatBudget.get(e.id) ?? 0 })),
  })
})

// ── Finance Accounts ──────────────────────────────────────────────────────────

// GET /api/finances/accounts
router.get('/accounts', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const [acctRes, txRes, connRes] = await Promise.all([
    supabaseAdmin.from('finance_accounts').select('*').eq('user_id', userId).eq('is_active', true).order('created_at'),
    supabaseAdmin.from('finance_transactions').select('account_id, amount').eq('user_id', userId).eq('is_internal_transfer', false).not('account_id', 'is', null),
    supabaseAdmin.from('finance_bank_connections').select('id, display_name, last_synced_at, finance_account_id').eq('user_id', userId),
  ])

  const balanceMap = new Map<number, number>()
  for (const tx of txRes.data ?? []) {
    if (tx.account_id != null) balanceMap.set(tx.account_id, (balanceMap.get(tx.account_id) ?? 0) + Number(tx.amount))
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

// GET /api/finances/accounts/portfolio-institutions
router.get('/accounts/portfolio-institutions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const [assetsRes, acctRes] = await Promise.all([
    supabaseAdmin.from('assets').select('exchange').eq('user_id', userId).not('exchange', 'is', null),
    supabaseAdmin.from('finance_accounts').select('institution_name').eq('user_id', userId).not('institution_name', 'is', null),
  ])
  const linked = new Set((acctRes.data ?? []).map(a => a.institution_name!.toLowerCase()))
  const institutions = [...new Set((assetsRes.data ?? []).map(a => a.exchange as string).filter(Boolean))]
    .filter(ex => !linked.has(ex.toLowerCase()))
    .sort()
  res.json(institutions)
})

// POST /api/finances/accounts
router.post('/accounts', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, currency, institution_name, color, icon } = req.body
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const { data, error } = await supabaseAdmin.from('finance_accounts').insert({
    user_id: userId, name, currency: currency ?? 'EUR',
    institution_name: institution_name ?? null,
    color: color ?? '#6366f1', icon: icon ?? '🏦',
  }).select().single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
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

// ── Transactions ───────────────────────────────────────────────────────────────

// GET /api/finances/transactions?month=2026-05&category_id=3
router.get('/transactions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { month, category_id, account_id } = req.query as Record<string, string>

  let query = supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, category_id, account_id, is_internal_transfer, source, moment_id, finance_categories(id, name, icon, color), finance_moments(id, name, icon, color)')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end   = new Date(y, m, 0).toISOString().split('T')[0]
    query = query.gte('date', start).lte('date', end)
  }
  if (category_id) query = query.eq('category_id', category_id)
  if (account_id)  query = query.eq('account_id', account_id)

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

// POST /api/finances/transactions — create manual
router.post('/transactions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { date, description, amount, currency, category_id, account_id, is_internal_transfer } = req.body
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
      source: 'manual',
    })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /api/finances/transactions/:id
router.patch('/transactions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { category_id, is_internal_transfer, description, amount } = req.body
  const update: Record<string, unknown> = {}
  if (category_id          !== undefined) update.category_id         = category_id
  if (is_internal_transfer !== undefined) update.is_internal_transfer = is_internal_transfer
  if (description          != null) update.description = description
  if (amount               != null) update.amount      = amount
  const { error } = await supabaseAdmin
    .from('finance_transactions')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
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
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if ((ch === ',' || ch === ';') && !inQ) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    rows.push(cells)
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

// POST /api/finances/transactions/csv-parse
// Parses CSV text and returns preview rows with auto-suggested categories
router.post('/transactions/csv-parse', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
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

  let transferCat = categories.find(c => norm(c.name).includes('transfer'))
  if (!transferCat) {
    const { data: incomeEnv } = await supabaseAdmin
      .from('finance_envelopes').select('id').eq('user_id', userId).eq('type', 'income').maybeSingle()
    const { data: newCat } = await supabaseAdmin.from('finance_categories').insert({
      user_id: userId, name: 'Transferência', icon: '↔️', color: '#6B7280',
      keyword_rules: [], envelope_id: incomeEnv?.id ?? null,
    }).select('id, name, icon, color, keyword_rules').single()
    if (newCat) { transferCat = newCat; categories = [...categories, newCat] }
  }

  function matchCategory(description: string): { id: number; name: string; icon: string; color: string } | null {
    const d = norm(description)
    // First pass: explicit keyword rules
    for (const cat of categories) {
      const rules: string[] = Array.isArray(cat.keyword_rules) ? cat.keyword_rules : []
      if (rules.some(kw => d.includes(norm(kw)))) return cat
    }
    // Second pass: category name appears in description (≥4 chars to avoid noise)
    for (const cat of categories) {
      const catName = norm(cat.name)
      if (catName.length >= 4 && d.includes(catName)) return cat
    }
    return null
  }

  const TRANSFER_TYPE_PATTERNS = [
    // EN
    'topup', 'top-up', 'exchange', 'transfer', 'savings',
    // FR
    'virement', 'echange', 'echanges', 'rechargement', 'envoi',
    // PT
    'transferencia', 'transferencia bancaria', 'pix', 'ted', 'doc',
  ]
  const P2P_DESC_RE = /^(to|à|a |para|envoyé à|envoye a|paiement envoyé à|paiement reçu de|reçu de|recu de|recebido de|enviado para|transferido para|virement de|virement vers)\s+[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ]/i

  const rows = parseCSV(csv)
  if (rows.length < 2) { res.status(400).json({ error: 'CSV must have at least a header row and one data row' }); return }

  const headers = rows[0]
  const dateIdx  = detectColumn(headers, ['date','data','fecha','datum'])
  const descIdx  = detectColumn(headers, ['description','descricao','historico','lancamento','memo','libelle','beneficiary','name','merchant'])
  const amtIdx   = detectColumn(headers, ['amount','valor','importe','betrag','montant','value','credit','debito','credito','charge'])
  const typeIdx  = detectColumn(headers, ['type','tipo','transaction type'])
  const stateIdx = detectColumn(headers, ['état','etat','state','status','estado','estatuto'])

  if (dateIdx < 0 || amtIdx < 0) {
    res.status(422).json({ error: 'Could not detect date or amount columns', headers, detected: { dateIdx, descIdx, amtIdx } })
    return
  }

  const SKIP_STATUSES = new Set(['renvoyé', 'renvoye', 'annulé', 'annule', 'cancelled', 'canceled', 'declined', 'failed', 'reverted', 'en attente', 'pending'])

  const transactions = []
  let skippedInvalid = 0
  for (let i = 1; i < rows.length; i++) {
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
    const isTransferByDesc = P2P_DESC_RE.test(rawDesc) || P2P_DESC_RE.test(rawDescNorm)
    const isTransfer = isTransferByType || isTransferByDesc

    const broker    = detectBroker(rawDesc)
    const category  = isTransfer ? (transferCat ?? null) : matchCategory(rawDesc)

    transactions.push({
      date,
      description: rawDesc,
      amount,
      currency,
      suggested_category: category,
      suggested_by: category ? (isTransfer ? 'transfer' : 'keyword') : null,
      is_broker_transfer: !!broker,
      is_internal_transfer: isTransfer,
      broker_name: broker,
    })
  }

  // AI categorization for rows without a keyword match (skip transfers — already categorized)
  const unmatched = transactions.filter(t => !t.suggested_category && !t.is_broker_transfer && !t.is_internal_transfer)
  if (unmatched.length > 0) {
    const uniqueMap = new Map<string, '+' | '-'>()
    for (const t of unmatched) {
      if (!uniqueMap.has(t.description)) uniqueMap.set(t.description, t.amount >= 0 ? '+' : '-')
    }
    const uniqueItems: AiItem[] = Array.from(uniqueMap.entries()).map(([description, sign]) => ({ description, sign }))
    const { map: aiMap } = await aiCategorize(uniqueItems, categories, reqDeadline)
    const catById = Object.fromEntries(categories.map(c => [c.id, c]))
    for (const t of transactions) {
      if (t.suggested_category || t.is_broker_transfer) continue
      const idx = uniqueItems.findIndex(u => u.description === t.description)
      const catId = aiMap[String(idx)]
      if (catId != null && catById[catId]) {
        t.suggested_category = catById[catId]
        t.suggested_by = 'ai'
      }
    }
  }

  res.json({ transactions, total: transactions.length, skipped_invalid: skippedInvalid, headers, detected: { dateIdx, descIdx, amtIdx, stateIdx } })
})

function csvSourceKey(t: { date: string; description: string; amount: number; currency: string }): string {
  const payload = `${t.date}|${t.description}|${t.amount}|${t.currency}`
  return 'csv:' + crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

// POST /api/finances/transactions/csv-import — insert parsed rows, skipping duplicates
router.post('/transactions/csv-import', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { transactions, learn_rules } = req.body as {
    transactions: { date: string; description: string; amount: number; currency: string; category_id?: number | null; account_id?: number | null; is_internal_transfer?: boolean }[]
    learn_rules?: { category_id: number; keyword: string }[]
  }
  if (!Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: 'transactions array required' }); return
  }

  let imported = 0
  let skipped = 0
  for (const t of transactions) {
    const source = csvSourceKey(t)
    const { error } = await supabaseAdmin.from('finance_transactions').insert({
      user_id: userId,
      date:        t.date,
      description: t.description ?? '',
      amount:      t.amount,
      currency:    t.currency ?? 'EUR',
      category_id: t.category_id ?? null,
      account_id:  t.account_id  ?? null,
      is_internal_transfer: t.is_internal_transfer ?? false,
      source,
    })
    if (error) { skipped++ } else { imported++ }
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

  res.json({ imported, skipped, total: transactions.length })
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
      .select('id, date, description, amount, currency, finance_categories(id, name, icon, color)')
      .eq('moment_id', momentId).eq('user_id', userId).order('date', { ascending: false }),
  ])
  if (momentRes.error || !momentRes.data) { res.status(404).json({ error: 'Not found' }); return }
  const transactions = txRes.data ?? []
  const total = transactions.reduce((sum, tx) => sum + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0)
  const catMap: Record<string, { name: string; icon: string; color: string; total: number }> = {}
  for (const tx of transactions) {
    if (tx.amount >= 0) continue
    const cat = tx.finance_categories as unknown as { id: number; name: string; icon: string; color: string } | null
    const key = cat ? String(cat.id) : 'none'
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Sem categoria', icon: cat?.icon ?? '❓', color: cat?.color ?? '#9CA3AF', total: 0 }
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
