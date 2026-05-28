// CoinGecko — preços de criptomoedas (sem API key, rate limit ~30 req/min)
import { cache, TTL } from '../lib/cache.js'

const BASE = 'https://api.coingecko.com/api/v3'

export interface PricePoint { date: string; price: number }

async function cg<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

// Busca preço atual de vários IDs de uma vez (mais eficiente)
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
    // Free tier não aceita interval=monthly — retorna dados diários e agregamos manualmente
    const data = await cg<{ prices: [number, number][] }>(
      `/coins/${coingeckoId}/market_chart?vs_currency=${vsCurrency}&days=${days}`
    )
    // Agrega diário→mensal: último preço de cada mês
    const monthMap = new Map<string, number>()
    for (const [ts, price] of data.prices) {
      const monthKey = new Date(ts).toISOString().substring(0, 7) // YYYY-MM
      monthMap.set(monthKey, price)
    }
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, price]) => ({ date: month + '-01', price }))
  })
}

export async function getDailyHistory(
  coingeckoId: string,
  days = 365,
  vsCurrency = 'usd'
): Promise<PricePoint[]> {
  const key = `coingecko:daily:${coingeckoId}:${days}:${vsCurrency}`
  return cache.getOrFetch(key, TTL.PRICE_HISTORICAL, async () => {
    const data = await cg<{ prices: [number, number][] }>(
      `/coins/${coingeckoId}/market_chart?vs_currency=${vsCurrency}&days=${days}`
    )
    return data.prices
      .map(([ts, price]) => ({ date: new Date(ts).toISOString().split('T')[0], price }))
      .filter(r => r.price > 0)
  })
}
