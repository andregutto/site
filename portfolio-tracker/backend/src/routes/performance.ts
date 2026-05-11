// Endpoints de performance — rentabilidade ajustada por aportes
import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getRates, SERIES } from '../services/bcbService.js'
import * as yahoo from '../services/yahooService.js'

const router = Router()

function parseMonth(ym: string): Date {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

// Busca valor total do portfólio em determinado mês a partir do price_history
// Para ativos sem price_history, usa o mais próximo disponível
async function getPortfolioValueAtMonth(
  userId: string,
  refDate: Date
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const dateStr = refDate.toISOString().split('T')[0]

  // Busca assets do usuário
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)

  if (!assets?.length) return { total: 0, detail: [] }

  const assetIds = assets.map((a) => a.id)

  // Holdings no mês (contribuições até o ref_date)
  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity')
    .in('asset_id', assetIds)
    .lte('date', dateStr)

  const holdingsMap: Record<number, number> = {}
  for (const c of (contributions ?? [])) {
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) +
      (c.type === 'buy' ? c.quantity : -c.quantity)
  }

  // Preços históricos do mês (price_history)
  const { data: prices } = await supabaseAdmin
    .from('price_history')
    .select('asset_id, price, currency, ref_date')
    .in('asset_id', assetIds)
    .lte('ref_date', dateStr)
    .order('ref_date', { ascending: false })

  // Pega preço mais recente por ativo
  const priceMap: Record<number, { price: number; currency: string }> = {}
  const seen = new Set<number>()
  for (const p of (prices ?? [])) {
    if (!seen.has(p.asset_id)) {
      priceMap[p.asset_id] = { price: p.price, currency: p.currency }
      seen.add(p.asset_id)
    }
  }

  // Manual values no mês
  const manualIds = assets.filter((a) => a.asset_type === 'manual').map((a) => a.id)
  const manualMap: Record<number, number> = {}
  if (manualIds.length > 0) {
    const { data: manualValues } = await supabaseAdmin
      .from('manual_values')
      .select('asset_id, value, currency, ref_date')
      .in('asset_id', manualIds)
      .lte('ref_date', dateStr)
      .order('ref_date', { ascending: false })

    const seenM = new Set<number>()
    for (const mv of (manualValues ?? [])) {
      if (!seenM.has(mv.asset_id)) {
        manualMap[mv.asset_id] = mv.value  // assumindo BRL
        seenM.add(mv.asset_id)
      }
    }
  }

  // FX rate aproximado (usa câmbio do price_history ou fallback)
  const fxCache: Record<string, number> = {}
  async function getFx(currency: string): Promise<number> {
    if (currency === 'BRL') return 1
    if (fxCache[currency]) return fxCache[currency]
    const { data: fx } = await supabaseAdmin
      .from('fx_rates')
      .select('rate')
      .eq('from_currency', currency)
      .eq('to_currency', 'BRL')
      .lte('ref_date', dateStr)
      .order('ref_date', { ascending: false })
      .limit(1)
      .single()
    const rate = fx?.rate ?? 5.7  // fallback
    fxCache[currency] = rate
    return rate
  }

  const detail: Array<{ asset_id: number; value: number }> = []
  let total = 0

  for (const a of assets) {
    let value = 0
    try {
      if (a.asset_type === 'manual') {
        value = manualMap[a.id] ?? 0
      } else if (a.asset_type === 'fixed_income') {
        // RF calculada com dados históricos: usa price_history se disponível
        const ph = priceMap[a.id]
        value = ph?.price ?? 0
      } else {
        // ticker
        const holdings = holdingsMap[a.id] ?? 0
        const ph = priceMap[a.id]
        if (holdings > 0 && ph) {
          const fx = await getFx(ph.currency)
          value = holdings * ph.price * fx
        }
      }
    } catch { value = 0 }

    if (value > 0) {
      detail.push({ asset_id: a.id, value: Math.round(value * 100) / 100 })
      total += value
    }
  }

  return { total: Math.round(total * 100) / 100, detail }
}

