// Builds the rich Phase-2 portfolio snapshot for shared reports.
// Mirrors backend/src/routes/portfolio.ts buildPortfolioSnapshot + performance helpers.
import { supabaseAdmin } from '../lib/supabase.js'
import { getFxRate } from '../lib/fx.js'
import { cache, TTL } from '../lib/cache.js'
import { getCurrentPrice, Asset, FITranche } from './priceService.js'
import { getAssetSector, getYf } from './yahooService.js'
import { getRates, SERIES, getCDIRates, getSelicRates, getIPCARates } from './bcbService.js'
import {
  localDate, localYM, ValPoint, interpolateKnownPoints,
  PrefetchedData, fetchPrefetchedData, prefetchFIRates,
  estimateContribValue, computePortfolioValueAtMonth,
} from '../routes/performance.js'


// ─── Snapshot types ───────────────────────────────────────────────────────────

export interface SnapshotAsset {
  id: number; code: string; name: string
  value: number; pct: number
  class_name: string; class_name_key: string | null; class_color: string
  exchange: string | null; currency: string
  return_pct: number | null
}

export interface SnapshotGroupValue {
  key: string; label: string; value: number; pct: number
}

export interface SnapshotClassValue {
  key: string; name: string; name_key: string | null; color: string
  value: number; pct: number; target_pct: number | null
}

export interface SnapshotPerformance {
  from: string; to: string
  value_start: number; value_end: number
  contributions: number
  return_abs: number; return_pct: number | null
}

export interface SnapshotBenchmarks {
  period: { portfolio_pct: number | null; cdi_pct: number | null; ibov_pct: number | null; sp500_pct: number | null }
  since_inception: { portfolio_pct: number | null; cdi_pct: number | null; ibov_pct: number | null; sp500_pct: number | null }
  monthly: Array<{ month: string; portfolio_cum: number | null; cdi_cum: number | null; ibov_cum: number | null; sp500_cum: number | null }>
}

export interface SnapshotMonthlyPoint {
  month: string; total: number; contributions_cumulative: number
}

export interface SnapshotDiversification {
  hhi_asset: number; hhi_asset_normalized: number
  hhi_geography: number; hhi_geography_normalized: number
  hhi_sector: number; hhi_sector_normalized: number
  effective_n: number; top5_pct: number; n_positions: number
}

export interface SnapshotDividends {
  total_12m: number
  by_month: Array<{ month: string; total: number }>
  top_payers: Array<{ asset_id: number; code: string; name: string; total: number }>
  yield_pct: number | null
}

export interface PortfolioSnapshot {
  generated_at: string; display_currency: string
  period: 'inception' | '12m' | 'ytd'; period_from: string | null; period_to: string; inception: string | null
  total: number; invested: number; asset_count: number; class_count: number
  performance: SnapshotPerformance | null; inception_performance: SnapshotPerformance | null
  monthly: SnapshotMonthlyPoint[]; benchmarks: SnapshotBenchmarks | null
  by_class: SnapshotClassValue[]; by_geography: SnapshotGroupValue[]
  by_sector: SnapshotGroupValue[]; by_currency: SnapshotGroupValue[]
  diversification: SnapshotDiversification
  top_assets: SnapshotAsset[]; top_gainers: SnapshotAsset[]; top_losers: SnapshotAsset[]
  dividends: SnapshotDividends
}

interface ByAssetValue {
  id: number; code: string; name: string
  value_brl: number; currency: string
  class_name: string; class_name_key: string | null; class_color: string
  exchange: string | null; source: string; invested_brl: number | null
}

// ─── computePortfolioValue (current prices) ───────────────────────────────────

