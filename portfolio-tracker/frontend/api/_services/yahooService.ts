import YahooFinance from 'yahoo-finance2'
import { cache, TTL } from '../_lib/cache.js'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

export interface PricePoint { date: string; price: number }

export async function getCurrentPrice(ticker: string): Promise<number> {
  return cache.getOrFetch(
    `yahoo:current:${ticker}`,
    TTL.PRICE_CURRENT,
    async () => {
      const quote = await yf.quote(ticker, { fields: ['regularMarketPrice'] })
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
    const rows = await yf.historical(ticker, {
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

      const rows = await yf.historical(ticker, {
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