// GET /api/performance/summary?from=2025-01&to=2026-04
router.get('/summary', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || '2025-01'
  const toStr   = (req.query.to   as string) || new Date().toISOString().substring(0, 7)

  const fromDate = parseMonth(fromStr)
  const toDate   = parseMonth(toStr)

  if (fromDate >= toDate) {
    res.status(400).json({ error: '"from" deve ser anterior a "to"' }); return
  }

  // Aportes no período
  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, value_brl, type, assets!inner(user_id)')
    .eq('assets.user_id', userId)
    .gte('date', fromDate.toISOString().split('T')[0])
    .lte('date', toDate.toISOString().split('T')[0])

  const totalContribs = (contributions ?? []).reduce((s, c) => {
    return s + (c.type === 'buy' ? (c.value_brl ?? 0) : -(c.value_brl ?? 0))
  }, 0)

  const [start, end] = await Promise.all([
    getPortfolioValueAtMonth(userId, fromDate),
    getPortfolioValueAtMonth(userId, toDate),
  ])

  const v_ini = start.total
  const v_fim = end.total

  // Fórmula Simple Dietz ajustada por aportes
  const base   = v_ini - totalContribs
  const return_pct = base > 0 ? ((v_fim - v_ini - totalContribs) / base) * 100 : null
  const return_abs = v_fim - v_ini - totalContribs

  res.json({
    from:              fromStr,
    to:                toStr,
    value_start:       v_ini,
    value_end:         v_fim,
    contributions:     Math.round(totalContribs * 100) / 100,
    return_abs:        Math.round(return_abs * 100) / 100,
    return_pct:        return_pct !== null ? Math.round(return_pct * 100) / 100 : null,
    note:              v_ini === 0
      ? 'Popule price_history via GET /api/prices/:id/history para calcular performance histórica'
      : undefined,
  })
})

// GET /api/performance/monthly?year=2025
router.get('/monthly', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const year = parseInt(req.query.year as string || String(new Date().getFullYear()))

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1)
    if (d > new Date()) return null
    return d
  }).filter(Boolean) as Date[]

  const values = await Promise.all(
    months.map(async (d) => {
      const { total } = await getPortfolioValueAtMonth(userId, d)
      return { month: d.toISOString().substring(0, 7), total }
    })
  )

  // Calcula rentabilidade mensal (mês atual vs anterior)
  const monthly = values.map((v, i) => {
    const prev  = i > 0 ? values[i - 1].total : 0

    // Aportes naquele mês
    return { month: v.month, total: v.total, prev_total: prev }
  })

  res.json({ year, monthly })
})

// GET /api/performance/benchmarks?year=2025
// Returns CDI (BCB), IBOV (Yahoo ^BVSP), S&P500 (Yahoo ^GSPC) % return for the year
router.get('/benchmarks', requireAuth, async (req, res: Response) => {
  const year = parseInt(req.query.year as string || String(new Date().getFullYear()))
  const startDate = new Date(year, 0, 2)           // Jan 2 (Jan 1 is holiday/weekend)
  const endDate   = new Date(Math.min(new Date(year, 11, 31).getTime(), Date.now()))

  type Monthly = { month: string; cdi_cum: number; ibov_cum: number | null; sp500_cum: number | null }
  const monthly: Monthly[] = []

  // CDI: compound daily rates into monthly cumulative index
  let cdiPct: number | null = null
  try {
    const rates = await getRates(SERIES.CDI, startDate, endDate)
    const monthMap = new Map<string, number>()
    for (const r of rates) {
      const m = r.date.toISOString().substring(0, 7)
      monthMap.set(m, (monthMap.get(m) ?? 1) * (1 + r.value / 100))
    }
    let cum = 1
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(year, i, 1)
      return d <= endDate ? `${year}-${String(i + 1).padStart(2, '0')}` : null
    }).filter(Boolean) as string[]

    for (const m of months) {
      cum *= (monthMap.get(m) ?? 1)
      monthly.push({ month: m, cdi_cum: Math.round(cum * 10000) / 10000, ibov_cum: null, sp500_cum: null })
    }
    cdiPct = Math.round((cum - 1) * 10000) / 100
  } catch { /* sem dados CDI */ }

  // IBOV: Yahoo ^BVSP monthly
  let ibovPct: number | null = null
  try {
    const hist = await yahoo.getMonthlyHistory('^BVSP', 14)
    const inYear = hist.filter(p => p.date.startsWith(String(year)))
    if (inYear.length >= 2) {
      const base = inYear[0].price
      for (const entry of monthly) {
        const match = inYear.find(p => p.date.startsWith(entry.month))
        entry.ibov_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
      }
      ibovPct = Math.round((inYear[inYear.length - 1].price / base - 1) * 10000) / 100
    }
  } catch { /* sem dados IBOV */ }

  // S&P500: Yahoo ^GSPC monthly
  let sp500Pct: number | null = null
  try {
    const hist = await yahoo.getMonthlyHistory('^GSPC', 14)
    const inYear = hist.filter(p => p.date.startsWith(String(year)))
    if (inYear.length >= 2) {
      const base = inYear[0].price
      for (const entry of monthly) {
        const match = inYear.find(p => p.date.startsWith(entry.month))
        entry.sp500_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
      }
      sp500Pct = Math.round((inYear[inYear.length - 1].price / base - 1) * 10000) / 100
    }
  } catch { /* sem dados S&P500 */ }

  res.json({ year, cdi_pct: cdiPct, ibov_pct: ibovPct, sp500_pct: sp500Pct, monthly })
})

export default router
