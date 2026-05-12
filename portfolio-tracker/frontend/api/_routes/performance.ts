import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getRates, SERIES } from '../_services/bcbService.js'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

const router = Router()

// Use local date components to avoid UTC offset shifting months
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function getPortfolioValueAtMonth(
  userId: string,
  year: number,
  month: number   // 1-based
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  // Use string construction to avoid timezone-shifted toISOString()
  const ym  = `${year}-${String(month).padStart(2, '0')}`
  // Last day of month for a tight upper bound
  const lastDay = new Date(year, month, 0).getDate()
  const dateStr = `${ym}-${String(lastDay).padStart(2, '0')}`

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)

  if (!assets?.length) return { total: 0, detail: [] }

  const assetIds = assets.map((a) => a.id)

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

  const { data: prices } = await supabaseAdmin
    .from('price_history')
    .select('asset_id, price, currency, ref_date')
    .in('asset_id', assetIds)
    .lte('ref_date', dateStr)
    .order('ref_date', { ascending: false })

  const priceMap: Record<number, { price: number; currency: string }> = {}
  const seen = new Set<number>()
  for (const p of (prices ?? [])) {
    if (!seen.has(p.asset_id)) {
      priceMap[p.asset_id] = { price: p.price, currency: p.currency }
      seen.add(p.asset_id)
    }
  }

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
        manualMap[mv.asset_id] = mv.value
        seenM.add(mv.asset_id)
      }
    }
  }

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
    const rate = fx?.rate ?? 5.7
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
        const ph = priceMap[a.id]
        value = ph?.price ?? 0
      } else {
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

router.get('/summary', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || '2025-01'
  const toStr   = (req.query.to   as string) || localYM(new Date())

  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)

  if (fromY > toY || (fromY === toY && fromM >= toM)) {
    res.status(400).json({ error: '"from" deve ser anterior a "to"' }); return
  }

  const fromDateStr = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const toLastDay   = new Date(toY, toM, 0).getDate()
  const toDateStr   = `${toY}-${String(toM).padStart(2, '0')}-${toLastDay}`

  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, value_brl, type, assets!inner(user_id)')
    .eq('assets.user_id', userId)
    .gte('date', fromDateStr)
    .lte('date', toDateStr)

  const totalContribs = (contributions ?? []).reduce((s, c) => {
    return s + (c.type === 'buy' ? (c.value_brl ?? 0) : -(c.value_brl ?? 0))
  }, 0)

  const [start, end] = await Promise.all([
    getPortfolioValueAtMonth(userId, fromY, fromM),
    getPortfolioValueAtMonth(userId, toY,   toM),
  ])

  const v_ini = start.total
  const v_fim = end.total

  const base       = v_ini - totalContribs
  const return_pct = base > 0 ? ((v_fim - v_ini - totalContribs) / base) * 100 : null
  const return_abs = v_fim - v_ini - totalContribs

  res.json({
    from:          fromStr,
    to:            toStr,
    value_start:   v_ini,
    value_end:     v_fim,
    contributions: Math.round(totalContribs * 100) / 100,
    return_abs:    Math.round(return_abs * 100) / 100,
    return_pct:    return_pct !== null ? Math.round(return_pct * 100) / 100 : null,
  })
})

router.get('/monthly', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const year = parseInt(req.query.year as string || String(new Date().getFullYear()))
  const now  = new Date()

  // Build list of months up to (and including) current month
  const months: Array<{ year: number; month: number; label: string }> = []
  for (let m = 1; m <= 12; m++) {
    if (year < now.getFullYear() || (year === now.getFullYear() && m <= now.getMonth() + 1)) {
      months.push({ year, month: m, label: `${year}-${String(m).padStart(2, '0')}` })
    }
  }

  const values = await Promise.all(
    months.map(async ({ year: y, month: m, label }) => {
      const { total } = await getPortfolioValueAtMonth(userId, y, m)
      return { month: label, total }
    })
  )

  const monthly = values.map((v, i) => ({
    month:      v.month,
    total:      v.total,
    prev_total: i > 0 ? values[i - 1].total : 0,
  }))

  res.json({ year, monthly })
})

