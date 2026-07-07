import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getFxRate } from '../lib/fx.js'
import { getRates, SERIES, getCDIRates, getSelicRates, getIPCARates } from '../services/bcbService.js'
import { getCurrentPrice, Asset, FITranche } from '../services/priceService.js'
import { getYf } from '../services/yahooService.js'
import { cache, TTL } from '../lib/cache.js'


const router = Router()

// getFxRate(currency) only depends on the currency pair (it always returns AwesomeAPI's "current"
// rate via the shared TTL cache — see lib/fx.ts), never on the historical date being valued. So
// within a single request, computePortfolioValueAtMonth/AtDay call it many times (once per
// FX-denominated asset, per month/day) with the exact same arguments and get the exact same
// already-resolved value back every time. `cache.getOrFetch` already avoids the HTTP round-trip,
// but each call still pays a fresh Promise + microtask hop. A tiny per-request Map of
// currency -> in-flight/resolved Promise<number> collapses all of those into a single lookup per
// currency per request, with zero change to the returned rate.
function makeFxMemo(): (currency: string) => Promise<number> {
  const memo = new Map<string, Promise<number>>()
  return (currency: string) => {
    let p = memo.get(currency)
    if (!p) {
      p = getFxRate(currency)
      memo.set(currency, p)
    }
    return p
  }
}

// Use local date components to avoid UTC offset shifting months
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function localYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export type ValPoint = { ref_date: string; value: number; currency: string }

// Compound-growth interpolation between two known value points.
// Points must be sorted ascending by ref_date.
// Carry-backward (before first point) and carry-forward (after last point) included.
export function interpolateKnownPoints(points: ValPoint[], targetDate: string): ValPoint | null {
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

export type PrefetchedData = {
  assets: Array<{
    id: number; code: string; name: string; asset_type: string; currency: string; active: boolean
    fi_principal: number | null; fi_start_date: string | null; fi_type: string | null
    fi_rate: number | null; fi_spread: number | null
    ticker_brapi: string | null; ticker_yahoo: string | null; coingecko_id: string | null
  }>
  contributions: Array<{
    asset_id: number; type: string; quantity: number | null
    value_brl: number | null; price_orig: number | null; fx_rate_brl: number | null
    currency: string | null; date: string; description: string | null
  }>
  prices: Array<{ asset_id: number; price: number; currency: string; ref_date: string }>
  manualValues: Array<{ asset_id: number; value: number; currency: string; ref_date: string }>
}

// Fetches all data needed for portfolio value computation in one round-trip (4 parallel DB queries).
// priceFrom: optional earliest ref_date to load from price_history (reduces rows for short periods).
// Short-TTL cached per user+priceFrom: /summary, /monthly and /daily are fired concurrently by the
// frontend and each needs the exact same dataset — the in-flight dedupe in cache.getOrFetch collapses
// those into one DB round-trip, and the 15s TTL also covers quick period-tab switches. TTL is kept
// short on purpose so post-mutation staleness (new contribution, history sync) resolves fast.
export async function fetchPrefetchedData(userId: string, priceFrom?: string): Promise<PrefetchedData> {
  return cache.getOrFetch(
    `perf:prefetch:${userId}:${priceFrom ?? 'all'}`,
    15_000,
    () => fetchPrefetchedDataUncached(userId, priceFrom),
  )
}

async function fetchPrefetchedDataUncached(userId: string, priceFrom?: string): Promise<PrefetchedData> {
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, active, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, ticker_brapi, ticker_yahoo, coingecko_id')
    .eq('user_id', userId)

  if (!assets?.length) return { assets: [], contributions: [], prices: [], manualValues: [] }

  const assetIds = assets.map(a => a.id)

  // Fetch contributions and manual_values in parallel (row counts stay manageable)
  const [{ data: contributions }, { data: manualValues }] = await Promise.all([
    supabaseAdmin.from('contributions')
      .select('asset_id, type, quantity, value_brl, price_orig, fx_rate_brl, currency, date, description')
      .in('asset_id', assetIds)
      .order('date', { ascending: true }),
    supabaseAdmin.from('manual_values')
      .select('asset_id, value, currency, ref_date')
      .in('asset_id', assetIds)
      .order('ref_date', { ascending: true }),
  ])

  // Paginate price_history — Supabase PostgREST caps at 1000 rows by default.
  // Portfolios with years of history easily exceed this; pagination ensures all rows are loaded.
  // Pages are fetched in parallel waves (count first, then ranges): the "Início"
  // period pulls 100k+ rows, and fetching ~100 páginas em fila era o gargalo de
  // latência do Dashboard/Performance em cache frio. O tiebreaker por asset_id
  // torna a ordenação determinística entre páginas (ref_date repete entre ativos;
  // sem ele, offset-pagination pode duplicar/pular linhas de queries separadas).
  const prices: PrefetchedData['prices'] = []
  {
    const pageSize = 1000
    const buildQuery = () => {
      let q = supabaseAdmin
        .from('price_history')
        .select('asset_id, price, currency, ref_date')
        .in('asset_id', assetIds)
        .order('ref_date', { ascending: true })
        .order('asset_id', { ascending: true })
      if (priceFrom) q = q.gte('ref_date', priceFrom)
      return q
    }
    let countQ = supabaseAdmin
      .from('price_history')
      .select('*', { count: 'exact', head: true })
      .in('asset_id', assetIds)
    if (priceFrom) countQ = countQ.gte('ref_date', priceFrom)
    const { count } = await countQ
    const pageCount = Math.ceil((count ?? 0) / pageSize)

    const CONCURRENCY = 10
    const pages: PrefetchedData['prices'][] = new Array(pageCount)
    for (let start = 0; start < pageCount; start += CONCURRENCY) {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, pageCount - start) }, (_, i) => {
          const p = start + i
          return buildQuery()
            .range(p * pageSize, p * pageSize + pageSize - 1)
            .then(({ data }) => { pages[p] = (data ?? []) as PrefetchedData['prices'] })
        })
      )
    }
    for (const page of pages) if (page?.length) prices.push(...page)
  }

  return {
    assets: assets as PrefetchedData['assets'],
    contributions: (contributions ?? []) as PrefetchedData['contributions'],
    prices,
    manualValues: (manualValues ?? []) as PrefetchedData['manualValues'],
  }
}

