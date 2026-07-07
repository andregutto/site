import type YahooFinance from 'yahoo-finance2'
import { cache, TTL } from '../lib/cache.js'

// Import dinâmico: yahoo-finance2 é um dos maiores pacotes do bundle serverless,
// e a maioria das requests (notificações, comunidade, mensagens...) nunca toca
// em preço Yahoo. Carregar sob demanda tira o parse do pacote do cold start de
// todas as rotas; só a primeira chamada de preço da instância paga o custo.
type Yf = InstanceType<typeof YahooFinance>
let yfInstance: Yf | null = null
export async function getYf(): Promise<Yf> {
  if (!yfInstance) {
    const { default: YF } = await import('yahoo-finance2')
    yfInstance = new YF({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
  }
  return yfInstance
}

export interface PricePoint { date: string; price: number }

export async function getAssetSector(yahooTicker: string): Promise<string | null> {
  return cache.getOrFetch(
    `yahoo:sector:${yahooTicker}`,
    24 * 60 * 60 * 1000,
    async () => {
      try {
        const summary = await (await getYf()).quoteSummary(yahooTicker, { modules: ['quoteType', 'assetProfile'] as any })
        const qType = (summary as any).quoteType?.quoteType as string | undefined
        if (qType === 'ETF' || qType === 'MUTUALFUND') return 'ETF'
        const sector = (summary as any).assetProfile?.sector as string | undefined
        return (sector && sector.length > 0) ? sector : null
      } catch {
        return null
      }
    }
  )
}

export async function getCurrentPrice(ticker: string): Promise<number> {
  return cache.getOrFetch(
    `yahoo:current:${ticker}`,
    TTL.PRICE_CURRENT,
    async () => {
      const quote = await (await getYf()).quote(ticker, { fields: ['regularMarketPrice'] })
      const price = quote.regularMarketPrice
      if (price == null) throw new Error(`Yahoo: preço não encontrado para ${ticker}`)
      return price
    }
  )
}

export async function getPriceAtDate(ticker: string, targetDate: string): Promise<number | null> {
  const d = new Date(targetDate + 'T12:00:00Z')
  const p1 = new Date(d); p1.setDate(d.getDate() - 7)
  const p2 = new Date(d); p2.setDate(d.getDate() + 7)
  try {
    const rows = await (await getYf()).historical(ticker, {
      period1: p1.toISOString().split('T')[0],
      period2: p2.toISOString().split('T')[0],
      interval: '1d',
    })
    if (!rows.length) return null
    const target = d.getTime()
    const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime())
    const after  = sorted.find(r => r.date.getTime() >= target)
    const before = sorted.filter(r => r.date.getTime() < target).pop()
    const best   = after ?? before
    return best ? (best.close ?? best.adjClose ?? null) : null
  } catch {
    return null
  }
}

export async function getMonthlyHistory(ticker: string, months = 24): Promise<PricePoint[]> {
  return cache.getOrFetch(
    `yahoo:history:${ticker}:${months}`,
    TTL.PRICE_HISTORICAL,
    async () => {
      const period1 = new Date()
      period1.setMonth(period1.getMonth() - months)
      const period2 = new Date().toISOString().split('T')[0]

      const rows = await (await getYf()).historical(ticker, {
        period1: period1.toISOString().split('T')[0],
        period2,
        interval: '1mo',
      })

      return rows.map((r) => ({
        date:  r.date.toISOString().split('T')[0],
        price: r.close ?? r.adjClose ?? 0,
      }))
    }
  )
}

export interface SplitEvent {
  date: string
  numerator: number
  denominator: number
  ratio: string
}

export async function getSplitEvents(ticker: string, sinceDate?: string): Promise<SplitEvent[]> {
  try {
    const result = await (await getYf()).quoteSummary(ticker, { modules: ['splitEvents'] as any })
    const events = ((result as any).splitEvents ?? []) as Array<{ date: Date; numerator: number; denominator: number; splitRatio?: string }>
    return events
      .map(e => ({
        date: e.date.toISOString().split('T')[0],
        numerator: e.numerator,
        denominator: e.denominator,
        ratio: e.splitRatio ?? `${e.numerator}:${e.denominator}`,
      }))
      .filter(e => !sinceDate || e.date >= sinceDate)
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

export async function getDailyHistory(ticker: string, days = 365): Promise<PricePoint[]> {
  return cache.getOrFetch(
    `yahoo:daily:${ticker}:${days}`,
    TTL.PRICE_HISTORICAL,
    async () => {
      const period1 = new Date()
      period1.setDate(period1.getDate() - days)
      const period2 = new Date().toISOString().split('T')[0]

      const rows = await (await getYf()).historical(ticker, {
        period1: period1.toISOString().split('T')[0],
        period2,
        interval: '1d',
      })

      return rows
        .map((r) => ({ date: r.date.toISOString().split('T')[0], price: r.close ?? r.adjClose ?? 0 }))
        .filter(r => r.price > 0)
    }
  )
}
