import { Router, Response } from 'express'
import { requireAuth } from '../_middleware/auth.js'
import { getRates, SERIES } from '../_services/bcbService.js'
import { cache, TTL } from '../_lib/cache.js'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
const router = Router()

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export type IndexCode = 'IBOV' | 'SP500' | 'NASDAQ' | 'DJI' | 'GOLD' | 'CDI' | 'SELIC' | 'IPCA' | 'USDBRL' | 'EURBRL'

export interface IndexDef {
  name: string
  category: 'br_equity' | 'us_equity' | 'br_rate' | 'br_inflation' | 'fx' | 'commodity'
  source: 'yahoo' | 'bcb'
  ticker?: string
  series?: number
  unit: string
  description: string
}

export const INDEX_DEFS: Record<IndexCode, IndexDef> = {
  IBOV:   { name: 'Ibovespa',  category: 'br_equity',    source: 'yahoo', ticker: '^BVSP',    unit: 'pts',    description: 'Índice Bovespa' },
  CDI:    { name: 'CDI',       category: 'br_rate',      source: 'bcb',   series: SERIES.CDI,  unit: '% a.a.', description: 'Certificado de Depósito Interbancário' },
  SELIC:  { name: 'Selic',     category: 'br_rate',      source: 'bcb',   series: SERIES.SELIC, unit: '% a.a.', description: 'Taxa básica de juros' },
  IPCA:   { name: 'IPCA',      category: 'br_inflation', source: 'bcb',   series: SERIES.IPCA, unit: '% a.m.', description: 'Índice de inflação oficial' },
  SP500:  { name: 'S&P 500',   category: 'us_equity',    source: 'yahoo', ticker: '^GSPC',    unit: 'pts',    description: 'Standard & Poor\'s 500' },
  NASDAQ: { name: 'Nasdaq',    category: 'us_equity',    source: 'yahoo', ticker: '^IXIC',    unit: 'pts',    description: 'Nasdaq Composite' },
  DJI:    { name: 'Dow Jones', category: 'us_equity',    source: 'yahoo', ticker: '^DJI',     unit: 'pts',    description: 'Dow Jones Industrial Average' },
  GOLD:   { name: 'Ouro',      category: 'commodity',    source: 'yahoo', ticker: 'GC=F',     unit: 'USD/oz', description: 'Ouro (futuros)' },
  USDBRL: { name: 'USD/BRL',   category: 'fx',           source: 'yahoo', ticker: 'USDBRL=X', unit: 'R$',     description: 'Dólar norte-americano' },
  EURBRL: { name: 'EUR/BRL',   category: 'fx',           source: 'yahoo', ticker: 'EURBRL=X', unit: 'R$',     description: 'Euro' },
}

export const INDEX_ORDER: IndexCode[] = ['IBOV', 'CDI', 'SELIC', 'IPCA', 'SP500', 'NASDAQ', 'DJI', 'GOLD', 'USDBRL', 'EURBRL']

export interface MonthlyPoint { month: string; value: number; pct_month: number | null }

// Fetch Yahoo Finance monthly history with daily-close override for current month
async function fetchYahooMonthly(ticker: string, fromYM: string): Promise<MonthlyPoint[]> {
  const today = localDate(new Date())
  const currentYM = localYM(new Date())
  const p1 = fromYM + '-01'

  const rows = await yf.historical(ticker, { period1: p1, period2: today, interval: '1mo' })
  const raw = rows
    .map(r => ({ month: localYM(r.date), close: r.close ?? r.adjClose ?? 0 }))
    .filter(r => r.month >= fromYM)
    .sort((a, b) => a.month.localeCompare(b.month))

  // Override current month with latest daily close for intraday accuracy
  try {
    const d2ago = localDate(new Date(Date.now() - 2 * 86400000))
    const daily = await yf.historical(ticker, { period1: d2ago, period2: today, interval: '1d' })
    if (daily.length > 0) {
      const latestClose = daily[daily.length - 1].close ?? daily[daily.length - 1].adjClose
      if (latestClose) {
        const idx = raw.findIndex(r => r.month === currentYM)
        if (idx >= 0) raw[idx].close = latestClose
        else raw.push({ month: currentYM, close: latestClose })
      }
    }
  } catch { /* fall back to monthly bar */ }

  return raw.map((d, i) => {
    const prev = i > 0 ? raw[i - 1].close : null
    const pct_month = prev && prev > 0 ? Math.round((d.close / prev - 1) * 10000) / 100 : null
    return { month: d.month, value: d.close, pct_month }
  })
}