// Pre-warms BCB rate caches for all fixed-income assets in parallel, before the
// per-month/per-day loops below process assets sequentially. Same getCDIRates/
// getSelicRates/getIPCARates calls (same args, same cache keys) calculateCurrentValue
// would make anyway — this only changes when the underlying HTTP fetch happens
// (parallel, up front) instead of changing any rate or computed value.
export async function prefetchFIRates(data: PrefetchedData): Promise<void> {
  const today = new Date()
  const fiAssets = data.assets.filter(a => a.asset_type === 'fixed_income' && a.active)

  await Promise.all(fiAssets.map(async (a) => {
    const minStartStr = a.fi_start_date
      ?? data.contributions.find(c => c.asset_id === a.id && c.type === 'buy' && Number(c.value_brl) > 0)?.date
      ?? null
    if (!minStartStr) return
    const minStart = new Date(minStartStr)
    try {
      switch (a.fi_type) {
        case 'pos_cdi':   await getCDIRates(minStart, today);   break
        case 'selic':     await getSelicRates(minStart, today); break
        case 'ipca_plus': await getIPCARates(minStart, today);  break
      }
    } catch { /* best-effort: the real computation will retry and surface any error */ }
  }))
}

export function estimateContribValue(c: {
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

const SPLIT_DESCRIPTION_RE = /Desdobro|Bonifica|Grupamento/i

// Stock-split / bonificação contributions are recorded as a one-time quantity delta on the
// event date (see assets.ts POST /:id/split and import.ts B3 "Desdobro"/"Bonificação em Ativos"
// handling). Yahoo's historical price series is split-adjusted retroactively (no price jump on
// the event date), so multiplying *nominal* historical holdings (pre-event quantity) by that
// already-adjusted price produces an artificial value jump on the event date. To keep value
// continuous, holdings before the event must be scaled up by the same factor the price series
// was implicitly scaled down by — i.e. project the post-event share count backward in time.
export type SplitFactorEvent = { date: string; factor: number }

export function computeSplitFactorEvents(
  contributions: PrefetchedData['contributions'],
  assetId: number
): SplitFactorEvent[] {
  const assetContribs = contributions
    .filter(c => c.asset_id === assetId)
    .sort((a, b) => a.date.localeCompare(b.date))

  const events: SplitFactorEvent[] = []
  let holdings = 0
  for (const c of assetContribs) {
    const qty = Number(c.quantity) || 0
    const delta = c.type === 'buy' ? qty : -qty
    const isSplitRow = (Number(c.price_orig) || 0) === 0 && (Number(c.value_brl) || 0) === 0
      && !!c.description && SPLIT_DESCRIPTION_RE.test(c.description)

    if (isSplitRow && holdings > 0) {
      const holdingsAfter = holdings + delta
      if (holdingsAfter > 0) {
        events.push({ date: c.date, factor: holdingsAfter / holdings })
      }
    }
    holdings += delta
  }
  return events
}

// Split events depend only on an asset's full contribution history, not on the month/day being
// evaluated. computePortfolioValueAtMonth/computePortfolioValueAtDay are invoked once per
// month (or per day, for /daily — far more calls) over the SAME `data.contributions`, so
// recomputing this filter+sort per call is pure repeated work. Callers that loop over many
// months/days for one `data` object should build this map once and pass it through.
export function buildSplitEventsCache(
  contributions: PrefetchedData['contributions'],
  assetIds: number[]
): Map<number, SplitFactorEvent[]> {
  const cache = new Map<number, SplitFactorEvent[]>()
  for (const id of assetIds) cache.set(id, computeSplitFactorEvents(contributions, id))
  return cache
}

// Adjustment factor to apply to nominal holdings computed as-of `dateStr`, so the result is
// consistent with a split-adjusted price series. Equals the product of all split factors for
// events that occur strictly after dateStr (future splits get "baked back" into past holdings).
export function getSplitAdjustmentFactor(events: SplitFactorEvent[], dateStr: string): number {
  let factor = 1
  for (const e of events) {
    if (e.date > dateStr) factor *= e.factor
  }
  return factor
}

// Corporate actions que o usuário nunca atravessou (posição fechada antes de um
// grupamento/desdobramento) não deixam linha de split nos aportes, mas a série de
// preços sincronizada hoje vem ajustada retroativamente pelo evento. Avaliar as
// holdings nominais contra a série ajustada infla/deflaciona o histórico pelo fator
// do split (ex.: 500 IRBR3 compradas a R$6,70 avaliadas a R$186 = +R$90k fantasmas).
// O preço realmente pago é a verdade: a mediana da razão price_orig / preço-da-série
// no mês de cada compra recupera a diferença de base. Só se aplica quando NÃO há
// eventos de split nos aportes (senão o ajuste de holdings já cobre e isso dobraria).
const calibrationMemo = new WeakMap<object, Map<number, number>>()
export function getSeriesCalibrationFactor(
  data: Pick<PrefetchedData, 'contributions' | 'prices'>,
  assetId: number,
): number {
  let memo = calibrationMemo.get(data.contributions)
  if (!memo) { memo = new Map(); calibrationMemo.set(data.contributions, memo) }
  const hit = memo.get(assetId)
  if (hit !== undefined) return hit

  const byMonth = new Map<string, { price: number; currency: string; ref_date: string }>()
  for (const pr of data.prices) {
    if (pr.asset_id !== assetId) continue
    const ym = pr.ref_date.substring(0, 7)
    const cur = byMonth.get(ym)
    if (!cur || pr.ref_date > cur.ref_date) byMonth.set(ym, { price: pr.price, currency: pr.currency, ref_date: pr.ref_date })
  }

  const ratios: number[] = []
  for (const c of data.contributions) {
    if (c.asset_id !== assetId || c.type !== 'buy') continue
    const po = Number(c.price_orig) || 0
    if (po <= 0) continue
    const ph = byMonth.get(String(c.date).substring(0, 7))
    if (!ph || ph.price <= 0) continue
    if (c.currency && ph.currency && c.currency !== ph.currency) continue
    ratios.push(po / ph.price)
  }

  let factor = 1
  if (ratios.length) {
    ratios.sort((x, y) => x - y)
    const median = ratios[Math.floor(ratios.length / 2)]
    // até ±35% é ruído de mercado (compra intradiária vs fechamento), não split
    if (median <= 0.75 || median >= 1.35) factor = median
  }
  memo.set(assetId, factor)
  return factor
}

// Month-keyed price index, built once per request. computePortfolioValueAtMonth used to rebuild
// this from every price_history row on every call — for a multi-year "Início" series that meant
// O(months × total price rows) work plus an Object.keys().filter().sort() prior-month fallback per
// asset per month. Building it once and binary-searching the sorted month keys makes the per-month
// cost independent of how many price rows the portfolio has accumulated.
type PriceEntry = { price: number; currency: string; ref_date: string }
export type PriceIndex = {
  byMonth: Map<number, Map<string, PriceEntry>>
  monthKeys: Map<number, string[]> // ascending
}

export function buildPriceIndex(prices: PrefetchedData['prices']): PriceIndex {
  const byMonth = new Map<number, Map<string, PriceEntry>>()
  for (const p of prices) {
    const pym = p.ref_date.substring(0, 7)
    let m = byMonth.get(p.asset_id)
    if (!m) { m = new Map(); byMonth.set(p.asset_id, m) }
    const cur = m.get(pym)
    if (!cur || p.ref_date > cur.ref_date) {
      m.set(pym, { price: p.price, currency: p.currency, ref_date: p.ref_date })
    }
  }
  const monthKeys = new Map<number, string[]>()
  for (const [assetId, m] of byMonth) {
    monthKeys.set(assetId, [...m.keys()].sort())
  }
  return { byMonth, monthKeys }
}

function lookupPrice(index: PriceIndex, assetId: number, targetYM: string): PriceEntry | undefined {
  const m = index.byMonth.get(assetId)
  if (!m) return undefined
  const exact = m.get(targetYM)
  if (exact) return exact
  const keys = index.monthKeys.get(assetId)!
  // binary search: greatest key strictly < targetYM
  let lo = 0, hi = keys.length - 1, best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (keys[mid] < targetYM) { best = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  return best >= 0 ? m.get(keys[best]) : undefined
}

// Computes portfolio total and per-asset values for a given month using pre-fetched data.
export async function computePortfolioValueAtMonth(
  data: PrefetchedData,
  year: number,
  month: number,
  splitEventsCache?: Map<number, SplitFactorEvent[]>,
  fxMemo?: (currency: string) => Promise<number>,
  priceIndex?: PriceIndex
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const getFx = fxMemo ?? getFxRate
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

  const fiAssetIdSet = new Set(assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id))
  const fiTranchesMap: Record<number, FITranche[]> = {}
  for (const c of contributions) {
    if (!fiAssetIdSet.has(c.asset_id)) continue
    if (c.type !== 'buy') continue
    const vBrl = Number(c.value_brl)
    if (vBrl <= 0) continue
    if (!fiTranchesMap[c.asset_id]) fiTranchesMap[c.asset_id] = []
    fiTranchesMap[c.asset_id].push({ principal: vBrl, start_date: c.date as string })
  }

  const index = priceIndex ?? buildPriceIndex(prices)
  const getPrice = (assetId: number, targetYM: string) => lookupPrice(index, assetId, targetYM)

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

  // Assets are independent of each other here (each reads only its own slice of the
  // pre-built maps above and writes only to its own `value`/`detail` entry), so the awaits
  // for FX/BCB/live-price lookups can run concurrently instead of one-asset-at-a-time.
  const perAsset = await Promise.all(assets.map(async (a): Promise<{ asset_id: number; value: number } | null> => {
    let value = 0
    const holdings = holdingsMap[a.id] ?? 0
    const cost = costMap[a.id]
    const costBasisValue = cost && cost.totalQty > 0 ? holdings * (cost.totalCost / cost.totalQty) : 0

    try {
      if (a.asset_type === 'manual') {
        if (!a.active) return null
        const anchor = firstBuyMap[a.id]
        const mvPts = allMVByAsset[a.id] ?? []
        if (anchor || mvPts.length > 0) {
          const pts = anchor ? [anchor, ...mvPts] : [...mvPts]
          pts.sort((x, y) => x.ref_date.localeCompare(y.ref_date))
          // Antes do primeiro ponto conhecido (primeira compra ou primeiro valor
          // manual) o ativo não existia: extrapolar o primeiro valor para trás
          // criava patrimônio fantasma que "evaporava" na data real de entrada.
          const interp = dateStr >= pts[0].ref_date.substring(0, 7) + '-01'
            ? interpolateKnownPoints(pts, dateStr) : null
          if (interp) {
            const fx = interp.currency === 'BRL' ? 1 : await getFx(interp.currency)
            value = interp.value * fx
          }
        }
      } else if (a.asset_type === 'fixed_income') {
        if (!a.active) return null
        const fiStartDate = (a.fi_start_date as string | null)
        const fiEarliestStart = fiStartDate ?? fiTranchesMap[a.id]?.[0]?.start_date ?? null
        if (fiEarliestStart && fiEarliestStart > dateStr) return null

        const ph = getPrice(a.id, ym)
        const phIsExact = ph?.ref_date.substring(0, 7) === ym

        if (ph && (phIsExact || !isCurrentOrFuture)) {
          // If the logged DB price represents a total portfolio manual entry rather than unit price
          value = ph.price > 50000 && fiStartDate ? ph.price : ph.price
          const fx = ph.currency === 'BRL' ? 1 : await getFx(ph.currency)
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
        // Ticker / Variable income assets logic.
        // Inactive (sold/archived) assets are excluded from the CURRENT value, but must
        // still be valued for historical months where they were held: their buy/sell
        // contributions count in the series' cash flows, so skipping their value made
        // every past month look deeply negative until the position was sold. Holdings
        // computed from contributions <= dateStr already go to zero after the sale, and
        // the historical branch below never triggers live price fetches for them.
        if (!a.active && isCurrentOrFuture) return null
        if (holdings > 0) {
          const splitEvents = splitEventsCache?.get(a.id) ?? computeSplitFactorEvents(allContribs, a.id)
          const adjHoldings = splitEvents.length > 0
            ? holdings * getSplitAdjustmentFactor(splitEvents, dateStr)
            : holdings * getSeriesCalibrationFactor(data, a.id)
          const ph = getPrice(a.id, ym)
          if (isCurrentOrFuture) {
            if (ph && ph.ref_date.substring(0, 7) === ym) {
              const fx = await getFx(ph.currency)
              value = adjHoldings * ph.price * fx
            } else {
              try {
                const result = await getCurrentPrice(a as Asset)
                const fx = result.currency === 'BRL' ? 1 : await getFx(result.currency)
                value = adjHoldings * result.price * fx
              } catch {
                if (ph) {
                  const fx = await getFx(ph.currency)
                  value = adjHoldings * ph.price * fx
                } else {
                  value = costBasisValue
                }
              }
            }
          } else {
            if (ph) {
              const fx = await getFx(ph.currency)
              value = adjHoldings * ph.price * fx
            } else {
              value = costBasisValue
            }
          }
        }
      }
    } catch { value = costBasisValue }

    return value > 0 ? { asset_id: a.id, value: Math.round(value * 100) / 100 } : null
  }))

  const detail: Array<{ asset_id: number; value: number }> = []
  let total = 0
  for (const r of perAsset) {
    if (!r) continue
    detail.push(r)
    total += r.value
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface PerformanceSummary {
  from: string; to: string
  value_start: number; value_end: number
  contributions: number
  return_abs: number; return_pct: number | null
}

// Modified Dietz return for [fromStr, toStr] (both 'YYYY-MM'). Pass `prefetched`
// (already through prefetchFIRates) to avoid re-fetching when called alongside
// computeMonthlySeries for the same user/range.
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

  const currentYM = localYM(new Date())
  const clampedToStr = toStr > currentYM ? currentYM : toStr
  const [clampedToY, clampedToM] = clampedToStr.split('-').map(Number)

  const data = prefetched ?? await fetchPrefetchedData(userId)
  if (!prefetched) await prefetchFIRates(data)

  const totalContribs = data.contributions
    .filter(c => c.date >= fromDateStr && c.date <= toDateStr)
    .reduce((s: number, c) => {
      if (c.type === 'income') return s
      const v = estimateContribValue(c)
      return s + (c.type === 'buy' ? v : -v)
    }, 0)

  const splitEventsCache = buildSplitEventsCache(data.contributions, data.assets.map(a => a.id))
  const fxMemo = makeFxMemo()
  const priceIndex = buildPriceIndex(data.prices)
  const [start, end] = await Promise.all([
    computePortfolioValueAtMonth(data, prevY,      prevM,      splitEventsCache, fxMemo, priceIndex),
    computePortfolioValueAtMonth(data, clampedToY, clampedToM, splitEventsCache, fxMemo, priceIndex),
  ])

  const v_ini = start.total
  const v_fim = end.total

  const return_abs = v_fim - v_ini - totalContribs
  const dietz_base = v_ini + 0.5 * totalContribs
  const return_pct = dietz_base > 0 ? (return_abs / dietz_base) * 100 : null

  return {
    from:          fromStr,
    to:            toStr,
    value_start:   v_ini,
    value_end:     v_fim,
    contributions: Math.round(totalContribs * 100) / 100,
    return_abs:    Math.round(return_abs * 100) / 100,
    return_pct:    return_pct !== null ? Math.round(return_pct * 100) / 100 : null,
  }
}

// Modified Dietz return for an exact date range [fromDateStr, toDateStr] (both 'YYYY-MM-DD').
// Reuses computePortfolioValueAtDay (already daily-granular, defined below) instead of the
// calendar-month-anchored computePortfolioValueAtMonth — needed for sub-month periods like
// "last 7 days" / "last 30 days" where a rolling window must start on an exact date, not a
// month boundary.
export async function computePerformanceSummaryDaily(userId: string, fromDateStr: string, toDateStr: string, prefetched?: PrefetchedData): Promise<PerformanceSummary> {
  const today = localDate(new Date())
  const clampedToDateStr = toDateStr > today ? today : toDateStr

  const startDate = new Date(fromDateStr + 'T12:00:00')
  startDate.setDate(startDate.getDate() - 1)
  const startDateStr = localDate(startDate)

  let data: PrefetchedData
  if (prefetched) {
    data = prefetched
  } else {
    const priceFromDate = new Date(startDateStr + 'T12:00:00')
    priceFromDate.setDate(priceFromDate.getDate() - 90)
    data = await fetchPrefetchedData(userId, localDate(priceFromDate))
    await prefetchFIRates(data)
  }

  const pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>> = {}
  for (const p of data.prices) {
    (pricesByAsset[p.asset_id] ??= []).push(p)
  }

  const totalContribs = data.contributions
    .filter(c => c.date > startDateStr && c.date <= clampedToDateStr)
    .reduce((s: number, c) => {
      if (c.type === 'income') return s
      const v = estimateContribValue(c)
      return s + (c.type === 'buy' ? v : -v)
    }, 0)

  const splitEventsCache = buildSplitEventsCache(data.contributions, data.assets.map(a => a.id))
  const fxMemo = makeFxMemo()
  const [start, end] = await Promise.all([
    computePortfolioValueAtDay(data, startDateStr, pricesByAsset, splitEventsCache, fxMemo),
    computePortfolioValueAtDay(data, clampedToDateStr, pricesByAsset, splitEventsCache, fxMemo),
  ])

  const v_ini = start.total
  const v_fim = end.total

  const return_abs = v_fim - v_ini - totalContribs
  const dietz_base = v_ini + 0.5 * totalContribs
  const return_pct = dietz_base > 0 ? (return_abs / dietz_base) * 100 : null

  return {
    from:          fromDateStr,
    to:            toDateStr,
    value_start:   v_ini,
    value_end:     v_fim,
    contributions: Math.round(totalContribs * 100) / 100,
    return_abs:    Math.round(return_abs * 100) / 100,
    return_pct:    return_pct !== null ? Math.round(return_pct * 100) / 100 : null,
  }
}

router.get('/summary', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || '2025-01'
  const toStr   = (req.query.to   as string) || localYM(new Date())

  if (DATE_RE.test(fromStr) && DATE_RE.test(toStr)) {
    if (fromStr > toStr) {
      res.status(400).json({ error: '"from" deve ser anterior a "to"' }); return
    }
    res.json(await computePerformanceSummaryDaily(userId, fromStr, toStr))
    return
  }

  const [fromY, fromM] = fromStr.split('-').map(Number)
  const [toY,   toM  ] = toStr.split('-').map(Number)

  if (fromY > toY || (fromY === toY && fromM > toM)) {
    res.status(400).json({ error: '"from" deve ser anterior a "to"' }); return
  }

  res.json(await computePerformanceSummary(userId, fromStr, toStr))
})

export interface MonthlyPoint {
  month: string
  total: number
  prev_total: number
  contributions: number
  contributions_cumulative: number
  detail: Array<{ asset_id: number; code: string; name: string; value: number; prev_value: number; contributions: number; gain: number }>
}

// Monthly portfolio value series for [fromStr, toStr] (both 'YYYY-MM'), with per-asset
// detail and running contribution totals. Pass `prefetched` (already through
// prefetchFIRates) to avoid re-fetching when called alongside computePerformanceSummary.
export async function computeMonthlySeries(
  userId: string, fromStr: string, toStr: string, prefetched?: PrefetchedData
): Promise<{ monthly: MonthlyPoint[] }> {
  const now = new Date()
  const currentYM = localYM(now)

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

  const assetInfo: Record<number, { code: string; name: string }> = {}
  const nativeFIIds = new Set<number>()
  for (const a of data.assets) {
    assetInfo[a.id] = { code: a.code, name: a.name }
    if (a.asset_type === 'fixed_income' && Number(a.fi_principal) > 0 && a.fi_start_date) {
      nativeFIIds.add(a.id)
    }
  }

  const splitEventsCache = buildSplitEventsCache(data.contributions, data.assets.map(a => a.id))
  const fxMemo = makeFxMemo()
  const priceIndex = buildPriceIndex(data.prices)
  const [prevMonthResult, valuesArr] = await Promise.all([
    computePortfolioValueAtMonth(data, prevY, prevM, splitEventsCache, fxMemo, priceIndex),
    Promise.all(
      months.map(async ({ year: y, month: m, label }) => {
        const { total, detail } = await computePortfolioValueAtMonth(data, y, m, splitEventsCache, fxMemo, priceIndex)
        return { month: label, total, detail }
      })
    ),
  ])

  const filteredContribs = data.contributions.filter(c => c.date <= rangeToDate)

  const contribsByMonth: Record<string, number> = {}
  const contribsByAssetMonth: Record<string, Record<number, number>> = {}
  let cumulContrib = 0
  for (const c of filteredContribs) {
    if (c.type === 'income') continue
    const ym = c.date.substring(0, 7)
    const vBrl = Number(c.value_brl) > 0
      ? Number(c.value_brl)
      : (Number(c.price_orig) > 0 && Number(c.quantity) > 0
        ? Number(c.price_orig) * Number(c.quantity) * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
        : 0)
    const delta = c.type === 'buy' ? vBrl : -vBrl
    if (ym < fromStr) { cumulContrib += delta; continue }
    contribsByMonth[ym] = (contribsByMonth[ym] ?? 0) + delta
    if (!contribsByAssetMonth[ym]) contribsByAssetMonth[ym] = {}
    const aid = c.asset_id as number
    contribsByAssetMonth[ym][aid] = (contribsByAssetMonth[ym][aid] ?? 0) + delta
  }

  const monthly: MonthlyPoint[] = valuesArr.map((v, i) => {
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
      const contributions = nativeFIIds.has(assetId) ? 0 : (assetContribs[assetId] ?? 0)
      const gain = Math.round((value - prev_value - contributions) * 100) / 100
      return { asset_id: assetId, code: info.code, name: info.name, value, prev_value, contributions, gain }
    }).sort((a, b) => b.value - a.value)

    cumulContrib += contribsByMonth[v.month] ?? 0

    return {
      month:                    v.month,
      total:                    v.total,
      prev_total:               i > 0 ? valuesArr[i - 1].total : prevMonthResult.total,
      contributions:            contribsByMonth[v.month] ?? 0,
      contributions_cumulative: Math.round(cumulContrib * 100) / 100,
      detail,
    }
  })

  return { monthly }
}

router.get('/monthly', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const now = new Date()

  let fromStr: string, toStr: string
  if (req.query.from && req.query.to) {
    fromStr = req.query.from as string
    toStr   = req.query.to   as string
  } else {
    const year = parseInt(req.query.year as string || String(now.getFullYear()))
    fromStr = `${year}-01`
    toStr   = `${year}-12`
  }

  res.json(await computeMonthlySeries(userId, fromStr, toStr))
})

