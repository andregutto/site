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

function interpolateKnownPointsDaily(points: ValPoint[], targetDate: string): ValPoint | null {
  if (!points.length) return null
  const last = points[points.length - 1]
  if (targetDate >= last.ref_date) return { ...last }
  if (targetDate <  points[0].ref_date) return { ...points[0] }

  let before = points[0], after = points[1]
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].ref_date <= targetDate && points[i + 1].ref_date > targetDate) {
      before = points[i]; after = points[i + 1]; break
    }
  }

  const toMs = (s: string) => new Date(s + 'T12:00:00').getTime()
  const dB = toMs(before.ref_date), dA = toMs(after.ref_date), dT = toMs(targetDate)
  const span = dA - dB, elapsed = dT - dB
  if (span <= 0 || elapsed <= 0) return { ...before }
  const t = elapsed / span
  const value = (before.value > 0 && after.value > 0)
    ? before.value * Math.pow(after.value / before.value, t)
    : before.value + (after.value - before.value) * t
  return { ref_date: targetDate, value, currency: before.currency }
}

type PrefetchedData = {
  assets: Array<{
    id: number; code: string; name: string; asset_type: string; currency: string; active: boolean
    fi_principal: number | null; fi_start_date: string | null; fi_type: string | null
    fi_rate: number | null; fi_spread: number | null
    ticker_brapi: string | null; ticker_yahoo: string | null; coingecko_id: string | null
  }>
  contributions: Array<{
    asset_id: number; type: string; quantity: number | null
    value_brl: number | null; price_orig: number | null; fx_rate_brl: number | null
    currency: string | null; date: string
  }>
  prices: Array<{ asset_id: number; price: number; currency: string; ref_date: string }>
  manualValues: Array<{ asset_id: number; value: number; currency: string; ref_date: string }>
}

// Fetches all data needed for portfolio value computation in one round-trip (4 parallel DB queries).
async function fetchPrefetchedData(userId: string): Promise<PrefetchedData> {
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, active, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, ticker_brapi, ticker_yahoo, coingecko_id')
    .eq('user_id', userId)

  if (!assets?.length) return { assets: [], contributions: [], prices: [], manualValues: [] }

  const assetIds = assets.map(a => a.id)

  // Fetch contributions and manual_values in parallel (row counts stay manageable)
  const [{ data: contributions }, { data: manualValues }] = await Promise.all([
    supabaseAdmin.from('contributions')
      .select('asset_id, type, quantity, value_brl, price_orig, fx_rate_brl, currency, date')
      .in('asset_id', assetIds)
      .order('date', { ascending: true }),
    supabaseAdmin.from('manual_values')
      .select('asset_id, value, currency, ref_date')
      .in('asset_id', assetIds)
      .order('ref_date', { ascending: true }),
  ])

  // Paginate price_history — Supabase PostgREST caps at 1000 rows by default.
  // Portfolios with years of history easily exceed this; pagination ensures all rows are loaded.
  const prices: PrefetchedData['prices'] = []
  {
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data: batch } = await supabaseAdmin
        .from('price_history')
        .select('asset_id, price, currency, ref_date')
        .in('asset_id', assetIds)
        .order('ref_date', { ascending: true })
        .range(from, from + pageSize - 1)
      if (!batch || batch.length === 0) break
      prices.push(...(batch as PrefetchedData['prices']))
      if (batch.length < pageSize) break
      from += pageSize
    }
  }

  return {
    assets: assets as PrefetchedData['assets'],
    contributions: (contributions ?? []) as PrefetchedData['contributions'],
    prices,
    manualValues: (manualValues ?? []) as PrefetchedData['manualValues'],
  }
}

