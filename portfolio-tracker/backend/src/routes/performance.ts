import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getRates, SERIES } from '../services/bcbService.js'
import { getCurrentPrice, Asset } from '../services/priceService.js'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

const router = Router()

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function getPortfolioValueAtMonth(
  userId: string,
  year: number,
  month: number
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const ym      = `${year}-${String(month).padStart(2, '0')}`
  const lastDay = new Date(year, month, 0).getDate()
  const dateStr = `${ym}-${String(lastDay).padStart(2, '0')}`
  const isCurrentOrFuture = ym >= localYM(new Date())

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, ticker_brapi, ticker_yahoo, coingecko_id')
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

  const priceMap: Record<number, { price: number; currency: string; ref_date: string }> = {}
  const seen = new Set<number>()
  for (const p of (prices ?? [])) {
    if (!seen.has(p.asset_id)) {
      priceMap[p.asset_id] = { price: p.price, currency: p.currency, ref_date: p.ref_date }
      seen.add(p.asset_id)
    }
  }

  const manualIds = assets.filter((a) => a.asset_type === 'manual').map((a) => a.id)
  const manualMap: Record<number, { value: number; currency: string }> = {}
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
        manualMap[mv.asset_id] = { value: mv.value, currency: mv.currency }
        seenM.add(mv.asset_id)
      }
    }
  }

  const fxCache: Record<string, number> = {}
  async function getFx(currency: string): Promise<number> {
    if (currency === 'BRL') return 1
    if (fxCache[currency]) return fxCache[currency]
    const { data: fx } = await supabaseAdmin
      .from('fx_rates').select('rate')
      .eq('from_currency', currency).eq('to_currency', 'BRL')
      .lte('ref_date', dateStr)
      .order('ref_date', { ascending: false }).limit(1).single()
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
        const mv = manualMap[a.id]
        if (mv) {
          const fx = await getFx(mv.currency)
          value = mv.value * fx
        }
      } else if (a.asset_type === 'fixed_income') {
        // RF não entra em price_history — calcula live via BCB
        try {
          const result = await getCurrentPrice({
            ...a,
            ticker_brapi: null, ticker_yahoo: null, coingecko_id: null,
          } as Asset)
          value = result.price  // already BRL total value
        } catch { value = 0 }
      } else {
        const holdings = holdingsMap[a.id] ?? 0
        if (holdings > 0) {
          const ph = priceMap[a.id]
          const phStale = ph && isCurrentOrFuture && ph.ref_date.substring(0, 7) < ym
          if (ph && !phStale) {
            const fx = await getFx(ph.currency)
            value = holdings * ph.price * fx
          } else if (isCurrentOrFuture) {
            try {
              const result = await getCurrentPrice(a as Asset)
              const fx = result.currency === 'BRL' ? 1 : await getFx(result.currency)
              value = holdings * result.price * fx
            } catch {
              if (ph) {
                const fx = await getFx(ph.currency)
                value = holdings * ph.price * fx
              }
            }
          }
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

  const prevM = fromM === 1 ? 12 : fromM - 1
  const prevY = fromM === 1 ? fromY - 1 : fromY

  const { data: userAssets } = await supabaseAdmin
    .from('assets').select('id').eq('user_id', userId).eq('active', true)
  const userAssetIds = (userAssets ?? []).map(a => a.id)

  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, value_brl, price_orig, quantity, fx_rate_brl, currency, type')
    .in('asset_id', userAssetIds)
    .gte('date', fromDateStr)
    .lte('date', toDateStr)

  function estimateContribValue(c: { value_brl: number | null; price_orig: number | null; quantity: number | null; fx_rate_brl: number | null; currency: string | null }): number {
    if (c.value_brl != null) return c.value_brl
    if (c.price_orig != null && c.quantity != null) {
      const fx = c.fx_rate_brl ?? (c.currency && c.currency !== 'BRL' ? 5.7 : 1)
      return c.price_orig * c.quantity * fx
    }
    return 0
  }

  const totalContribs = (contributions ?? []).reduce((s: number, c) => {
    if (c.type === 'income') return s
    const v = estimateContribValue(c as Parameters<typeof estimateContribValue>[0])
    return s + (c.type === 'buy' ? v : -v)
  }, 0)

  const [start, end] = await Promise.all([
    getPortfolioValueAtMonth(userId, prevY, prevM),
    getPortfolioValueAtMonth(userId, toY,   toM),
  ])

  const v_ini      = start.total
  const v_fim      = end.total
  const return_abs = v_fim - v_ini - totalContribs
  const dietz_base = v_ini + 0.5 * totalContribs
  const return_pct = dietz_base > 0 ? (return_abs / dietz_base) * 100 : null

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
  const now = new Date()
  const currentYM = localYM(now)

  let fromStr: string, toStr: string
  if (req.query.from && req.query.to) {
    fromStr = req.query.from as string
    toStr   = req.query.to   as string
  } else {
    const year = parseInt(req.query.year as string || String(now.getFullYear()))
    fromStr = `${year}-01`
    toStr   = `${year}-12`
  }

  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)

  const months: Array<{ year: number; month: number; label: string }> = []
  for (let y = fromY; y <= toY; y++) {
    const mStart = y === fromY ? fromM : 1
    const mEnd   = y === toY   ? toM   : 12
    for (let m = mStart; m <= mEnd; m++) {
      const ym = `${y}-${String(m).padStart(2, '0')}`
      if (ym <= currentYM) months.push({ year: y, month: m, label: ym })
    }
  }

  const rangeFromDate  = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const rangeToLastDay = new Date(toY, toM, 0).getDate()
  const rangeToDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(rangeToLastDay).padStart(2, '0')}`

  const { data: userAssets2 } = await supabaseAdmin
    .from('assets').select('id').eq('user_id', userId).eq('active', true)
  const userAssetIds2 = (userAssets2 ?? []).map(a => a.id)

  const [valuesArr, contribsData] = await Promise.all([
    Promise.all(
      months.map(async ({ year: y, month: m, label }) => {
        const { total } = await getPortfolioValueAtMonth(userId, y, m)
        return { month: label, total }
      })
    ),
    supabaseAdmin
      .from('contributions')
      .select('date, value_brl, price_orig, quantity, fx_rate_brl, currency, type')
      .in('asset_id', userAssetIds2)
      .gte('date', rangeFromDate)
      .lte('date', rangeToDate),
  ])

  const contribsByMonth: Record<string, number> = {}
  for (const c of (contribsData.data ?? [])) {
    if (c.type === 'income') continue
    const ym = (c.date as string).substring(0, 7)
    const vBrl = c.value_brl ??
      (c.price_orig != null && c.quantity != null
        ? c.price_orig * c.quantity * (c.fx_rate_brl ?? (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
        : 0)
    const delta = c.type === 'buy' ? vBrl : -vBrl
    contribsByMonth[ym] = (contribsByMonth[ym] ?? 0) + delta
  }

  const monthly = valuesArr.map((v, i) => ({
    month:         v.month,
    total:         v.total,
    prev_total:    i > 0 ? valuesArr[i - 1].total : 0,
    contributions: contribsByMonth[v.month] ?? 0,
  }))

  res.json({ monthly })
})

router.get('/benchmarks', requireAuth, async (req, res: Response) => {
  const today   = localDate(new Date())
  const todayYM = today.substring(0, 7)

  let fromStr: string, toStr: string
  if (req.query.from && req.query.to) {
    fromStr = req.query.from as string
    toStr   = req.query.to   as string
  } else {
    const year = parseInt(req.query.year as string || String(new Date().getFullYear()))
    fromStr = `${year}-01`
    toStr   = `${year}-12`
  }

  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)

  const months: string[] = []
  for (let y = fromY; y <= toY; y++) {
    const mStart = y === fromY ? fromM : 1
    const mEnd   = y === toY   ? toM   : 12
    for (let m = mStart; m <= mEnd; m++) {
      const ym = `${y}-${String(m).padStart(2, '0')}`
      if (ym <= todayYM) months.push(ym)
    }
  }
  if (months.length === 0) {
    res.json({ cdi_pct: null, ibov_pct: null, sp500_pct: null, monthly: [] }); return
  }

  type Monthly = { month: string; cdi_cum: number; ibov_cum: number | null; sp500_cum: number | null }
  const monthly: Monthly[] = months.map(m => ({ month: m, cdi_cum: 1, ibov_cum: null, sp500_cum: null }))

  let cdiPct: number | null = null
  try {
    const startDate = new Date(fromY, fromM - 1, 2)
    const endDate   = new Date()
    const capDate   = new Date(toY, toM, 0)
    if (endDate > capDate) { endDate.setFullYear(capDate.getFullYear(), capDate.getMonth(), capDate.getDate()) }
    const rates = await getRates(SERIES.CDI, startDate, endDate)
    const monthMap = new Map<string, number>()
    for (const r of rates) {
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

  async function fetchRangeMonthly(ticker: string) {
    const p1 = `${fromY}-${String(fromM).padStart(2, '0')}-01`
    const p2 = today < `${toY}-${String(toM).padStart(2, '0')}-28` ? today : `${toY}-${String(toM).padStart(2, '0')}-28`
    const rows = await yf.historical(ticker, { period1: p1, period2: p2, interval: '1mo' })
    return rows.map(r => ({
      ym:    localYM(r.date),
      price: r.close ?? r.adjClose ?? 0,
    })).filter(r => r.ym >= fromStr && r.ym <= toStr)
  }

  let ibovPct: number | null = null
  try {
    const pts = await fetchRangeMonthly('^BVSP')
    if (pts.length >= 1) {
      const base = pts[0].price
      for (const entry of monthly) {
        const match = pts.find(p => p.ym === entry.month)
        entry.ibov_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
      }
    }
  } catch { /* sem dados IBOV */ }

  let sp500Pct: number | null = null
  try {
    const pts = await fetchRangeMonthly('^GSPC')
    if (pts.length >= 1) {
      const base = pts[0].price
      for (const entry of monthly) {
        const match = pts.find(p => p.ym === entry.month)
        entry.sp500_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
      }
    }
  } catch { /* sem dados S&P500 */ }

  // Fill forward null gaps
  let lastIbov: number | null = null
  let lastSp500: number | null = null
  for (const entry of monthly) {
    if (entry.ibov_cum  != null) lastIbov  = entry.ibov_cum
    if (entry.sp500_cum != null) lastSp500 = entry.sp500_cum
    if (entry.ibov_cum  == null && lastIbov  != null) entry.ibov_cum  = lastIbov
    if (entry.sp500_cum == null && lastSp500 != null) entry.sp500_cum = lastSp500
  }

  const lastEntry = monthly[monthly.length - 1]
  if (lastEntry.ibov_cum  != null) ibovPct  = Math.round((lastEntry.ibov_cum  - 1) * 10000) / 100
  if (lastEntry.sp500_cum != null) sp500Pct = Math.round((lastEntry.sp500_cum - 1) * 10000) / 100

  res.json({ cdi_pct: cdiPct, ibov_pct: ibovPct, sp500_pct: sp500Pct, monthly })
})

router.get('/inception', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: userAssets } = await supabaseAdmin
    .from('assets').select('id').eq('user_id', userId).eq('active', true)
  const userAssetIds = (userAssets ?? []).map(a => a.id)

  const { data } = await supabaseAdmin
    .from('contributions')
    .select('date')
    .in('asset_id', userAssetIds)
    .order('date', { ascending: true })
    .limit(1)

  const firstDate = (data as Array<{ date: string }> | null)?.[0]?.date
  if (!firstDate) { res.json({ inception: null }); return }
  res.json({ inception: firstDate.substring(0, 7) })
})

router.get('/asset-returns', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || localYM(new Date())
  const toStr   = (req.query.to   as string) || localYM(new Date())

  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)

  const fromDate  = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const toLastDay = new Date(toY, toM, 0).getDate()
  const toDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(toLastDay).padStart(2, '0')}`

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({}); return }
  const assetIds = assets.map(a => a.id)

  const [{ data: startPrices }, { data: endPrices }] = await Promise.all([
    supabaseAdmin.from('price_history').select('asset_id, price')
      .in('asset_id', assetIds).lt('ref_date', fromDate).order('ref_date', { ascending: false }),
    supabaseAdmin.from('price_history').select('asset_id, price')
      .in('asset_id', assetIds).lte('ref_date', toDate).order('ref_date', { ascending: false }),
  ])

  const startMap: Record<number, number> = {}
  for (const p of (startPrices ?? [])) {
    if (!(p.asset_id in startMap)) startMap[p.asset_id] = p.price
  }
  const endMap: Record<number, number> = {}
  for (const p of (endPrices ?? [])) {
    if (!(p.asset_id in endMap)) endMap[p.asset_id] = p.price
  }

  const returns: Record<number, number | null> = {}
  for (const a of assets) {
    const ps = startMap[a.id]
    const pe = endMap[a.id]
    returns[a.id] = (ps != null && pe != null && ps > 0)
      ? Math.round((pe / ps - 1) * 10000) / 100
      : null
  }

  res.json(returns)
})

export default router
