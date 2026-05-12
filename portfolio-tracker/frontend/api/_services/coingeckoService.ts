import { cache, TTL } from '../_lib/cache.js'

const BASE = 'https://api.coingecko.com/api/v3'

export interface PricePoint { date: string; price: number }

async function cg<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export async function getCurrentPrices(
  ids: string[],
  vsCurrency = 'usd'
): Promise<Record<string, number>> {
  const key = `coingecko:current:${ids.join(',')}:${vsCurrency}`
  return cache.getOrFetch(key, TTL.PRICE_CURRENT, async () => {
    const data = await cg<Record<string, Record<string, number>>>(
      `/simple/price?ids=${ids.join(',')}&vs_currencies=${vsCurrency}`
    )
    return Object.fromEntries(
      Object.entries(data).map(([id, prices]) => [id, prices[vsCurrency]])
    )
  })
}

export async function getCurrentPrice(coingeckoId: string, vsCurrency = 'usd'): Promise<number> {
  const prices = await getCurrentPrices([coingeckoId], vsCurrency)
  const price  = prices[coingeckoId]
  if (price == null) throw new Error(`CoinGecko: preço não encontrado para ${coingeckoId}`)
  return price
}

export async function getMonthlyHistory(
  coingeckoId: string,
  months = 24,
  vsCurrency = 'usd'
): Promise<PricePoint[]> {
  const key = `coingecko:history:${coingeckoId}:${months}:${vsCurrency}`
  return cache.getOrFetch(key, TTL.PRICE_HISTORICAL, async () => {
    const days = months * 31
    const data = await cg<{ prices: [number, number][] }>(
      `/coins/${coingeckoId}/market_chart?vs_currency=${vsCurrency}&days=${days}`
    )
    const monthMap = new Map<string, number>()
    for (const [ts, price] of data.prices) {
      const monthKey = new Date(ts).toISOString().substring(0, 7)
      monthMap.set(monthKey, price)
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, price]) => ({ date: month + '-01', price }))
  })
}