export async function computePortfolioValue(userId: string) {
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('assets')
    .select(`id, code, name, asset_type, currency, exchange,
      ticker_brapi, ticker_yahoo, coingecko_id,
      fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, fi_maturity,
      asset_classes ( id, name, color, name_key )`)
    .eq('user_id', userId).eq('active', true)

  if (assetsErr) throw new Error(assetsErr.message)
  if (!assets?.length) return { total_brl: 0, by_class: [], by_asset: [] }

  const assetIds = assets.map(a => a.id)
  const { data: contributions } = await supabaseAdmin
    .from('contributions').select('asset_id, type, quantity, date, value_brl')
    .in('asset_id', assetIds).order('date', { ascending: true })

  const holdingsMap: Record<number, number> = {}
  const investedMap: Record<number, number> = {}
  const rfAssetIds = assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id)
  const rfTranchesMap: Record<number, FITranche[]> = {}

  for (const c of (contributions ?? [])) {
    if (c.type === 'income') continue
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) + (c.type === 'buy' ? c.quantity : -c.quantity)
    if (c.value_brl && c.value_brl > 0) {
      if (c.type === 'buy') investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + c.value_brl
      if (rfAssetIds.includes(c.asset_id)) {
        if (!rfTranchesMap[c.asset_id]) rfTranchesMap[c.asset_id] = []
        if (c.type === 'buy') rfTranchesMap[c.asset_id].push({ principal: c.value_brl, start_date: c.date })
        else if (c.type === 'sell') rfTranchesMap[c.asset_id].push({ principal: -c.value_brl, start_date: c.date })
      }
    }
  }

  const manualMap: Record<number, { value: number; currency: string; last_date: string }> = {}
  const oldestManualMap: Record<number, { value: number; currency: string; ref_date: string }> = {}
  if (assetIds.length > 0) {
    const { data: manualValues } = await supabaseAdmin
      .from('manual_values').select('asset_id, value, currency, ref_date')
      .in('asset_id', assetIds).order('ref_date', { ascending: false })
    const seen = new Set<number>()
    for (const mv of (manualValues ?? [])) {
      if (!seen.has(mv.asset_id)) {
        manualMap[mv.asset_id] = { value: mv.value, currency: mv.currency, last_date: mv.ref_date }
        seen.add(mv.asset_id)
      }
      oldestManualMap[mv.asset_id] = { value: mv.value, currency: mv.currency, ref_date: mv.ref_date }
    }
  }

  await Promise.all(
    assets.filter(a => a.asset_type === 'manual').map(async (a) => {
      const oldest = oldestManualMap[a.id]
      if (!oldest) return
      const fxRate = oldest.currency === 'BRL' ? 1 : await getFxRate(oldest.currency)
      const oldestBrl = oldest.value * fxRate
      const extraContribs = (contributions ?? [])
        .filter(c => c.asset_id === a.id && c.type === 'buy' && c.value_brl && c.value_brl > 0 && c.date > oldest.ref_date)
        .reduce((s, c) => s + (c.value_brl as number), 0)
      investedMap[a.id] = Math.round((oldestBrl + extraContribs) * 100) / 100
    })
  )

  const byAsset: ByAssetValue[] = []
  await Promise.allSettled(assets.map(async (a) => {
    const cls = (a.asset_classes as unknown as { id: number; name: string; color: string; name_key?: string | null } | null)
    const base = {
      id: a.id, code: a.code, name: a.name,
      class_name: cls?.name ?? 'Sem classe', class_name_key: cls?.name_key ?? null,
      class_color: cls?.color ?? '#6B7280', exchange: (a.exchange as string | null) ?? null,
    }
    try {
      let value_brl = 0, currency = a.currency || 'BRL', source = ''

      if (a.asset_type === 'manual') {
        const mv = manualMap[a.id]
        if (!mv) return
        currency = mv.currency; source = 'manual'
        value_brl = currency === 'BRL' ? mv.value : mv.value * await getFxRate(currency)

      } else if (a.asset_type === 'fixed_income') {
        const tranches = rfTranchesMap[a.id]
        const hasTranches = tranches && tranches.length > 0
        if (!a.fi_type || (a.fi_type !== 'ipca_plus' && a.fi_rate == null) ||
            (!hasTranches && (!a.fi_principal || !a.fi_start_date))) return
        let value_orig: number
        try {
          const result = await getCurrentPrice(a as Asset, hasTranches ? tranches : undefined)
          currency = result.currency; source = result.source
          value_orig = result.price
        } catch (err) {
          // Mesmo fallback do computePortfolioValue em routes/portfolio.ts: uma falha
          // na fonte (BCB fora do ar, série do dia ainda não publicada) não pode fazer
          // o ativo sumir do snapshot — usa o principal sem os juros do período.
          console.warn(`[snapshot] getCurrentPrice falhou pra ${a.code} (renda fixa), usando principal como fallback:`, err)
          currency = a.currency || 'BRL'; source = 'fixed_income_fallback'
          value_orig = hasTranches ? tranches.reduce((s, t) => s + t.principal, 0) : Number(a.fi_principal)
        }
        value_brl = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)

      } else {
        const holdings = holdingsMap[a.id] ?? 0
        if (holdings <= 0) return
        try {
          const result = await getCurrentPrice(a as Asset)
          currency = result.currency; source = result.source
          value_brl = currency === 'BRL' ? holdings * result.price : holdings * result.price * await getFxRate(currency)
        } catch {
          const mv = manualMap[a.id]
          if (mv) {
            currency = mv.currency; source = 'manual'
            value_brl = currency === 'BRL' ? mv.value : mv.value * await getFxRate(currency)
          } else {
            const { data: lastPh } = await supabaseAdmin.from('price_history')
              .select('price, currency').eq('asset_id', a.id)
              .order('ref_date', { ascending: false }).limit(1).single()
            if (lastPh) {
              currency = lastPh.currency; source = 'stale'
              value_brl = currency === 'BRL' ? holdings * lastPh.price : holdings * lastPh.price * await getFxRate(currency)
            } else return
          }
        }
      }

      if (value_brl > 0) byAsset.push({
        ...base, value_brl: Math.round(value_brl * 100) / 100, currency, source,
        invested_brl: investedMap[a.id] != null ? Math.round(investedMap[a.id] * 100) / 100 : null,
      })
    } catch { /* skip asset */ }
  }))

  const classMap: Record<string, { name: string; name_key: string | null; color: string; value_brl: number }> = {}
  for (const a of byAsset) {
    if (!classMap[a.class_name]) classMap[a.class_name] = { name: a.class_name, name_key: a.class_name_key, color: a.class_color, value_brl: 0 }
    classMap[a.class_name].value_brl += a.value_brl
  }
  const total_brl = byAsset.reduce((s, a) => s + a.value_brl, 0)
  const by_class = Object.values(classMap)
    .map(c => ({ ...c, pct: total_brl > 0 ? (c.value_brl / total_brl) * 100 : 0 }))
    .sort((a, b) => b.value_brl - a.value_brl)

  return { total_brl: Math.round(total_brl * 100) / 100, by_class, by_asset: byAsset.sort((a, b) => b.value_brl - a.value_brl) }
}