function estimateContribValue(c: {
  value_brl: number | null; price_orig: number | null
  quantity: number | null; fx_rate_brl: number | null; currency: string | null
}): number {
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

// Computes portfolio total and per-asset values for a given month using pre-fetched data.
async function computePortfolioValueAtMonth(
  data: PrefetchedData,
  year: number,
  month: number
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const ym      = `${year}-${String(month).padStart(2, '0')}`
  const lastDay = new Date(year, month, 0).getDate()
  const dateStr = `${ym}-${String(lastDay).padStart(2, '0')}`
  const isCurrentOrFuture = ym >= localYM(new Date())

  const { assets, contributions: allContribs, prices, manualValues: allMVRaw } = data
  if (!assets.length) return { total: 0, detail: [] }

  const contributions = allContribs.filter(c => c.date <= dateStr)

  const holdingsMap: Record<number, number> = {}
  const costMap: Record<number, { totalCost: number; totalQty: number }> = {}

  for (const c of contributions) {
    const qty = Number(c.quantity) || 0
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) + (c.type === 'buy' ? qty : -qty)

    if (c.type === 'buy' && qty > 0) {
      const vBrl = Number(c.value_brl) > 0
        ? Number(c.value_brl)
        : (Number(c.price_orig) > 0 ? Number(c.price_orig) * qty * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1)) : 0)
      if (vBrl > 0) {
        if (!costMap[c.asset_id]) costMap[c.asset_id] = { totalCost: 0, totalQty: 0 }
        costMap[c.asset_id].totalCost += vBrl
        costMap[c.asset_id].totalQty  += qty
      }
    }
  }

  const fiAssetIds = assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id)
  const fiTranchesMap: Record<number, FITranche[]> = {}
  for (const c of contributions) {
    if (!fiAssetIds.includes(c.asset_id)) continue
    if (c.type !== 'buy') continue
    const vBrl = Number(c.value_brl)
    if (vBrl <= 0) continue
    if (!fiTranchesMap[c.asset_id]) fiTranchesMap[c.asset_id] = []
    fiTranchesMap[c.asset_id].push({ principal: vBrl, start_date: c.date as string })
  }

  // Index price_history mapped correctly by asset and strictly by specific historical month
  type PriceEntry = { price: number; currency: string; ref_date: string }
  const priceByMonth: Record<number, Record<string, PriceEntry>> = {}
  for (const p of prices) {
    const pym = p.ref_date.substring(0, 7)
    const byMonth = (priceByMonth[p.asset_id] ??= {})
    const cur = byMonth[pym]
    if (!cur || p.ref_date > cur.ref_date) {
      byMonth[pym] = { price: p.price, currency: p.currency, ref_date: p.ref_date }
    }
  }

  function getPrice(assetId: number, targetYM: string): PriceEntry | undefined {
    const byMonth = priceByMonth[assetId]
    if (!byMonth) return undefined
    if (byMonth[targetYM]) return byMonth[targetYM]
    const prior = Object.keys(byMonth).filter(k => k < targetYM).sort().pop()
    return prior ? byMonth[prior] : undefined
  }

  const allMVByAsset: Record<number, ValPoint[]> = {}
  for (const mv of allMVRaw) {
    if (!allMVByAsset[mv.asset_id]) allMVByAsset[mv.asset_id] = []
    allMVByAsset[mv.asset_id].push({ ref_date: mv.ref_date, value: mv.value, currency: mv.currency })
  }

  const firstBuyMap: Record<number, ValPoint> = {}
  for (const c of contributions) {
    if (c.type !== 'buy') continue
    const vBrl = Number(c.value_brl) > 0 ? Number(c.value_brl) : 0
    if (vBrl <= 0) continue
    if (!firstBuyMap[c.asset_id]) {
      firstBuyMap[c.asset_id] = { ref_date: c.date as string, value: vBrl, currency: 'BRL' }
    }
  }

  const detail: Array<{ asset_id: number; value: number }> = []
  let total = 0

  for (const a of assets) {
    let value = 0
    const holdings = holdingsMap[a.id] ?? 0
    const cost = costMap[a.id]
    const costBasisValue = cost && cost.totalQty > 0 ? holdings * (cost.totalCost / cost.totalQty) : 0

    try {
      if (a.asset_type === 'manual') {
        if (!a.active) continue
        const anchor = firstBuyMap[a.id]
        const mvPts = allMVByAsset[a.id] ?? []
        if (anchor || mvPts.length > 0) {
          const pts = anchor ? [anchor, ...mvPts] : [...mvPts]
          pts.sort((x, y) => x.ref_date.localeCompare(y.ref_date))
          const interp = interpolateKnownPoints(pts, dateStr)
          if (interp) {
            const fx = interp.currency === 'BRL' ? 1 : await getFxRate(interp.currency)
            value = interp.value * fx
          }
        }
      } else if (a.asset_type === 'fixed_income') {
        if (!a.active) continue
        const fiStartDate = (a.fi_start_date as string | null)
        const fiEarliestStart = fiStartDate ?? fiTranchesMap[a.id]?.[0]?.start_date ?? null
        if (fiEarliestStart && fiEarliestStart > dateStr) continue

        const ph = getPrice(a.id, ym)
        const phIsExact = ph?.ref_date.substring(0, 7) === ym

        if (ph && (phIsExact || !isCurrentOrFuture)) {
          // If the logged DB price represents a total portfolio manual entry rather than unit price
          value = ph.price > 50000 && fiStartDate ? ph.price : ph.price
          const fx = ph.currency === 'BRL' ? 1 : await getFxRate(ph.currency)
          value = value * fx
        } else {
          const fiPrincipal = Number(a.fi_principal) || 0
          if (fiPrincipal > 0 && !!fiStartDate) {
            try {
              const result = await getCurrentPrice({ ...a, fi_principal: fiPrincipal, ticker_brapi: null, ticker_yahoo: null, coingecko_id: null } as Asset, undefined, new Date(dateStr))
              value = result.price
            } catch { value = ph?.price ?? fiPrincipal }
          } else {
            const activeTranches = (fiTranchesMap[a.id] ?? []).filter(t => t.start_date <= dateStr)
            const principalSum = activeTranches.reduce((s, t) => s + t.principal, 0)
            try {
              const result = await getCurrentPrice({ ...a, ticker_brapi: null, ticker_yahoo: null, coingecko_id: null } as Asset, activeTranches.length > 0 ? activeTranches : undefined, new Date(dateStr))
              value = result.price
            } catch { value = ph?.price ?? principalSum }
          }
        }
      } else {
        // Ticker / Variable income assets logic
        if (!a.active) continue
        if (holdings > 0) {
          const ph = getPrice(a.id, ym)
          if (isCurrentOrFuture) {
            if (ph && ph.ref_date.substring(0, 7) === ym) {
              const fx = await getFxRate(ph.currency)
              value = holdings * ph.price * fx
            } else {
              try {
                const result = await getCurrentPrice(a as Asset)
                const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
                value = holdings * result.price * fx
              } catch {
                if (ph) {
                  const fx = await getFxRate(ph.currency)
                  value = holdings * ph.price * fx
                } else {
                  value = costBasisValue
                }
              }
            }
          } else {
            if (ph) {
              const fx = await getFxRate(ph.currency)
              value = holdings * ph.price * fx
            } else {
              value = costBasisValue
            }
          }
        }
      }
    } catch { value = costBasisValue }

    if (value > 0) {
      detail.push({ asset_id: a.id, value: Math.round(value * 100) / 100 })
      total += value
    }
  }

  return { total: Math.round(total * 100) / 100, detail }
}