router.get('/benchmarks', requireAuth, async (req, res: Response) => {
  const year    = parseInt(req.query.year as string || String(new Date().getFullYear()))
  const today   = localDate(new Date())
  const startYM = `${year}-01`

  // Only include months up to today
  const months: string[] = []
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    if (ym <= today.substring(0, 7)) months.push(ym)
  }
  if (months.length === 0) {
    res.json({ year, cdi_pct: null, ibov_pct: null, sp500_pct: null, monthly: [] }); return
  }

  type Monthly = { month: string; cdi_cum: number; ibov_cum: number | null; sp500_cum: number | null }
  const monthly: Monthly[] = months.map(m => ({ month: m, cdi_cum: 1, ibov_cum: null, sp500_cum: null }))

  // CDI: compound daily rates from BCB
  let cdiPct: number | null = null
  try {
    const startDate = new Date(year, 0, 2)  // Jan 2 (fmtDate uses local components, safe)
    const endDate   = new Date()
    if (endDate.getFullYear() > year) {
      endDate.setFullYear(year, 11, 31)  // Dec 31 of target year
    }
    const rates = await getRates(SERIES.CDI, startDate, endDate)
    const monthMap = new Map<string, number>()
    for (const r of rates) {
      // Use local month components to avoid timezone shift
      const m = localYM(r.date)
      monthMap.set(m, (monthMap.get(m) ?? 1) * (1 + r.value / 100))
    }
    let cum = 1
    for (const entry of monthly) {
      cum *= (monthMap.get(entry.month) ?? 1)
      entry.cdi_cum = Math.round(cum * 10000) / 10000
    }
    cdiPct = Math.round((cum - 1) * 10000) / 100
  } catch { /* sem dados CDI */ }

  // Fetch IBOV and S&P500 using explicit year range
  async function fetchYearlyMonthly(ticker: string) {
    const endStr = today < `${year}-12-31` ? today : `${year}-12-31`
    const rows = await yf.historical(ticker, {
      period1:  `${year}-01-01`,
      period2:  endStr,
      interval: '1mo',
    })
    // Map date using local components to avoid UTC offset shift
    return rows.map(r => ({
      ym:    localYM(r.date),
      price: r.close ?? r.adjClose ?? 0,
    })).filter(r => r.ym.startsWith(String(year)))
  }

  // IBOV
  let ibovPct: number | null = null
  try {
    const pts = await fetchYearlyMonthly('^BVSP')
    if (pts.length >= 1) {
      const base = pts[0].price
      for (const entry of monthly) {
        const match = pts.find(p => p.ym === entry.month)
        entry.ibov_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
      }
      ibovPct = pts.length >= 2
        ? Math.round((pts[pts.length - 1].price / base - 1) * 10000) / 100
        : null
    }
  } catch { /* sem dados IBOV */ }

  // S&P500
  let sp500Pct: number | null = null
  try {
    const pts = await fetchYearlyMonthly('^GSPC')
    if (pts.length >= 1) {
      const base = pts[0].price
      for (const entry of monthly) {
        const match = pts.find(p => p.ym === entry.month)
        entry.sp500_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
      }
      sp500Pct = pts.length >= 2
        ? Math.round((pts[pts.length - 1].price / base - 1) * 10000) / 100
        : null
    }
  } catch { /* sem dados S&P500 */ }

  // Normalize: if first month has ibov/sp500 data, it's the baseline (= 1.0 = 0%)
  // Fill forward null gaps using last known value
  let lastIbov: number | null = null
  let lastSp500: number | null = null
  for (const entry of monthly) {
    if (entry.ibov_cum  != null) lastIbov  = entry.ibov_cum
    if (entry.sp500_cum != null) lastSp500 = entry.sp500_cum
    if (entry.ibov_cum  == null && lastIbov  != null) entry.ibov_cum  = lastIbov
    if (entry.sp500_cum == null && lastSp500 != null) entry.sp500_cum = lastSp500
  }

  // Recalculate year-end pct from last filled entry
  const lastEntry = monthly[monthly.length - 1]
  if (lastEntry.ibov_cum  != null) ibovPct  = Math.round((lastEntry.ibov_cum  - 1) * 10000) / 100
  if (lastEntry.sp500_cum != null) sp500Pct = Math.round((lastEntry.sp500_cum - 1) * 10000) / 100

  // Filter to only months covered in startYM onward (already done in months array)
  const filteredMonthly = monthly.filter(m => m.month >= startYM)

  res.json({ year, cdi_pct: cdiPct, ibov_pct: ibovPct, sp500_pct: sp500Pct, monthly: filteredMonthly })
})

export default router