// ─── computeInception ─────────────────────────────────────────────────────────

export async function computeInception(userId: string): Promise<string | null> {
  const { data: userAssets } = await supabaseAdmin.from('assets').select('id').eq('user_id', userId).eq('active', true)
  const ids = (userAssets ?? []).map(a => a.id)
  const { data } = await supabaseAdmin.from('contributions').select('date')
    .in('asset_id', ids).order('date', { ascending: true }).limit(1)
  const first = (data as Array<{ date: string }> | null)?.[0]?.date
  return first ? first.substring(0, 7) : null
}

// ─── computePerformanceSummary ────────────────────────────────────────────────

interface PerformanceSummary {
  from: string; to: string
  value_start: number; value_end: number
  contributions: number; return_abs: number; return_pct: number | null
}

export async function computePerformanceSummary(
  userId: string, fromStr: string, toStr: string, prefetched?: PrefetchedData
): Promise<PerformanceSummary> {
  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)
  const prevM = fromM === 1 ? 12 : fromM - 1
  const prevY = fromM === 1 ? fromY - 1 : fromY
  const fromDateStr = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const toLastDay   = new Date(toY, toM, 0).getDate()
  const toDateStr   = `${toY}-${String(toM).padStart(2, '0')}-${toLastDay}`
  const currentYM   = localYM(new Date())
  const clampedToStr = toStr > currentYM ? currentYM : toStr
  const [clampedToY, clampedToM] = clampedToStr.split('-').map(Number)

  const data = prefetched ?? await fetchPrefetchedData(userId)
  if (!prefetched) await prefetchFIRates(data)

  const totalContribs = data.contributions
    .filter(c => c.date >= fromDateStr && c.date <= toDateStr)
    .reduce((s, c) => {
      if (c.type === 'income') return s
      const v = estimateContribValue(c)
      return s + (c.type === 'buy' ? v : -v)
    }, 0)

  const [start, end] = await Promise.all([
    computePortfolioValueAtMonth(data, prevY, prevM),
    computePortfolioValueAtMonth(data, clampedToY, clampedToM),
  ])
  const return_abs = end.total - start.total - totalContribs
  const dietz_base = start.total + 0.5 * totalContribs
  const return_pct = dietz_base > 0 ? (return_abs / dietz_base) * 100 : null

  return {
    from: fromStr, to: toStr,
    value_start: start.total, value_end: end.total,
    contributions: Math.round(totalContribs * 100) / 100,
    return_abs: Math.round(return_abs * 100) / 100,
    return_pct: return_pct !== null ? Math.round(return_pct * 100) / 100 : null,
  }
}

// ─── computeMonthlySeries ─────────────────────────────────────────────────────

interface MonthlyPoint {
  month: string; total: number; prev_total: number
  contributions: number; contributions_cumulative: number
}