// Fetch BCB rate-based monthly data
async function fetchBcbMonthly(series: number, fromYM: string): Promise<MonthlyPoint[]> {
  const startDate = new Date(parseInt(fromYM.slice(0, 4)), parseInt(fromYM.slice(5, 7)) - 1, 1)
  const endDate = new Date()
  const rates = await getRates(series, startDate, endDate)

  if (series === SERIES.CDI) {
    // Daily CDI: compound per month → monthly % rate
    const monthMap = new Map<string, number>()
    for (const r of rates) {
      const m = localYM(r.date)
      monthMap.set(m, (monthMap.get(m) ?? 1) * (1 + r.value / 100))
    }
    const months = Array.from(monthMap.keys()).sort()
    return months.map(m => ({
      month: m,
      value: Math.round((monthMap.get(m)! - 1) * 10000) / 100,  // monthly CDI %
      pct_month: Math.round((monthMap.get(m)! - 1) * 10000) / 100,
    }))
  }

  if (series === SERIES.SELIC) {
    // Selic target: take last value per month (% a.a.)
    const monthMap = new Map<string, number>()
    for (const r of rates) {
      monthMap.set(localYM(r.date), r.value)
    }
    const months = Array.from(monthMap.keys()).sort()
    return months.map(m => ({
      month: m,
      value: monthMap.get(m)!,
      pct_month: null,
    }))
  }

  if (series === SERIES.IPCA) {
    // Monthly IPCA %
    return rates
      .map(r => ({ month: localYM(r.date), value: r.value, pct_month: r.value }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  return []
}

function accumulatedPct(monthly: MonthlyPoint[], fromYM: string, toYM: string): number | null {
  const slice = monthly.filter(m => m.month >= fromYM && m.month <= toYM)
  if (!slice.length) return null

  // For rate-based (CDI, IPCA): compound monthly rates
  let cum = 1
  for (const s of slice) {
    if (s.pct_month != null) cum *= (1 + s.pct_month / 100)
  }
  return Math.round((cum - 1) * 10000) / 100
}

function ytdFromYM(): string {
  return `${new Date().getFullYear()}-01`
}

function m12FromYM(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  return localYM(d)
}

function prevMonthYM(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return localYM(d)
}

// ── GET /api/indices ────────────────────────────────────────────────────────
router.get('/', requireAuth, async (_req, res: Response) => {
  const cacheKey = `indices:snapshot:${localYM(new Date())}`
  const cached = cache.get<object[]>(cacheKey)
  if (cached) { res.json(cached); return }

  const currentYM = localYM(new Date())
  const from5y = `${new Date().getFullYear() - 5}-01`

  const results = await Promise.allSettled(
    INDEX_ORDER.map(async (code) => {
      const def = INDEX_DEFS[code]
      let monthly: MonthlyPoint[] = []

      if (def.source === 'yahoo' && def.ticker) {
        monthly = await fetchYahooMonthly(def.ticker, from5y)
      } else if (def.source === 'bcb' && def.series != null) {
        monthly = await fetchBcbMonthly(def.series, from5y)
      }

      const last = monthly[monthly.length - 1]
      const prev = monthly[monthly.length - 2]

      let currentValue: number | null = last?.value ?? null
      let ytd: number | null = null
      let m12: number | null = null
      let m1: number | null = null

      const ytdFrom = ytdFromYM()
      const m12From = m12FromYM()
      const prevM    = prevMonthYM()

      if (def.source === 'yahoo') {
        // Price-based: return = (latest / base - 1) * 100
        const ytdBase = monthly.find(m => m.month === `${currentYM.slice(0, 4)}-01` || m.month >= ytdFrom)
        const ytdPrev = monthly.filter(m => m.month < ytdFrom).pop()
        if (ytdPrev && last) ytd = Math.round((last.value / ytdPrev.value - 1) * 10000) / 100

        const m12Prev = monthly.filter(m => m.month < m12From).pop()
        if (m12Prev && last) m12 = Math.round((last.value / m12Prev.value - 1) * 10000) / 100

        m1 = monthly.find(m => m.month === prevM)?.pct_month ?? null
        void ytdBase  // suppress unused warning
      } else {
        // Rate-based: accumulate monthly rates
        ytd = accumulatedPct(monthly, ytdFrom, currentYM)
        m12 = accumulatedPct(monthly, m12From, currentYM)
        m1 = monthly.find(m => m.month === prevM)?.pct_month ?? null

        // For Selic, current value is the last annual rate (not accumulated)
        if (def.series === SERIES.SELIC) {
          currentValue = last?.value ?? null
        }
        // For CDI, annualize the most recent daily rate for display
        if (def.series === SERIES.CDI) {
          // Fetch latest daily CDI rate and annualize
          try {
            const today = new Date()
            const weekAgo = new Date(today.getTime() - 7 * 86400000)
            const latestRates = await getRates(SERIES.CDI, weekAgo, today)
            if (latestRates.length > 0) {
              const d = latestRates[latestRates.length - 1].value
              currentValue = Math.round((Math.pow(1 + d / 100, 252) - 1) * 10000) / 100
            }
          } catch {}
        }
      }

      return {
        code,
        name: def.name,
        category: def.category,
        unit: def.unit,
        description: def.description,
        value: currentValue != null ? Math.round(currentValue * 100) / 100 : null,
        prev_value: prev?.value != null ? Math.round(prev.value * 100) / 100 : null,
        ytd_pct: ytd,
        m12_pct: m12,
        m1_pct: m1,
      }
    })
  )

  const data = results
    .map((r, i) => r.status === 'fulfilled' ? r.value : { code: INDEX_ORDER[i], error: true })
    .filter(r => !('error' in r))

  cache.set(cacheKey, data, TTL.PRICE_CURRENT)
  res.json(data)
})

// ── GET /api/indices/:code/history ─────────────────────────────────────────
router.get('/:code/history', requireAuth, async (req, res: Response) => {
  const code = req.params.code.toUpperCase() as IndexCode
  const def = INDEX_DEFS[code]
  if (!def) { res.status(404).json({ error: 'Unknown index' }); return }

  const yearsBack = parseInt(req.query.years as string || '5')
  const fromYM = `${new Date().getFullYear() - yearsBack}-01`
  const cacheKey = `indices:history:${code}:${yearsBack}:${localYM(new Date())}`
  const cached = cache.get<object>(cacheKey)
  if (cached) { res.json(cached); return }

  let monthly: MonthlyPoint[] = []
  try {
    if (def.source === 'yahoo' && def.ticker) {
      monthly = await fetchYahooMonthly(def.ticker, fromYM)
    } else if (def.source === 'bcb' && def.series != null) {
      monthly = await fetchBcbMonthly(def.series, fromYM)
    }
  } catch {
    res.status(500).json({ error: 'Failed to fetch index data' }); return
  }

  // Build annual performance table
  const annualMap = new Map<number, { start: number | null; end: number | null; rates: number[] }>()
  for (const m of monthly) {
    const year = parseInt(m.month.slice(0, 4))
    if (!annualMap.has(year)) annualMap.set(year, { start: null, end: null, rates: [] })
    const entry = annualMap.get(year)!
    if (entry.start === null) entry.start = m.value
    entry.end = m.value
    if (m.pct_month != null) entry.rates.push(m.pct_month)
  }

  const annual = Array.from(annualMap.entries())
    .map(([year, d]) => {
      let pct: number | null = null
      if (def.source === 'yahoo' && d.start && d.end) {
        // For price-based: use close of Dec prior year as base
        const decPrev = monthly.filter(m => m.month.startsWith(`${year - 1}-`)).pop()
        const decCur  = monthly.filter(m => m.month.startsWith(`${year}-`)).pop()
        if (decPrev && decCur) {
          pct = Math.round((decCur.value / decPrev.value - 1) * 10000) / 100
        }
      } else if (d.rates.length > 0) {
        // Rate-based: compound monthly rates
        let cum = 1
        for (const r of d.rates) cum *= (1 + r / 100)
        pct = Math.round((cum - 1) * 10000) / 100
      }
      return { year, pct }
    })
    .sort((a, b) => a.year - b.year)

  const payload = {
    code,
    name: def.name,
    category: def.category,
    unit: def.unit,
    description: def.description,
    monthly,
    annual,
  }

  cache.set(cacheKey, payload, TTL.FX_HISTORICAL)
  res.json(payload)
})

export default router
