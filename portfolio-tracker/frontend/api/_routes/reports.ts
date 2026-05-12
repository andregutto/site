import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

// GET /api/reports/:year
router.get('/:year', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const year = parseInt(req.params.year, 10)
  if (isNaN(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'Ano inválido' }); return
  }

  const startOfYear = `${year}-01-01`
  const endOfYear   = `${year}-12-31`

  // Fetch all contributions for the year
  const { data: contribs, error: ce } = await supabaseAdmin
    .from('contributions')
    .select('id, asset_id, type, date, quantity, unit_price_brl, value_brl, description, assets(id, code, name, asset_type, currency)')
    .eq('user_id', userId)
    .gte('date', startOfYear)
    .lte('date', endOfYear)
    .order('date')

  if (ce) { res.status(500).json({ error: ce.message }); return }

  // Fetch all buy contributions up to end of year to compute avg cost basis per asset
  const { data: allBuys, error: be } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, quantity, value_brl, unit_price_brl, date')
    .eq('user_id', userId)
    .eq('type', 'buy')
    .lte('date', endOfYear)
    .order('date')

  if (be) { res.status(500).json({ error: be.message }); return }

  // Build cost basis map: asset_id -> { totalQty, totalCost }
  const basis: Record<number, { totalQty: number; totalCost: number }> = {}
  for (const b of (allBuys ?? [])) {
    if (!basis[b.asset_id]) basis[b.asset_id] = { totalQty: 0, totalCost: 0 }
    const qty  = b.quantity ?? 1
    const cost = b.value_brl ?? (b.unit_price_brl ?? 0) * qty
    basis[b.asset_id].totalQty  += qty
    basis[b.asset_id].totalCost += cost
  }

  // Sells in the year — compute gain/loss using avg cost at time of sale
  const sells = (contribs ?? []).filter(c => c.type === 'sell').map(c => {
    const b = basis[c.asset_id] ?? { totalQty: 0, totalCost: 0 }
    const avgCostPerUnit = b.totalQty > 0 ? b.totalCost / b.totalQty : 0
    const qty = c.quantity ?? 1
    const costBasis    = avgCostPerUnit * qty
    const saleValue    = c.value_brl ?? (c.unit_price_brl ?? 0) * qty
    const gainLoss     = saleValue - costBasis
    const gainLossPct  = costBasis > 0 ? (gainLoss / costBasis) * 100 : null
    return {
      id: c.id, date: c.date, asset_id: c.asset_id,
      code: (c.assets as { code: string } | null)?.code ?? '',
      name: (c.assets as { name: string } | null)?.name ?? '',
      qty, sale_value_brl: saleValue, cost_basis_brl: costBasis,
      gain_loss_brl: gainLoss, gain_loss_pct: gainLossPct,
    }
  })

  // Income in the year
  const income = (contribs ?? []).filter(c => c.type === 'income').map(c => ({
    id: c.id, date: c.date, asset_id: c.asset_id,
    code: (c.assets as { code: string } | null)?.code ?? '',
    name: (c.assets as { name: string } | null)?.name ?? '',
    value_brl: c.value_brl ?? 0,
    description: c.description ?? '',
  }))

  // Asset positions at Dec 31 of the year
  const { data: allContribs, error: ace } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity, value_brl, unit_price_brl')
    .eq('user_id', userId)
    .lte('date', endOfYear)

  if (ace) { res.status(500).json({ error: ace.message }); return }

  const { data: assets, error: ae } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, exchange')
    .eq('user_id', userId)
    .eq('active', true)

  if (ae) { res.status(500).json({ error: ae.message }); return }

  const posMap: Record<number, { qty: number; cost: number }> = {}
  for (const c of (allContribs ?? [])) {
    if (c.type === 'income') continue
    if (!posMap[c.asset_id]) posMap[c.asset_id] = { qty: 0, cost: 0 }
    const qty  = c.quantity ?? 1
    const cost = c.value_brl ?? (c.unit_price_brl ?? 0) * qty
    if (c.type === 'buy')  { posMap[c.asset_id].qty += qty; posMap[c.asset_id].cost += cost }
    if (c.type === 'sell') { posMap[c.asset_id].qty -= qty; posMap[c.asset_id].cost -= cost }
  }

  const positions = (assets ?? [])
    .map(a => {
      const p = posMap[a.id]
      if (!p || p.qty <= 0) return null
      return { asset_id: a.id, code: a.code, name: a.name, asset_type: a.asset_type, currency: a.currency, exchange: a.exchange, qty: p.qty, cost_brl: p.cost }
    })
    .filter(Boolean)

  const totalGainLoss  = sells.reduce((s, r) => s + r.gain_loss_brl, 0)
  const totalIncome    = income.reduce((s, r) => s + r.value_brl, 0)

  res.json({ year, sells, income, positions, totalGainLoss, totalIncome })
})

export default router