export async function computeMonthlySeries(
  userId: string, fromStr: string, toStr: string, prefetched?: PrefetchedData
): Promise<{ monthly: MonthlyPoint[] }> {
  const currentYM = localYM(new Date())
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

  const rangeToLastDay = new Date(toY, toM, 0).getDate()
  const rangeToDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(rangeToLastDay).padStart(2, '0')}`
  const prevM = fromM === 1 ? 12 : fromM - 1
  const prevY = fromM === 1 ? fromY - 1 : fromY

  const data = prefetched ?? await fetchPrefetchedData(userId)
  if (!prefetched) await prefetchFIRates(data)

  const [prevMonthResult, valuesArr] = await Promise.all([
    computePortfolioValueAtMonth(data, prevY, prevM),
    Promise.all(months.map(async ({ year: y, month: m, label }) => {
      const { total } = await computePortfolioValueAtMonth(data, y, m)
      return { month: label, total }
    })),
  ])

  const filteredContribs = data.contributions.filter(c => c.date <= rangeToDate)
  const contribsByMonth: Record<string, number> = {}
  for (const c of filteredContribs) {
    if (c.type === 'income') continue
    const ym = c.date.substring(0, 7)
    const vBrl = Number(c.value_brl) > 0 ? Number(c.value_brl)
      : (Number(c.price_orig) > 0 && Number(c.quantity) > 0
        ? Number(c.price_orig) * Number(c.quantity) * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
        : 0)
    contribsByMonth[ym] = (contribsByMonth[ym] ?? 0) + (c.type === 'buy' ? vBrl : -vBrl)
  }

  const sortedContribMonths = Object.keys(contribsByMonth).sort()
  let cumulContrib = 0, contribIdx = 0

  const monthly: MonthlyPoint[] = valuesArr.map((v, i) => {
    while (contribIdx < sortedContribMonths.length && sortedContribMonths[contribIdx] <= v.month) {
      cumulContrib += contribsByMonth[sortedContribMonths[contribIdx]]
      contribIdx++
    }
    return {
      month: v.month, total: v.total,
      prev_total: i > 0 ? valuesArr[i - 1].total : prevMonthResult.total,
      contributions: contribsByMonth[v.month] ?? 0,
      contributions_cumulative: Math.round(cumulContrib * 100) / 100,
    }
  })

  return { monthly }
}

// ─── computeBenchmarks ────────────────────────────────────────────────────────

interface BenchmarksResult {
  cdi_pct: number | null; ibov_pct: number | null; sp500_pct: number | null
  monthly: Array<{ month: string; cdi_cum: number | null; ibov_cum: number | null; sp500_cum: number | null }>
}

export async function computeBenchmarks(fromStr: string, toStr: string): Promise<BenchmarksResult> {
  const today   = localDate(new Date())
  const todayYM = today.substring(0, 7)
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
  if (months.length === 0) return { cdi_pct: null, ibov_pct: null, sp500_pct: null, monthly: [] }

  type Monthly = { month: string; cdi_cum: number | null; ibov_cum: number | null; sp500_cum: number | null }
  const monthly: Monthly[] = months.map(m => ({ month: m, cdi_cum: null, ibov_cum: null, sp500_cum: null }))

  let cdiPct: number | null = null
  try {
    const startDate = new Date(fromY, fromM - 1, 2)
    const endDate   = new Date()
    const capDate   = new Date(toY, toM, 0)
    if (endDate > capDate) endDate.setFullYear(capDate.getFullYear(), capDate.getMonth(), capDate.getDate())
    const rates = await getRates(SERIES.CDI, startDate, endDate)
    const monthMap = new Map<string, number>()
    for (const r of rates) {
      const m = localYM(r.date)
      monthMap.set(m, (monthMap.get(m) ?? 1) * (1 + r.value / 100))
    }
    let cum = 1
    for (const entry of monthly) { cum *= (monthMap.get(entry.month) ?? 1); entry.cdi_cum = Math.round(cum * 10000) / 10000 }
    cdiPct = Math.round((cum - 1) * 10000) / 100
  } catch { /* sem CDI */ }

  async function fetchRangeMonthly(ticker: string) {
    const p1 = `${fromY}-${String(fromM).padStart(2, '0')}-01`
    const p2 = today < `${toY}-${String(toM).padStart(2, '0')}-28` ? today : `${toY}-${String(toM).padStart(2, '0')}-28`
    const rows = await cache.getOrFetch(
      `benchmark:monthly:${ticker}:${p1}:${p2}`, TTL.PRICE_HISTORICAL,
      async () => (await getYf()).historical(ticker, { period1: p1, period2: p2, interval: '1mo' }),
    )
    const pts = rows.map((r: { date: Date; close?: number; adjClose?: number }) => ({
      ym: localYM(r.date), price: r.close ?? r.adjClose ?? 0,
    })).filter((r: { ym: string }) => r.ym >= fromStr && r.ym <= toStr)

    if (todayYM <= toStr) {
      try {
        const d2ago = localDate(new Date(Date.now() - 2 * 86400000))
        const daily = await cache.getOrFetch(
          `benchmark:daily:${ticker}:${d2ago}:${today}`, TTL.PRICE_CURRENT,
          async () => (await getYf()).historical(ticker, { period1: d2ago, period2: today, interval: '1d' }),
        )
        if (daily.length > 0) {
          const latestClose = daily[daily.length - 1].close ?? daily[daily.length - 1].adjClose
          if (latestClose) {
            const idx = pts.findIndex((p: { ym: string }) => p.ym === todayYM)
            if (idx >= 0) pts[idx].price = latestClose
            else pts.push({ ym: todayYM, price: latestClose })
          }
        }
      } catch { /* fall back to monthly bar */ }
    }
    return pts
  }

  const [ibovPts, sp500Pts] = await Promise.all([
    fetchRangeMonthly('^BVSP').catch(() => []),
    fetchRangeMonthly('^GSPC').catch(() => []),
  ])

  let ibovPct: number | null = null, sp500Pct: number | null = null

  if (ibovPts.length >= 1) {
    const base = ibovPts[0].price
    for (const entry of monthly) {
      const match = ibovPts.find((p: { ym: string }) => p.ym === entry.month)
      entry.ibov_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
    }
  }
  if (sp500Pts.length >= 1) {
    const base = sp500Pts[0].price
    for (const entry of monthly) {
      const match = sp500Pts.find((p: { ym: string }) => p.ym === entry.month)
      entry.sp500_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
    }
  }

  let lastIbov: number | null = null, lastSp500: number | null = null
  for (const entry of monthly) {
    if (entry.ibov_cum  != null) lastIbov  = entry.ibov_cum
    if (entry.sp500_cum != null) lastSp500 = entry.sp500_cum
    if (entry.ibov_cum  == null && lastIbov  != null) entry.ibov_cum  = lastIbov
    if (entry.sp500_cum == null && lastSp500 != null) entry.sp500_cum = lastSp500
  }
  const lastEntry = monthly[monthly.length - 1]
  if (lastEntry.ibov_cum  != null) ibovPct  = Math.round((lastEntry.ibov_cum  - 1) * 10000) / 100
  if (lastEntry.sp500_cum != null) sp500Pct = Math.round((lastEntry.sp500_cum - 1) * 10000) / 100

  return { cdi_pct: cdiPct, ibov_pct: ibovPct, sp500_pct: sp500Pct, monthly }
}

// ─── computeAssetReturns ──────────────────────────────────────────────────────

export async function computeAssetReturns(userId: string, fromStr: string, toStr: string): Promise<Record<number, number | null>> {
  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)
  const currentYM       = localYM(new Date())
  const isCurrentPeriod = toStr >= currentYM
  const fromDate  = `${fromY}-${String(fromM).padStart(2, '0')}-01`
  const toLastDay = new Date(toY, toM, 0).getDate()
  const toDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(toLastDay).padStart(2, '0')}`

  const { data: assets } = await supabaseAdmin.from('assets')
    .select('id, asset_type, currency, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId).eq('active', true).in('asset_type', ['ticker'])

  if (!assets?.length) return {}

  const tickerAssets = assets
  const tickerIds    = tickerAssets.map(a => a.id)
  const returns: Record<number, number | null> = {}

  if (tickerIds.length > 0) {
    const [{ data: endPricesRaw }, { data: preFromPrices }] = await Promise.all([
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).lte('ref_date', toDate).order('ref_date', { ascending: false }).limit(1000),
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).lt('ref_date', fromDate).order('ref_date', { ascending: false }).limit(1000),
    ])

    const startMap: Record<number, number> = {}
    for (const p of (preFromPrices ?? [])) if (!(p.asset_id in startMap)) startMap[p.asset_id] = p.price

    const endMap: Record<number, { price: number; ref_date: string }> = {}
    for (const p of (endPricesRaw ?? [])) if (!(p.asset_id in endMap)) endMap[p.asset_id] = { price: p.price, ref_date: p.ref_date }

    if (isCurrentPeriod) {
      await Promise.all(tickerAssets.map(async (a) => {
        const entry = endMap[a.id]
        if (!entry || entry.ref_date.substring(0, 7) < currentYM) {
          try {
            const result = await getCurrentPrice(a as Asset)
            endMap[a.id] = { price: result.price, ref_date: currentYM + '-01' }
          } catch { /* keep stale */ }
        }
      }))
    }

    for (const a of tickerAssets) {
      const ps = startMap[a.id]  // only use price before inception; no oldestMap fallback to avoid inflated returns
      const pe = endMap[a.id]?.price
      returns[a.id] = (ps != null && pe != null && ps > 0 && ps !== pe)
        ? Math.round((pe / ps - 1) * 10000) / 100
        : (ps != null && pe != null && ps === pe) ? 0 : null
    }
  }

  return returns
}

