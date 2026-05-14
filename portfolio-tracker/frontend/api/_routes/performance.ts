import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getFxRate } from '../_lib/fx.js'
import { getRates, SERIES } from '../_services/bcbService.js'
import { getCurrentPrice, Asset, FITranche } from '../_services/priceService.js'
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

type ValPoint = { ref_date: string; value: number; currency: string }

// Compound-growth interpolation between two known value points.
// Points must be sorted ascending by ref_date.
// Carry-backward (before first point) and carry-forward (after last point) included.
function interpolateKnownPoints(points: ValPoint[], targetDate: string): ValPoint | null {
  if (!points.length) return null
  const last = points[points.length - 1]
  if (targetDate >= last.ref_date)  return { ...last }      // carry-forward
  if (targetDate <  points[0].ref_date) return { ...points[0] } // carry-backward

  let before = points[0], after = points[1]
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].ref_date <= targetDate && points[i + 1].ref_date > targetDate) {
      before = points[i]; after = points[i + 1]; break
    }
  }

  const mi = (s: string) => { const [y, m] = s.substring(0, 7).split('-').map(Number); return y * 12 + m }
  const mB = mi(before.ref_date), mA = mi(after.ref_date), mT = mi(targetDate)
  const span = mA - mB, elapsed = mT - mB
  if (span <= 0 || elapsed <= 0) return { ...before }

  const value = (before.value > 0 && after.value > 0)
    ? before.value * Math.pow(after.value / before.value, elapsed / span)
    : before.value + (after.value - before.value) * (elapsed / span)
  return { ref_date: targetDate, value, currency: before.currency }
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

  // Include ALL assets (active AND inactive): sold assets may have had holdings
  // in past months and must be counted for correct historical portfolio value.
  // Holdings computed from contributions (lte dateStr) naturally produce 0 for sold assets.
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, active, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, ticker_brapi, ticker_yahoo, coingecko_id')
    .eq('user_id', userId)

  if (!assets?.length) return { total: 0, detail: [] }

  const assetIds = assets.map((a) => a.id)

  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity, value_brl, price_orig, fx_rate_brl, currency, date')
    .in('asset_id', assetIds)
    .lte('date', dateStr)

  const holdingsMap: Record<number, number> = {}
  // costMap: used as fallback price when price_history is missing (delisted/renamed tickers)
  const costMap: Record<number, { totalCost: number; totalQty: number }> = {}
  for (const c of (contributions ?? [])) {
    const qty = Number(c.quantity) || 0
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) +
      (c.type === 'buy' ? qty : -qty)
    if (c.type === 'buy' && qty > 0) {
      const vBrl = Number(c.value_brl) > 0
        ? Number(c.value_brl)
        : (Number(c.price_orig) > 0
          ? Number(c.price_orig) * qty * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
          : 0)
      if (vBrl > 0) {
        if (!costMap[c.asset_id]) costMap[c.asset_id] = { totalCost: 0, totalQty: 0 }
        costMap[c.asset_id].totalCost += vBrl
        costMap[c.asset_id].totalQty  += qty
      }
    }
  }

  // FI tranches from contributions up to dateStr — used by getCurrentPrice for fixed_income
  const fiAssetIds = assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id)
  const fiTranchesMap: Record<number, FITranche[]> = {}
  for (const c of (contributions ?? [])) {
    if (!fiAssetIds.includes(c.asset_id)) continue
    if (c.type !== 'buy') continue
    const vBrl = Number(c.value_brl)
    if (vBrl <= 0) continue
    if (!fiTranchesMap[c.asset_id]) fiTranchesMap[c.asset_id] = []
    fiTranchesMap[c.asset_id].push({ principal: vBrl, start_date: c.date as string })
  }

  // Fetch ALL price_history (no date filter) to enable carry-backward for assets
  // that have no history before the query date (e.g. crypto added recently).
  // Limit 10000: ~84 assets × 73 months = ~6000 rows max, well within this ceiling.
  // Without an explicit limit Supabase JS defaults to 1000 rows, which silently
  // truncates recent data and causes all recent gains to collapse into one month.
  const { data: prices } = await supabaseAdmin
    .from('price_history')
    .select('asset_id, price, currency, ref_date')
    .in('asset_id', assetIds)
    .order('ref_date', { ascending: true }) // oldest first for carry-backward
    .limit(10000)

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

  // Fetch manual_values for ALL asset types — enables interpolation for any asset
  // that has user-recorded balance updates (manual, delisted tickers, etc.)
  const { data: allMVRaw } = await supabaseAdmin
    .from('manual_values')
    .select('asset_id, value, currency, ref_date')
    .in('asset_id', assetIds)
    .order('ref_date', { ascending: true })

  const allMVByAsset: Record<number, ValPoint[]> = {}
  for (const mv of (allMVRaw ?? [])) {
    if (!allMVByAsset[mv.asset_id]) allMVByAsset[mv.asset_id] = []
    allMVByAsset[mv.asset_id].push({ ref_date: mv.ref_date, value: mv.value, currency: mv.currency })
  }

  // First-buy anchor per asset: used as the interpolation origin for ticker assets
  // (represents "at the time of first purchase, value = amount invested")
  const firstBuyMap: Record<number, ValPoint> = {}
  for (const c of (contributions ?? [])) {
    if (c.type !== 'buy') continue
    const vBrl = Number(c.value_brl) > 0
      ? Number(c.value_brl)
      : (Number(c.price_orig) > 0 && (Number(c.quantity) || 0) > 0
        ? Number(c.price_orig) * (Number(c.quantity) || 0) * (Number(c.fx_rate_brl) || 1) : 0)
    if (vBrl <= 0) continue
    if (!firstBuyMap[c.asset_id]) {
      firstBuyMap[c.asset_id] = { ref_date: c.date as string, value: vBrl, currency: 'BRL' }
    }
  }

  const detail: Array<{ asset_id: number; value: number }> = []
  let total = 0

  for (const a of assets) {
    let value = 0
    try {
      if (a.asset_type === 'manual') {
        if (!a.active) continue
        const anchor = firstBuyMap[a.id]
        const mvPts = allMVByAsset[a.id] ?? []
        if (anchor || mvPts.length > 0) {
          const pts: ValPoint[] = anchor ? [anchor, ...mvPts] : [...mvPts]
          pts.sort((x, y) => x.ref_date.localeCompare(y.ref_date))
          // Allow carry-backward: if data was entered after dateStr, use it as the starting value
          const interp = interpolateKnownPoints(pts, dateStr)
          if (interp) {
            const fx = interp.currency === 'BRL' ? 1 : await getFxRate(interp.currency)
            value = interp.value * fx
          }
        }
      } else if (a.asset_type === 'fixed_income') {
        if (!a.active) continue
        // Use asset-level fi_start_date as cutoff — contribution dates may be entered retrospectively
        const fiPrincipal  = Number(a.fi_principal)  || 0
        const fiStartDate  = (a.fi_start_date as string | null)
        const fiEarliestStart = fiStartDate ?? fiTranchesMap[a.id]?.[0]?.start_date ?? null
        if (fiEarliestStart && fiEarliestStart > dateStr) continue

        // If fi_principal + fi_start_date are set, always compute CDI/IPCA from the declared start.
        // Contributions may have been entered retroactively for tracking; using them would switch
        // the calculation method on the contribution date and concentrate gains in that month.
        const hasNativePrincipal = fiPrincipal > 0 && !!fiStartDate
        if (hasNativePrincipal) {
          try {
            const result = await getCurrentPrice({
              ...a,
              fi_principal: fiPrincipal,   // ensure numeric (Supabase DECIMAL may come as string)
              ticker_brapi: null, ticker_yahoo: null, coingecko_id: null,
            } as Asset, undefined, new Date(dateStr))
            value = result.price
          } catch { value = fiPrincipal }
        } else {
          // No native principal: use contributions that have started by this date
          const activeTranches = (fiTranchesMap[a.id] ?? []).filter(t => t.start_date <= dateStr)
          const principalSum = activeTranches.reduce((s, t) => s + t.principal, 0)
          try {
            const result = await getCurrentPrice({
              ...a,
              ticker_brapi: null, ticker_yahoo: null, coingecko_id: null,
            } as Asset, activeTranches.length > 0 ? activeTranches : undefined, new Date(dateStr))
            value = result.price
          } catch { value = principalSum }
        }
      } else {
        const holdings = holdingsMap[a.id] ?? 0
        if (holdings > 0) {
          const mvPts = allMVByAsset[a.id] ?? []

          if (mvPts.length > 0) {
            // Asset has user-recorded balance updates: interpolate between known points.
            // Anchor the timeline at the first buy date so the curve starts at cost basis.
            const anchor = firstBuyMap[a.id]
            const pts: ValPoint[] = anchor ? [anchor, ...mvPts] : [...mvPts]
            pts.sort((x, y) => x.ref_date.localeCompare(y.ref_date))
            const interp = interpolateKnownPoints(pts, dateStr)
            if (interp) {
              const fx = interp.currency === 'BRL' ? 1 : await getFxRate(interp.currency)
              value = interp.value * fx
            }
          } else {
            // No manual balance updates: use price_history (LOCF) and live price for current month
            const ph = priceMap[a.id]
            if (!ph) {
              // No price_history at all.
              // For brapi-only assets (no yahoo, no coingecko), brapi.dev may return stale
              // prices for delisted tickers — use cost basis directly to avoid false values.
              const hasReliableAutoSource = !!(a.ticker_yahoo || a.coingecko_id)
              if (isCurrentOrFuture && hasReliableAutoSource) {
                try {
                  const result = await getCurrentPrice(a as Asset)
                  const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
                  value = holdings * result.price * fx
                } catch {
                  const cost = costMap[a.id]
                  if (cost && cost.totalQty > 0) value = holdings * (cost.totalCost / cost.totalQty)
                }
              } else {
                const cost = costMap[a.id]
                if (cost && cost.totalQty > 0) value = holdings * (cost.totalCost / cost.totalQty)
              }
            } else {
              const phStale = isCurrentOrFuture && ph.ref_date.substring(0, 7) < ym
              if (!phStale) {
                const fx = await getFxRate(ph.currency)
                value = holdings * ph.price * fx
              } else {
                try {
                  const result = await getCurrentPrice(a as Asset)
                  const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
                  value = holdings * result.price * fx
                } catch {
                  const cost = costMap[a.id]
                  if (cost && cost.totalQty > 0) {
                    value = holdings * (cost.totalCost / cost.totalQty)
                  } else {
                    const fx = await getFxRate(ph.currency)
                    value = holdings * ph.price * fx
                  }
                }
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

  // ALL assets (not just active): sold assets may have had contributions
  // within the period that must count in the Simple Dietz cash-flow term.
  const { data: userAssets } = await supabaseAdmin
    .from('assets').select('id').eq('user_id', userId)
  const userAssetIds = (userAssets ?? []).map(a => a.id)

  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, value_brl, price_orig, quantity, fx_rate_brl, currency, type')
    .in('asset_id', userAssetIds.length ? userAssetIds : [-1])
    .gte('date', fromDateStr)
    .lte('date', toDateStr)

  function estimateContribValue(c: { value_brl: number | null; price_orig: number | null; quantity: number | null; fx_rate_brl: number | null; currency: string | null }): number {
    const vBrl = Number(c.value_brl)
    if (vBrl > 0) return vBrl
    const price = Number(c.price_orig)
    const qty   = Number(c.quantity)
    if (price > 0 && qty > 0) {
      const fx = Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1)
      return price * qty * fx
    }
    return 0
  }

  const totalContribs = (contributions ?? []).reduce((s: number, c) => {
    if (c.type === 'income') return s  // income is portfolio return, not a cash flow
    const v = estimateContribValue(c as Parameters<typeof estimateContribValue>[0])
    return s + (c.type === 'buy' ? v : -v)
  }, 0)

  // Cap value_end to the current month: future months (e.g. Dec 2026 when viewing year 2026)
  // use the same live prices as the current month, so clamp to currentYM for a stable result
  // that matches the dashboard's total.
  const currentYM = localYM(new Date())
  const clampedToStr = toStr > currentYM ? currentYM : toStr
  const [clampedToY, clampedToM] = clampedToStr.split('-').map(Number)

  const [start, end] = await Promise.all([
    getPortfolioValueAtMonth(userId, prevY,       prevM),
    getPortfolioValueAtMonth(userId, clampedToY,  clampedToM),
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

  const rangeToLastDay = new Date(toY, toM, 0).getDate()
  const rangeToDate    = `${toY}-${String(toM).padStart(2, '0')}-${String(rangeToLastDay).padStart(2, '0')}`

  // Previous month for first-row prev_total
  const prevM = fromM === 1 ? 12 : fromM - 1
  const prevY = fromM === 1 ? fromY - 1 : fromY
  const prevYM = `${prevY}-${String(prevM).padStart(2, '0')}`

  const { data: userAssets2 } = await supabaseAdmin
    .from('assets').select('id, code, name, asset_type, fi_principal, fi_start_date').eq('user_id', userId)
  const userAssetIds2 = (userAssets2 ?? []).map(a => a.id)
  const assetInfo: Record<number, { code: string; name: string }> = {}
  // Native FI: fi_principal + fi_start_date are set — their CDI returns are already baked into
  // the value computation, so contributions entered for tracking should not be subtracted as
  // new cash flows in the per-asset gain formula.
  const nativeFIIds = new Set<number>()
  for (const a of (userAssets2 ?? [])) {
    assetInfo[a.id as number] = { code: a.code as string, name: a.name as string }
    if (a.asset_type === 'fixed_income' && Number(a.fi_principal) > 0 && a.fi_start_date) {
      nativeFIIds.add(a.id as number)
    }
  }

  const [prevMonthResult, valuesArr, contribsData] = await Promise.all([
    getPortfolioValueAtMonth(userId, prevY, prevM),
    Promise.all(
      months.map(async ({ year: y, month: m, label }) => {
        const { total, detail } = await getPortfolioValueAtMonth(userId, y, m)
        return { month: label, total, detail }
      })
    ),
    // Fetch ALL contributions (no lower date bound) so every historical month shows
    // its actual cash flows in the APORTES column regardless of the viewed period.
    supabaseAdmin
      .from('contributions')
      .select('asset_id, date, value_brl, price_orig, quantity, fx_rate_brl, currency, type')
      .in('asset_id', userAssetIds2.length ? userAssetIds2 : [-1])
      .lte('date', rangeToDate),
  ])

  if (contribsData.error) console.error('[monthly] contributions query error:', contribsData.error.message)

  const contribsByMonth: Record<string, number> = {}
  const contribsByAssetMonth: Record<string, Record<number, number>> = {}
  for (const c of (contribsData.data ?? [])) {
    if (c.type === 'income') continue  // income is portfolio return, not a cash flow
    const ym = (c.date as string).substring(0, 7)
    // Use Number() to safely coerce Supabase DECIMAL fields (may arrive as strings)
    const vBrl = Number(c.value_brl) > 0
      ? Number(c.value_brl)
      : (Number(c.price_orig) > 0 && Number(c.quantity) > 0
        ? Number(c.price_orig) * Number(c.quantity) * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
        : 0)
    const delta = c.type === 'buy' ? vBrl : -vBrl
    contribsByMonth[ym] = (contribsByMonth[ym] ?? 0) + delta
    if (!contribsByAssetMonth[ym]) contribsByAssetMonth[ym] = {}
    const aid = c.asset_id as number
    contribsByAssetMonth[ym][aid] = (contribsByAssetMonth[ym][aid] ?? 0) + delta
  }

  const monthly = valuesArr.map((v, i) => {
    const prevDetail = i > 0 ? valuesArr[i - 1].detail : prevMonthResult.detail
    const prevByAsset: Record<number, number> = {}
    for (const d of prevDetail) prevByAsset[d.asset_id] = d.value

    const assetContribs = contribsByAssetMonth[v.month] ?? {}
    const allIds = new Set<number>([
      ...v.detail.map(d => d.asset_id),
      ...Object.keys(assetContribs).map(Number),
    ])
    const detail = Array.from(allIds).map(assetId => {
      const info = assetInfo[assetId] ?? { code: '?', name: '?' }
      const value = v.detail.find(d => d.asset_id === assetId)?.value ?? 0
      const prev_value = prevByAsset[assetId] ?? 0
      // Native FI assets compute CDI from fi_start_date; their contributions are tracking
      // entries (not real monthly cash flows), so don't subtract them from the gain.
      const contributions = nativeFIIds.has(assetId) ? 0 : (assetContribs[assetId] ?? 0)
      const gain = Math.round((value - prev_value - contributions) * 100) / 100
      return { asset_id: assetId, code: info.code, name: info.name, value, prev_value, contributions, gain }
    }).sort((a, b) => b.value - a.value)

    return {
      month:         v.month,
      total:         v.total,
      prev_total:    i > 0 ? valuesArr[i - 1].total : prevMonthResult.total,
      contributions: contribsByMonth[v.month] ?? 0,
      detail,
    }
  })

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



  // Fetch all history in one query for both start and oldest lookups (limit 10000 each)
  const [{ data: endPricesRaw }, { data: allHistory }] = await Promise.all([
    supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
      .in('asset_id', assetIds).lte('ref_date', toDate).order('ref_date', { ascending: false }).limit(10000),
    supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
      .in('asset_id', assetIds).order('ref_date', { ascending: true }).limit(10000),
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
