import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getFxRate } from '../_lib/fx.js'
import { getRates, SERIES } from '../_services/bcbService.js'
import { getCurrentPrice, getMonthlyHistory, Asset } from '../_services/priceService.js'
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

// Detects ticker assets with missing price_history for the requested months
// and auto-populates via getMonthlyHistory(). Called before any computation
// so that historical months (e.g. April) use real prices instead of carry-forward.
async function autoSyncHistory(
  assets: Array<{ id: number; asset_type: string; currency: string; ticker_yahoo: string | null; ticker_brapi: string | null; coingecko_id: string | null; fi_principal: number | null; fi_start_date: string | null; fi_type: string | null; fi_rate: number | null; fi_spread: number | null }>,
  neededYMs: string[]  // e.g. ['2026-01', '2026-04']
) {
  if (!assets.length || !neededYMs.length) return
  const uniqueYMs = [...new Set(neededYMs)].sort()
  const assetIds  = assets.map(a => a.id)

  // Query by range to find any stored entry for each needed month (regardless of which day was stored).
  const rangeFrom = uniqueYMs[0] + '-01'
  const rangeTo   = uniqueYMs[uniqueYMs.length - 1] + '-31'
  const { data: existing } = await supabaseAdmin
    .from('price_history')
    .select('asset_id, ref_date')
    .in('asset_id', assetIds)
    .gte('ref_date', rangeFrom)
    .lte('ref_date', rangeTo)

  // Key by asset_id|YYYY-MM so any stored day within the month counts.
  const have = new Set((existing ?? []).map(p => `${p.asset_id}|${(p.ref_date as string).substring(0, 7)}`))
  const toSync = assets.filter(a => uniqueYMs.some(ym => !have.has(`${a.id}|${ym}`)))
  if (!toSync.length) return

  await Promise.allSettled(toSync.map(async a => {
    try {
      const pts = await getMonthlyHistory(a as Asset, 26)
      if (!pts.length) return
      await supabaseAdmin.from('price_history').upsert(
        pts.map(p => ({
          asset_id: a.id,
          ref_date:  p.date,  // use the actual date returned by the API (e.g. '2026-04-30')
          price:     p.price,
          currency:  p.currency,
          source:    'auto',
        })),
        { onConflict: 'asset_id,ref_date' }
      )
    } catch { /* best effort — endpoint still returns data */ }
  }))
}