// ─── computeDividendsSummary ──────────────────────────────────────────────────

export async function computeDividendsSummary(userId: string, from?: string, to?: string) {
  const { data: assets } = await supabaseAdmin.from('assets')
    .select('id, code, name, currency').eq('user_id', userId).eq('active', true)
  const assetIds = (assets ?? []).map(a => a.id as number)
  if (!assetIds.length) return { total_brl: 0, by_asset: [], by_month: [] }

  let q = supabaseAdmin.from('dividends')
    .select('asset_id, ex_date, amount_brl')
    .in('asset_id', assetIds).eq('user_id', userId)
  if (from) q = q.gte('ex_date', from)
  if (to)   q = q.lte('ex_date', to)
  const { data } = await q

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

  return { total_brl: Math.round(total_brl * 100) / 100, by_asset, by_month }
}

// ─── getSectorMap ─────────────────────────────────────────────────────────────

const YAHOO_SECTOR_MAP: Record<string, string> = {
  'Financial Services': 'Financeiro', Financial: 'Financeiro', Energy: 'Energia',
  'Basic Materials': 'Materiais Básicos', 'Consumer Cyclical': 'Consumo Cíclico',
  'Consumer Defensive': 'Consumo Essencial', Industrials: 'Industrial',
  Technology: 'Tecnologia', Healthcare: 'Saúde', 'Real Estate': 'Imóveis',
  Utilities: 'Utilidades Públicas', 'Communication Services': 'Telecom', Communications: 'Telecom',
}

