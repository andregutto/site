import { Router, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import type {
  PortfolioSnapshot, SnapshotAsset, SnapshotGroupValue, SnapshotClassValue,
  SnapshotPerformance, SnapshotMonthlyPoint, SnapshotDividends,
} from './portfolio.js'

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
    .select('id, date, description, amount, currency, finance_categories(id, name, name_key, icon, color)')
    .eq('moment_id', moment.id)
    .order('date', { ascending: false })

  const expenses = (txns ?? []).filter(t => t.amount < 0)
  const total    = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)

  const catMap: Record<string, { name: string; name_key: string | null; icon: string; color: string; total: number }> = {}
  for (const tx of expenses) {
    const cat = tx.finance_categories as unknown as { id: number; name: string; name_key: string | null; icon: string; color: string } | null
    const key = cat ? String(cat.id) : 'none'
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Sem categoria', name_key: cat?.name_key ?? null, icon: cat?.icon ?? '❓', color: cat?.color ?? '#9CA3AF', total: 0 }
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
    .select('user_id, show_values, hide_holdings, label, updated_at, snapshot')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (!share) { res.status(404).json({ error: 'not_found' }); return }

  let owner_name: string | null = null
  try {
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(share.user_id)
    owner_name = (user?.user_metadata?.first_name as string | null) ?? null
  } catch { /* ignore */ }

  const snap = share.snapshot as PortfolioSnapshot | null
  if (!snap) { res.status(503).json({ error: 'snapshot_pending' }); return }

  const showVal = share.show_values
  const hideHoldings = share.hide_holdings

  const mv = (v: number): number | null => showVal ? v : null

  const maskPerformance = (p: SnapshotPerformance | null) => p && {
    from: p.from, to: p.to,
    value_start: mv(p.value_start), value_end: mv(p.value_end),
    contributions: mv(p.contributions), return_abs: mv(p.return_abs),
    return_pct: p.return_pct,
  }

  const maskMonthly = (m: SnapshotMonthlyPoint[]) => m.map(p => ({
    month: p.month, total: mv(p.total), contributions_cumulative: mv(p.contributions_cumulative),
  }))

  const maskGroups = (g: SnapshotGroupValue[]) => g.map(x => ({ ...x, value: mv(x.value) }))

  const maskClasses = (c: SnapshotClassValue[]) => c.map(x => ({ ...x, value: mv(x.value) }))

  const maskAssets = (a: SnapshotAsset[]) => hideHoldings ? [] : a.map(x => ({ ...x, value: mv(x.value) }))

  const maskDividends = (d: SnapshotDividends) => ({
    total_12m: mv(d.total_12m),
    by_month: d.by_month.map(m => ({ month: m.month, total: mv(m.total) })),
    top_payers: hideHoldings ? [] : d.top_payers.map(p => ({ ...p, total: mv(p.total) })),
    yield_pct: d.yield_pct,
  })

  res.json({
    owner_name,
    label: share.label,
    show_values: showVal,
    hide_holdings: hideHoldings,
    updated_at: share.updated_at,
    generated_at: snap.generated_at,
    display_currency: snap.display_currency,
    period: snap.period,
    period_from: snap.period_from,
    period_to: snap.period_to,
    inception: snap.inception,

    total: mv(snap.total),
    invested: mv(snap.invested),
    asset_count: snap.asset_count,
    class_count: snap.class_count,

    performance: maskPerformance(snap.performance),
    inception_performance: maskPerformance(snap.inception_performance),
    monthly: maskMonthly(snap.monthly),
    benchmarks: snap.benchmarks,

    by_class: maskClasses(snap.by_class),
    by_geography: maskGroups(snap.by_geography),
    by_sector: maskGroups(snap.by_sector),
    by_currency: maskGroups(snap.by_currency),

    diversification: snap.diversification,

    top_assets: maskAssets(snap.top_assets),
    top_gainers: maskAssets(snap.top_gainers),
    top_losers: maskAssets(snap.top_losers),

    dividends: maskDividends(snap.dividends),
  })
})

export default router