async function getPortfolioValueAtMonth(
  userId: string,
  year: number,
  month: number   // 1-based
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const ym      = `${year}-${String(month).padStart(2, '0')}`
  const lastDay = new Date(year, month, 0).getDate()
  const dateStr = `${ym}-${String(lastDay).padStart(2, '0')}`
  // Current month or future: allow live-price fallback for assets missing price_history
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

  // Fetch ALL price_history (no date filter) to enable carry-backward for assets
  // that have no history before the query date (e.g. crypto added recently)
  const { data: prices } = await supabaseAdmin
    .from('price_history')
    .select('asset_id, price, currency, ref_date')
    .in('asset_id', assetIds)
    .order('ref_date', { ascending: true }) // oldest first for carry-backward

  const phByAsset: Record<number, Array<{ price: number; currency: string; ref_date: string }>> = {}
  for (const p of (prices ?? [])) {
    if (!phByAsset[p.asset_id]) phByAsset[p.asset_id] = []
    phByAsset[p.asset_id].push(p)
  }

  // Best price: most recent <= dateStr, else oldest available (carry-backward from future)
  const priceMap: Record<number, { price: number; currency: string; ref_date: string }> = {}
  for (const id of assetIds) {
    const entries = phByAsset[id] ?? []
    if (!entries.length) continue
    let best = entries[0]
    for (const e of entries) {
      if (e.ref_date <= dateStr) best = e
    }
    priceMap[id] = { price: best.price, currency: best.currency, ref_date: best.ref_date }
  }

  // Manual assets: carry-backward from manual_values
  const manualIds = assets.filter((a) => a.asset_type === 'manual').map((a) => a.id)
  const manualMap: Record<number, { value: number; currency: string }> = {}
  if (manualIds.length > 0) {
    const { data: allMV } = await supabaseAdmin
      .from('manual_values')
      .select('asset_id, value, currency, ref_date')
      .in('asset_id', manualIds)
      .order('ref_date', { ascending: true })

    const mvByAsset: Record<number, Array<{ value: number; currency: string; ref_date: string }>> = {}
    for (const mv of (allMV ?? [])) {
      if (!mvByAsset[mv.asset_id]) mvByAsset[mv.asset_id] = []
      mvByAsset[mv.asset_id].push({ value: mv.value, currency: mv.currency, ref_date: mv.ref_date })
    }

    for (const id of manualIds) {
      const entries = mvByAsset[id] ?? []
      if (!entries.length) continue
      let best = entries[0]
      for (const e of entries) {
        if (e.ref_date <= dateStr) best = e
      }
      manualMap[id] = { value: best.value, currency: best.currency }
    }
  }

  const detail: Array<{ asset_id: number; value: number }> = []
  let total = 0

  for (const a of assets) {
    let value = 0
    try {
      if (a.asset_type === 'manual') {
        const mv = manualMap[a.id]
        if (mv) {
          const fx = await getFxRate(mv.currency)
          value = mv.value * fx
        }
      } else if (a.asset_type === 'fixed_income') {
        try {
          const result = await getCurrentPrice({
            ...a,
            ticker_brapi: null, ticker_yahoo: null, coingecko_id: null,
          } as Asset)
          value = result.price
        } catch { value = 0 }
      } else {
        const holdings = holdingsMap[a.id] ?? 0
        if (holdings > 0) {
          const ph = priceMap[a.id]
          // For current month: use live price when history is absent or stale (from a previous month)
          const phStale = ph && isCurrentOrFuture && ph.ref_date.substring(0, 7) < ym
          if (ph && !phStale) {
            const fx = await getFxRate(ph.currency)
            value = holdings * ph.price * fx
          } else if (isCurrentOrFuture) {
            try {
              const result = await getCurrentPrice(a as Asset)
              const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
              value = holdings * result.price * fx
            } catch {
              // Last resort: use stale history if live price fails
              if (ph) {
                const fx = await getFxRate(ph.currency)
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

  if (fromY > toY || (fromY === toY && fromM > toM)) {
    res.status(400).json({ error: '"from" deve ser anterior a "to"' }); return
  }

  // v_ini = valor ao fim do mês ANTERIOR a from (= início real do período)
  // Isso evita contar aportes de from no denominador errado
  const prevM = fromM === 1 ? 12 : fromM - 1
  const prevY = fromM === 1 ? fromY - 1 : fromY

  const fromDateStr = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const toLastDay   = new Date(toY, toM, 0).getDate()
  const toDateStr   = `${toY}-${String(toM).padStart(2, '0')}-${toLastDay}`

  const { data: tickerAssetsSync } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, ticker_yahoo, ticker_brapi, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'ticker')
  if (tickerAssetsSync?.length) {
    const prevYM = `${prevY}-${String(prevM).padStart(2, '0')}`
    await autoSyncHistory(tickerAssetsSync, [prevYM, toStr])
  }

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
    if (c.type === 'income') return s  // income is portfolio return, not a cash flow
    const v = estimateContribValue(c as Parameters<typeof estimateContribValue>[0])
    return s + (c.type === 'buy' ? v : -v)
  }, 0)

  const [start, end] = await Promise.all([
    getPortfolioValueAtMonth(userId, prevY, prevM),
    getPortfolioValueAtMonth(userId, toY,   toM),
  ])

  const v_ini = start.total
  const v_fim = end.total

  // Simple Dietz: R = (V_fim - V_ini - CF) / (V_ini + 0.5 * CF)
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

  const rangeFromDate = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const rangeToLastDay = new Date(toY, toM, 0).getDate()
  const rangeToDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(rangeToLastDay).padStart(2, '0')}`

  const { data: userAssets2 } = await supabaseAdmin
    .from('assets').select('id').eq('user_id', userId).eq('active', true)
  const userAssetIds2 = (userAssets2 ?? []).map(a => a.id)

  // Auto-populate price_history for months missing data (fixes carry-forward bug)
  const { data: tickerAssetsForSync } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, ticker_yahoo, ticker_brapi, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'ticker')
  if (tickerAssetsForSync?.length) {
    await autoSyncHistory(tickerAssetsForSync, months.map(m => m.label))
  }

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
    if (c.type === 'income') continue  // income is portfolio return, not a cash flow
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

router.get('/debug-manual', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const ym = (req.query.ym as string) || localYM(new Date())
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const dateStr = `${ym}-${String(lastDay).padStart(2, '0')}`

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, asset_type, fi_principal, fi_start_date, fi_type, fi_rate')
    .eq('user_id', userId)
    .eq('active', true)

  const manualAssets = (assets ?? []).filter((a) => a.asset_type === 'manual')
  const fiAssets     = (assets ?? []).filter((a) => a.asset_type === 'fixed_income')
  const manualIds    = manualAssets.map((a) => a.id)

  let manualValues: unknown[] = []
  if (manualIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('manual_values')
      .select('asset_id, value, currency, ref_date')
      .in('asset_id', manualIds)
      .order('ref_date', { ascending: true })
    manualValues = data ?? []
  }

  // Simulate carry-backward for the requested ym
  const mvByAsset: Record<number, Array<{ value: number; currency: string; ref_date: string }>> = {}
  for (const mv of manualValues as Array<{ asset_id: number; value: number; currency: string; ref_date: string }>) {
    if (!mvByAsset[mv.asset_id]) mvByAsset[mv.asset_id] = []
    mvByAsset[mv.asset_id].push(mv)
  }
  const resolved: Record<string, unknown> = {}
  for (const a of manualAssets) {
    const entries = mvByAsset[a.id] ?? []
    if (!entries.length) { resolved[a.code] = null; continue }
    let best = entries[0]
    for (const e of entries) { if (e.ref_date <= dateStr) best = e }
    resolved[a.code] = { value: best.value, currency: best.currency, ref_date: best.ref_date }
  }

  res.json({
    requested_ym:   ym,
    date_str:       dateStr,
    manual_assets:  manualAssets.map((a) => ({ id: a.id, code: a.code })),
    fi_assets:      fiAssets.map((a) => ({ id: a.id, code: a.code, fi_principal: a.fi_principal, fi_start_date: a.fi_start_date, fi_type: a.fi_type })),
    manual_values_count: manualValues.length,
    manual_values:  manualValues,
    resolved_values: resolved,
  })
})

router.get('/asset-returns', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || localYM(new Date())
  const toStr   = (req.query.to   as string) || localYM(new Date())

  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)

  const currentYM       = localYM(new Date())
  const isCurrentPeriod = toStr >= currentYM

  const fromDate  = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const toLastDay = new Date(toY, toM, 0).getDate()
  const toDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(toLastDay).padStart(2, '0')}`

  // Fetch assets with pricing fields for live-price fallback
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({}); return }
  const assetIds = assets.map(a => a.id)

  // Auto-sync: find assets with no price_history in the requested range, fetch and store
  await autoSyncHistory(assets, [fromStr, toStr])

  // Fetch all history in one query for both start and oldest lookups
  const [{ data: endPricesRaw }, { data: allHistory }] = await Promise.all([
    supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
      .in('asset_id', assetIds).lte('ref_date', toDate).order('ref_date', { ascending: false }),
    supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
      .in('asset_id', assetIds).order('ref_date', { ascending: true }),
  ])

  // Most recent price strictly before fromDate (start of period), and oldest price per asset
  const startMap:  Record<number, number> = {}
  const oldestMap: Record<number, number> = {}
  for (const p of (allHistory ?? [])) {
    if (!(p.asset_id in oldestMap)) oldestMap[p.asset_id] = p.price   // first = oldest (asc order)
    if (p.ref_date < fromDate) startMap[p.asset_id] = p.price         // keep overwriting = most recent before fromDate
  }

  // Most recent end price with its date (for staleness check)
  const endMap: Record<number, { price: number; ref_date: string }> = {}
  for (const p of (endPricesRaw ?? [])) {
    if (!(p.asset_id in endMap)) endMap[p.asset_id] = { price: p.price, ref_date: p.ref_date }
  }

  // For current period: supplement stale or missing end prices with live price
  if (isCurrentPeriod) {
    await Promise.all(assets.map(async (a) => {
      const entry = endMap[a.id]
      if (!entry || entry.ref_date.substring(0, 7) < currentYM) {
        try {
          const result = await getCurrentPrice(a as Asset)
          endMap[a.id] = { price: result.price, ref_date: currentYM + '-01' }
        } catch { /* keep stale or absent */ }
      }
    }))
  }

  const returns: Record<number, number | null> = {}
  for (const a of assets) {
    const ps = startMap[a.id] ?? oldestMap[a.id]   // carry-backward: oldest if no pre-period price
    const pe = endMap[a.id]?.price
    returns[a.id] = (ps != null && pe != null && ps > 0 && ps !== pe)
      ? Math.round((pe / ps - 1) * 10000) / 100
      : (ps != null && pe != null && ps === pe) ? 0
      : null
  }

  res.json(returns)
})

export default router