function mapSectorPt(sector: string | null, classNameKey?: string | null): string | null {
  if (sector && sector.length > 0) return YAHOO_SECTOR_MAP[sector] ?? sector
  const k = (classNameKey ?? '').toLowerCase()
  if (k.includes('caixa') || k.includes('cash')) return 'Caixa'
  if (k.includes('rendafixa') || k.includes('previdencia')) return 'Renda Fixa'
  if (k.includes('fii') || k.includes('imoveis') || k.includes('imóveis')) return 'Imóveis'
  if (k.includes('cripto') || k.includes('crypto')) return 'Cripto'
  if (k.includes('acoes') || k.includes('ações') || k.includes('equit')) return 'Ações'
  if (k.includes('etf')) return 'ETF'
  return null
}

export async function getSectorMap(userId: string): Promise<Record<string, string | null>> {
  const cacheKey = `portfolio:sectors:${userId}`
  const cached = cache.get<Record<string, string | null>>(cacheKey)
  if (cached) return cached

  const { data: assets } = await supabaseAdmin.from('assets')
    .select('id, code, asset_type, ticker_brapi, ticker_yahoo, coingecko_id, asset_classes(name_key)')
    .eq('user_id', userId).eq('active', true)

  const sectors: Record<string, string | null> = {}
  await Promise.allSettled((assets ?? []).map(async (a) => {
    const classKey = (a.asset_classes as { name_key?: string } | null)?.name_key ?? null
    if (a.asset_type === 'fixed_income') { sectors[a.code] = 'Renda Fixa'; return }
    if (a.coingecko_id) { sectors[a.code] = 'Cripto'; return }
    const yahooTicker = (a.ticker_yahoo as string | null) ?? (a.ticker_brapi ? `${a.ticker_brapi}.SA` : null)
    if (yahooTicker) {
      const raw = await getAssetSector(yahooTicker)
      sectors[a.code] = mapSectorPt(raw, classKey)
    } else {
      sectors[a.code] = mapSectorPt(null, classKey)
    }
  }))

  cache.set(cacheKey, sectors, 24 * 60 * 60 * 1000)
  return sectors
}

// ─── buildPortfolioSnapshot ───────────────────────────────────────────────────

function calcHHI(shares: number[]): number { return shares.reduce((s, x) => s + x * x, 0) }

function normalizeHHI(hhi: number, n: number): number {
  if (n <= 1) return 0
  const min = 1 / n
  return (hhi - min) / (1 - min)
}

function getCountryKey(asset: ByAssetValue): string {
  const exch = (asset.exchange ?? '').toUpperCase()
  if (asset.source === 'fixed_income') return 'BR'
  if (['BVMF', 'B3', 'BOVESPA', 'SAO'].some(e => exch.startsWith(e))) return 'BR'
  if (['NYSE', 'NASDAQ', 'AMEX', 'NYSEARCA', 'NYQ', 'NMS', 'PCX', 'NGM', 'BATS', 'CBOE'].includes(exch)) return 'US'
  if (['XPAR', 'XETR', 'XLON', 'LSE', 'EURONEXT', 'XAMS', 'XBRU', 'XMIL', 'XMAD', 'AMS', 'FRA', 'EPA'].includes(exch)) return 'EU'
  if (asset.source === 'coingecko') return 'CRYPTO'
  if (asset.currency === 'BRL') return 'BR'
  if (asset.currency === 'USD') return 'US'
  if (asset.currency === 'EUR') return 'EU'
  return 'OTHER'
}

function sectorKey(sector: string | null): string {
  const s = sector ?? 'Outros'
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '')
}