// ── Daily portfolio value ─────────────────────────────────────────────────────

export async function computePortfolioValueAtDay(
  data: PrefetchedData,
  dateStr: string,
  pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>>,
  splitEventsCache?: Map<number, SplitFactorEvent[]>,
  fxMemo?: (currency: string) => Promise<number>
): Promise<{ total: number; detail: Array<{ asset_id: number; value: number }> }> {
  const getFx = fxMemo ?? getFxRate
  const isCurrentOrFuture = dateStr >= localDate(new Date())

  const { assets, contributions: allContribs, manualValues: allMVRaw } = data
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

  const fiAssetIdSet = new Set(assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id))
  const fiTranchesMap: Record<number, FITranche[]> = {}
  for (const c of contributions) {
    if (!fiAssetIdSet.has(c.asset_id) || c.type !== 'buy') continue
    const vBrl = Number(c.value_brl)
    if (vBrl <= 0) continue
    if (!fiTranchesMap[c.asset_id]) fiTranchesMap[c.asset_id] = []
    fiTranchesMap[c.asset_id].push({ principal: vBrl, start_date: c.date as string })
  }

  function getPriceAtDay(assetId: number): { price: number; currency: string; ref_date: string } | undefined {
    const arr = pricesByAsset[assetId]
    if (!arr) return undefined
    let best: typeof arr[0] | undefined
    for (const p of arr) {
      if (p.ref_date <= dateStr) best = p
      else break
    }
    return best ? { price: best.price, currency: best.currency, ref_date: best.ref_date } : undefined
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

  // Assets are independent of each other here (same reasoning as computePortfolioValueAtMonth
  // above), so the FX/BCB/live-price awaits can run concurrently instead of serially per asset.
  const perAsset = await Promise.all(assets.map(async (a): Promise<{ asset_id: number; value: number } | null> => {
    // Same rule as computePortfolioValueAtMonth: inactive ticker assets still count on
    // historical dates where they were held (their cash flows are in the series), and
    // only drop out of current/future valuations. Manual/FI inactive assets stay
    // excluded entirely — their carry-forward valuation would never decay to zero.
    const isTickerType = a.asset_type !== 'manual' && a.asset_type !== 'fixed_income'
    if (!a.active && (isCurrentOrFuture || !isTickerType)) return null
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
          const interp = dateStr >= pts[0].ref_date
            ? interpolateKnownPointsDaily(pts, dateStr) : null
          if (interp) {
            const fx = interp.currency === 'BRL' ? 1 : await getFx(interp.currency)
            value = interp.value * fx
          }
        }
      } else if (a.asset_type === 'fixed_income') {
        const fiStartDate     = a.fi_start_date as string | null
        const fiEarliestStart = fiStartDate ?? fiTranchesMap[a.id]?.[0]?.start_date ?? null
        if (fiEarliestStart && fiEarliestStart > dateStr) return null

        const ph = getPriceAtDay(a.id)
        const phIsExact = ph?.ref_date === dateStr
        if (ph && (phIsExact || !isCurrentOrFuture)) {
          const fx = ph.currency === 'BRL' ? 1 : await getFx(ph.currency)
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
          const splitEvents = splitEventsCache?.get(a.id) ?? computeSplitFactorEvents(allContribs, a.id)
          const adjHoldings = splitEvents.length > 0
            ? holdings * getSplitAdjustmentFactor(splitEvents, dateStr)
            : holdings * getSeriesCalibrationFactor(data, a.id)
          const ph = getPriceAtDay(a.id)
          const phIsExact = ph?.ref_date === dateStr
          if (isCurrentOrFuture && !phIsExact) {
            try {
              const result = await getCurrentPrice(a as Asset)
              const fx = result.currency === 'BRL' ? 1 : await getFx(result.currency)
              value = adjHoldings * result.price * fx
            } catch {
              if (ph) { const fx = await getFx(ph.currency); value = adjHoldings * ph.price * fx }
              else     { value = costBasisValue }
            }
          } else {
            if (ph) { const fx = await getFx(ph.currency); value = adjHoldings * ph.price * fx }
            else     { value = costBasisValue }
          }
        }
      }
    } catch { value = costBasisValue }

    return value > 0 ? { asset_id: a.id, value: Math.round(value * 100) / 100 } : null
  }))

  let total = 0
  const detail: Array<{ asset_id: number; value: number }> = []
  for (const r of perAsset) {
    if (!r) continue
    detail.push(r)
    total += r.value
  }

  return { total: Math.round(total * 100) / 100, detail }
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

  // Load only price_history rows back 90 days before the window (carry-backward buffer).
  // This reduces ~78k rows to ~3k for a 30-day window.
  const priceFromDate = new Date(fromStr + 'T12:00:00')
  priceFromDate.setDate(priceFromDate.getDate() - 90)
  const priceFrom = localDate(priceFromDate)
  const prefetched = await fetchPrefetchedData(userId, priceFrom)
  await prefetchFIRates(prefetched)

  const pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>> = {}
  for (const p of prefetched.prices) {
    if (!pricesByAsset[p.asset_id]) pricesByAsset[p.asset_id] = []
    pricesByAsset[p.asset_id].push(p)
  }

  const dates: string[] = []
  const cur = new Date(fromStr + 'T12:00:00')
  const end = new Date(toStr   + 'T12:00:00')
  while (cur <= end) { dates.push(localDate(cur)); cur.setDate(cur.getDate() + 1) }

  const splitEventsCache = buildSplitEventsCache(prefetched.contributions, prefetched.assets.map(a => a.id))
  const fxMemo = makeFxMemo()
  const values = await Promise.all(dates.map(d => computePortfolioValueAtDay(prefetched, d, pricesByAsset, splitEventsCache, fxMemo)))

  const contribsByDay: Record<string, number> = {}
  // Running total since inception through days BEFORE the window — mirrors the
  // asset-level invested_brl so the "Aportes" chart line reflects total
  // invested-to-date even when the selected period doesn't start at inception.
  let cumulContrib = 0
  for (const c of prefetched.contributions) {
    if (c.type === 'income' || c.date > toStr) continue
    const vBrl = Number(c.value_brl) > 0
      ? Number(c.value_brl)
      : (Number(c.price_orig) > 0 && Number(c.quantity) > 0
          ? Number(c.price_orig) * Number(c.quantity) * (Number(c.fx_rate_brl) || (c.currency && c.currency !== 'BRL' ? 5.7 : 1))
          : 0)
    const delta = c.type === 'buy' ? vBrl : -vBrl
    if (c.date < fromStr) { cumulContrib += delta; continue }
    contribsByDay[c.date] = (contribsByDay[c.date] ?? 0) + delta
  }

  const daily = dates.map((date, i) => {
    cumulContrib += contribsByDay[date] ?? 0
    return {
      date,
      total:                    values[i].total,
      contributions:            Math.round((contribsByDay[date] ?? 0) * 100) / 100,
      contributions_cumulative: Math.round(cumulContrib * 100) / 100,
    }
  })

  res.json({ daily })
})

