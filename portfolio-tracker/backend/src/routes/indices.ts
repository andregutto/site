import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getRates, SERIES } from '../services/bcbService.js'
import { cache, TTL } from '../lib/cache.js'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
const router = Router()

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type IndexCode = 'IBOV' | 'SP500' | 'NASDAQ' | 'DJI' | 'GOLD' | 'CDI' | 'SELIC' | 'IPCA' | 'USDBRL' | 'EURBRL'

interface IndexDef {
  name: string
  category: string
  source: 'yahoo' | 'bcb'
  ticker?: string
  series?: number
  unit: string
  description: string
}

const INDEX_DEFS: Record<IndexCode, IndexDef> = {
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

const INDEX_ORDER: IndexCode[] = ['IBOV', 'CDI', 'SELIC', 'IPCA', 'SP500', 'NASDAQ', 'DJI', 'GOLD', 'USDBRL', 'EURBRL']

interface MonthlyPoint { month: string; value: number; pct_month: number | null }

async function fetchYahooMonthly(ticker: string, fromYM: string): Promise<MonthlyPoint[]> {
  const today = localDate(new Date())
  const currentYM = localYM(new Date())
  const p1 = fromYM + '-01'

  const rows = await yf.historical(ticker, { period1: p1, period2: today, interval: '1mo' })
  const raw = rows
    .map(r => ({ month: localYM(r.date), close: r.close ?? r.adjClose ?? 0 }))
    .filter(r => r.month >= fromYM)
    .sort((a, b) => a.month.localeCompare(b.month))

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
  } catch { /* fall back */ }

  return raw.map((d, i) => {
    const prev = i > 0 ? raw[i - 1].close : null
    const pct_month = prev && prev > 0 ? Math.round((d.close / prev - 1) * 10000) / 100 : null
    return { month: d.month, value: d.close, pct_month }
  })
}

