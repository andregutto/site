import { Router, Response } from 'express'
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
  const [incomeRes, envelopesRes, categoriesRes] = await Promise.all([
    supabaseAdmin.from('finance_income').select('monthly_net, currency').eq('user_id', userId).single(),
    supabaseAdmin.from('finance_envelopes').select('*').eq('user_id', userId).order('sort_order'),
    supabaseAdmin.from('finance_categories').select('*').eq('user_id', userId).order('name'),
  ])
  const income     = incomeRes.data ?? { monthly_net: 0, currency: 'EUR' }
  const envelopes  = envelopesRes.data ?? []
  const categories = categoriesRes.data ?? []

  // Attach categories to envelopes
  const result = envelopes.map(env => ({
    ...env,
    budget_amount: income.monthly_net * (env.pct_target / 100),
    categories: categories.filter(c => c.envelope_id === env.id),
  }))

  res.json({ income, envelopes: result })
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

export default router
