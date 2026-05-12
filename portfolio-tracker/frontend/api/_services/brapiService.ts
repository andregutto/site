import { cache, TTL } from '../_lib/cache.js'

const BASE = 'https://brapi.dev/api'
const TOKEN = process.env.BRAPI_TOKEN ? `?token=${process.env.BRAPI_TOKEN}` : ''
const SEP   = TOKEN ? '&' : '?'

interface BrapiResult {
  symbol: string
  regularMarketPrice: number
  currency: string
  historicalDataPrice?: Array<{ date: number; close: number }>
}

async function fetchBrapi(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`brapi ${res.status}: ${path}`)
  const json = await res.json() as { results?: BrapiResult[]; error?: string }
  if (json.error) throw new Error(`brapi error: ${json.error}`)
  return json
}

export async function getCurrentPrice(ticker: string): Promise<number> {
  return cache.getOrFetch(
    `brapi:current:${ticker}`,
    TTL.PRICE_CURRENT,
    async () => {
      const json = await fetchBrapi(`/quote/${ticker}${TOKEN}`) as { results: BrapiResult[] }
      const price = json.results?.[0]?.regularMarketPrice
      if (price == null) throw new Error(`Preço não encontrado para ${ticker}`)
      return price
    }
  )
}

export interface PricePoint { date: string; price: number }

export async function getMonthlyHistory(ticker: string, months = 24): Promise<PricePoint[]> {
  return cache.getOrFetch(
    `brapi:history:${ticker}:${months}`,
    TTL.PRICE_HISTORICAL,
    async () => {
      const range = months <= 12 ? '1y' : '2y'
      const json = await fetchBrapi(
        `/quote/${ticker}${TOKEN}${SEP}range=${range}&interval=1mo&fundamental=false`
      ) as { results: BrapiResult[] }

      const hist = json.results?.[0]?.historicalDataPrice ?? []
      return hist.map((p) => ({
        date:  new Date(p.date * 1000).toISOString().split('T')[0],
        price: p.close,
      })).reverse()
    }
  )
}