async function fetchBcbMonthly(series: number, fromYM: string): Promise<MonthlyPoint[]> {
  const startDate = new Date(parseInt(fromYM.slice(0, 4)), parseInt(fromYM.slice(5, 7)) - 1, 1)
  const rates = await getRates(series, startDate, new Date())

  if (series === SERIES.CDI) {
    const monthMap = new Map<string, number>()
    for (const r of rates) {
      const m = localYM(r.date)
      monthMap.set(m, (monthMap.get(m) ?? 1) * (1 + r.value / 100))
    }
    const months = Array.from(monthMap.keys()).sort()
    return months.map(m => ({
      month: m,
      value: Math.round((monthMap.get(m)! - 1) * 10000) / 100,
      pct_month: Math.round((monthMap.get(m)! - 1) * 10000) / 100,
    }))
  }

  if (series === SERIES.SELIC) {
    const monthMap = new Map<string, number>()
    for (const r of rates) monthMap.set(localYM(r.date), r.value)
    const months = Array.from(monthMap.keys()).sort()
    return months.map(m => ({ month: m, value: monthMap.get(m)!, pct_month: null }))
  }

  if (series === SERIES.IPCA) {
    return rates
      .map(r => ({ month: localYM(r.date), value: r.value, pct_month: r.value }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }

  return []
}

function accumulatedPct(monthly: MonthlyPoint[], fromYM: string, toYM: string): number | null {
  const slice = monthly.filter(m => m.month >= fromYM && m.month <= toYM)
  if (!slice.length) return null
  let cum = 1
  for (const s of slice) {
    if (s.pct_month != null) cum *= (1 + s.pct_month / 100)
  }
  return Math.round((cum - 1) * 10000) / 100
}

function ytdFromYM() { return `${new Date().getFullYear()}-01` }
function m12FromYM() { const d = new Date(); d.setMonth(d.getMonth() - 11); return localYM(d) }
function prevMonthYM() { const d = new Date(); d.setMonth(d.getMonth() - 1); return localYM(d) }

router.get('/', requireAuth, async (_req, res: Response) => {
  const cacheKey = `indices:snapshot:${localYM(new Date())}`
  const cached = cache.get<object[]>(cacheKey)
  if (cached) { res.json(cached); return }

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
      const currentYM = localYM(new Date())

      let currentValue: number | null = last?.value ?? null
      let ytd: number | null = null
      let m12: number | null = null
      let m1: number | null = null

      if (def.source === 'yahoo') {
        const ytdPrev = monthly.filter(m => m.month < ytdFromYM()).pop()
        if (ytdPrev && last) ytd = Math.round((last.value / ytdPrev.value - 1) * 10000) / 100
        const m12Prev = monthly.filter(m => m.month < m12FromYM()).pop()
        if (m12Prev && last) m12 = Math.round((last.value / m12Prev.value - 1) * 10000) / 100
        m1 = monthly.find(m => m.month === prevMonthYM())?.pct_month ?? null
      } else {
        ytd = accumulatedPct(monthly, ytdFromYM(), currentYM)
        m12 = accumulatedPct(monthly, m12FromYM(), currentYM)
        m1 = monthly.find(m => m.month === prevMonthYM())?.pct_month ?? null
        if (def.series === SERIES.CDI) {
          try {
            const weekAgo = new Date(Date.now() - 7 * 86400000)
            const latestRates = await getRates(SERIES.CDI, weekAgo, new Date())
            if (latestRates.length > 0) {
              const d = latestRates[latestRates.length - 1].value
              currentValue = Math.round((Math.pow(1 + d / 100, 252) - 1) * 10000) / 100
            }
          } catch {}
        }
      }

      return {
        code, name: def.name, category: def.category, unit: def.unit, description: def.description,
        value: currentValue != null ? Math.round(currentValue * 100) / 100 : null,
        prev_value: prev?.value != null ? Math.round(prev.value * 100) / 100 : null,
        ytd_pct: ytd, m12_pct: m12, m1_pct: m1,
      }
    })
  )

  const data = results
    .map((r, i) => r.status === 'fulfilled' ? r.value : { code: INDEX_ORDER[i], error: true })
    .filter(r => !('error' in r))

  cache.set(cacheKey, data, TTL.PRICE_CURRENT)
  res.json(data)
})

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
    if (def.source === 'yahoo' && def.ticker) monthly = await fetchYahooMonthly(def.ticker, fromYM)
    else if (def.source === 'bcb' && def.series != null) monthly = await fetchBcbMonthly(def.series, fromYM)
  } catch { res.status(500).json({ error: 'Failed to fetch index data' }); return }

  const annualMap = new Map<number, { rates: number[]; decPrev?: number; decCur?: number }>()
  for (const m of monthly) {
    const year = parseInt(m.month.slice(0, 4))
    if (!annualMap.has(year)) annualMap.set(year, { rates: [] })
    const entry = annualMap.get(year)!
    if (m.pct_month != null) entry.rates.push(m.pct_month)
    if (m.month.endsWith('-12')) entry.decCur = m.value
  }
  // Set decPrev for each year from decCur of prior year
  const years = Array.from(annualMap.keys()).sort()
  for (let i = 1; i < years.length; i++) {
    const prev = annualMap.get(years[i - 1])
    if (prev?.decCur) annualMap.get(years[i])!.decPrev = prev.decCur
  }

  const annual = years.map(year => {
    const d = annualMap.get(year)!
    let pct: number | null = null
    if (def.source === 'yahoo' && d.decPrev && d.decCur) {
      pct = Math.round((d.decCur / d.decPrev - 1) * 10000) / 100
    } else if (d.rates.length > 0) {
      let cum = 1
      for (const r of d.rates) cum *= (1 + r / 100)
      pct = Math.round((cum - 1) * 10000) / 100
    }
    return { year, pct }
  })

  const payload = { code, name: def.name, category: def.category, unit: def.unit, description: def.description, monthly, annual }
  cache.set(cacheKey, payload, TTL.FX_HISTORICAL)
  res.json(payload)
})

export default router