function periodFromFor(period: 'inception' | '12m' | 'ytd', inception: string | null, toStr: string): string | null {
  if (period === 'inception') return inception
  const [toY, toM] = toStr.split('-').map(Number)
  if (period === 'ytd') return `${toY}-01`
  let y = toY, m = toM - 11
  if (m <= 0) { m += 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}

function aggregateByKey(
  byAsset: ByAssetValue[], totalBrl: number,
  keyFn: (a: ByAssetValue) => string, labelFn: (a: ByAssetValue) => string,
  cvt: (n: number) => number,
): SnapshotGroupValue[] {
  const map = new Map<string, { label: string; value_brl: number }>()
  for (const a of byAsset) {
    const key = keyFn(a)
    const existing = map.get(key)
    if (existing) existing.value_brl += a.value_brl
    else map.set(key, { label: labelFn(a), value_brl: a.value_brl })
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, value: cvt(v.value_brl), pct: totalBrl > 0 ? (v.value_brl / totalBrl) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

function computePortfolioCum(monthly: MonthlyPoint[]): number[] {
  let cum = 1
  return monthly.map(m => {
    // Skip months with no price data (total=0 but contributions exist would show -200% return)
    if (m.total === 0) return Math.round(cum * 10000) / 10000
    const base = m.prev_total + 0.5 * m.contributions
    const returnAbs = m.total - m.prev_total - m.contributions
    const r = base > 0 ? returnAbs / base : 0
    cum *= (1 + r)
    return Math.round(cum * 10000) / 10000
  })
}

export async function buildPortfolioSnapshot(
  userId: string, displayCurrency = 'BRL', period: 'inception' | '12m' | 'ytd' = 'inception',
  precomputedValue?: { total_brl: number; by_asset: ByAssetValue[]; by_class: { name: string; name_key?: string | null; color: string; value_brl: number; pct?: number }[] }
): Promise<PortfolioSnapshot> {
  const toStr = localYM(new Date())

  const [maybeResult, inception, sectorMap, classRowsRes] = await Promise.all([
    precomputedValue ? Promise.resolve(null) : computePortfolioValue(userId),
    computeInception(userId),
    getSectorMap(userId),
    supabaseAdmin.from('asset_classes').select('name, target_pct').eq('user_id', userId),
  ])

  // Use precomputed value if provided (avoids duplicate price fetching vs dashboard)
  const result = (precomputedValue ?? maybeResult)!

  const targetMap = new Map(
    ((classRowsRes.data ?? []) as Array<{ name: string; target_pct: number | null }>)
      .map(c => [c.name, c.target_pct])
  )

  const fxToDisplay = displayCurrency === 'BRL' ? 1 : 1 / (await getFxRate(displayCurrency))
  const cvt = (n: number) => Math.round(n * fxToDisplay * 100) / 100
  const periodFrom = periodFromFor(period, inception, toStr)

  let performance: SnapshotPerformance | null = null
  let inceptionPerformance: SnapshotPerformance | null = null
  let monthly: SnapshotMonthlyPoint[] = []
  let benchmarks: SnapshotBenchmarks | null = null
  let assetReturns: Record<number, number | null> = {}

  if (inception) {
    const prefetched = await fetchPrefetchedData(userId)
    await prefetchFIRates(prefetched)

    const [inceptionPerfRaw, monthlySeries, benchmarksFull] = await Promise.all([
      computePerformanceSummary(userId, inception, toStr, prefetched),
      computeMonthlySeries(userId, inception, toStr, prefetched),
      computeBenchmarks(inception, toStr),
    ])

    const samePeriod    = !periodFrom || periodFrom === inception
    const periodPerfRaw = samePeriod ? inceptionPerfRaw : await computePerformanceSummary(userId, periodFrom!, toStr, prefetched)
    const periodBench   = samePeriod ? benchmarksFull   : await computeBenchmarks(periodFrom!, toStr)

    inceptionPerformance = {
      from: inceptionPerfRaw.from, to: inceptionPerfRaw.to,
      value_start: cvt(inceptionPerfRaw.value_start), value_end: cvt(inceptionPerfRaw.value_end),
      contributions: cvt(inceptionPerfRaw.contributions),
      return_abs: cvt(inceptionPerfRaw.return_abs), return_pct: inceptionPerfRaw.return_pct,
    }
    performance = {
      from: periodPerfRaw.from, to: periodPerfRaw.to,
      value_start: cvt(periodPerfRaw.value_start), value_end: cvt(periodPerfRaw.value_end),
      contributions: cvt(periodPerfRaw.contributions),
      return_abs: cvt(periodPerfRaw.return_abs), return_pct: periodPerfRaw.return_pct,
    }

    monthly = monthlySeries.monthly.map(m => ({
      month: m.month, total: cvt(m.total), contributions_cumulative: cvt(m.contributions_cumulative),
    }))

    const portfolioCum = computePortfolioCum(monthlySeries.monthly)
    benchmarks = {
      period: { portfolio_pct: performance.return_pct, cdi_pct: periodBench.cdi_pct, ibov_pct: periodBench.ibov_pct, sp500_pct: periodBench.sp500_pct },
      since_inception: { portfolio_pct: inceptionPerformance.return_pct, cdi_pct: benchmarksFull.cdi_pct, ibov_pct: benchmarksFull.ibov_pct, sp500_pct: benchmarksFull.sp500_pct },
      monthly: benchmarksFull.monthly.map((b, i) => ({ ...b, portfolio_cum: portfolioCum[i] ?? null })),
    }

    assetReturns = await computeAssetReturns(userId, periodFrom ?? toStr, toStr)
  }

  const by_class: SnapshotClassValue[] = result.by_class.map(c => ({
    key: c.name_key ?? c.name, name: c.name, name_key: c.name_key ?? null, color: c.color,
    value: cvt(c.value_brl), pct: c.pct ?? 0, target_pct: targetMap.get(c.name) ?? null,
  }))

  const by_geography = aggregateByKey(result.by_asset, result.total_brl, getCountryKey, getCountryKey, cvt)
  const by_sector = aggregateByKey(
    result.by_asset, result.total_brl,
    a => sectorKey(sectorMap[a.code] ?? null),
    a => sectorMap[a.code] ?? 'Outros', cvt,
  )
  const by_currency = aggregateByKey(result.by_asset, result.total_brl, a => a.currency, a => a.currency, cvt)

  const positiveAssets = result.by_asset.filter(a => a.value_brl > 0)
  const assetShares = positiveAssets.map(a => result.total_brl > 0 ? a.value_brl / result.total_brl : 0)
  const hhiAsset  = calcHHI(assetShares)
  const hhiGeo    = calcHHI(by_geography.map(g => g.pct / 100))
  const hhiSector = calcHHI(by_sector.map(g => g.pct / 100))
  const sortedByValue = [...positiveAssets].sort((a, b) => b.value_brl - a.value_brl)
  const top5Brl = sortedByValue.slice(0, 5).reduce((s, a) => s + a.value_brl, 0)

  const diversification: SnapshotDiversification = {
    hhi_asset: Math.round(hhiAsset * 10000) / 10000,
    hhi_asset_normalized: Math.round(normalizeHHI(hhiAsset, positiveAssets.length) * 10000) / 10000,
    hhi_geography: Math.round(hhiGeo * 10000) / 10000,
    hhi_geography_normalized: Math.round(normalizeHHI(hhiGeo, by_geography.length) * 10000) / 10000,
    hhi_sector: Math.round(hhiSector * 10000) / 10000,
    hhi_sector_normalized: Math.round(normalizeHHI(hhiSector, by_sector.length) * 10000) / 10000,
    effective_n: hhiAsset > 0 ? Math.round((1 / hhiAsset) * 100) / 100 : 0,
    top5_pct: result.total_brl > 0 ? Math.round((top5Brl / result.total_brl) * 10000) / 100 : 0,
    n_positions: positiveAssets.length,
  }

  const snapshotAssets: SnapshotAsset[] = sortedByValue.map(a => ({
    id: a.id, code: a.code, name: a.name,
    value: cvt(a.value_brl), pct: result.total_brl > 0 ? (a.value_brl / result.total_brl) * 100 : 0,
    class_name: a.class_name, class_name_key: a.class_name_key, class_color: a.class_color,
    exchange: a.exchange ?? null, currency: a.currency,
    return_pct: assetReturns[a.id] ?? null,
  }))

  const top_assets  = snapshotAssets.slice(0, 15)
  const withReturns = snapshotAssets.filter(a => a.return_pct !== null)
  const top_gainers = [...withReturns].sort((a, b) => (b.return_pct as number) - (a.return_pct as number)).slice(0, 5)
  const top_losers  = [...withReturns].sort((a, b) => (a.return_pct as number) - (b.return_pct as number)).slice(0, 5)

  const today = new Date()
  const since12m = new Date(today); since12m.setFullYear(since12m.getFullYear() - 1)
  const divSummary = await computeDividendsSummary(userId, localDate(since12m), localDate(today))

  const investedBrlTotal = result.by_asset.reduce((s, a) => s + (a.invested_brl ?? 0), 0)

  return {
    generated_at: new Date().toISOString(), display_currency: displayCurrency,
    period, period_from: periodFrom, period_to: toStr, inception,
    total: cvt(result.total_brl), invested: cvt(investedBrlTotal),
    asset_count: positiveAssets.length, class_count: result.by_class.length,
    performance, inception_performance: inceptionPerformance, monthly, benchmarks,
    by_class, by_geography, by_sector, by_currency,
    diversification, top_assets, top_gainers, top_losers,
    dividends: {
      total_12m: cvt(divSummary.total_brl),
      by_month: divSummary.by_month.map(m => ({ month: m.month, total: cvt(m.total_brl) })),
      top_payers: divSummary.by_asset.slice(0, 5).map(a => ({ asset_id: a.asset_id, code: a.code, name: a.name, total: cvt(a.total_brl) })),
      yield_pct: result.total_brl > 0 ? Math.round((divSummary.total_brl / result.total_brl) * 10000) / 100 : null,
    },
  }
}
