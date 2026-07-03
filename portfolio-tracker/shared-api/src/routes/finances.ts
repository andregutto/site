import { Router, Response } from 'express'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { canAutoAccept } from './people.js'

const router = Router()

// ── Moment collaboration: user display helper (mirrors voyage.ts userDisplay) ──
async function userDisplay(userId: string): Promise<{ name: string; email: string; avatar_url?: string }> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
  const meta = data?.user?.user_metadata ?? {}
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || data?.user?.email || userId
  return { name, email: data?.user?.email ?? '', avatar_url: meta.avatar_url }
}

// ── Pending moment invites (exported for notifications.ts) ───────────────────
export interface PendingMomentInvite {
  key: string
  moment_name: string
  inviter_name: string
  token: string
  occurred_at: string
}

export interface RecentMomentAddition {
  key: string
  moment_id: number
  moment_name: string
  inviter_name: string
  occurred_at: string
}

export async function getPendingMomentInvites(userId: string): Promise<PendingMomentInvite[]> {
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  const select = 'invite_token, created_at, finance_moments(name, user_id)'

  const [byUser, byEmail] = await Promise.all([
    supabaseAdmin.from('finance_moment_members').select(select)
      .eq('status', 'pending').eq('user_id', userId)
      .not('invite_token', 'is', null),
    email
      ? supabaseAdmin.from('finance_moment_members').select(select)
          .eq('status', 'pending').eq('invite_email', email)
          .not('invite_token', 'is', null)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const seen = new Set<string>()
  const result: PendingMomentInvite[] = []
  for (const row of [...(byUser.data ?? []), ...(byEmail.data ?? [])] as any[]) {
    const moment = row.finance_moments
    if (!moment || seen.has(row.invite_token)) continue
    seen.add(row.invite_token)
    const inviter = await userDisplay(moment.user_id)
    result.push({
      key: `moment_invite:${row.invite_token}`,
      moment_name: moment.name,
      inviter_name: inviter.name,
      token: row.invite_token,
      occurred_at: row.created_at,
    })
  }
  return result
}

// Membros adicionados direto (auto-aceite) não passam por token/link — sem
// isso eles nunca saberiam que foram incluídos no momento.
export async function getRecentMomentAdditions(userId: string): Promise<RecentMomentAddition[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('finance_moment_members')
    .select('id, joined_at, finance_moments(id, name, user_id)')
    .eq('user_id', userId).eq('status', 'active')
    .is('invite_token', null)
    .gte('joined_at', since)

  const result: RecentMomentAddition[] = []
  for (const row of (data ?? []) as any[]) {
    const moment = row.finance_moments
    if (!moment || moment.user_id === userId) continue
    const inviter = await userDisplay(moment.user_id)
    result.push({
      key: `moment_added:${row.id}`,
      moment_id: moment.id,
      moment_name: moment.name,
      inviter_name: inviter.name,
      occurred_at: row.joined_at,
    })
  }
  return result
}

export interface RecentSettlement {
  key: string
  from_user_name: string
  amounts: { currency: string; amount: number }[]
  occurred_at: string
}

// "Acertar contas" (POST /people/settle) cria uma linha is_settlement=true por
// Momento/moeda pendente, todas com o mesmo settlement_batch_id — aqui a gente
// re-agrupa pelo batch_id pra virar UMA notificação só, não N (uma por Momento).
export async function getRecentSettlements(userId: string): Promise<RecentSettlement[]> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('id, amount, currency, paid_by_user_id, created_by, created_at, settlement_batch_id, finance_moment_expense_shares(user_id)')
    .eq('is_settlement', true)
    .neq('created_by', userId)
    .gte('created_at', since)

  const relevant = (data ?? []).filter((e: any) => {
    const participants = new Set([e.paid_by_user_id, ...((e.finance_moment_expense_shares ?? []).map((s: any) => s.user_id))])
    return participants.has(userId)
  })

  const batches = new Map<string, { created_by: string; occurred_at: string; totals: Record<string, number> }>()
  for (const e of relevant as any[]) {
    const batchKey = e.settlement_batch_id ?? `single:${e.id}`
    if (!batches.has(batchKey)) batches.set(batchKey, { created_by: e.created_by, occurred_at: e.created_at, totals: {} })
    const b = batches.get(batchKey)!
    b.totals[e.currency] = (b.totals[e.currency] ?? 0) + e.amount
    if (e.created_at > b.occurred_at) b.occurred_at = e.created_at
  }

  const result: RecentSettlement[] = []
  for (const [key, b] of batches) {
    const from = await userDisplay(b.created_by)
    result.push({
      key: `settlement:${key}`,
      from_user_name: from.name ?? from.email,
      amounts: Object.entries(b.totals).map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
      occurred_at: b.occurred_at,
    })
  }
  return result
}

export interface RecentExpenseShare {
  key: string
  moment_id: number
  moment_name: string
  description: string
  share_amount: number
  currency: string
  creator_name: string
  occurred_at: string
}

// Alguém te incluiu numa despesa dividida (ou te marcou como quem pagou) — sem isso
// você só descobre que tem um saldo pendente entrando na tela Pessoas por acaso.
// Não inclui acertos de conta (is_settlement) — esses já têm sua própria notificação.
export async function getRecentExpenseShares(userId: string): Promise<RecentExpenseShare[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from('finance_moment_expense_shares')
    .select('share_amount, created_at, finance_moment_expenses(id, moment_id, description, currency, created_by, is_settlement, finance_moments(name))')
    .eq('user_id', userId)
    .gte('created_at', since)

  const result: RecentExpenseShare[] = []
  for (const row of (data ?? []) as any[]) {
    const expense = row.finance_moment_expenses
    if (!expense || expense.is_settlement || expense.created_by === userId) continue
    const moment = expense.finance_moments
    const creator = await userDisplay(expense.created_by)
    result.push({
      key: `expense_share:${expense.id}`,
      moment_id: expense.moment_id,
      moment_name: moment?.name ?? '',
      description: expense.description,
      share_amount: row.share_amount,
      currency: expense.currency,
      creator_name: creator.name,
      occurred_at: row.created_at,
    })
  }
  return result
}

// ── Financial month helpers ───────────────────────────────────────────────────

function financialMonthKey(dateStr: string, cycleDay: number): string {
  if (cycleDay <= 1) return dateStr.slice(0, 7)
  const [y, m, d] = dateStr.split('-').map(Number)
  if (d >= cycleDay) {
    const next = new Date(y, m, 1)
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

function financialMonthRange(yearMonth: string, cycleDay: number): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  if (cycleDay <= 1) {
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const end   = new Date(y, m, 0).toISOString().split('T')[0]
    return { start, end }
  }
  const prevM = m === 1 ? 12 : m - 1
  const prevY = m === 1 ? y - 1 : y
  const start = `${prevY}-${String(prevM).padStart(2, '0')}-${String(cycleDay).padStart(2, '0')}`
  const endDay = Math.min(cycleDay - 1, new Date(y, m, 0).getDate())
  const end   = `${y}-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
  return { start, end }
}

async function getUserCycleDay(userId: string): Promise<number> {
  const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId)
  const day = user?.user_metadata?.month_cycle_day
  return typeof day === 'number' && day >= 1 && day <= 28 ? day : 1
}

// ── Budget alerts (envelopes approaching their monthly budget) ────────────────

export interface BudgetAlertItem {
  envelope_id: number
  name: string
  name_key: string | null
  icon: string
  type: string
  pct: number
  month: string
}

// Envelopes (non-income) that are at 80–100% of their budget for the current financial month.
export async function getBudgetAlerts(userId: string): Promise<BudgetAlertItem[]> {
  const cycleDay = await getUserCycleDay(userId)
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentFM = financialMonthKey(todayStr, cycleDay)
  const { start, end } = financialMonthRange(currentFM, cycleDay)

  const [txnRes, catRes, envRes, sharedEnvRes] = await Promise.all([
    supabaseAdmin
      .from('finance_transactions')
      .select('amount, category_id, shared_category_id, is_internal_transfer, exclude_from_stats')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabaseAdmin
      .from('finance_categories')
      .select('id, envelope_id, budget_monthly')
      .eq('user_id', userId),
    supabaseAdmin
      .from('finance_envelopes')
      .select('id, name, name_key, icon, type')
      .eq('user_id', userId)
      .neq('type', 'income'),
    supabaseAdmin
      .from('shared_category_user_settings')
      .select('shared_category_id, local_envelope_id')
      .eq('user_id', userId),
  ])

  const txns = txnRes.data ?? []
  const cats = (catRes.data ?? []) as { id: number; envelope_id: number | null; budget_monthly: number | null }[]
  const envs = (envRes.data ?? []) as { id: number; name: string; name_key: string | null; icon: string; type: string }[]

  const catToEnv = new Map(cats.map(c => [c.id, c.envelope_id]))
  const envCatBudget = new Map<number, number>()
  for (const c of cats) {
    if (c.envelope_id != null && c.budget_monthly != null) {
      envCatBudget.set(c.envelope_id, (envCatBudget.get(c.envelope_id) ?? 0) + c.budget_monthly)
    }
  }

  // Shared category envelope mappings + goals (mirrors /spending-summary)
  const sharedCatToEnv = new Map<number, number>(
    (sharedEnvRes.data ?? [])
      .filter(r => r.local_envelope_id != null)
      .map(r => [r.shared_category_id, r.local_envelope_id as number])
  )
  if (sharedCatToEnv.size > 0) {
    const sharedCatIds = [...sharedCatToEnv.keys()]
    const { data: sharedCatRows } = await supabaseAdmin
      .from('shared_categories')
      .select('id, total_goal, group_id')
      .in('id', sharedCatIds)
    const groupIds = [...new Set((sharedCatRows ?? []).map(c => c.group_id))]
    const { data: myMemberships } = await supabaseAdmin
      .from('shared_group_members')
      .select('group_id, share_pct')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('group_id', groupIds.length > 0 ? groupIds : [-1])
    const pctByGroup = new Map((myMemberships ?? []).map(m => [m.group_id, Number(m.share_pct ?? 50)]))
    for (const cat of sharedCatRows ?? []) {
      const envId = sharedCatToEnv.get(cat.id)
      if (!envId) continue
      const pct = pctByGroup.get(cat.group_id) ?? 50
      const myGoal = Number(cat.total_goal) * pct / 100
      envCatBudget.set(envId, (envCatBudget.get(envId) ?? 0) + myGoal)
    }
  }

  const envActual = new Map<number, number>()
  for (const tx of txns) {
    if (tx.is_internal_transfer || tx.exclude_from_stats || tx.amount >= 0) continue
    const sharedEnvId = tx.shared_category_id ? sharedCatToEnv.get(tx.shared_category_id) : undefined
    const envId = sharedEnvId ?? (tx.category_id ? catToEnv.get(tx.category_id) ?? null : null)
    if (envId == null) continue
    envActual.set(envId, (envActual.get(envId) ?? 0) + Math.abs(tx.amount))
  }

  const alerts: BudgetAlertItem[] = []
  for (const env of envs) {
    const budget = envCatBudget.get(env.id) ?? 0
    if (budget <= 0) continue
    const actual = envActual.get(env.id) ?? 0
    const ratio = actual / budget
    if (ratio >= 0.80 && ratio <= 1) {
      alerts.push({ envelope_id: env.id, name: env.name, name_key: env.name_key, icon: env.icon, type: env.type, pct: Math.round(ratio * 100), month: currentFM })
    }
  }
  return alerts
}

// ── Monthly review alerts (over-budget streak + negative balance) ─────────────
// Both look only at CLOSED financial months (never the current, in-progress one) so
// they can't fire on a partial month that still has time left to recover.

export interface OverBudgetStreakAlert { key: string; months: number; last_month: string }
export interface NegativeBalanceAlert { key: string; month: string }

export async function getMonthlyReviewAlerts(userId: string): Promise<{ streak: OverBudgetStreakAlert | null; negative: NegativeBalanceAlert | null }> {
  const cycleDay = await getUserCycleDay(userId)
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentFM = financialMonthKey(todayStr, cycleDay)

  const [catRes, envRes] = await Promise.all([
    supabaseAdmin.from('finance_categories').select('id, envelope_id, budget_monthly').eq('user_id', userId),
    supabaseAdmin.from('finance_envelopes').select('id, type').eq('user_id', userId),
  ])
  const cats = catRes.data ?? []
  const expenseEnvIds = new Set((envRes.data ?? []).filter(e => e.type !== 'income').map(e => e.id))
  let totalBudgeted = cats
    .filter(c => c.envelope_id != null && expenseEnvIds.has(c.envelope_id) && c.budget_monthly != null)
    .reduce((s, c) => s + (c.budget_monthly as number), 0)

  // Add shared-category goals assigned to an expense envelope (mirrors /finances/budget)
  const { data: sharedEnvRows } = await supabaseAdmin
    .from('shared_category_user_settings').select('shared_category_id, local_envelope_id').eq('user_id', userId)
  const sharedCatIds = (sharedEnvRows ?? []).filter(r => r.local_envelope_id != null && expenseEnvIds.has(r.local_envelope_id)).map(r => r.shared_category_id)
  if (sharedCatIds.length > 0) {
    const { data: sharedCatRows } = await supabaseAdmin.from('shared_categories').select('id, total_goal, group_id').in('id', sharedCatIds)
    const groupIds = [...new Set((sharedCatRows ?? []).map(c => c.group_id))]
    const { data: myMemberships } = await supabaseAdmin
      .from('shared_group_members').select('group_id, share_pct').eq('user_id', userId).eq('status', 'active').in('group_id', groupIds.length > 0 ? groupIds : [-1])
    const pctByGroup = new Map((myMemberships ?? []).map(m => [m.group_id, Number(m.share_pct ?? 50)]))
    for (const cat of sharedCatRows ?? []) totalBudgeted += Number(cat.total_goal) * (pctByGroup.get(cat.group_id) ?? 50) / 100
  }

  // Last 3 CLOSED financial months (most recent first) — skip the current, in-progress one
  const [cfy, cfm] = currentFM.split('-').map(Number)
  const closedMonths: string[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(cfy, cfm - 1 - i, 1)
    closedMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthTotals = await Promise.all(closedMonths.map(async fm => {
    const { start, end } = financialMonthRange(fm, cycleDay)
    const { data: txns } = await supabaseAdmin
      .from('finance_transactions').select('amount, is_internal_transfer, exclude_from_stats')
      .eq('user_id', userId).gte('date', start).lte('date', end)
    let income = 0, expenses = 0
    for (const tx of txns ?? []) {
      if (tx.is_internal_transfer || tx.exclude_from_stats) continue
      if (tx.amount > 0) income += tx.amount
      else expenses += Math.abs(tx.amount)
    }
    return { month: fm, income, expenses }
  }))

  // Streak: fires only once all 3 of the last 3 closed months went over budget — a single
  // bad month isn't a signal the plan is stale, three in a row usually is.
  let streak: OverBudgetStreakAlert | null = null
  if (totalBudgeted > 0 && monthTotals.every(m => m.expenses > totalBudgeted)) {
    streak = { key: `overbudget_streak:${monthTotals[0].month}`, months: monthTotals.length, last_month: monthTotals[0].month }
  }

  // Negative balance: only the most recently closed month, and only if it actually had
  // transactions (avoids firing for a brand-new account with no history yet).
  let negative: NegativeBalanceAlert | null = null
  const lastClosed = monthTotals[0]
  if (lastClosed && (lastClosed.income > 0 || lastClosed.expenses > 0) && lastClosed.expenses > lastClosed.income) {
    negative = { key: `negative_balance:${lastClosed.month}`, month: lastClosed.month }
  }

  return { streak, negative }
}

const DEFAULT_NAMES: Record<string, { income: string; transfer: string; salary: string; essential: string; investment: string; savings: string; free: string }> = {
  pt: { income: 'Rendas',  transfer: 'Transferência', salary: 'Salário',  essential: 'Gastos Essenciais',      investment: 'Investimentos',    savings: 'Reserva', free: 'Lazer'    },
  en: { income: 'Income',  transfer: 'Transfer',      salary: 'Salary',   essential: 'Essential Expenses',     investment: 'Investments',      savings: 'Savings', free: 'Fun Money' },
  fr: { income: 'Revenus', transfer: 'Virement',      salary: 'Salaire',  essential: 'Dépenses Essentielles',  investment: 'Investissements',  savings: 'Épargne', free: 'Loisirs'  },
}

const DEFAULT_CAT_NAMES: Record<string, Record<string, { name: string; icon: string; color: string; name_key: string }[]>> = {
  pt: {
    envelopeEssential:  [
      { name: 'Moradia',        icon: '🏠', color: '#3b82f6', name_key: 'categoryHousing' },
      { name: 'Alimentação',    icon: '🛒', color: '#10b981', name_key: 'categoryGroceries' },
      { name: 'Transporte',     icon: '🚗', color: '#f59e0b', name_key: 'categoryTransport' },
      { name: 'Saúde',          icon: '💊', color: '#ef4444', name_key: 'categoryHealth' },
      { name: 'Utilidades',     icon: '💡', color: '#6366f1', name_key: 'categoryUtilities' },
    ],
    envelopeInvestment: [
      { name: 'Ações / FII',    icon: '📈', color: '#10b981', name_key: 'categoryInvestment' },
      { name: 'Renda Fixa',     icon: '📄', color: '#06b6d4', name_key: 'categoryBonds' },
    ],
    envelopeSavings:    [{ name: 'Emergência',    icon: '🏦', color: '#f59e0b', name_key: 'categoryEmergency' }],
    envelopeFree:       [
      { name: 'Restaurante',    icon: '🍽️', color: '#f97316', name_key: 'categoryRestaurant' },
      { name: 'Viagem',         icon: '✈️', color: '#8b5cf6', name_key: 'categoryTravel' },
      { name: 'Entretenimento', icon: '🎬', color: '#ec4899', name_key: 'categoryEntertainment' },
    ],
  },
  en: {
    envelopeEssential:  [
      { name: 'Housing',        icon: '🏠', color: '#3b82f6', name_key: 'categoryHousing' },
      { name: 'Food',           icon: '🛒', color: '#10b981', name_key: 'categoryGroceries' },
      { name: 'Transport',      icon: '🚗', color: '#f59e0b', name_key: 'categoryTransport' },
      { name: 'Health',         icon: '💊', color: '#ef4444', name_key: 'categoryHealth' },
      { name: 'Utilities',      icon: '💡', color: '#6366f1', name_key: 'categoryUtilities' },
    ],
    envelopeInvestment: [
      { name: 'Stocks / ETF',   icon: '📈', color: '#10b981', name_key: 'categoryInvestment' },
      { name: 'Fixed Income',   icon: '📄', color: '#06b6d4', name_key: 'categoryBonds' },
    ],
    envelopeSavings:    [{ name: 'Emergency Fund', icon: '🏦', color: '#f59e0b', name_key: 'categoryEmergency' }],
    envelopeFree:       [
      { name: 'Restaurants',    icon: '🍽️', color: '#f97316', name_key: 'categoryRestaurant' },
      { name: 'Travel',         icon: '✈️', color: '#8b5cf6', name_key: 'categoryTravel' },
      { name: 'Entertainment',  icon: '🎬', color: '#ec4899', name_key: 'categoryEntertainment' },
    ],
  },
  fr: {
    envelopeEssential:  [
      { name: 'Logement',       icon: '🏠', color: '#3b82f6', name_key: 'categoryHousing' },
      { name: 'Alimentation',   icon: '🛒', color: '#10b981', name_key: 'categoryGroceries' },
      { name: 'Transport',      icon: '🚗', color: '#f59e0b', name_key: 'categoryTransport' },
      { name: 'Santé',          icon: '💊', color: '#ef4444', name_key: 'categoryHealth' },
      { name: 'Services',       icon: '💡', color: '#6366f1', name_key: 'categoryUtilities' },
    ],
    envelopeInvestment: [
      { name: 'Actions / ETF',  icon: '📈', color: '#10b981', name_key: 'categoryInvestment' },
      { name: 'Revenu fixe',    icon: '📄', color: '#06b6d4', name_key: 'categoryBonds' },
    ],
    envelopeSavings:    [{ name: 'Fonds d\'urgence', icon: '🏦', color: '#f59e0b', name_key: 'categoryEmergency' }],
    envelopeFree:       [
      { name: 'Restaurants',    icon: '🍽️', color: '#f97316', name_key: 'categoryRestaurant' },
      { name: 'Voyages',        icon: '✈️', color: '#8b5cf6', name_key: 'categoryTravel' },
      { name: 'Divertissement', icon: '🎬', color: '#ec4899', name_key: 'categoryEntertainment' },
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
    const hasSalario  = categories.some(c => c.name_key === 'categorySalary' || norm(c.name).includes('salari') || norm(c.name).includes('salary') || norm(c.name).includes('salaire'))
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
        return defs.map(c => ({ user_id: userId, name: c.name, name_key: c.name_key, icon: c.icon, color: c.color, keyword_rules: [], envelope_id: env.id }))
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

  // Shared categories the user linked to one of their own envelopes (mirrors the same
  // join used by /spending-summary) — attached per-envelope here so the Budget page can
  // nest them inside the envelope they belong to and fold their goal into its total,
  // instead of only listing them in a separate section further down the page.
  const { data: sharedEnvRows } = await supabaseAdmin
    .from('shared_category_user_settings')
    .select('shared_category_id, local_envelope_id')
    .eq('user_id', userId)
  const sharedCatToEnv = new Map<number, number>(
    (sharedEnvRows ?? []).filter(r => r.local_envelope_id != null).map(r => [r.shared_category_id, r.local_envelope_id as number])
  )
  const sharedByEnv = new Map<number, { id: number; name: string; icon: string; color: string; my_goal: number; total_goal: number; currency: string; group_id: number; group_name: string }[]>()
  if (sharedCatToEnv.size > 0) {
    const sharedCatIds = [...sharedCatToEnv.keys()]
    const { data: sharedCatRows } = await supabaseAdmin
      .from('shared_categories').select('id, name, icon, color, total_goal, currency, group_id').in('id', sharedCatIds)
    const groupIds = [...new Set((sharedCatRows ?? []).map(c => c.group_id))]
    const [{ data: myMemberships }, { data: groupRows }] = await Promise.all([
      supabaseAdmin.from('shared_group_members').select('group_id, share_pct').eq('user_id', userId).eq('status', 'active').in('group_id', groupIds.length > 0 ? groupIds : [-1]),
      supabaseAdmin.from('shared_groups').select('id, name').in('id', groupIds.length > 0 ? groupIds : [-1]),
    ])
    const pctByGroup = new Map((myMemberships ?? []).map(m => [m.group_id, Number(m.share_pct ?? 50)]))
    const groupNameMap = new Map((groupRows ?? []).map(g => [g.id, g.name]))
    for (const cat of sharedCatRows ?? []) {
      const envId = sharedCatToEnv.get(cat.id)
      if (!envId) continue
      const pct = pctByGroup.get(cat.group_id) ?? 50
      const myGoal = Number(cat.total_goal) * pct / 100
      const list = sharedByEnv.get(envId) ?? []
      list.push({ id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, my_goal: myGoal, total_goal: Number(cat.total_goal), currency: cat.currency, group_id: cat.group_id, group_name: groupNameMap.get(cat.group_id) ?? '' })
      sharedByEnv.set(envId, list)
    }
  }

  // Attach categories to envelopes; expense envelopes use effective income for budget_amount
  const result = envelopes.map(env => ({
    ...env,
    budget_amount: env.type === 'income' ? 0 : effectiveIncome * (env.pct_target / 100),
    categories: categories.filter(c => c.envelope_id === env.id),
    shared_categories: sharedByEnv.get(env.id) ?? [],
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
    .select('id, name, icon, color, budget_monthly, name_key, archived')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('name')
  res.json(data ?? [])
})

// POST /api/finances/categories/:id/share — converte uma categoria pessoal
// existente numa categoria compartilhada de um grupo (mesma identidade,
// transações migram, original fica arquivada para permitir reverter depois).
router.post('/categories/:id/share', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = req as AuthRequest
    const categoryId = Number(req.params.id)
    const { group_id } = req.body as { group_id?: number }
    if (!group_id) { res.status(400).json({ error: 'group_id obrigatório' }); return }

    const { data: category } = await supabaseAdmin
      .from('finance_categories').select('*').eq('id', categoryId).eq('user_id', userId).single()
    if (!category) { res.status(404).json({ error: 'Categoria não encontrada' }); return }

    const { data: group } = await supabaseAdmin.from('shared_groups').select('id, created_by').eq('id', group_id).single()
    if (!group) { res.status(404).json({ error: 'Grupo não encontrado' }); return }
    const { data: membership } = await supabaseAdmin
      .from('shared_group_members').select('id').eq('group_id', group_id).eq('user_id', userId).eq('status', 'active').maybeSingle()
    if (group.created_by !== userId && !membership) { res.status(403).json({ error: 'Sem permissão neste grupo' }); return }

    const { data: sharedCat, error } = await supabaseAdmin
      .from('shared_categories')
      .insert({
        group_id, name: category.name, icon: category.icon, color: category.color,
        total_goal: category.budget_monthly ?? 0, created_by: userId, source_category_id: categoryId,
      })
      .select('id').single()
    if (error || !sharedCat) { res.status(500).json({ error: error?.message }); return }

    await supabaseAdmin
      .from('finance_transactions')
      .update({ shared_category_id: sharedCat.id, category_id: null })
      .eq('category_id', categoryId)
    await supabaseAdmin.from('finance_categories').update({ archived: true }).eq('id', categoryId)

    res.json({ ok: true, shared_category_id: sharedCat.id })
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Erro ao compartilhar categoria' })
  }
})

// POST /api/finances/categories/:id/unarchive — reverte manualmente (usado
// também pelo auto-revert ao remover o último outro membro do grupo).
export async function revertSharedCategory(sharedCategoryId: number): Promise<boolean> {
  const { data: sharedCat } = await supabaseAdmin
    .from('shared_categories').select('id, source_category_id').eq('id', sharedCategoryId).single()
  if (!sharedCat?.source_category_id) return false

  await supabaseAdmin
    .from('finance_transactions')
    .update({ category_id: sharedCat.source_category_id, shared_category_id: null })
    .eq('shared_category_id', sharedCategoryId)
  await supabaseAdmin.from('finance_categories').update({ archived: false }).eq('id', sharedCat.source_category_id)
  await supabaseAdmin.from('shared_categories').delete().eq('id', sharedCategoryId)
  return true
}

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
  const cycleDay = await getUserCycleDay(userId)

  // Determine current financial month and the oldest one needed
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentFM = financialMonthKey(todayStr, cycleDay)
  const [cfy, cfm] = currentFM.split('-').map(Number)
  const oldestDate = new Date(cfy, cfm - 1 - (months - 1), 1)
  const oldestFM   = `${oldestDate.getFullYear()}-${String(oldestDate.getMonth() + 1).padStart(2, '0')}`
  const { start: sinceStr } = financialMonthRange(oldestFM, cycleDay)

  // PostgREST caps a single response at 1000 rows — with "Tudo" (up to 120 months) pulling
  // in a user's whole transaction history, that silently truncated to the oldest 1000 rows
  // (ascending date order), so any month past that point showed as empty. Paginate instead.
  async function fetchAllTransactions() {
    const PAGE_SIZE = 1000
    const all: { date: string; amount: number; category_id: number | null; shared_category_id: number | null; is_internal_transfer: boolean; exclude_from_stats: boolean }[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await supabaseAdmin
        .from('finance_transactions')
        .select('date, amount, category_id, shared_category_id, is_internal_transfer, exclude_from_stats')
        .eq('user_id', userId)
        .gte('date', sinceStr)
        .order('date', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (!data?.length) break
      all.push(...data)
      if (data.length < PAGE_SIZE) break
    }
    return all
  }

  const [txns, catRes, envRes, incomeRes] = await Promise.all([
    fetchAllTransactions(),
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

  // Shared category envelope mappings for this user
  const { data: sharedEnvRows } = await supabaseAdmin
    .from('shared_category_user_settings')
    .select('shared_category_id, local_envelope_id')
    .eq('user_id', userId)
  const sharedCatToEnv = new Map<number, number>(
    (sharedEnvRows ?? [])
      .filter(r => r.local_envelope_id != null)
      .map(r => [r.shared_category_id, r.local_envelope_id as number])
  )

  // Add shared category goals to envelope budgets
  if (sharedCatToEnv.size > 0) {
    const sharedCatIds = [...sharedCatToEnv.keys()]
    const { data: sharedCatRows } = await supabaseAdmin
      .from('shared_categories')
      .select('id, total_goal, group_id')
      .in('id', sharedCatIds)
    const groupIds2 = [...new Set((sharedCatRows ?? []).map(c => c.group_id))]
    const { data: myMemberships } = await supabaseAdmin
      .from('shared_group_members')
      .select('group_id, share_pct')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('group_id', groupIds2.length > 0 ? groupIds2 : [-1])
    const pctByGroup = new Map((myMemberships ?? []).map(m => [m.group_id, Number(m.share_pct ?? 50)]))
    for (const cat of sharedCatRows ?? []) {
      const envId = sharedCatToEnv.get(cat.id)
      if (!envId) continue
      const pct = pctByGroup.get(cat.group_id) ?? 50
      const myGoal = Number(cat.total_goal) * pct / 100
      envCatBudget.set(envId, (envCatBudget.get(envId) ?? 0) + myGoal)
    }
  }

  // Aggregate transactions by financial month → envelope and category
  type MonthData = { income: number; expenses: number; byEnv: Map<number | null, number>; byCat: Map<number | null, number> }
  const monthMap = new Map<string, MonthData>()

  for (const tx of txns) {
    const m = financialMonthKey(tx.date as string, cycleDay)
    if (!monthMap.has(m)) monthMap.set(m, { income: 0, expenses: 0, byEnv: new Map(), byCat: new Map() })
    const md = monthMap.get(m)!
    if (tx.is_internal_transfer || tx.exclude_from_stats) continue
    if (tx.amount > 0) {
      md.income += tx.amount
      const incomeEnvId2 = tx.category_id ? (catToEnv.get(tx.category_id) ?? null) : null
      if (incomeEnvId2 != null) {
        md.byEnv.set(incomeEnvId2, (md.byEnv.get(incomeEnvId2) ?? 0) + tx.amount)
        md.byCat.set(tx.category_id, (md.byCat.get(tx.category_id) ?? 0) + tx.amount)
      }
    } else {
      md.expenses += Math.abs(tx.amount)
      const sharedEnvId = (tx as { shared_category_id?: number }).shared_category_id
        ? sharedCatToEnv.get((tx as { shared_category_id: number }).shared_category_id)
        : undefined
      const envId = sharedEnvId ?? (tx.category_id ? (catToEnv.get(tx.category_id) ?? null) : null)
      md.byEnv.set(envId ?? null, (md.byEnv.get(envId ?? null) ?? 0) + Math.abs(tx.amount))
      md.byCat.set(tx.category_id, (md.byCat.get(tx.category_id) ?? 0) + Math.abs(tx.amount))
    }
  }

  // Build response months anchored to current financial month
  const resultMonths = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(cfy, cfm - 1 - i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const md = monthMap.get(m) ?? { income: 0, expenses: 0, byEnv: new Map(), byCat: new Map() }

    const byEnv = allEnvs.map(env => {
      const envCats = cats
        .filter(c => c.envelope_id === env.id)
        .map(c => ({ id: c.id, name: c.name, name_key: c.name_key ?? null, icon: c.icon, color: c.color, actual: Math.round((md.byCat.get(c.id) ?? 0) * 100) / 100, budget: Math.round((c.budget_monthly ?? 0) * 100) / 100 }))
        .filter(c => c.actual > 0)
        .sort((a, b) => b.actual - a.actual)
      const envBudget = env.type === 'income' ? income.monthly_net : (envCatBudget.get(env.id) ?? 0)
      return {
        envelope_id: env.id,
        name:        env.name,
        name_key:    (env as { name_key?: string | null }).name_key ?? null,
        type:        env.type,
        color:       env.color,
        icon:        env.icon,
        actual:      Math.round((md.byEnv.get(env.id) ?? 0) * 100) / 100,
        budget:      Math.round(envBudget * 100) / 100,
        categories:  envCats,
      }
    })

    const uncategorized = md.byEnv.get(null) ?? 0
    if (uncategorized > 0) {
      byEnv.push({ envelope_id: -1, name: 'Não categorizado', name_key: 'categoryUncategorized', type: '', color: '#9CA3AF', icon: '❓', actual: Math.round(uncategorized * 100) / 100, budget: 0, categories: [] })
    }

    // Daily expense breakdown for the current financial month only
    let byDay: { day: number; amount: number }[] | undefined
    if (i === 0) {
      const { start: fmStart } = financialMonthRange(m, cycleDay)
      const [fsy, fsm, fsd] = fmStart.split('-').map(Number)
      const fmStartMs = new Date(fsy, fsm - 1, fsd).getTime()
      const dayMap = new Map<number, number>()
      for (const tx of txns) {
        if (Number(tx.amount) >= 0 || tx.is_internal_transfer || tx.exclude_from_stats) continue
        const [ty, tm, td] = (tx.date as string).split('-').map(Number)
        const txMs = new Date(ty, tm - 1, td).getTime()
        if (txMs < fmStartMs) continue
        const dayN = Math.round((txMs - fmStartMs) / 86400000) + 1
        dayMap.set(dayN, (dayMap.get(dayN) ?? 0) + Math.abs(Number(tx.amount)))
      }
      byDay = [...dayMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, amount]) => ({ day, amount: Math.round(amount * 100) / 100 }))
    }

    resultMonths.push({
      month:       m,
      income:      Math.round(md.income * 100) / 100,
      expenses:    Math.round(md.expenses * 100) / 100,
      by_envelope: byEnv,
      ...(i === 0 ? { by_day: byDay } : {}),
    })
  }

  res.json({
    months:        resultMonths,
    income_config: income,
    envelopes:     allEnvs.map(e => ({ ...e, budget: e.type === 'income' ? income.monthly_net : (envCatBudget.get(e.id) ?? 0) })),
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
  const txnCountMap = new Map<number, number>()
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
      if (tx.account_id != null) {
        balanceMap.set(tx.account_id, (balanceMap.get(tx.account_id) ?? 0) + Number(tx.amount))
        txnCountMap.set(tx.account_id, (txnCountMap.get(tx.account_id) ?? 0) + 1)
      }
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
    transaction_count: txnCountMap.get(a.id) ?? 0,
    bank_connection: connMap.get(a.id) ?? null,
  }))
  res.json(result)
})

// GET /api/finances/accounts/portfolio-institutions
// Returns curated international banks/brokers + user's asset exchanges, minus already-linked accounts
const KNOWN_INSTITUTIONS = [
  // France
  'BNP Paribas', 'Société Générale', 'Crédit Agricole', 'LCL', 'Caisse d\'Épargne', 'Banque Populaire',
  'La Banque Postale', 'Crédit Mutuel', 'CIC', 'HSBC France', 'ING France', 'Boursorama',
  'Fortuneo', 'Hello bank!', 'Monabanq', 'N26', 'Revolut', 'Wise',
  'Degiro', 'Trade Republic', 'eToro',
  // USA
  'Charles Schwab', 'Fidelity', 'Vanguard', 'TD Ameritrade', 'E*TRADE', 'Robinhood',
  'Interactive Brokers', 'Merrill Lynch', 'Morgan Stanley', 'JPMorgan Chase',
  'Bank of America', 'Wells Fargo', 'Citibank', 'Goldman Sachs',
  // Brazil
  'XP Investimentos', 'Rico', 'Clear', 'BTG Pactual', 'Itaú', 'Bradesco', 'Santander',
  'Banco do Brasil', 'Caixa Econômica Federal', 'Nubank', 'C6 Bank', 'Inter',
  'Avenue', 'Órama', 'Genial', 'Warren', 'Vitreo', 'Kinea',
]
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
    const { userLocale } = req as AuthRequest
    const caixaNames: Record<string, string> = { pt: 'Caixa', en: 'Cash', fr: 'Liquidités' }
    const caixaName = caixaNames[userLocale] ?? caixaNames['pt']
    let caixaClassId: string | null = null
    const { data: existingClass } = await supabaseAdmin
      .from('asset_classes').select('id').eq('user_id', userId).eq('name_key', 'classCaixa').maybeSingle()
    if (existingClass) {
      caixaClassId = existingClass.id
    } else {
      const { data: newClass } = await supabaseAdmin.from('asset_classes').insert({
        user_id: userId, name: caixaName, color: '#6B7280', name_key: 'classCaixa',
      }).select('id').single()
      if (newClass) caixaClassId = newClass.id
    }
    const code = name.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-]/g, '').slice(0, 20) || `CASH-${Date.now().toString(36).toUpperCase().slice(-4)}`
    const { data: asset } = await supabaseAdmin.from('assets').insert({
      user_id: userId, code, name: name.trim(), asset_type: 'manual',
      currency: currency ?? 'EUR', exchange: institution_name?.trim() ?? null, active: true,
      ...(caixaClassId ? { class_id: caixaClassId } : {}),
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
  // Unlink transactions (set account_id = null), keep the transactions
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

// Helper: compute balance and upsert manual_value for linked asset (fire-and-forget safe)
async function syncAccountToPortfolio(accountId: number, userId: string): Promise<void> {
  const { data: account } = await supabaseAdmin
    .from('finance_accounts')
    .select('id, name, currency, linked_asset_id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()
  if (!account?.linked_asset_id) return
  let balance = 0
  let offset = 0
  while (true) {
    const { data: page } = await supabaseAdmin
      .from('finance_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .range(offset, offset + 999)
    if (!page || page.length === 0) break
    balance += page.reduce((s, t) => s + Number(t.amount), 0)
    if (page.length < 1000) break
    offset += 1000
  }
  balance = Math.round(balance * 100) / 100
  const today = new Date().toISOString().split('T')[0]
  await supabaseAdmin
    .from('manual_values')
    .upsert(
      { asset_id: account.linked_asset_id, ref_date: today, value: balance, currency: account.currency, notes: `Sincronizado de ${account.name}` },
      { onConflict: 'asset_id,ref_date' }
    )
}

// POST /api/finances/accounts/:id/sync-portfolio
router.post('/accounts/:id/sync-portfolio', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const accountId = Number(req.params.id)
  const { data: account, error: accErr } = await supabaseAdmin
    .from('finance_accounts')
    .select('id, linked_asset_id, currency')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()
  if (accErr || !account) { res.status(404).json({ error: 'Conta não encontrada' }); return }
  if (!account.linked_asset_id) { res.status(400).json({ error: 'Conta não vinculada a nenhum ativo' }); return }
  await syncAccountToPortfolio(accountId, userId)
  // Return current balance from manual_values
  const today = new Date().toISOString().split('T')[0]
  const { data: mv } = await supabaseAdmin
    .from('manual_values')
    .select('value, currency')
    .eq('asset_id', account.linked_asset_id)
    .eq('ref_date', today)
    .single()
  res.json({ ok: true, value: mv?.value ?? 0, currency: mv?.currency ?? account.currency })
})

// ── Transactions ───────────────────────────────────────────────────────────────

// GET /api/finances/transactions?month=2026-05&category_id=3&limit=1
router.get('/transactions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { month, category_id, account_id, limit, date_from, date_to, moment_id } = req.query as Record<string, string>

  let query = supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, category_id, shared_category_id, account_id, is_internal_transfer, linked_transfer_id, exclude_from_stats, reimbursement_group_id, source, moment_id, notes, finance_categories(id, name, icon, color), finance_transaction_moments(moment_id, finance_moments(id, name, icon, color))')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (month) {
    const cycleDay = await getUserCycleDay(userId)
    const { start, end } = financialMonthRange(month, cycleDay)
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
  // Transform junction table into flat moments array
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

// GET /api/finances/transactions/months — distinct financial YYYY-MM months with data, desc
router.get('/transactions/months', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const cycleDay = await getUserCycleDay(userId)
  const { data } = await supabaseAdmin
    .from('finance_transactions')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  const seen = new Set<string>()
  for (const r of (data ?? [])) seen.add(financialMonthKey(r.date as string, cycleDay))
  res.json([...seen])
})

// GET /api/finances/transactions/search?q=xxx&limit=15 — full-history search by description
router.get('/transactions/search', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { q, limit } = req.query as Record<string, string>
  if (!q || q.trim().length < 2) { res.json([]); return }
  const { data, error } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, finance_categories(id, name, icon, color)')
    .eq('user_id', userId)
    .ilike('description', `%${q.trim()}%`)
    .order('date', { ascending: false })
    .limit(Number(limit) || 15)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

// POST /api/finances/transactions — create manual
router.post('/transactions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { date, description, amount, currency, category_id, account_id, is_internal_transfer, notes, shared_category_id } = req.body
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
      shared_category_id: shared_category_id ?? null,
      source: 'manual',
    })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  if (data.account_id) syncAccountToPortfolio(data.account_id, userId).catch(() => {})
  res.json(data)
})

// PATCH /api/finances/transactions/bulk-category — update category for ALL transactions with matching description
router.patch('/transactions/bulk-category', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { description, category_id } = req.body as { description: string; category_id: number | null }
  if (!description) { res.status(400).json({ error: 'description required' }); return }
  const { error, count } = await supabaseAdmin
    .from('finance_transactions')
    .update({ category_id: category_id ?? null }, { count: 'exact' })
    .eq('user_id', userId)
    .eq('description', description)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true, updated: count ?? 0 })
})

// PATCH /api/finances/transactions/bulk-transfer — mark/unmark all transactions with same description
router.patch('/transactions/bulk-transfer', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { description, is_internal_transfer } = req.body as { description: string; is_internal_transfer: boolean }
  if (!description) { res.status(400).json({ error: 'description required' }); return }
  const { error } = await supabaseAdmin
    .from('finance_transactions')
    .update({ is_internal_transfer })
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
  if (account_id) syncAccountToPortfolio(account_id, userId).catch(() => {})
  res.json({ ok: true, updated: transaction_ids.length })
})

// PATCH /api/finances/transactions/:id
// Ownership: todo update é restrito por .eq('user_id', userId) abaixo — mesmo
// quando a transação pertence a um "momento" compartilhado (finance_moment_members),
// colaboradores só conseguem editar suas PRÓPRIAS transações, nunca as de outro
// membro do mesmo momento. Isso é reforçado no nível da rota Express (não só RLS).
router.patch('/transactions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { category_id, shared_category_id, is_internal_transfer, description, amount, notes, moment_id, moment_ids, exclude_from_stats, reimbursement_group_id } = req.body
  const update: Record<string, unknown> = {}
  if (category_id          !== undefined) update.category_id          = category_id
  if (shared_category_id   !== undefined) update.shared_category_id   = shared_category_id
  if (is_internal_transfer !== undefined) update.is_internal_transfer  = is_internal_transfer
  if (exclude_from_stats   !== undefined) update.exclude_from_stats    = exclude_from_stats
  if (reimbursement_group_id !== undefined) update.reimbursement_group_id = reimbursement_group_id
  if (description          != null) update.description = description
  if (amount               != null) update.amount      = amount
  if (notes                !== undefined) update.notes = notes ?? null

  // Handle moment assignment via junction table
  if (moment_ids !== undefined || moment_id !== undefined) {
    const ids: number[] = moment_ids !== undefined
      ? moment_ids
      : (moment_id === null ? [] : [moment_id])

    // A reimbursement group is displayed/managed as a single unit (collapsed row in the
    // Transactions page) — assigning a moment to one member must assign it to the whole
    // group, or the group would show up split across "in a moment" / "not in a moment".
    const { data: selfTx } = await supabaseAdmin
      .from('finance_transactions').select('reimbursement_group_id').eq('id', id).eq('user_id', userId).single()
    const groupId = reimbursement_group_id !== undefined ? reimbursement_group_id : selfTx?.reimbursement_group_id
    let targetIds = [Number(id)]
    if (groupId) {
      const { data: siblings } = await supabaseAdmin
        .from('finance_transactions').select('id').eq('reimbursement_group_id', groupId).eq('user_id', userId)
      targetIds = (siblings ?? []).map((s: { id: number }) => s.id)
    }

    await supabaseAdmin.from('finance_transaction_moments')
      .delete().in('transaction_id', targetIds).eq('user_id', userId)
    if (ids.length > 0) {
      await supabaseAdmin.from('finance_transaction_moments')
        .insert(targetIds.flatMap(tid => ids.map((mid: number) => ({ transaction_id: tid, moment_id: mid, user_id: userId }))))
    }
    update.moment_id = ids[0] ?? null  // keep legacy column in sync
    const otherIds = targetIds.filter(tid => tid !== Number(id))
    if (otherIds.length > 0) {
      await supabaseAdmin.from('finance_transactions').update({ moment_id: ids[0] ?? null }).in('id', otherIds).eq('user_id', userId)
    }
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabaseAdmin
      .from('finance_transactions')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
    if (error) { res.status(500).json({ error: error.message }); return }
    if (update.amount != null) {
      const { data: tx } = await supabaseAdmin
        .from('finance_transactions').select('account_id').eq('id', id).eq('user_id', userId).single()
      if (tx?.account_id) syncAccountToPortfolio(tx.account_id, userId).catch(() => {})
    }
  }
  res.json({ ok: true })
})

// DELETE /api/finances/transactions/:id
// Ownership: mesma regra do PATCH acima — .eq('user_id', userId) garante que
// colaboradores de um momento compartilhado só apagam suas próprias transações.
router.delete('/transactions/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { id } = req.params
  const { data: tx } = await supabaseAdmin
    .from('finance_transactions').select('account_id').eq('id', id).eq('user_id', userId).single()
  const { error } = await supabaseAdmin
    .from('finance_transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  if (tx?.account_id) syncAccountToPortfolio(tx.account_id, userId).catch(() => {})
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

  // Auto-detect delimiter: tab wins if any line has tabs, otherwise pick ; or ,
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

function detectBroker(description: string): string | null {
  const d = description.toLowerCase()
  return BROKER_KEYWORDS.find(b => d.includes(b)) ?? null
}

// ── Transfer pair detection ────────────────────────────────────────────────────

const TRANSFER_KWS = [
  // FR
  'virement','vir sepa','sepa','topup','top-up','top up',
  // PT
  'transferencia','transferência','ted ','doc ','pix ','tef ',
  // EN
  'transfer','wire',
  // Banks commonly seen in counterpart descriptions
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

  // Build lookup: rounded-amount -> negative transactions
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
      if (remaining <= 1000) break // less than 1s left — return what we have
      const batch = items.slice(i, i + AI_BATCH_SIZE)
      // Race the batch against the remaining deadline so one slow call can't cause 504
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

  // "Internal transfer" only makes sense between two of the user's OWN accounts — with a
  // single account registered there's nothing for a SEPA/TED/PIX transfer to be internal
  // to, so every such transaction is necessarily external (salary, rent, a friend paying
  // you back, etc.) and must not be auto-hidden just because the label says "VIREMENT".
  const { count: accountCount } = await supabaseAdmin
    .from('finance_accounts').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('is_active', true)
  const hasMultipleAccounts = (accountCount ?? 0) >= 2

  let transferCat = categories.find(c => { const n = norm(c.name); return n.includes('transfer') || n.includes('virement') })
  // Ensure transfer category exists — create it if not (fix: transfers get proper category)
  if (!transferCat) {
    const { data: incomeEnv } = await supabaseAdmin
      .from('finance_envelopes').select('id').eq('user_id', userId).eq('type', 'income').maybeSingle()
    const { data: newCat } = await supabaseAdmin.from('finance_categories').insert({
      user_id: userId, name: csvNames.transfer, icon: '↔️', color: '#6B7280',
      keyword_rules: [], envelope_id: incomeEnv?.id ?? null,
    }).select('id, name, icon, color').single()
    if (newCat) {
      const newCatWithRules = { ...newCat, keyword_rules: [] as string[] }
      transferCat = newCatWithRules
      categories = [...categories, newCatWithRules]
    }
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
  // ("To M Andre" = person; "To IDM Conseil" = company → no salutation → not caught)
  const P2P_DESC_RE = /^(?:to\s+(?:m|mr|mrs|ms|mme|dr)\.?\s+|(?:à|a)\s+(?!l[ae]?\s|l'|les\s)|para\s+|envoyé\s+à\s+|envoye\s+a\s+|paiement\s+envoyé\s+à\s+|enviado\s+para\s+|transferido\s+para\s+|pix\s+para\s+|ted\s+para\s+|virement\s+(?:vers|(?:à|a))\s+|envoi\s+(?:à|a)\s+)[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ]/i
  // SEPA / FR banking viremennts (BNP, Boursorama, etc.) and BR bank transfers (TED, PIX, DOC, TEF)
  // Matches: "VIREMENT INSTANTANE RECU/EMIS ...", "VIR SEPA ...", "VIR INTERNE ...", "TED ...", "PIX ..."
  // "VIREMENT INSTANTANE" is BNP's instant SEPA transfer — always bank-to-bank, never a merchant payment
  // "VIREMENT /DE SPB" (bare VIREMENT without qualifier) is NOT matched — could be salary/income
  // keyword match still wins via effectiveIsTransfer guard below
  const SEPA_VIREMENT_RE = /^(?:vir(?:ement)?\s+instantane\b|vir(?:ement)?\s+(?:sepa|interne|permanent|euros?|emis|recu|vers\b)|ted\s|pix\s|doc\s|tef\s)/i

  const rows = parseCSV(csv)
  if (rows.length < 2) { res.status(400).json({ error: 'CSV must have at least a header row and one data row' }); return }

  // Auto-detect header row: scan first 5 rows for the one with recognisable date/amount columns
  // (handles formats like BNP Paribas XLS which has account info in row 0 before the real headers)
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

  // Statuses that mean the transaction was reversed, cancelled or not yet settled — skip them
  const SKIP_STATUSES = new Set(['renvoyé', 'renvoye', 'annulé', 'annule', 'cancelled', 'canceled', 'declined', 'failed', 'reverted', 'en attente', 'pending'])

  const transactions = []
  let skippedInvalid = 0
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(c => !c.trim())) continue

    // Skip reversed / cancelled / pending rows
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

    // Sign correction from type column
    if (rawTypeNorm.includes('debit'))  amount = -Math.abs(amount)
    if (rawTypeNorm.includes('credit')) amount =  Math.abs(amount)

    const isTransferByType = TRANSFER_TYPE_PATTERNS.some(t => rawTypeNorm.includes(t))
    const isTransferByP2P  = P2P_DESC_RE.test(rawDesc) || P2P_DESC_RE.test(rawDescNorm)
    // SEPA viremements (VIR INSTANTANE, VIR SEPA, TED, PIX…) only mean "internal transfer"
    // when the user actually has another account for it to be internal to — otherwise this
    // is just how their bank labels any bank-to-bank movement (salary, rent, a refund from
    // a friend) and must not be auto-hidden.
    const isTransferBySEPA = hasMultipleAccounts && SEPA_VIREMENT_RE.test(rawDesc)
    const isTransfer = isTransferByType || isTransferByP2P || isTransferBySEPA

    const broker = detectBroker(rawDesc)

    const keywordCat = matchCategory(rawDesc)
    // SEPA viremements always win. Ambiguous transfers (Revolut type column, P2P) let keyword win
    // — e.g. Airbnb income arrives via Revolut TRANSFER type but is clearly an income category.
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

  // Candidatas a "já lancei isso manualmente numa divisão de despesa, não importar de novo
  // como linha nova" — não dá pra comparar descrição (banco nunca escreve igual ao que o
  // usuário digitou), então o critério é: mesmo valor (exato, ou até 2% se quiser cobrir
  // arredondamento de câmbio) + data a até 2 dias de distância. Sempre um "sugestão pra
  // confirmar", nunca fundido automático — ver POST /transactions/:id/adopt-import.
  const { data: manualExpenseLinks } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('transaction_id, moment_id, finance_moments(name)')
    .eq('paid_by_user_id', userId)
    .eq('owns_transaction', true)
    .not('transaction_id', 'is', null)
  const manualTxIds = [...new Set((manualExpenseLinks ?? []).map(l => l.transaction_id as number))]
  const momentByTxId = new Map<number, { moment_id: number; moment_name: string }>()
  for (const l of manualExpenseLinks ?? []) {
    momentByTxId.set(l.transaction_id as number, { moment_id: l.moment_id as number, moment_name: (l as any).finance_moments?.name ?? '' })
  }

  let manualCandidates: { id: number; date: string; description: string; amount: number; currency: string }[] = []
  if (manualTxIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('finance_transactions')
      .select('id, date, description, amount, currency')
      .in('id', manualTxIds)
      .eq('source', 'manual')
    manualCandidates = data ?? []
  }

  const DAY_MS = 24 * 60 * 60 * 1000
  function findManualMatch(t: { date: string; amount: number; currency: string }) {
    if (manualCandidates.length === 0) return null
    const targetAbs = Math.abs(t.amount)
    let best: typeof manualCandidates[number] | null = null
    let bestDiffDays = Infinity
    for (const c of manualCandidates) {
      if (c.currency !== t.currency) continue
      const candAbs = Math.abs(c.amount)
      const withinValue = candAbs === targetAbs || Math.abs(candAbs - targetAbs) / targetAbs <= 0.02
      if (!withinValue) continue
      const diffDays = Math.abs(new Date(c.date + 'T00:00:00').getTime() - new Date(t.date + 'T00:00:00').getTime()) / DAY_MS
      if (diffDays > 2) continue
      if (diffDays < bestDiffDays) { best = c; bestDiffDays = diffDays }
    }
    if (!best) return null
    const momentInfo = momentByTxId.get(best.id)
    return {
      transaction_id: best.id, description: best.description, amount: best.amount, date: best.date,
      moment_id: momentInfo?.moment_id ?? null, moment_name: momentInfo?.moment_name ?? '',
    }
  }

  const taggedTransactions = transactions.map((t, i) => {
    const source = sourceKeys[i]
    const is_duplicate = existingSet.has(source)
    return { ...t, source, is_duplicate, manual_match: is_duplicate ? null : findManualMatch(t) }
  })
  const duplicateCount = taggedTransactions.filter(t => t.is_duplicate).length

  // AI runs separately via /transactions/ai-categorize — just report how many need it
  const unmatchedCount = taggedTransactions.filter(t => !t.is_duplicate && !t.suggested_category && !t.is_broker_transfer && !t.is_internal_transfer).length

  res.json({
    transactions: taggedTransactions,
    total: taggedTransactions.length,
    duplicate_count: duplicateCount,
    skipped_invalid: skippedInvalid,
    headers,
    detected: { dateIdx, descIdx, amtIdx, stateIdx },
    ai_debug: { ran: false, assigned: 0, unmatched: unmatchedCount, error: null },
  })
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

// POST /api/finances/transactions/:id/adopt-import — user confirmed that a bank CSV row
// is the same real-world charge as a manual split expense they already logged (surfaced
// as `manual_match` by csv-parse). Instead of importing a second transaction, overwrite
// the existing manual one with the bank's authoritative date/description/amount/category
// and give it a real csv: source key, so (a) the CSV row is skipped, not duplicated, and
// (b) re-importing the same statement later correctly treats it as already-imported.
router.post('/transactions/:id/adopt-import', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const txId = Number(req.params.id)
  const { date, description, amount, currency, category_id, account_id, is_internal_transfer } = req.body as {
    date?: string; description?: string; amount?: number; currency?: string
    category_id?: number | null; account_id?: number | null; is_internal_transfer?: boolean
  }
  if (!date || !description || amount == null || !currency) {
    res.status(400).json({ error: 'date, description, amount e currency são obrigatórios' }); return
  }

  const { data: tx } = await supabaseAdmin
    .from('finance_transactions').select('id, user_id, source').eq('id', txId).maybeSingle()
  if (!tx || tx.user_id !== userId) { res.status(404).json({ error: 'Transação não encontrada' }); return }
  if (tx.source !== 'manual') { res.status(400).json({ error: 'Esta transação já não é manual' }); return }

  const source = csvSourceKey({ date, description, amount, currency })
  const { error: updateError } = await supabaseAdmin
    .from('finance_transactions')
    .update({
      date, description, amount, currency, source,
      category_id: category_id ?? null, account_id: account_id ?? null,
      is_internal_transfer: !!is_internal_transfer,
    })
    .eq('id', txId)
  if (updateError) { res.status(500).json({ error: updateError.message }); return }

  // Mantém a despesa dividida em sincronia com os dados agora "de banco" — mesmo padrão
  // do PATCH de edição de despesa, só que aqui os valores vêm do CSV em vez do usuário.
  await supabaseAdmin
    .from('finance_moment_expenses')
    .update({ description, amount: Math.abs(amount), currency, expense_date: date })
    .eq('transaction_id', txId)

  res.json({ ok: true })
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

  // Deduplicate within the incoming rows themselves (e.g. two identical Revolut transactions
  // same day/amount/merchant → same source hash → unique index would reject entire batch)
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

  // Fire-and-forget transfer detection after import
  detectTransferPairs(userId).catch(() => {})

  // Auto-sync all affected finance accounts to portfolio
  const importedAccountIds = [...new Set(newRows.map(r => r.account_id).filter((id): id is number => id != null))]
  for (const aid of importedAccountIds) {
    syncAccountToPortfolio(aid, userId).catch(() => {})
  }

  res.json({ imported, skipped, total: transactions.length })
})

// POST /api/finances/detect-transfers — run on-demand over all existing transactions
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

// GET /api/finances/categories/monthly-history
router.get('/categories/monthly-history', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { from, to } = req.query as Record<string, string>

  if (!from || !to) { res.status(400).json({ error: 'from and to are required (YYYY-MM)' }); return }

  const cycleDay = await getUserCycleDay(userId)
  const { start: dateFrom } = financialMonthRange(from, cycleDay)
  const { end:   dateTo   } = financialMonthRange(to,   cycleDay)

  // Paginate — a heavy user's expense history over "Tudo" (up to 5 years) can exceed
  // PostgREST's 1000-row response cap, which would silently drop everything past that point.
  async function fetchAllExpenseTxns() {
    const PAGE_SIZE = 1000
    const all: any[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data } = await supabaseAdmin
        .from('finance_transactions')
        .select('date, amount, category_id, finance_categories(id, name, name_key, icon, color, envelope_id)')
        .eq('user_id', userId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .eq('is_internal_transfer', false)
        .eq('exclude_from_stats', false)
        .not('category_id', 'is', null)
        .lt('amount', 0)
        .range(from, from + PAGE_SIZE - 1)
      if (!data?.length) break
      all.push(...data)
      if (data.length < PAGE_SIZE) break
    }
    return all
  }

  const [data, { data: incomeEnvs }] = await Promise.all([
    fetchAllExpenseTxns(),
    supabaseAdmin.from('finance_envelopes').select('id').eq('user_id', userId).eq('type', 'income'),
  ])

  // Income-type categories (e.g. Airbnb rental income) can occasionally carry a stray
  // negative-amount entry (a refund, a correction) and would otherwise show up here with
  // just that one lonely month — this chart is about spending categories, so exclude them
  // the same way the envelope trend chart already excludes income envelopes.
  const incomeEnvIds = new Set((incomeEnvs ?? []).map(e => e.id))

  type CatInfo = { id: number; name: string; name_key: string | null; icon: string; color: string; envelope_id: number | null }
  const catMap = new Map<number, CatInfo>()
  const monthlyMap = new Map<number, Map<string, number>>()

  for (const row of (data ?? []) as any[]) {
    const cat = row.finance_categories as CatInfo | null
    if (!cat) continue
    if (cat.envelope_id != null && incomeEnvIds.has(cat.envelope_id)) continue
    const catId = cat.id
    if (!catMap.has(catId)) catMap.set(catId, cat)
    const ym = financialMonthKey(row.date as string, cycleDay)
    if (!monthlyMap.has(catId)) monthlyMap.set(catId, new Map())
    const cm = monthlyMap.get(catId)!
    cm.set(ym, (cm.get(ym) ?? 0) + Math.abs(row.amount as number))
  }

  const result = Array.from(catMap.entries()).map(([catId, cat]) => {
    const cm = monthlyMap.get(catId) ?? new Map()
    const months = Array.from(cm.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month))
    return { ...cat, months }
  }).sort((a, b) => a.name.localeCompare(b.name))

  res.json(result)
})

// POST /api/finances/detect-reimbursements
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

// GET /api/finances/freedom-plans
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

// POST /api/finances/freedom-plans
router.post('/freedom-plans', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    name, initial_capital, monthly_contribution, monthly_return_rate,
    monthly_income_rate, target_amount, currency, horizon_years, notes, start_date,
    goal_mode, desired_income, income_inflation_pct,
  } = req.body as {
    name: string; initial_capital: number; monthly_contribution: number
    monthly_return_rate: number; monthly_income_rate: number; target_amount: number
    currency: string; horizon_years: number; notes?: string; start_date?: string
    goal_mode?: 'capital' | 'income'; desired_income?: number | null; income_inflation_pct?: number | null
  }
  if (!name || !initial_capital || !target_amount) {
    res.status(400).json({ error: 'name, initial_capital, target_amount required' }); return
  }
  // Set new plan as active, deactivate others
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
      goal_mode: goal_mode ?? 'capital',
      desired_income: desired_income ?? null,
      income_inflation_pct: income_inflation_pct ?? null,
    })
    .select()
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// PATCH /api/finances/freedom-plans/:id
router.patch('/freedom-plans/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const planId = Number(req.params.id)
  const updates = req.body as Record<string, unknown>
  // If setting as active, deactivate others first
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

// DELETE /api/finances/freedom-plans/:id
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

// Momento oculto 1:1 usado como "conta corrente" implícita entre dois amigos,
// pra permitir dividir uma despesa direto de Transações sem exigir que o
// usuário crie um Momento antes. Nunca aparece em GET /moments — só existe
// pra carregar finance_moment_expenses/shares e pra ser exibido como saldo
// (com lista de despesas) na página Pessoas.
export async function getOrCreateDefaultPairMoment(userId: string, friendUserId: string): Promise<number> {
  const { data: mine } = await supabaseAdmin
    .from('finance_moments')
    .select('id, finance_moment_members(user_id, status)')
    .eq('user_id', userId).eq('is_pair_default', true)
  for (const m of mine ?? []) {
    if (((m as any).finance_moment_members ?? []).some((mm: any) => mm.user_id === friendUserId && mm.status === 'active')) return m.id
  }
  const { data: theirs } = await supabaseAdmin
    .from('finance_moments')
    .select('id, finance_moment_members(user_id, status)')
    .eq('user_id', friendUserId).eq('is_pair_default', true)
  for (const m of theirs ?? []) {
    if (((m as any).finance_moment_members ?? []).some((mm: any) => mm.user_id === userId && mm.status === 'active')) return m.id
  }

  const friend = await userDisplay(friendUserId)
  const { data: created, error } = await supabaseAdmin
    .from('finance_moments')
    .insert({ user_id: userId, name: `Você e ${friend.name}`, icon: '🤝', is_pair_default: true })
    .select('id').single()
  if (error || !created) throw new Error(error?.message ?? 'Falha ao criar momento padrão')

  // Amigo já é uma conexão ativa (pré-condição pra "dividir com" aparecer na
  // UI), então entra direto como membro ativo — sem convite/aceite, já que
  // esse momento nunca é exposto como uma superfície de colaboração nova.
  await supabaseAdmin.from('finance_moment_members').insert({
    moment_id: created.id, user_id: friendUserId, invite_email: friend.email,
    role: 'editor', status: 'active', joined_at: new Date().toISOString(),
  })
  return created.id
}

router.post('/moments/default-with/:friendUserId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const friendUserId = req.params.friendUserId
  try {
    const momentId = await getOrCreateDefaultPairMoment(userId, friendUserId)
    res.json({ moment_id: momentId })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
})

// Generalização do momento oculto pra grupo (shared_groups): pra despesas avulsas
// entre as mesmas pessoas de um grupo recorrente que não merecem virar categoria
// de orçamento nem um Momento nomeado — ver docs/SHARED_EXPENSES_MODEL.md.
// Diferente do par (que precisa procurar nos dois sentidos, já que não tinha uma
// coluna de vínculo), aqui shared_group_id já identifica o momento diretamente.
export async function getOrCreateDefaultGroupMoment(userId: string, groupId: number): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from('finance_moments').select('id').eq('shared_group_id', groupId).eq('is_pair_default', true).maybeSingle()
  if (existing) return existing.id

  const { data: group } = await supabaseAdmin.from('shared_groups').select('name').eq('id', groupId).single()
  if (!group) throw new Error('Grupo não encontrado')

  const { data: members } = await supabaseAdmin
    .from('shared_group_members').select('user_id, invite_email').eq('group_id', groupId).eq('status', 'active')
  const others = (members ?? []).filter(m => m.user_id && m.user_id !== userId)

  const { data: created, error } = await supabaseAdmin
    .from('finance_moments')
    .insert({ user_id: userId, name: group.name, icon: '🤝', is_pair_default: true, shared_group_id: groupId })
    .select('id').single()
  if (error || !created) throw new Error(error?.message ?? 'Falha ao criar momento padrão do grupo')

  // Mesma lógica do par: todos já são conexões ativas dentro do grupo, então
  // entram direto como membros ativos, sem convite/aceite.
  if (others.length > 0) {
    await supabaseAdmin.from('finance_moment_members').insert(others.map(m => ({
      moment_id: created.id, user_id: m.user_id, invite_email: m.invite_email,
      role: 'editor', status: 'active', joined_at: new Date().toISOString(),
    })))
  }
  return created.id
}

// Transforma o momento 1:1 oculto num Momento normal (visível, nomeado) —
// disparado quando um 3º participante é adicionado a uma despesa, já que o
// conceito de "1:1 implícito" deixa de fazer sentido com um grupo.
router.post('/moments/:id/promote', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const { name } = req.body as { name?: string }
  if (!name?.trim()) { res.status(400).json({ error: 'Nome obrigatório' }); return }
  const access = await assertMomentAccess(momentId, userId)
  if (!access.ok) { res.status(403).json({ error: 'Sem permissão' }); return }
  const { error } = await supabaseAdmin
    .from('finance_moments').update({ is_pair_default: false, name: name.trim() }).eq('id', momentId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.get('/moments', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const [ownedRes, memberRes] = await Promise.all([
    supabaseAdmin.from('finance_moments').select('*').eq('user_id', userId).eq('is_pair_default', false).order('created_at', { ascending: false }),
    supabaseAdmin.from('finance_moment_members').select('moment_id').eq('user_id', userId).eq('status', 'active'),
  ])
  if (ownedRes.error) { res.status(500).json({ error: ownedRes.error.message }); return }
  const sharedIds = (memberRes.data ?? []).map(m => m.moment_id)
  let shared: any[] = []
  if (sharedIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('finance_moments').select('*').in('id', sharedIds).neq('user_id', userId).eq('is_pair_default', false).order('created_at', { ascending: false })
    if (error) { res.status(500).json({ error: error.message }); return }
    shared = data ?? []
  }
  const allMoments = [...(ownedRes.data ?? []), ...shared]

  // Attach which trip (if any) this moment has already been transformed into/linked to, so
  // the UI can offer "go to trip" instead of "create trip" without an extra round-trip.
  const momentIds = allMoments.map(m => m.id)
  const linkedTripByMoment = new Map<number, number>()
  if (momentIds.length > 0) {
    const { data: tripLinks } = await supabaseAdmin
      .from('voyage_trip_moments').select('trip_id, moment_id').in('moment_id', momentIds)
    for (const link of tripLinks ?? []) {
      if (!linkedTripByMoment.has(link.moment_id)) linkedTripByMoment.set(link.moment_id, link.trip_id)
    }
  }

  res.json(allMoments.map(m => ({ ...m, linked_trip_id: linkedTripByMoment.get(m.id) ?? null })))
})

router.get('/moments-for-picker', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  // Moments the user owns, PLUS ones they're an active collaborator on — without the
  // second half, shared moments silently never showed up when assigning a transaction.
  const { data: memberRows } = await supabaseAdmin
    .from('finance_moment_members').select('moment_id').eq('user_id', userId).eq('status', 'active')
  const sharedIds = (memberRows ?? []).map(m => m.moment_id)

  const { data, error } = await supabaseAdmin
    .from('finance_moments').select('id, name, icon, color')
    .or(`user_id.eq.${userId}${sharedIds.length > 0 ? `,id.in.(${sharedIds.join(',')})` : ''}`)
    .order('created_at', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.get('/moments/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)

  const momentRes = await supabaseAdmin.from('finance_moments').select('*').eq('id', momentId).single()
  if (momentRes.error || !momentRes.data) { res.status(404).json({ error: 'Not found' }); return }
  const moment = momentRes.data

  const isOwner = moment.user_id === userId
  let isActiveMember = isOwner
  if (!isOwner) {
    const { data: myMember } = await supabaseAdmin
      .from('finance_moment_members')
      .select('id').eq('moment_id', momentId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    isActiveMember = !!myMember
  }
  if (!isActiveMember) { res.status(404).json({ error: 'Not found' }); return }

  // Transações de TODOS os colaboradores ativos do momento (via junction table),
  // não só do usuário requisitante — necessário para o split "quem pagou o quê".
  const { data: ftmRows } = await supabaseAdmin
    .from('finance_transaction_moments')
    .select('transaction_id, finance_transactions(id, date, description, amount, currency, notes, user_id, reimbursement_group_id, finance_categories(id, name, name_key, icon, color))')
    .eq('moment_id', momentId)

  let transactions = (ftmRows ?? [])
    .map((r: any) => r.finance_transactions)
    .filter(Boolean)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : -1))

  // Marca quais transações já viraram uma despesa dividida (finance_moment_expenses),
  // pra UI oferecer "Dividir" só onde ainda faz sentido e não duplicar a divisão.
  const txIds = transactions.map((tx: any) => tx.id)
  if (txIds.length > 0) {
    const { data: splitRows } = await supabaseAdmin
      .from('finance_moment_expenses').select('transaction_id').in('transaction_id', txIds)
    const splitSet = new Set((splitRows ?? []).map((r: any) => r.transaction_id))
    transactions = transactions.map((tx: any) => ({ ...tx, has_split: splitSet.has(tx.id) }))
  }

  const groupIds = [...new Set(transactions.map((tx: any) => tx.reimbursement_group_id).filter(Boolean))]
  const { data: groupRows } = groupIds.length > 0
    ? await supabaseAdmin.from('reimbursement_groups').select('id, name').in('id', groupIds)
    : { data: [] as { id: string; name: string }[] }
  const groupNameMap = new Map((groupRows ?? []).map((g: any) => [g.id, g.name]))

  const total = transactions.reduce((sum: number, tx: any) => sum + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0)
  const catMap: Record<string, { name: string; name_key: string | null; icon: string; color: string; total: number }> = {}
  const byUserTotals: Record<string, number> = {}
  for (const tx of transactions) {
    if (tx.amount >= 0) continue
    const cat = tx.finance_categories as unknown as { id: number; name: string; name_key: string | null; icon: string; color: string } | null
    const key = cat ? String(cat.id) : 'none'
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Sem categoria', name_key: cat?.name_key ?? null, icon: cat?.icon ?? '❓', color: cat?.color ?? '#9CA3AF', total: 0 }
    catMap[key].total += Math.abs(tx.amount)
    byUserTotals[tx.user_id] = (byUserTotals[tx.user_id] ?? 0) + Math.abs(tx.amount)
  }

  const byUserEntries = Object.entries(byUserTotals)
  const displays = await Promise.all(byUserEntries.map(([uid]) => userDisplay(uid)))
  const by_user = byUserEntries.map(([uid, t], i) => ({
    user_id: uid,
    total: Math.round(t * 100) / 100,
    display: displays[i],
  })).sort((a, b) => b.total - a.total)

  // Already transformed into / linked to a trip? Lets the UI offer "go to trip" instead of
  // "create trip" without the caller having to POST /from-moment first just to find out.
  const { data: tripLinks } = await supabaseAdmin
    .from('voyage_trip_moments').select('trip_id').eq('moment_id', momentId).limit(1)

  res.json({
    moment: { ...moment, linked_trip_id: tripLinks?.[0]?.trip_id ?? null },
    transactions,
    reimbursement_groups: Object.fromEntries(groupNameMap),
    summary: {
      total: Math.round(total * 100) / 100,
      by_category: Object.values(catMap).sort((a, b) => b.total - a.total),
      by_user,
    },
  })
})

router.post('/moments', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, description, icon, color, start_date, end_date, cover_image_url, cover_image_position, budget, moment_type } = req.body
  const { data, error } = await supabaseAdmin
    .from('finance_moments')
    .insert({ user_id: userId, name, description, icon: icon ?? '✨', color: color ?? '#7C3AED', start_date: start_date ?? null, end_date: end_date ?? null, cover_image_url: cover_image_url ?? null, cover_image_position: cover_image_position ?? '50% 50%', budget: budget ?? null, moment_type: moment_type ?? 'other' })
    .select().single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// ── GET /finances/moments/:id/members ─────────────────────────────────────────
router.get('/moments/:id/members', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)

  const { data: moment } = await supabaseAdmin
    .from('finance_moments').select('user_id').eq('id', momentId).single()
  if (!moment) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  const isOwner = moment.user_id === userId
  const { data: myMember } = !isOwner
    ? await supabaseAdmin.from('finance_moment_members')
        .select('id').eq('moment_id', momentId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    : { data: true as any }
  if (!myMember) { res.status(403).json({ error: 'Sem acesso' }); return }

  const { data: members } = await supabaseAdmin
    .from('finance_moment_members')
    .select('id, user_id, invite_email, role, status, joined_at, created_at')
    .eq('moment_id', momentId)
    .order('created_at')

  const enriched = await Promise.all((members ?? []).map(async m => {
    if (!m.user_id) return { ...m, display: { name: m.invite_email, email: m.invite_email } }
    const d = await userDisplay(m.user_id)
    return { ...m, display: d }
  }))

  // The moment's creator has no row in finance_moment_members — synthesize one so their
  // avatar shows up alongside invited collaborators everywhere this list is rendered.
  const ownerDisplay = await userDisplay(moment.user_id)
  const ownerEntry = {
    id: -1, user_id: moment.user_id, invite_email: null, role: 'owner', status: 'active',
    joined_at: null, created_at: null, display: ownerDisplay,
  }

  res.json({ members: [ownerEntry, ...enriched] })
})

// ── POST /finances/moments/:id/invite  (convidar por e-mail ou @username) ────
router.post('/moments/:id/invite', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const { email, username, role = 'editor' } = req.body as { email?: string; username?: string; role?: string }

  if (!email?.includes('@') && !username?.trim()) {
    res.status(400).json({ error: 'Informe um e-mail ou @usuário' }); return
  }

  const { data: moment } = await supabaseAdmin
    .from('finance_moments').select('user_id, name').eq('id', momentId).single()
  if (!moment) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  const isOwner = moment.user_id === userId
  const { data: myMember } = !isOwner
    ? await supabaseAdmin.from('finance_moment_members')
        .select('id, role').eq('moment_id', momentId).eq('user_id', userId).eq('status', 'active').maybeSingle()
    : { data: { role: 'owner' } as any }
  if (!myMember || !['owner', 'editor'].includes((myMember as any).role)) {
    res.status(403).json({ error: 'Sem permissão para convidar' }); return
  }

  let targetUserId: string | null = null
  let targetEmail: string | null = email?.trim() || null

  if (username) {
    const handle = username.trim().toLowerCase().replace(/^@/, '')
    const { data: handleRow } = await supabaseAdmin
      .from('user_handles').select('user_id').eq('username', handle).maybeSingle()
    if (!handleRow) { res.status(404).json({ error: 'Nenhum usuário com esse @' }); return }
    targetUserId = handleRow.user_id
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(handleRow.user_id)
    targetEmail = u?.user?.email ?? null
  } else if (targetEmail) {
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers()
    const targetUser = authList?.users?.find(u => u.email === targetEmail)
    targetUserId = targetUser?.id ?? null
  }

  if (targetUserId) {
    const { data: existing } = await supabaseAdmin
      .from('finance_moment_members')
      .select('id, status').eq('moment_id', momentId).eq('user_id', targetUserId).maybeSingle()
    if (existing?.status === 'active') {
      res.status(409).json({ error: 'Já é colaborador deste momento' }); return
    }
  }

  await supabaseAdmin
    .from('finance_moment_members')
    .delete()
    .eq('moment_id', momentId).eq('invite_email', targetEmail).eq('status', 'pending')

  // Usuário já cadastrado na plataforma E optou por aceitar convites
  // automaticamente de quem está convidando: entra direto como membro ativo.
  // Caso contrário, mesmo sendo amigo, sempre passa pelo fluxo de aceite
  // explícito — ninguém entra num momento compartilhado sem consentir.
  if (targetUserId && await canAutoAccept(targetUserId, userId)) {
    const { error } = await supabaseAdmin.from('finance_moment_members').insert({
      moment_id: momentId,
      user_id: targetUserId,
      invite_email: targetEmail,
      role,
      status: 'active',
      joined_at: new Date().toISOString(),
    })
    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ direct: true })
    return
  }

  const token = crypto.randomBytes(24).toString('hex')
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const { error } = await supabaseAdmin.from('finance_moment_members').insert({
    moment_id: momentId,
    user_id: targetUserId,
    invite_email: targetEmail,
    invite_token: token,
    invite_expires_at: expires,
    role,
    status: 'pending',
  })
  if (error) { res.status(500).json({ error: error.message }); return }

  const baseUrl = process.env.FRONTEND_ORIGIN?.split(',')[0] ?? 'https://arvo.andregutto.com'
  res.json({ direct: false, token, invite_url: `${baseUrl}/finances/moments/invite/${token}` })
})

// ── GET /finances/moments/invite/:token  (preview público do convite) ────────
router.get('/moments/invite/:token', async (req, res: Response) => {
  const { token } = req.params
  const { data: member } = await supabaseAdmin
    .from('finance_moment_members')
    .select('id, status, invite_email, finance_moments(name, user_id)')
    .eq('invite_token', token)
    .single()

  if (!member) { res.status(404).json({ error: 'Convite não encontrado ou expirado' }); return }
  if (member.status !== 'pending') { res.status(410).json({ error: 'Convite já utilizado' }); return }

  const moment = member.finance_moments as any
  const inviter = await userDisplay(moment?.user_id)

  res.json({ moment_name: moment?.name ?? '—', inviter_name: inviter.name, status: member.status })
})

// ── POST /finances/moments/invite/accept  (aceitar convite de momento) ───────
router.post('/moments/invite/accept', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { token } = req.body as { token: string }

  const { data: member } = await supabaseAdmin
    .from('finance_moment_members')
    .select('id, moment_id, status')
    .eq('invite_token', token)
    .single()

  if (!member) { res.status(404).json({ error: 'Convite não encontrado' }); return }
  if (member.status !== 'pending') { res.status(409).json({ error: 'Convite já utilizado' }); return }

  await supabaseAdmin
    .from('finance_moment_members')
    .update({ user_id: userId, status: 'active', joined_at: new Date().toISOString(), invite_token: null })
    .eq('id', member.id)

  res.json({ moment_id: member.moment_id })
})

// ── DELETE /finances/moments/:id/members/:memberId  (revogar acesso) ─────────
// O momento continua existindo para ambos; só as transações do usuário
// revogado dentro deste momento são removidas. O registro do membro vira
// status='left' (não é apagado, mirror voyage_trip_members).
router.delete('/moments/:id/members/:memberId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const memberId = Number(req.params.memberId)

  const { data: moment } = await supabaseAdmin
    .from('finance_moments').select('user_id').eq('id', momentId).single()
  const { data: member } = await supabaseAdmin
    .from('finance_moment_members').select('user_id').eq('id', memberId).single()

  const isOwner = moment?.user_id === userId
  const isSelf = member?.user_id === userId
  if (!isOwner && !isSelf) { res.status(403).json({ error: 'Sem permissão' }); return }

  await supabaseAdmin
    .from('finance_moment_members')
    .update({ status: 'left' })
    .eq('id', memberId).eq('moment_id', momentId)

  // Remove apenas as transações do usuário revogado dentro deste momento.
  if (member?.user_id) {
    const { data: revokedTxIds } = await supabaseAdmin
      .from('finance_transaction_moments')
      .select('transaction_id')
      .eq('moment_id', momentId)
      .eq('user_id', member.user_id)
    const ids = (revokedTxIds ?? []).map(r => r.transaction_id)
    if (ids.length > 0) {
      await supabaseAdmin
        .from('finance_transactions')
        .delete()
        .in('id', ids)
        .eq('user_id', member.user_id)
        .eq('moment_id', momentId)
    }
  }

  res.json({ ok: true })
})

// POST /finances/moments/:id/share — generate share token
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

// PATCH /finances/moments/:id/share — update share settings
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

// DELETE /finances/moments/:id/share — revoke
router.delete('/moments/:id/share', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const id = Number(req.params.id)
  await supabaseAdmin.from('finance_moments').update({ share_token: null, share_expires_at: null }).eq('id', id).eq('user_id', userId)
  res.json({ ok: true })
})

router.patch('/moments/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)

  const { data: moment } = await supabaseAdmin
    .from('finance_moments').select('user_id').eq('id', momentId).single()
  if (!moment) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  const isOwner = moment.user_id === userId
  if (!isOwner) {
    const { data: member } = await supabaseAdmin
      .from('finance_moment_members')
      .select('id').eq('moment_id', momentId).eq('user_id', userId).eq('role', 'editor').eq('status', 'active').maybeSingle()
    if (!member) { res.status(403).json({ error: 'Sem permissão para editar este momento' }); return }
  }

  const { data, error } = await supabaseAdmin
    .from('finance_moments').update(req.body).eq('id', momentId).select().single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

router.delete('/moments/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const force = req.query.force === 'true' || (req.body as { force?: boolean } | undefined)?.force === true

  // finance_moment_expenses/shares CASCADE-delete with the moment (migration 058), with no
  // settlement record left behind — deleting a moment that still has a pending shared-expense
  // balance would silently wipe out a real debt between the user and a friend. Block it unless
  // the caller explicitly confirms (force=true), after being shown what would be lost — and even
  // then, notify each affected participant, since only the deleter sees that confirm dialog.
  const { data: expenseRows } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('paid_by_user_id, currency, is_settlement, finance_moment_expense_shares(user_id, share_amount)')
    .eq('moment_id', momentId)
  const balance: Record<string, Record<string, number>> = {}
  for (const e of expenseRows ?? []) {
    if (e.is_settlement) continue
    const shares = (e.finance_moment_expense_shares ?? []) as { user_id: string; share_amount: number }[]
    if (e.paid_by_user_id === userId) {
      for (const s of shares) {
        if (s.user_id === userId) continue
        balance[s.user_id] ??= {}
        balance[s.user_id][e.currency] = (balance[s.user_id][e.currency] ?? 0) + s.share_amount
      }
    } else {
      const mine = shares.find(s => s.user_id === userId)
      if (mine) {
        balance[e.paid_by_user_id] ??= {}
        balance[e.paid_by_user_id][e.currency] = (balance[e.paid_by_user_id][e.currency] ?? 0) - mine.share_amount
      }
    }
  }
  const pending: { user_id: string; name: string; currency: string; amount: number }[] = []
  for (const [uid, perCurrency] of Object.entries(balance)) {
    for (const [currency, amount] of Object.entries(perCurrency)) {
      const rounded = Math.round(amount * 100) / 100
      if (Math.abs(rounded) >= 0.01) pending.push({ user_id: uid, name: (await userDisplay(uid)).name ?? uid, currency, amount: rounded })
    }
  }

  if (pending.length > 0 && !force) {
    // The error string doubles as the confirm-dialog message on the frontend (apiFetch only
    // surfaces `.error`, not the structured `pending_balances`) — so it needs to be readable
    // on its own, not just a flag the UI has to look up meaning for separately.
    const summary = pending
      .map(p => `${p.name} ${p.amount > 0 ? 'te deve' : 'você deve'} ${Math.abs(p.amount).toFixed(2)} ${p.currency}`)
      .join('; ')
    res.status(409).json({
      error: `Saldo pendente de despesas divididas: ${summary}. Apagar este momento apaga esse saldo sem registrar acerto de contas — apagar mesmo assim?`,
      pending_balances: pending,
    }); return
  }

  const { data: momentRow } = await supabaseAdmin.from('finance_moments').select('name').eq('id', momentId).maybeSingle()
  const momentName = momentRow?.name ?? ''

  await supabaseAdmin.from('finance_transactions').update({ moment_id: null }).eq('moment_id', momentId).eq('user_id', userId)
  const { error } = await supabaseAdmin.from('finance_moments').delete().eq('id', momentId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }

  if (pending.length > 0) {
    const deleter = await userDisplay(userId)
    // Sign flips from the deleter's perspective (balance[uid] > 0 = uid owed the deleter) to the
    // recipient's own perspective (positive = they were owed money that just vanished).
    await Promise.all(pending.map(p => supabaseAdmin.from('notification_dismissals').upsert({
      user_id: p.user_id,
      key: `moment_deleted_balance:${momentId}:${p.user_id}:${p.currency}`,
      type: 'moment_deleted_with_balance',
      params: {
        deleter_name: deleter.name ?? deleter.email, moment_name: momentName,
        amount: -p.amount, currency: p.currency,
      },
      severity: 'warning',
      link: '/people',
      occurred_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' })))
  }

  res.json({ ok: true })
})

// ── Lançamento manual de despesa (split) dentro de um Momento ────────────────
// Reaproveita finance_moment_members para achar quem pode participar; ao contrário
// de transações reais, não exige conta bancária/CSV — é o "quick add" do Splitwise.

async function assertMomentAccess(momentId: number, userId: string): Promise<{ ok: boolean; isOwner: boolean }> {
  const { data: moment } = await supabaseAdmin
    .from('finance_moments').select('user_id').eq('id', momentId).single()
  if (!moment) return { ok: false, isOwner: false }
  const isOwner = moment.user_id === userId
  if (isOwner) return { ok: true, isOwner: true }
  const { data: member } = await supabaseAdmin
    .from('finance_moment_members')
    .select('id').eq('moment_id', momentId).eq('user_id', userId).eq('status', 'active').maybeSingle()
  return { ok: !!member, isOwner: false }
}

// Todos os participantes elegíveis para dividir uma despesa: dono do momento +
// membros ativos com user_id (convites pendentes ainda não têm conta para dever/receber).
async function momentParticipantIds(momentId: number): Promise<string[]> {
  const { data: moment } = await supabaseAdmin.from('finance_moments').select('user_id').eq('id', momentId).single()
  const { data: members } = await supabaseAdmin
    .from('finance_moment_members')
    .select('user_id').eq('moment_id', momentId).eq('status', 'active').not('user_id', 'is', null)
  const ids = new Set<string>()
  if (moment?.user_id) ids.add(moment.user_id)
  for (const m of members ?? []) if (m.user_id) ids.add(m.user_id)
  return [...ids]
}

router.get('/moments/:id/expenses', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)

  const access = await assertMomentAccess(momentId, userId)
  if (!access.ok) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  const { data: expenses, error } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('id, description, amount, currency, paid_by_user_id, split_type, expense_date, created_by, created_at, is_settlement, transaction_id, finance_moment_expense_shares(user_id, share_amount)')
    .eq('moment_id', momentId)
    .order('expense_date', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }

  const userIds = new Set<string>()
  for (const e of expenses ?? []) {
    userIds.add(e.paid_by_user_id)
    for (const s of (e as any).finance_moment_expense_shares ?? []) userIds.add(s.user_id)
  }
  const displayEntries = await Promise.all([...userIds].map(async uid => [uid, await userDisplay(uid)] as const))
  const displayMap = Object.fromEntries(displayEntries)

  // Categoria vive na finance_transactions ligada (não na despesa em si) — uma
  // despesa manual sempre cria/aponta pra uma transação real, ver POST acima.
  const txIds = [...new Set((expenses ?? []).map(e => e.transaction_id).filter((id): id is number => id != null))]
  const categoryByTx: Record<number, { id: number; name: string; icon: string; color: string } | null> = {}
  if (txIds.length > 0) {
    const { data: txRows } = await supabaseAdmin
      .from('finance_transactions')
      .select('id, finance_categories(id, name, icon, color)')
      .in('id', txIds)
    for (const row of txRows ?? []) categoryByTx[(row as any).id] = (row as any).finance_categories ?? null
  }

  const enriched = (expenses ?? []).map((e: any) => ({
    ...e,
    paid_by_display: displayMap[e.paid_by_user_id],
    shares: (e.finance_moment_expense_shares ?? []).map((s: any) => ({ ...s, display: displayMap[s.user_id] })),
    finance_moment_expense_shares: undefined,
    category: e.transaction_id != null ? (categoryByTx[e.transaction_id] ?? null) : null,
  }))

  res.json({ expenses: enriched })
})

router.post('/moments/:id/expenses', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const { description, amount, currency, paid_by_user_id, expense_date, split_type, participant_ids, custom_shares, from_transaction_id, category_id } = req.body as {
    description?: string
    amount?: number
    currency?: string
    paid_by_user_id?: string
    expense_date?: string
    split_type?: 'equal' | 'custom'
    participant_ids?: string[]
    custom_shares?: Record<string, number>
    from_transaction_id?: number
    category_id?: number | null
  }

  const access = await assertMomentAccess(momentId, userId)
  if (!access.ok) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  // Duas origens possíveis: (a) despesa manual do zero — cria uma finance_transactions
  // nova, pra contar no total gasto/lista do Momento como qualquer outra; ou (b) "dividir"
  // uma transação já existente (ex: veio do banco) — reaproveita ela, sem duplicar valor.
  let baseDescription = description?.trim()
  let baseAmount = amount
  let baseCurrency = currency ?? 'BRL'
  let basePaidBy = paid_by_user_id
  let baseDate = expense_date ?? new Date().toISOString().slice(0, 10)
  let existingTx: { id: number; user_id: string; amount: number; currency: string; description: string; date: string } | null = null

  if (from_transaction_id) {
    const { data: tx } = await supabaseAdmin
      .from('finance_transactions').select('id, user_id, amount, currency, description, date').eq('id', from_transaction_id).single()
    if (!tx) { res.status(404).json({ error: 'Transação não encontrada' }); return }
    const { data: ftm } = await supabaseAdmin
      .from('finance_transaction_moments').select('transaction_id').eq('transaction_id', from_transaction_id).eq('moment_id', momentId).maybeSingle()
    if (!ftm) {
      // Transação ainda não linkada a este momento — acontece no fluxo "dividir direto
      // da tela de Transações" (a transação nunca esteve num Momento antes). Só o dono
      // da transação pode linká-la aqui; a partir daí funciona igual ao fluxo antigo.
      if (tx.user_id !== userId) { res.status(404).json({ error: 'Transação não encontrada neste momento' }); return }
      const { error: linkErr } = await supabaseAdmin
        .from('finance_transaction_moments').insert({ transaction_id: tx.id, moment_id: momentId, user_id: tx.user_id })
      if (linkErr) { res.status(500).json({ error: linkErr.message }); return }
    }
    const { data: alreadySplit } = await supabaseAdmin
      .from('finance_moment_expenses').select('id').eq('transaction_id', tx.id).maybeSingle()
    if (alreadySplit) { res.status(409).json({ error: 'Esta transação já está dividida' }); return }
    existingTx = tx as any
    baseDescription = tx.description
    baseAmount = Math.abs(tx.amount)
    baseCurrency = tx.currency
    basePaidBy = tx.user_id
    baseDate = tx.date
  }

  if (!baseDescription || !baseAmount || baseAmount <= 0 || !basePaidBy) {
    res.status(400).json({ error: 'Descrição, valor e pagador são obrigatórios' }); return
  }

  const eligibleIds = await momentParticipantIds(momentId)
  if (!eligibleIds.includes(basePaidBy)) {
    res.status(400).json({ error: 'Pagador não é participante deste momento' }); return
  }

  const participants = (participant_ids && participant_ids.length > 0 ? participant_ids : eligibleIds)
    .filter(id => eligibleIds.includes(id))
  if (participants.length === 0) { res.status(400).json({ error: 'Selecione ao menos um participante' }); return }

  let shares: { user_id: string; share_amount: number }[]
  if (split_type === 'custom') {
    if (!custom_shares) { res.status(400).json({ error: 'Informe os valores de cada participante' }); return }
    shares = participants.map(uid => ({ user_id: uid, share_amount: Math.round((custom_shares[uid] ?? 0) * 100) / 100 }))
    const sum = Math.round(shares.reduce((s, x) => s + x.share_amount, 0) * 100) / 100
    if (Math.abs(sum - baseAmount) > 0.02) {
      res.status(400).json({ error: 'A soma das partes precisa bater com o valor total' }); return
    }
  } else {
    const base = Math.floor((baseAmount / participants.length) * 100) / 100
    shares = participants.map(uid => ({ user_id: uid, share_amount: base }))
    // sobra de arredondamento fica com quem pagou, pra soma bater exatamente com o total
    const remainder = Math.round((baseAmount - base * participants.length) * 100) / 100
    const payerShare = shares.find(s => s.user_id === basePaidBy) ?? shares[0]
    payerShare.share_amount = Math.round((payerShare.share_amount + remainder) * 100) / 100
  }

  // category_id pertence ao próprio pagador (categorias são por usuário) — só aplica se
  // for uma categoria de despesa dele, senão ignora silenciosamente em vez de dar 500.
  let validCategoryId: number | null = null
  if (category_id != null) {
    const { data: cat } = await supabaseAdmin
      .from('finance_categories').select('id').eq('id', category_id).eq('user_id', basePaidBy).maybeSingle()
    if (cat) validCategoryId = cat.id
  }

  let transactionId: number
  let ownsTransaction: boolean
  if (existingTx) {
    transactionId = existingTx.id
    ownsTransaction = false
  } else {
    const { data: tx, error: txError } = await supabaseAdmin
      .from('finance_transactions')
      .insert({
        user_id: basePaidBy, date: baseDate, description: baseDescription,
        amount: -baseAmount, currency: baseCurrency, source: 'manual', category_id: validCategoryId,
      })
      .select('id').single()
    if (txError) { res.status(500).json({ error: txError.message }); return }
    const { error: linkError } = await supabaseAdmin
      .from('finance_transaction_moments').insert({ transaction_id: tx.id, moment_id: momentId, user_id: basePaidBy })
    if (linkError) {
      await supabaseAdmin.from('finance_transactions').delete().eq('id', tx.id)
      res.status(500).json({ error: linkError.message }); return
    }
    transactionId = tx.id
    ownsTransaction = true
  }

  const { data: expense, error } = await supabaseAdmin
    .from('finance_moment_expenses')
    .insert({
      moment_id: momentId,
      description: baseDescription,
      amount: baseAmount,
      currency: baseCurrency,
      paid_by_user_id: basePaidBy,
      split_type: split_type ?? 'equal',
      expense_date: baseDate,
      created_by: userId,
      transaction_id: transactionId,
      owns_transaction: ownsTransaction,
    })
    .select().single()
  if (error) {
    if (ownsTransaction) await supabaseAdmin.from('finance_transactions').delete().eq('id', transactionId)
    res.status(500).json({ error: error.message }); return
  }

  const { error: sharesError } = await supabaseAdmin
    .from('finance_moment_expense_shares')
    .insert(shares.map(s => ({ expense_id: expense.id, user_id: s.user_id, share_amount: s.share_amount })))
  if (sharesError) {
    await supabaseAdmin.from('finance_moment_expenses').delete().eq('id', expense.id)
    if (ownsTransaction) await supabaseAdmin.from('finance_transactions').delete().eq('id', transactionId)
    res.status(500).json({ error: sharesError.message }); return
  }

  res.json({ ...expense, shares })
})

// Edição de uma despesa existente — qualquer membro ativo do Momento pode editar
// qualquer despesa (não só quem criou). Não mexe em from_transaction_id/settlement;
// recalcula as shares do zero e, se a despesa é dona da transação, mantém a
// finance_transactions ligada em sincronia (senão o total gasto do Momento desalinha).
router.patch('/moments/:id/expenses/:expenseId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const expenseId = Number(req.params.expenseId)
  const { description, amount, currency, paid_by_user_id, expense_date, split_type, participant_ids, custom_shares, category_id } = req.body as {
    description?: string
    amount?: number
    currency?: string
    paid_by_user_id?: string
    expense_date?: string
    split_type?: 'equal' | 'custom'
    participant_ids?: string[]
    custom_shares?: Record<string, number>
    category_id?: number | null
  }

  const access = await assertMomentAccess(momentId, userId)
  if (!access.ok) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  const { data: existing } = await supabaseAdmin
    .from('finance_moment_expenses')
    .select('id, transaction_id, owns_transaction, is_settlement')
    .eq('id', expenseId).eq('moment_id', momentId).maybeSingle()
  if (!existing) { res.status(404).json({ error: 'Despesa não encontrada' }); return }
  if (existing.is_settlement) { res.status(400).json({ error: 'Acertos de contas não podem ser editados' }); return }

  if (!description?.trim() || !amount || amount <= 0 || !paid_by_user_id) {
    res.status(400).json({ error: 'Descrição, valor e pagador são obrigatórios' }); return
  }

  const eligibleIds = await momentParticipantIds(momentId)
  if (!eligibleIds.includes(paid_by_user_id)) {
    res.status(400).json({ error: 'Pagador não é participante deste momento' }); return
  }
  const participants = (participant_ids && participant_ids.length > 0 ? participant_ids : eligibleIds)
    .filter(id => eligibleIds.includes(id))
  if (participants.length === 0) { res.status(400).json({ error: 'Selecione ao menos um participante' }); return }

  let shares: { user_id: string; share_amount: number }[]
  if (split_type === 'custom') {
    if (!custom_shares) { res.status(400).json({ error: 'Informe os valores de cada participante' }); return }
    shares = participants.map(uid => ({ user_id: uid, share_amount: Math.round((custom_shares[uid] ?? 0) * 100) / 100 }))
    const sum = Math.round(shares.reduce((s, x) => s + x.share_amount, 0) * 100) / 100
    if (Math.abs(sum - amount) > 0.02) {
      res.status(400).json({ error: 'A soma das partes precisa bater com o valor total' }); return
    }
  } else {
    const base = Math.floor((amount / participants.length) * 100) / 100
    shares = participants.map(uid => ({ user_id: uid, share_amount: base }))
    const remainder = Math.round((amount - base * participants.length) * 100) / 100
    const payerShare = shares.find(s => s.user_id === paid_by_user_id) ?? shares[0]
    payerShare.share_amount = Math.round((payerShare.share_amount + remainder) * 100) / 100
  }

  const baseCurrency = currency ?? 'BRL'
  const baseDate = expense_date ?? new Date().toISOString().slice(0, 10)

  const { error: updateError } = await supabaseAdmin
    .from('finance_moment_expenses')
    .update({
      description: description.trim(), amount, currency: baseCurrency,
      paid_by_user_id, split_type: split_type ?? 'equal', expense_date: baseDate,
    })
    .eq('id', expenseId)
  if (updateError) { res.status(500).json({ error: updateError.message }); return }

  const { error: deleteSharesError } = await supabaseAdmin
    .from('finance_moment_expense_shares').delete().eq('expense_id', expenseId)
  if (deleteSharesError) { res.status(500).json({ error: deleteSharesError.message }); return }
  const { error: sharesError } = await supabaseAdmin
    .from('finance_moment_expense_shares')
    .insert(shares.map(s => ({ expense_id: expenseId, user_id: s.user_id, share_amount: s.share_amount })))
  if (sharesError) { res.status(500).json({ error: sharesError.message }); return }

  if (existing.owns_transaction && existing.transaction_id) {
    let validCategoryId: number | null | undefined = undefined
    if (category_id !== undefined) {
      if (category_id == null) {
        validCategoryId = null
      } else {
        const { data: cat } = await supabaseAdmin
          .from('finance_categories').select('id').eq('id', category_id).eq('user_id', paid_by_user_id).maybeSingle()
        validCategoryId = cat ? cat.id : null
      }
    }
    await supabaseAdmin
      .from('finance_transactions')
      .update({
        description: description.trim(), amount: -amount, currency: baseCurrency, date: baseDate, user_id: paid_by_user_id,
        ...(validCategoryId !== undefined ? { category_id: validCategoryId } : {}),
      })
      .eq('id', existing.transaction_id)
  }

  res.json({ ok: true, shares })
})

router.delete('/moments/:id/expenses/:expenseId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const momentId = Number(req.params.id)
  const expenseId = Number(req.params.expenseId)

  const access = await assertMomentAccess(momentId, userId)
  if (!access.ok) { res.status(404).json({ error: 'Momento não encontrado' }); return }

  const { data: expense } = await supabaseAdmin
    .from('finance_moment_expenses').select('created_by, transaction_id, owns_transaction').eq('id', expenseId).eq('moment_id', momentId).maybeSingle()
  if (!expense) { res.status(404).json({ error: 'Despesa não encontrada' }); return }
  // Qualquer membro ativo do Momento (não só quem criou/dono) pode editar/excluir
  // qualquer despesa — pedido explícito do André: despesas de grupo são de todos.

  // Se a transação foi criada JUNTO com a despesa (owns_transaction), apagar a
  // despesa também remove a transação — senão ela ficaria órfã, sem divisão nem dono.
  // Se veio de uma transação PRÉ-EXISTENTE (ex: banco), só desfaz a divisão.
  if (expense.owns_transaction && expense.transaction_id) {
    await supabaseAdmin.from('finance_transactions').delete().eq('id', expense.transaction_id)
    // A cascade da FK transaction_id já apaga a linha de finance_moment_expenses.
  } else {
    const { error } = await supabaseAdmin.from('finance_moment_expenses').delete().eq('id', expenseId)
    if (error) { res.status(500).json({ error: error.message }); return }
  }
  res.json({ ok: true })
})

// ── Scanner de Assinaturas ────────────────────────────────────────────────────

function normalizeSubscriptionDesc(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(paiement|prlv|prélèvement|virement|vir|achat|carte|cb|payment|ref|no|num|#|debit|credit|débito|crédito|pagamento|pgto)\b/gi, '')
    .replace(/\d{2}[/\-]\d{2}([/\-]\d{2,4})?/g, '')
    .replace(/\b\d{5,}\b/g, '')
    .replace(/[*@#.,\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Categorias que nunca são assinatura, mesmo que recorram com valor estável
// (mercado, restaurantes...) — excluídas da detecção independente do padrão.
// Nota: categoryHousing NÃO está aqui — contas como EDF/Freebox costumam ser
// categorizadas como Moradia mas são contratos recorrentes reais (assinaturas).
// Itens de aluguel em si têm variação de valor alta o suficiente para falhar
// no teste de tolerância abaixo; falsos positivos podem ser ignorados na UI.
const SUBSCRIPTION_CATEGORY_DENYLIST = new Set([
  'categoryRestaurant', 'categoryBarsRestaurants', 'categoryGroceries',
  'categoryCoffee', 'categoryTransport', 'categoryPharmacy', 'categoryTravel', 'categoryAirbnb',
  'categoryShowsParties', 'categoryGifts', 'categoryClothing', 'categoryPersonalCare',
  'categoryElectronics', 'categoryShopping', 'categoryFees', 'categoryTaxes', 'categoryEducation',
])

// Categorias com cara de assinatura toleram variação maior de valor (reajustes de plano)
const SUBSCRIPTION_LOOSE_TOLERANCE_CATEGORIES = new Set([
  'categoryStreaming', 'categorySubscriptions', 'categoryPhone', 'categoryUtilities',
])

export type SubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual'

export interface SubscriptionItem {
  key: string; name: string; frequency: SubscriptionFrequency
  median_amount: number; currency: string; last_date: string
  annual_cost: number; monthly_equivalent: number; occurrences: number
  category: { id: number; name: string; icon: string; color: string; name_key?: string } | null
}

type SubscriptionTxRow = {
  id: number; date: string; description: string; amount: number; currency: string
  category_id: number | null; is_internal_transfer: boolean; exclude_from_stats: boolean
  finance_categories: { id: number; name: string; icon: string; color: string; name_key?: string } | null
}

const SUBSCRIPTION_ANNUAL_MULTIPLIER: Record<SubscriptionFrequency, number> = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, biannual: 2, annual: 1 }

// Minimum occurrences (within the 18-month window) to be considered recurring.
const SUBSCRIPTION_MIN_OCCURRENCES: Record<SubscriptionFrequency, number> = { weekly: 4, biweekly: 4, monthly: 3, quarterly: 2, biannual: 2, annual: 2 }

function detectSubscriptionFrequency(sorted: SubscriptionTxRow[]): SubscriptionFrequency | null {
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const ms = new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()
    gaps.push(Math.round(ms / 86400000))
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)]
  if (medianGap >= 5   && medianGap <= 9)   return 'weekly'
  if (medianGap >= 11  && medianGap <= 17)  return 'biweekly'
  if (medianGap >= 25  && medianGap <= 38)  return 'monthly'
  if (medianGap >= 83  && medianGap <= 100) return 'quarterly'
  if (medianGap >= 165 && medianGap <= 200) return 'biannual'
  if (medianGap >= 330 && medianGap <= 400) return 'annual'
  return null
}

// True if at least 75% of `values` fall within `window` of the median, measured
// circularly over `period` (so e.g. day 30 and day 1 of the month are 2 apart,
// not 29 — tolerating the occasional bank-processing delay around month-end).
function isDateConsistent(values: number[], period: number, window: number): boolean {
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const within = values.filter(v => {
    const diff = Math.abs(v - median)
    return Math.min(diff, period - diff) <= window
  }).length
  return within / values.length >= 0.75
}

// Builds a SubscriptionItem from a cluster of same-description transactions.
// `strict` is used for categories in SUBSCRIPTION_CATEGORY_DENYLIST: the cluster
// already has identical amounts (split by exact cents beforehand), so it
// additionally requires one extra occurrence and a consistent billing date —
// distinguishing real recurring contracts (transit pass, app subscription) from
// purchases that merely happen to repeat at a similar value (e.g. Uber rides).
function buildSubscription(
  key: string, sorted: SubscriptionTxRow[], category: SubscriptionItem['category'], strict: boolean,
): SubscriptionItem | null {
  const frequency = detectSubscriptionFrequency(sorted)
  if (!frequency) return null
  // Annual cadence needs 2 gaps (~2 years) to require an extra occurrence,
  // which doesn't fit the 18-month lookback window — keep its minimum as-is.
  const minOcc = SUBSCRIPTION_MIN_OCCURRENCES[frequency] + (strict && frequency !== 'annual' ? 1 : 0)
  if (sorted.length < minOcc) return null

  const amounts = sorted.map(t => Math.abs(t.amount))
  const sortedAmt = [...amounts].sort((a, b) => a - b)
  const medianAmt = sortedAmt[Math.floor(sortedAmt.length / 2)]

  // Sub-cent/few-cent fees (e.g. FX-rounding remainders) aren't meaningful
  // recurring charges, even if they happen to repeat at the same value.
  if (strict && medianAmt < 1) return null

  if (strict) {
    const consistent = frequency === 'weekly' || frequency === 'biweekly'
      ? isDateConsistent(sorted.map(t => new Date(`${t.date}T00:00:00Z`).getUTCDay()), 7, 1)
      : isDateConsistent(sorted.map(t => Number(t.date.split('-')[2])), 31, 3)
    if (!consistent) return null
  } else {
    const tolerance = category?.name_key && SUBSCRIPTION_LOOSE_TOLERANCE_CATEGORIES.has(category.name_key) ? 0.20 : 0.08
    if (!amounts.every(a => Math.abs(a - medianAmt) / medianAmt <= tolerance)) return null
  }

  const annualCost = Math.round(medianAmt * SUBSCRIPTION_ANNUAL_MULTIPLIER[frequency] * 100) / 100
  return {
    key,
    name: sorted[sorted.length - 1].description.trim(),
    frequency,
    median_amount: Math.round(medianAmt * 100) / 100,
    currency: sorted[sorted.length - 1].currency,
    last_date: sorted[sorted.length - 1].date,
    annual_cost: annualCost,
    monthly_equivalent: Math.round(annualCost / 12 * 100) / 100,
    occurrences: sorted.length,
    category,
  }
}

export async function getActiveSubscriptions(userId: string): Promise<{ subscriptions: SubscriptionItem[]; error?: string }> {
  const since = new Date()
  since.setMonth(since.getMonth() - 18)
  const sinceStr = since.toISOString().split('T')[0]

  const dismissalsPromise = supabaseAdmin
    .from('finance_subscription_dismissals')
    .select('key')
    .eq('user_id', userId)

  // Paginate to bypass Supabase PostgREST default 1000-row limit
  const PAGE_SIZE = 1000
  const transactions: SubscriptionTxRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('finance_transactions')
      .select('id, date, description, amount, currency, category_id, is_internal_transfer, exclude_from_stats, finance_categories(id, name, icon, color, name_key)')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('date', sinceStr)
      .eq('is_internal_transfer', false)
      .eq('exclude_from_stats', false)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { subscriptions: [], error: error.message }
    if (!data?.length) break
    transactions.push(...(data as unknown as SubscriptionTxRow[]))
    if (data.length < PAGE_SIZE) break
  }

  if (transactions.length === 0) return { subscriptions: [] }

  const { data: dismissals } = await dismissalsPromise
  const dismissedKeys = new Set((dismissals ?? []).map(d => d.key))

  const groups = new Map<string, SubscriptionTxRow[]>()
  for (const tx of transactions) {
    const key = normalizeSubscriptionDesc(tx.description ?? '')
    if (!key || key.length < 3 || dismissedKeys.has(key)) continue
    const list = groups.get(key) ?? []
    list.push(tx)
    groups.set(key, list)
  }

  const subscriptions: SubscriptionItem[] = []

  for (const [key, txs] of groups) {
    if (txs.length < 2) continue
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date))

    const withCat = sorted.filter(t => t.category_id).reverse()
    const category = withCat.length > 0 ? (withCat[0] as any).finance_categories : null
    const isDenylisted = !!(category?.name_key && SUBSCRIPTION_CATEGORY_DENYLIST.has(category.name_key))

    if (!isDenylisted) {
      const sub = buildSubscription(key, sorted, category, false)
      if (sub) subscriptions.push(sub)
      continue
    }

    // Denylisted category: split by exact amount and only surface tight,
    // date-regular sub-clusters (see buildSubscription's `strict` criteria).
    const byAmount = new Map<number, SubscriptionTxRow[]>()
    for (const t of sorted) {
      const cents = Math.round(Math.abs(t.amount) * 100)
      const list = byAmount.get(cents) ?? []
      list.push(t)
      byAmount.set(cents, list)
    }
    for (const [cents, cluster] of byAmount) {
      if (cluster.length < 2) continue
      const subKey = `${key}_${cents}`
      if (dismissedKeys.has(subKey)) continue
      const sub = buildSubscription(subKey, cluster, category, true)
      if (sub) subscriptions.push(sub)
    }
  }

  subscriptions.sort((a, b) => b.monthly_equivalent - a.monthly_equivalent)
  return { subscriptions }
}

router.get('/subscriptions', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const result = await getActiveSubscriptions(userId)
  if (result.error) { res.status(500).json({ error: result.error }); return }
  res.json({ subscriptions: result.subscriptions })
})

// GET /api/finances/subscriptions/dismissed
router.get('/subscriptions/dismissed', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('finance_subscription_dismissals')
    .select('key, name, dismissed_at')
    .eq('user_id', userId)
    .order('dismissed_at', { ascending: false })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ dismissed: data ?? [] })
})

// POST /api/finances/subscriptions/dismiss
router.post('/subscriptions/dismiss', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { key, name } = req.body as { key?: string; name?: string }
  if (!key) { res.status(400).json({ error: 'key required' }); return }
  const { error } = await supabaseAdmin
    .from('finance_subscription_dismissals')
    .upsert({ user_id: userId, key, name: name ?? '' }, { onConflict: 'user_id,key' })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// DELETE /api/finances/subscriptions/dismiss/:key
router.delete('/subscriptions/dismiss/:key', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { key } = req.params
  const { error } = await supabaseAdmin
    .from('finance_subscription_dismissals')
    .delete()
    .eq('user_id', userId)
    .eq('key', key)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// GET /api/finances/fee-scan
router.get('/fee-scan', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const since = new Date()
  since.setFullYear(since.getFullYear() - 1)
  const sinceStr = since.toISOString().split('T')[0]

  const { data: transactions, error } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, finance_categories(id, name, icon, color, name_key)')
    .eq('user_id', userId)
    .lt('amount', 0)
    .gte('date', sinceStr)
    .eq('is_internal_transfer', false)
    .eq('exclude_from_stats', false)
    .order('date', { ascending: true })

  if (error) { res.status(500).json({ error: error.message }); return }
  if (!transactions) { res.json({ total: 0, by_category: [], monthly: [] }); return }

  const FEE_DESC_KEYWORDS = [
    'taxa', 'tarifa', 'iof', 'custód', 'custodi', 'corretag', 'spread',
    'anuidade', 'manutenc', 'manutenç', 'emolument', 'liquidaç', 'liquidac',
    'câmbio', 'cambio', 'imposto de', 'cpmf', 'cobrança', 'cobranca',
    'juros mora', 'multa', 'ted ', ' ted', 'penalidade',
  ]
  const FEE_CAT_KEYWORDS = ['taxa', 'tarifa', 'imposto', 'iof', 'fee', 'bancár', 'bancar', 'corretor']

  function isFee(tx: { description: string | null; finance_categories?: unknown }): boolean {
    const desc = (tx.description ?? '').toLowerCase()
    const cat = tx.finance_categories as { name?: string; name_key?: string } | null
    const catStr = ((cat?.name ?? '') + ' ' + (cat?.name_key ?? '')).toLowerCase()
    return FEE_DESC_KEYWORDS.some(k => desc.includes(k)) || FEE_CAT_KEYWORDS.some(k => catStr.includes(k))
  }

  const feeTxs = transactions.filter(isFee)

  const catMap = new Map<string, { id: string; name: string; icon: string; color: string; total: number; count: number }>()
  for (const tx of feeTxs) {
    const cat = tx.finance_categories as unknown as { id: number; name: string; icon: string; color: string } | null
    const key = cat ? String(cat.id) : '_uncat'
    const existing = catMap.get(key)
    if (existing) { existing.total += Math.abs(tx.amount); existing.count++ }
    else catMap.set(key, { id: key, name: cat?.name ?? '—', icon: cat?.icon ?? '💸', color: cat?.color ?? '#94A3B8', total: Math.abs(tx.amount), count: 1 })
  }

  const monthMap = new Map<string, number>()
  for (const tx of feeTxs) {
    const m = tx.date.slice(0, 7)
    monthMap.set(m, (monthMap.get(m) ?? 0) + Math.abs(tx.amount))
  }

  const by_category = [...catMap.values()].sort((a, b) => b.total - a.total)
  const total = by_category.reduce((s, c) => s + c.total, 0)
  const monthly = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))

  res.json({ total: Math.round(total * 100) / 100, by_category, monthly })
})

export default router
