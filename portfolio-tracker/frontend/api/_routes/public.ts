import { Router, Response } from 'express'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

// GET /api/public/moments/:token — no auth required
router.get('/moments/:token', async (req, res: Response) => {
  const { token } = req.params

  const { data: moment } = await supabaseAdmin
    .from('finance_moments')
    .select('id, name, icon, color, cover_image_url, start_date, end_date, description, share_expires_at, share_hide_descriptions')
    .eq('share_token', token)
    .single()

  if (!moment) { res.status(404).json({ error: 'not_found' }); return }
  if (moment.share_expires_at && new Date(moment.share_expires_at) < new Date()) {
    res.status(410).json({ error: 'expired' }); return
  }

  const { data: txns } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, finance_categories(id, name, icon, color)')
    .eq('moment_id', moment.id)
    .order('date', { ascending: false })

  const expenses = (txns ?? []).filter(t => t.amount < 0)
  const total    = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)

  const catMap: Record<string, { name: string; icon: string; color: string; total: number }> = {}
  for (const tx of expenses) {
    const cat = tx.finance_categories as unknown as { id: number; name: string; icon: string; color: string } | null
    const key = cat ? String(cat.id) : 'none'
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? null, icon: cat?.icon ?? '❓', color: cat?.color ?? '#9CA3AF', total: 0 }
    catMap[key].total += Math.abs(tx.amount)
  }

  res.json({
    moment: {
      name: moment.name, icon: moment.icon, color: moment.color,
      cover_image_url: moment.cover_image_url,
      start_date: moment.start_date, end_date: moment.end_date,
      description: moment.description,
      share_expires_at: moment.share_expires_at,
    },
    summary: {
      total: Math.round(total * 100) / 100,
      currency: expenses[0]?.currency ?? 'EUR',
      by_category: Object.values(catMap).sort((a, b) => b.total - a.total),
    },
    transactions: expenses.map(t => ({
      date: t.date,
      description: moment.share_hide_descriptions ? null : t.description,
      amount: t.amount,
      currency: t.currency,
      category: t.finance_categories,
    })),
  })
})

// GET /api/public/portfolio/:token — no auth required
router.get('/portfolio/:token', async (req, res: Response) => {
  const { token } = req.params

  const { data: share } = await supabaseAdmin
    .from('portfolio_shares')
    .select('user_id, show_values, label, updated_at, snapshot')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!share) { res.status(404).json({ error: 'not_found' }); return }

  // Get owner first name
  let owner_name: string | null = null
  try {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(share.user_id)
    owner_name = (user?.user_metadata?.first_name as string | null) ?? null
  } catch { /* ignore */ }

  const snap = share.snapshot as {
    total_brl: number; portfolio_value?: number; invested_value?: number
    total_return_pct?: number | null; display_currency?: string
    asset_count: number; generated_at: string
    by_class: Array<{ name: string; key: string | null; color: string; value: number; pct: number }>
    top_assets: Array<{ code: string; name: string; value_brl: number; pct: number; class_name: string; class_color: string; exchange: string | null }>
    dividends_12m: number
    monthly_dividends: Array<{ month: string; amount: number }>
  } | null

  if (!snap) { res.status(503).json({ error: 'snapshot_pending' }); return }

  const showVal = share.show_values

  const displayCurr = snap.display_currency ?? 'BRL'
  const portfolioValue = snap.portfolio_value ?? snap.total_brl

  res.json({
    owner_name,
    show_values: showVal,
    updated_at: share.updated_at,
    display_currency: displayCurr,
    total_brl: showVal ? snap.total_brl : null,
    portfolio_value: showVal ? portfolioValue : null,
    invested_value: showVal ? (snap.invested_value ?? null) : null,
    total_return_pct: snap.total_return_pct ?? null,
    asset_count: snap.asset_count,
    generated_at: snap.generated_at,
    by_class: snap.by_class.map(c => ({
      name: c.name, key: c.key, color: c.color, pct: c.pct,
      value: showVal ? c.value : null,
    })),
    top_assets: snap.top_assets.map(a => ({
      code: a.code, name: a.name, pct: a.pct,
      value_brl: showVal ? a.value_brl : null,
      class_name: a.class_name, class_color: a.class_color, exchange: a.exchange,
    })),
    dividends_12m: showVal ? snap.dividends_12m : null,
    monthly_dividends: snap.monthly_dividends,
  })
})

export default router