// Convenience wrapper: fetches data and computes for a single month.
async function getPortfolioValueAtMonth(
  userId: string,
  year: number,
  month: number
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const data = await fetchPrefetchedData(userId)
  return computePortfolioValueAtMonth(data, year, month)
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

  // Cap value_end to the current month: future months (e.g. Dec 2026 when viewing year 2026)
  // use the same live prices as the current month, so clamp to currentYM for a stable result
  // that matches the dashboard's total.
  const currentYM = localYM(new Date())
  const clampedToStr = toStr > currentYM ? currentYM : toStr
  const [clampedToY, clampedToM] = clampedToStr.split('-').map(Number)

  // Pre-fetch all data once — shared across both computePortfolioValueAtMonth calls
  const prefetched = await fetchPrefetchedData(userId)

  // Contributions: filter in memory instead of a separate DB query
  const totalContribs = prefetched.contributions
    .filter(c => c.date >= fromDateStr && c.date <= toDateStr)
    .reduce((s: number, c) => {
      if (c.type === 'income') return s
      const v = estimateContribValue(c)
      return s + (c.type === 'buy' ? v : -v)
    }, 0)

  const [start, end] = await Promise.all([
    computePortfolioValueAtMonth(prefetched, prevY,      prevM),
    computePortfolioValueAtMonth(prefetched, clampedToY, clampedToM),
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

  // Pre-fetch all data once — eliminates N+1 DB round-trips (was N×4 queries, now 4 total)
  const prefetched = await fetchPrefetchedData(userId)

  const assetInfo: Record<number, { code: string; name: string }> = {}
  // Native FI: fi_principal + fi_start_date are set — their CDI returns are already baked into
  // the value computation, so contributions entered for tracking should not be subtracted as
  // new cash flows in the per-asset gain formula.
  const nativeFIIds = new Set<number>()
  for (const a of prefetched.assets) {
    assetInfo[a.id] = { code: a.code, name: a.name }
    if (a.asset_type === 'fixed_income' && Number(a.fi_principal) > 0 && a.fi_start_date) {
      nativeFIIds.add(a.id)
    }
  }

  // Compute all months using pre-fetched data — no additional DB queries
  const [prevMonthResult, valuesArr] = await Promise.all([
    computePortfolioValueAtMonth(prefetched, prevY, prevM),
    Promise.all(
      months.map(async ({ year: y, month: m, label }) => {
        const { total, detail } = await computePortfolioValueAtMonth(prefetched, y, m)
        return { month: label, total, detail }
      })
    ),
  ])

  // Use pre-fetched contributions for per-month breakdown (no extra DB query)
  const filteredContribs = prefetched.contributions.filter(c => c.date <= rangeToDate)

  const contribsByMonth: Record<string, number> = {}
  const contribsByAssetMonth: Record<string, Record<number, number>> = {}
  for (const c of filteredContribs) {
    if (c.type === 'income') continue  // income is portfolio return, not a cash flow
    const ym = c.date.substring(0, 7)
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

// ── Daily portfolio value ─────────────────────────────────────────────────────

async function computePortfolioValueAtDay(
  data: PrefetchedData,
  dateStr: string,
  pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>>
): Promise<{ total: number }> {
  const today   = localDate(new Date())
  const isToday = dateStr === today

  const { assets, contributions: allContribs, manualValues: allMVRaw } = data
  if (!assets.length) return { total: 0 }

  const contributions = allContribs.filter(c => c.date <= dateStr)

  const holdingsMap: Record<number, number> = {}
  const costMap: Record<number, { totalCost: number; totalQty: number }> = {}
  for (const c of contributions) {
    const qty = Number(c.quantity) || 0
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) + (c.type === 'buy' ? qty : -qty)
    if (c.type === 'buy' && qty > 0) {
      const vBrl = Number(c.value_brl) > 0
        ? Number(c.value_brl)
        : (Number(c.price_orig) > 0 ? Number(c.price_orig) * qty * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1)) : 0)
      if (vBrl > 0) {
        if (!costMap[c.asset_id]) costMap[c.asset_id] = { totalCost: 0, totalQty: 0 }
        costMap[c.asset_id].totalCost += vBrl
        costMap[c.asset_id].totalQty  += qty
      }
    }
  }

  const fiAssetIds = assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id)
  const fiTranchesMap: Record<number, FITranche[]> = {}
  for (const c of contributions) {
    if (!fiAssetIds.includes(c.asset_id) || c.type !== 'buy') continue
    const vBrl = Number(c.value_brl)
    if (vBrl <= 0) continue
    if (!fiTranchesMap[c.asset_id]) fiTranchesMap[c.asset_id] = []
    fiTranchesMap[c.asset_id].push({ principal: vBrl, start_date: c.date as string })
  }

  function getPriceAtDay(assetId: number): { price: number; currency: string } | undefined {
    const arr = pricesByAsset[assetId]
    if (!arr) return undefined
    let best: typeof arr[0] | undefined
    for (const p of arr) {
      if (p.ref_date <= dateStr) best = p
      else break
    }
    return best ? { price: best.price, currency: best.currency } : undefined
  }

  const allMVByAsset: Record<number, ValPoint[]> = {}
  for (const mv of allMVRaw) {
    if (!allMVByAsset[mv.asset_id]) allMVByAsset[mv.asset_id] = []
    allMVByAsset[mv.asset_id].push({ ref_date: mv.ref_date, value: mv.value, currency: mv.currency })
  }

  const firstBuyMap: Record<number, ValPoint> = {}
  for (const c of contributions) {
    if (c.type !== 'buy') continue
    const vBrl = Number(c.value_brl) > 0 ? Number(c.value_brl) : 0
    if (vBrl <= 0 || firstBuyMap[c.asset_id]) continue
    firstBuyMap[c.asset_id] = { ref_date: c.date as string, value: vBrl, currency: 'BRL' }
  }

  let total = 0
  for (const a of assets) {
    if (!a.active) continue
    let value = 0
    const holdings = holdingsMap[a.id] ?? 0
    const cost = costMap[a.id]
    const costBasisValue = cost && cost.totalQty > 0 ? holdings * (cost.totalCost / cost.totalQty) : 0

    try {
      if (a.asset_type === 'manual') {
        const anchor = firstBuyMap[a.id]
        const mvPts  = allMVByAsset[a.id] ?? []
        if (anchor || mvPts.length > 0) {
          const pts = anchor ? [anchor, ...mvPts] : [...mvPts]
          pts.sort((x, y) => x.ref_date.localeCompare(y.ref_date))
          const interp = interpolateKnownPointsDaily(pts, dateStr)
          if (interp) {
            const fx = interp.currency === 'BRL' ? 1 : await getFxRate(interp.currency)
            value = interp.value * fx
          }
        }
      } else if (a.asset_type === 'fixed_income') {
        const fiStartDate     = a.fi_start_date as string | null
        const fiEarliestStart = fiStartDate ?? fiTranchesMap[a.id]?.[0]?.start_date ?? null
        if (fiEarliestStart && fiEarliestStart > dateStr) continue

        const ph = getPriceAtDay(a.id)
        if (ph && !isToday) {
          const fx = ph.currency === 'BRL' ? 1 : await getFxRate(ph.currency)
          value = ph.price * fx
        } else {
          const fiPrincipal = Number(a.fi_principal) || 0
          if (fiPrincipal > 0 && fiStartDate) {
            try {
              const result = await getCurrentPrice(
                { ...a, fi_principal: fiPrincipal, ticker_brapi: null, ticker_yahoo: null, coingecko_id: null } as Asset,
                undefined, new Date(dateStr + 'T12:00:00')
              )
              value = result.price
            } catch { value = ph?.price ?? fiPrincipal }
          } else {
            const activeTranches = (fiTranchesMap[a.id] ?? []).filter(t => t.start_date <= dateStr)
            const principalSum = activeTranches.reduce((s, t) => s + t.principal, 0)
            try {
              const result = await getCurrentPrice(
                { ...a, ticker_brapi: null, ticker_yahoo: null, coingecko_id: null } as Asset,
                activeTranches.length > 0 ? activeTranches : undefined,
                new Date(dateStr + 'T12:00:00')
              )
              value = result.price
            } catch { value = ph?.price ?? principalSum }
          }
        }
      } else {
        if (holdings > 0) {
          const ph = getPriceAtDay(a.id)
          if (isToday) {
            try {
              const result = await getCurrentPrice(a as Asset)
              const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
              value = holdings * result.price * fx
            } catch {
              if (ph) { const fx = await getFxRate(ph.currency); value = holdings * ph.price * fx }
              else     { value = costBasisValue }
            }
          } else {
            if (ph) { const fx = await getFxRate(ph.currency); value = holdings * ph.price * fx }
            else     { value = costBasisValue }
          }
        }
      }
    } catch { value = costBasisValue }

    if (value > 0) total += value
  }

  return { total: Math.round(total * 100) / 100 }
}