export interface BenchmarksResult {
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
  if (months.length === 0) {
    return { cdi_pct: null, ibov_pct: null, sp500_pct: null, monthly: [] }
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
    const rows = await cache.getOrFetch(
      `benchmark:monthly:${ticker}:${p1}:${p2}`,
      TTL.PRICE_HISTORICAL,
      async () => (await getYf()).historical(ticker, { period1: p1, period2: p2, interval: '1mo' }),
    )
    const pts = rows.map(r => ({
      ym:    localYM(r.date),
      price: r.close ?? r.adjClose ?? 0,
    })).filter(r => r.ym >= fromStr && r.ym <= toStr)

    if (todayYM <= toStr) {
      try {
        const d2ago = localDate(new Date(Date.now() - 2 * 86400000))
        const daily = await cache.getOrFetch(
          `benchmark:daily:${ticker}:${d2ago}:${today}`,
          TTL.PRICE_CURRENT,
          async () => (await getYf()).historical(ticker, { period1: d2ago, period2: today, interval: '1d' }),
        )
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

  const [ibovPts, sp500Pts] = await Promise.all([
    fetchRangeMonthly('^BVSP').catch(() => []),
    fetchRangeMonthly('^GSPC').catch(() => []),
  ])

  let ibovPct: number | null = null
  if (ibovPts.length >= 1) {
    const base = ibovPts[0].price
    for (const entry of monthly) {
      const match = ibovPts.find(p => p.ym === entry.month)
      entry.ibov_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
    }
  }

  let sp500Pct: number | null = null
  if (sp500Pts.length >= 1) {
    const base = sp500Pts[0].price
    for (const entry of monthly) {
      const match = sp500Pts.find(p => p.ym === entry.month)
      entry.sp500_cum = match ? Math.round((match.price / base) * 10000) / 10000 : null
    }
  }

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

  return { cdi_pct: cdiPct, ibov_pct: ibovPct, sp500_pct: sp500Pct, monthly }
}

router.get('/benchmarks', requireAuth, async (req, res: Response) => {
  let fromStr: string, toStr: string
  if (req.query.from && req.query.to) {
    fromStr = req.query.from as string
    toStr   = req.query.to   as string
  } else {
    const year = parseInt(req.query.year as string || String(new Date().getFullYear()))
    fromStr = `${year}-01`
    toStr   = `${year}-12`
  }

  res.json(await computeBenchmarks(fromStr, toStr))
})

export async function computeInception(userId: string): Promise<string | null> {
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
  return firstDate ? firstDate.substring(0, 7) : null
}

router.get('/inception', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const inception = await computeInception(userId)
  res.json({ inception })
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

export async function computeAssetReturns(userId: string, fromStr: string, toStr: string): Promise<Record<number, number | null>> {
  const isDaily = DATE_RE.test(fromStr) && DATE_RE.test(toStr)
  const todayStr = localDate(new Date())

  let fromDate: string
  let toDate: string
  let isCurrentPeriod: boolean

  if (isDaily) {
    fromDate = fromStr
    toDate   = toStr
    isCurrentPeriod = toStr >= todayStr
  } else {
    const [fromY, fromM] = fromStr.split('-').map(Number)
    const [toY,   toM  ] = toStr.split('-').map(Number)
    const currentYM = localYM(new Date())
    isCurrentPeriod = toStr >= currentYM
    fromDate = `${fromY}-${String(fromM).padStart(2, '0')}-01`
    const toLastDay = new Date(toY, toM, 0).getDate()
    toDate = `${toY}-${String(toM).padStart(2, '0')}-${String(toLastDay).padStart(2, '0')}`
  }
  const interpFn = isDaily ? interpolateKnownPointsDaily : interpolateKnownPoints

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', userId)
    .eq('active', true)
    .in('asset_type', ['ticker', 'manual'])

  if (!assets?.length) return {}

  const tickerAssets = assets.filter(a => a.asset_type === 'ticker')
  const manualAssets = assets.filter(a => a.asset_type === 'manual')
  const tickerIds    = tickerAssets.map(a => a.id)

  const returns: Record<number, number | null> = {}

  // ── Ticker assets: price_history ────────────────────────────────────────────
  if (tickerIds.length > 0) {
    // Three targeted queries replace the old single allHistory fetch:
    // endPricesRaw: most recent price per asset up to period end
    // preFromPrices: most recent price per asset strictly before period start (→ startMap)
    // oldestPrices:  oldest price per asset ever (→ oldestMap fallback)
    // Each limit(1000) is well within Supabase's row cap for any realistic portfolio size.
    const [{ data: endPricesRaw }, { data: preFromPrices }, { data: oldestPrices }] = await Promise.all([
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).lte('ref_date', toDate).order('ref_date', { ascending: false }).limit(1000),
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).lt('ref_date', fromDate).order('ref_date', { ascending: false }).limit(1000),
      supabaseAdmin.from('price_history').select('asset_id, price, ref_date')
        .in('asset_id', tickerIds).order('ref_date', { ascending: true }).limit(1000),
    ])

    const startMap:  Record<number, number> = {}
    const oldestMap: Record<number, number> = {}
    for (const p of (preFromPrices ?? [])) {
      if (!(p.asset_id in startMap)) startMap[p.asset_id] = p.price  // DESC → first = most recent before fromDate
    }
    for (const p of (oldestPrices ?? [])) {
      if (!(p.asset_id in oldestMap)) oldestMap[p.asset_id] = p.price  // ASC → first = oldest ever
    }

    const endMap: Record<number, { price: number; ref_date: string }> = {}
    for (const p of (endPricesRaw ?? [])) {
      if (!(p.asset_id in endMap)) endMap[p.asset_id] = { price: p.price, ref_date: p.ref_date }
    }

    if (isCurrentPeriod) {
      const isStale = isDaily
        ? (entry: { ref_date: string } | undefined) => !entry || entry.ref_date < todayStr
        : (entry: { ref_date: string } | undefined) => !entry || entry.ref_date.substring(0, 7) < todayStr.substring(0, 7)
      await Promise.all(tickerAssets.map(async (a) => {
        if (isStale(endMap[a.id])) {
          try {
            const result = await getCurrentPrice(a as Asset)
            endMap[a.id] = { price: result.price, ref_date: todayStr }
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
          const rows = await (await getYf()).historical(a.ticker_yahoo!, {
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

  // Manual assets don't have a real return: their "value" is just whatever the
  // user typed in for that month, not a market price with a purchase cost basis,
  // so (end/start - 1) would report a plain value update as if it were an
  // investment return %. Same distinction the monthly performance series already
  // makes (there gain = value - prev_value - contributions, which for manual
  // assets naturally collapses to a value delta rather than a % return) —
  // here we just don't compute a return at all for them.
  for (const a of manualAssets) {
    returns[a.id] = null
  }

  return returns
}

// Per-asset POSITION return (Simple Dietz) for [fromStr, toStr] ('YYYY-MM'), alongside the
// asset's own price variation. position = (value_end - value_start - net_contribs) /
// (value_start + 0.5 * net_contribs) — the same formula the Performance page uses for the
// whole portfolio, applied per asset, so a mid-period contribution is not reported as gain.
// price = computeAssetReturns' price variation (what the asset itself did in the period).
// Manual assets get position=null (their "value" is a typed-in number, not a return).
export interface AssetReturnPair { position: number | null; price: number | null }

export async function computeAssetPositionReturns(
  userId: string, fromStr: string, toStr: string
): Promise<Record<number, AssetReturnPair>> {
  const isDaily = DATE_RE.test(fromStr) && DATE_RE.test(toStr)

  const data = await fetchPrefetchedData(userId)
  await prefetchFIRates(data)
  const splitEventsCache = buildSplitEventsCache(data.contributions, data.assets.map(a => a.id))
  const fxMemo = makeFxMemo()
  const priceIndex = buildPriceIndex(data.prices)

  let start: { detail: Array<{ asset_id: number; value: number }> }
  let end:   { detail: Array<{ asset_id: number; value: number }> }
  let priceReturns: Record<number, number | null>
  let fromDateStr: string
  let toDateStr: string

  if (isDaily) {
    const today = localDate(new Date())
    const clampedTo = toStr > today ? today : toStr
    const startDate = new Date(fromStr + 'T12:00:00')
    startDate.setDate(startDate.getDate() - 1)
    const startStr = localDate(startDate)
    const pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>> = {}
    for (const p of data.prices) (pricesByAsset[p.asset_id] ??= []).push(p)
    ;[priceReturns, start, end] = await Promise.all([
      computeAssetReturns(userId, fromStr, toStr),
      computePortfolioValueAtDay(data, startStr,  pricesByAsset, splitEventsCache, fxMemo),
      computePortfolioValueAtDay(data, clampedTo, pricesByAsset, splitEventsCache, fxMemo),
    ])
    fromDateStr = fromStr
    toDateStr   = clampedTo
  } else {
    const [fromY, fromM] = fromStr.split('-').map(Number)
    const currentYM = localYM(new Date())
    const clampedToStr = toStr > currentYM ? currentYM : toStr
    const [toY, toM] = clampedToStr.split('-').map(Number)
    const prevM = fromM === 1 ? 12 : fromM - 1
    const prevY = fromM === 1 ? fromY - 1 : fromY
    ;[priceReturns, start, end] = await Promise.all([
      computeAssetReturns(userId, fromStr, toStr),
      computePortfolioValueAtMonth(data, prevY, prevM, splitEventsCache, fxMemo, priceIndex),
      computePortfolioValueAtMonth(data, toY,   toM,  splitEventsCache, fxMemo, priceIndex),
    ])
    fromDateStr = `${fromStr}-01`
    const toLastDay = new Date(toY, toM, 0).getDate()
    toDateStr = `${clampedToStr}-${String(toLastDay).padStart(2, '0')}`
  }

  const vsMap: Record<number, number> = {}
  for (const d of start.detail) vsMap[d.asset_id] = d.value
  const veMap: Record<number, number> = {}
  for (const d of end.detail) veMap[d.asset_id] = d.value

  const cfMap: Record<number, number> = {}
  for (const c of data.contributions) {
    if (c.type === 'income' || c.date < fromDateStr || c.date > toDateStr) continue
    const v = estimateContribValue(c)
    cfMap[c.asset_id] = (cfMap[c.asset_id] ?? 0) + (c.type === 'buy' ? v : -v)
  }

  const out: Record<number, AssetReturnPair> = {}
  for (const a of data.assets) {
    const price = priceReturns[a.id] ?? null
    let position: number | null = null
    if (a.asset_type !== 'manual') {
      const vs = vsMap[a.id] ?? 0
      const ve = veMap[a.id] ?? 0
      const cf = cfMap[a.id] ?? 0
      const denom = vs + 0.5 * cf
      if ((vs > 0 || cf > 0) && denom > 0) {
        position = Math.round(((ve - vs - cf) / denom) * 10000) / 100
      }
    }
    out[a.id] = { position, price }
  }
  return out
}

router.get('/asset-position-returns', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || localYM(new Date())
  const toStr   = (req.query.to   as string) || localYM(new Date())
  res.json(await cache.getOrFetch(
    `asset-position-returns:${userId}:${fromStr}:${toStr}`,
    60_000,
    () => computeAssetPositionReturns(userId, fromStr, toStr),
  ))
})

router.get('/asset-returns', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const fromStr = (req.query.from as string) || localYM(new Date())
  const toStr   = (req.query.to   as string) || localYM(new Date())
  // Short cache: the Assets page refires this on every period-tab switch and the
  // Dashboard requests the same ranges — within the TTL they share one computation
  // (which may include live price lookups for stale tickers).
  res.json(await cache.getOrFetch(
    `asset-returns:${userId}:${fromStr}:${toStr}`,
    60_000,
    () => computeAssetReturns(userId, fromStr, toStr),
  ))
})

export default router
