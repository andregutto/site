import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { syncDividendsForUser } from '../_services/dividendService.js'

const router = Router()

// POST /api/dividends/sync?force=true  — force=true deletes all dividends and re-fetches from scratch
router.post('/sync', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const force = req.query.force === 'true'
  res.json({ status: 'started', force })
  syncDividendsForUser(userId, force).catch(err =>
    console.warn('[dividends/sync]', err)
  )
})

// GET /api/dividends/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { from, to } = req.query as Record<string, string>

  const { data: assets } = await supabaseAdmin
    .from('assets').select('id, code, name, currency')
    .eq('user_id', userId).eq('active', true)

  const assetIds = (assets ?? []).map(a => a.id as number)
  if (!assetIds.length) { res.json({ total_brl: 0, by_asset: [], by_month: [] }); return }

  let q = supabaseAdmin
    .from('dividends')
    .select('asset_id, ex_date, amount_brl, dividend_type')
    .in('asset_id', assetIds).eq('user_id', userId)

  if (from) q = q.gte('ex_date', from)
  if (to)   q = q.lte('ex_date', to)

  const { data, error } = await q
  if (error) { res.status(500).json({ error: error.message }); return }

  const rows = data ?? []
  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))
  const total_brl = rows.reduce((s, r) => s + (r.amount_brl ?? 0), 0)

  const byAssetMap: Record<number, { code: string; name: string; total_brl: number; count: number }> = {}
  for (const r of rows) {
    if (!byAssetMap[r.asset_id]) byAssetMap[r.asset_id] = { code: assetMap[r.asset_id]?.code ?? '', name: assetMap[r.asset_id]?.name ?? '', total_brl: 0, count: 0 }
    byAssetMap[r.asset_id].total_brl += r.amount_brl ?? 0
    byAssetMap[r.asset_id].count++
  }
  const by_asset = Object.entries(byAssetMap)
    .map(([id, v]) => ({ asset_id: Number(id), ...v, total_brl: Math.round(v.total_brl * 100) / 100 }))
    .sort((a, b) => b.total_brl - a.total_brl)

  const byMonthMap: Record<string, number> = {}
  for (const r of rows) {
    const month = r.ex_date.slice(0, 7)
    byMonthMap[month] = (byMonthMap[month] ?? 0) + (r.amount_brl ?? 0)
  }
  const by_month = Object.entries(byMonthMap)
    .map(([month, total_brl]) => ({ month, total_brl: Math.round(total_brl * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month))

  res.json({ total_brl: Math.round(total_brl * 100) / 100, by_asset, by_month })
})

// GET /api/dividends?from=&to=&asset_id=
router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { from, to, asset_id } = req.query as Record<string, string>

  const { data: assets } = await supabaseAdmin
    .from('assets').select('id, code, name')
    .eq('user_id', userId).eq('active', true)

  const assetIds = (assets ?? []).map(a => a.id as number)
  if (!assetIds.length) { res.json([]); return }

  let q = supabaseAdmin
    .from('dividends')
    .select('id, asset_id, ex_date, pay_date, amount_per_share, amount_total, currency, amount_brl, dividend_type, source')
    .in('asset_id', assetIds).eq('user_id', userId).order('ex_date', { ascending: false })

  if (from) q = q.gte('ex_date', from)
  if (to)   q = q.lte('ex_date', to)
  if (asset_id) q = q.eq('asset_id', Number(asset_id))

  const { data, error } = await q
  if (error) { res.status(500).json({ error: error.message }); return }

  const assetMap = Object.fromEntries((assets ?? []).map(a => [a.id, a]))
  res.json((data ?? []).map(d => ({ ...d, code: assetMap[d.asset_id]?.code ?? '', name: assetMap[d.asset_id]?.name ?? '' })))
})

export default router