router.get('/daily', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const today = localDate(new Date())

  const fromStr = (req.query.from as string) || today
  const rawTo   = (req.query.to   as string) || today
  const toStr   = rawTo > today ? today : rawTo

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    res.status(400).json({ error: 'from and to must be YYYY-MM-DD' }); return
  }
  if (fromStr > toStr) {
    res.status(400).json({ error: '"from" deve ser anterior a "to"' }); return
  }

  const prefetched = await fetchPrefetchedData(userId)

  const pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>> = {}
  for (const p of prefetched.prices) {
    if (!pricesByAsset[p.asset_id]) pricesByAsset[p.asset_id] = []
    pricesByAsset[p.asset_id].push(p)
  }

  const dates: string[] = []
  const cur = new Date(fromStr + 'T12:00:00')
  const end = new Date(toStr   + 'T12:00:00')
  while (cur <= end) { dates.push(localDate(cur)); cur.setDate(cur.getDate() + 1) }

  const values = await Promise.all(dates.map(d => computePortfolioValueAtDay(prefetched, d, pricesByAsset)))

  const contribsByDay: Record<string, number> = {}
  for (const c of prefetched.contributions) {
    if (c.date < fromStr || c.date > toStr || c.type === 'income') continue
    const vBrl = Number(c.value_brl) > 0
      ? Number(c.value_brl)
      : (Number(c.price_orig) > 0 && Number(c.quantity) > 0
          ? Number(c.price_orig) * Number(c.quantity) * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
          : 0)
    contribsByDay[c.date] = (contribsByDay[c.date] ?? 0) + (c.type === 'buy' ? vBrl : -vBrl)
  }

  const daily = dates.map((date, i) => ({
    date,
    total:         values[i].total,
    contributions: Math.round((contribsByDay[date] ?? 0) * 100) / 100,
  }))

  res.json({ daily })
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

  type Monthly = { month: string; cdi_cum: number | null; ibov_cum: number | null; sp500_cum: number | null }
  const monthly: Monthly[] = months.map(m => ({ month: m, cdi_cum: null, ibov_cum: null, sp500_cum: null }))

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
    const pts = rows.map(r => ({
      ym:    localYM(r.date),
      price: r.close ?? r.adjClose ?? 0,
    })).filter(r => r.ym >= fromStr && r.ym <= toStr)

    // Override current month with latest daily close for intraday accuracy
    if (todayYM <= toStr) {
      try {
        const d2ago = localDate(new Date(Date.now() - 2 * 86400000))
        const daily = await yf.historical(ticker, { period1: d2ago, period2: today, interval: '1d' })
        if (daily.length > 0) {
          const latestClose = daily[daily.length - 1].close ?? daily[daily.length - 1].adjClose
          if (latestClose) {
            const idx = pts.findIndex(p => p.ym === todayYM)
            if (idx >= 0) pts[idx].price = latestClose
            else pts.push({ ym: todayYM, price: latestClose })
          }
        }
      } catch { /* fall back to monthly bar */ }
    }
    return pts
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

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)
    .in('asset_type', ['ticker', 'manual'])

  if (!assets?.length) { res.json({}); return }

  const tickerAssets = assets.filter(a => a.asset_type === 'ticker')
  const manualAssets = assets.filter(a => a.asset_type === 'manual')
  const tickerIds    = tickerAssets.map(a => a.id)
  const manualIds    = manualAssets.map(a => a.id)

  const returns: Record<number, number | null> = {}

  // ── Ticker assets: price_history ────────────────────────────────────────────
  if (tickerIds.length > 0) {
    const phLimit2 = Math.max(10000, tickerIds.length * 240)
    const [{ data: endPricesRaw }, { data: allHistory }] = await Promise.all([
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).lte('ref_date', toDate).order('ref_date', { ascending: false }).limit(phLimit2),
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).order('ref_date', { ascending: true }).limit(phLimit2),
    ])

    const startMap:  Record<number, number> = {}
    const oldestMap: Record<number, number> = {}
    for (const p of (allHistory ?? [])) {
      if (!(p.asset_id in oldestMap)) oldestMap[p.asset_id] = p.price
      if (p.ref_date < fromDate) startMap[p.asset_id] = p.price
    }

    const endMap: Record<number, { price: number; ref_date: string }> = {}
    for (const p of (endPricesRaw ?? [])) {
      if (!(p.asset_id in endMap)) endMap[p.asset_id] = { price: p.price, ref_date: p.ref_date }
    }

    if (isCurrentPeriod) {
      await Promise.all(tickerAssets.map(async (a) => {
        const entry = endMap[a.id]
        if (!entry || entry.ref_date.substring(0, 7) < currentYM) {
          try {
            const result = await getCurrentPrice(a as Asset)
            endMap[a.id] = { price: result.price, ref_date: currentYM + '-01' }
          } catch { /* keep stale or absent */ }
        }
      }))
    }

    // For Yahoo assets with no price_history at all, fetch the period-start price
    // live from Yahoo Finance so the return column changes correctly per period.
    const assetsNeedingStart = tickerAssets.filter(a =>
      a.ticker_yahoo && startMap[a.id] == null && oldestMap[a.id] == null
    )
    if (assetsNeedingStart.length > 0) {
      const d  = new Date(fromDate + 'T12:00:00Z')
      const p1 = new Date(d); p1.setDate(d.getDate() - 7)
      const p2 = new Date(d); p2.setDate(d.getDate() + 7)
      const p1Str = p1.toISOString().split('T')[0]
      const p2Str = p2.toISOString().split('T')[0]
      await Promise.all(assetsNeedingStart.map(async a => {
        try {
          const rows = await yf.historical(a.ticker_yahoo!, {
            period1: p1Str, period2: p2Str, interval: '1d',
          }) as Array<{ date: Date; close?: number; adjClose?: number }>
          if (!rows.length) return
          const sorted = [...rows].sort((r1, r2) => r1.date.getTime() - r2.date.getTime())
          const target = d.getTime()
          const after  = sorted.find(r => r.date.getTime() >= target)
          const before = sorted.filter(r => r.date.getTime() < target).pop()
          const best   = after ?? before
          const price  = best ? (best.close ?? best.adjClose ?? 0) : 0
          if (price > 0) startMap[a.id] = price
        } catch { /* keep as null */ }
      }))
    }

    for (const a of tickerAssets) {
      const ps = startMap[a.id] ?? oldestMap[a.id]
      const pe = endMap[a.id]?.price
      returns[a.id] = (ps != null && pe != null && ps > 0 && ps !== pe)
        ? Math.round((pe / ps - 1) * 10000) / 100
        : (ps != null && pe != null && ps === pe) ? 0
        : null
    }
  }

  // ── Manual assets: interpolate manual_values ────────────────────────────────
  if (manualIds.length > 0) {
    const [{ data: mvRows }, { data: firstBuys }] = await Promise.all([
      supabaseAdmin.from('manual_values').select('asset_id, value, currency, ref_date')
        .in('asset_id', manualIds).order('ref_date', { ascending: true }),
      supabaseAdmin.from('contributions').select('asset_id, value_brl, date')
        .in('asset_id', manualIds).eq('type', 'buy').order('date', { ascending: true }),
    ])

    const mvByAsset: Record<number, ValPoint[]> = {}
    for (const mv of (mvRows ?? [])) {
      if (!mvByAsset[mv.asset_id]) mvByAsset[mv.asset_id] = []
      mvByAsset[mv.asset_id].push({ ref_date: mv.ref_date, value: mv.value, currency: mv.currency })
    }

    const firstBuyByAsset: Record<number, ValPoint> = {}
    for (const c of (firstBuys ?? [])) {
      const aid = c.asset_id as number
      if (!firstBuyByAsset[aid] && Number(c.value_brl) > 0) {
        firstBuyByAsset[aid] = { ref_date: c.date as string, value: Number(c.value_brl), currency: 'BRL' }
      }
    }

    for (const a of manualAssets) {
      const anchor = firstBuyByAsset[a.id]
      const mvPts  = mvByAsset[a.id] ?? []
      if (!anchor && mvPts.length === 0) { returns[a.id] = null; continue }

      const pts: ValPoint[] = anchor ? [anchor, ...mvPts] : [...mvPts]
      pts.sort((x, y) => x.ref_date.localeCompare(y.ref_date))

      const endDateForInterp = isCurrentPeriod ? localDate(new Date()) : toDate
      const startPt = interpolateKnownPoints(pts, fromDate)
      const endPt   = interpolateKnownPoints(pts, endDateForInterp)

      if (!startPt || !endPt || startPt.value <= 0) { returns[a.id] = null; continue }

      const fxS = startPt.currency === 'BRL' ? 1 : await getFxRate(startPt.currency)
      const fxE = endPt.currency   === 'BRL' ? 1 : await getFxRate(endPt.currency)
      const vs  = startPt.value * fxS
      const ve  = endPt.value   * fxE

      returns[a.id] = vs > 0 && Math.abs(ve - vs) > 0.01
        ? Math.round((ve / vs - 1) * 10000) / 100
        : (Math.abs(ve - vs) <= 0.01 ? 0 : null)
    }
  }

  res.json(returns)
})

export default router
