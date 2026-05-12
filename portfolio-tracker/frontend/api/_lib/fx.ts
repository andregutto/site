import { supabaseAdmin } from './supabase'
import { cache, TTL } from './cache'

const AWESOME_BASE = 'https://economia.awesomeapi.com.br/json'
const FX_FALLBACK: Record<string, number> = { USD: 5.70, EUR: 6.40, GBP: 7.20 }

export async function getFxRate(from: string, to = 'BRL'): Promise<number> {
  if (from === to) return 1
  const url = `${AWESOME_BASE}/last/${from}-${to}`
  try {
    return await cache.getOrFetch(url, TTL.FX_CURRENT, async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`)
      const data = await res.json() as Record<string, Record<string, string>>
      const entry = Object.values(data)[0]
      const rate = parseFloat(entry.bid)
      supabaseAdmin.from('fx_rates').upsert(
        { from_currency: from, to_currency: to, rate, ref_date: new Date().toISOString().split('T')[0], source: 'awesomeapi' },
        { onConflict: 'ref_date,from_currency,to_currency' }
      ).then(() => {}, () => {})
      return rate
    })
  } catch {
    const { data: fx } = await supabaseAdmin
      .from('fx_rates').select('rate')
      .eq('from_currency', from).eq('to_currency', to)
      .order('ref_date', { ascending: false }).limit(1).single()
    if (fx?.rate) return fx.rate
    return FX_FALLBACK[from] ?? 5.70
  }
}
