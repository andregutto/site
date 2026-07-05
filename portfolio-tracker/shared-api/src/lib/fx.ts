import { supabaseAdmin } from './supabase.js'
import { cache, TTL } from './cache.js'

const AWESOME_BASE = 'https://economia.awesomeapi.com.br/json'
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1'
const FX_FALLBACK: Record<string, number> = { USD: 5.70, EUR: 6.40, GBP: 7.20 }

async function fetchFromAwesome(from: string, to: string): Promise<number> {
  const res = await fetch(`${AWESOME_BASE}/last/${from}-${to}`)
  if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`)
  const data = await res.json() as Record<string, Record<string, string>>
  return parseFloat(Object.values(data)[0].bid)
}

// AwesomeAPI é gratuita mas com cota apertada (já vimos ela retornar 429 e o
// app cair pro cache do banco com semanas de idade sem avisar ninguém).
// Frankfurter (dados do BCE, sem chave/limite) é a segunda tentativa antes de
// aceitar um valor desatualizado.
async function fetchFromFrankfurter(from: string, to: string): Promise<number> {
  const res = await fetch(`${FRANKFURTER_BASE}/latest?base=${from}&symbols=${to}`)
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`)
  const data = await res.json() as { rates: Record<string, number> }
  const rate = data.rates[to]
  if (!rate) throw new Error(`Frankfurter: sem taxa para ${to}`)
  return rate
}

interface FxResult { rate: number; date: string }

async function resolveFxRate(from: string, to: string): Promise<FxResult> {
  if (from === to) return { rate: 1, date: new Date().toISOString().split('T')[0] }
  const cacheKey = `fxrate:${from}-${to}`
  try {
    return await cache.getOrFetch(cacheKey, TTL.FX_CURRENT, async () => {
      const today = new Date().toISOString().split('T')[0]
      let rate: number
      let source = 'awesomeapi'
      try {
        rate = await fetchFromAwesome(from, to)
      } catch {
        rate = await fetchFromFrankfurter(from, to)
        source = 'frankfurter'
      }
      supabaseAdmin.from('fx_rates').upsert(
        { from_currency: from, to_currency: to, rate, ref_date: today, source },
        { onConflict: 'ref_date,from_currency,to_currency' }
      ).then(() => {}, () => {})
      return { rate, date: today }
    })
  } catch {
    const { data: fx } = await supabaseAdmin
      .from('fx_rates').select('rate, ref_date')
      .eq('from_currency', from).eq('to_currency', to)
      .order('ref_date', { ascending: false }).limit(1).single()
    if (fx?.rate != null && Number(fx.rate) > 0) return { rate: Number(fx.rate), date: fx.ref_date }
    return { rate: FX_FALLBACK[from] ?? 5.70, date: new Date().toISOString().split('T')[0] }
  }
}

export async function getFxRate(from: string, to = 'BRL'): Promise<number> {
  return (await resolveFxRate(from, to)).rate
}

export async function getFxRateWithDate(from: string, to = 'BRL'): Promise<FxResult> {
  return resolveFxRate(from, to)
}
