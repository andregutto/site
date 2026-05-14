/**
 * One-time script: populate price_history for all ticker assets.
 * Run with: tsx scripts/sync-price-history.ts
 * from the backend/ directory with .env loaded.
 */
import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'
import { getMonthlyHistory } from '../src/services/priceService.js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Asset = any

const USER_ID = '453bc770-0cea-4c88-b72f-babf9e50437e'
const MONTHS  = 72   // 6 years of history

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const { data: assets, error } = await supabaseAdmin
    .from('assets')
    .select('id, code, asset_type, currency, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', USER_ID)
    .eq('asset_type', 'ticker')

  if (error) { console.error('Error fetching assets:', error.message); process.exit(1) }
  if (!assets?.length) { console.log('No ticker assets found'); return }

  // Skip assets that already have sufficient price_history (>= 12 points)
  const { data: existingPH } = await supabaseAdmin
    .from('price_history')
    .select('asset_id')
    .in('asset_id', assets.map(a => a.id))

  const phCounts: Record<number, number> = {}
  for (const row of existingPH ?? []) {
    phCounts[row.asset_id] = (phCounts[row.asset_id] ?? 0) + 1
  }

  // Separate by source so we can batch Yahoo quickly and pace brapi
  const needsSync = assets.filter(a => (phCounts[a.id] ?? 0) < 12)
  const yahoo = needsSync.filter(a => a.ticker_yahoo)
  const brapi = needsSync.filter(a => a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id)
  const crypto = needsSync.filter(a => a.coingecko_id)

  console.log(`Assets needing sync: ${needsSync.length} (Yahoo: ${yahoo.length}, brapi: ${brapi.length}, crypto: ${crypto.length})`)
  console.log()

  let ok = 0, empty = 0, errors = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function syncAsset(a: Asset, delay: number) {
    try {
      const history = await getMonthlyHistory(a as Parameters<typeof getMonthlyHistory>[0], MONTHS)
      if (!history.length) {
        console.log(`  [empty]  ${a.code}`)
        empty++
        return
      }
      const { error: upsertErr } = await supabaseAdmin.from('price_history').upsert(
        history.map(p => ({ asset_id: a.id, ref_date: p.date, price: p.price, currency: p.currency, source: 'script' })),
        { onConflict: 'asset_id,ref_date' }
      )
      if (upsertErr) throw new Error(`DB upsert: ${upsertErr.message}`)
      console.log(`  [ok]     ${a.code.padEnd(12)} ${history.length} pts  (${history[0].date} → ${history[history.length-1].date})`)
      ok++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  [error]  ${a.code}: ${msg}`)
      errors++
    }
    if (delay > 0) await sleep(delay)
  }

  // Yahoo Finance: no rate limiting needed
  if (yahoo.length) {
    console.log(`── Yahoo Finance (${yahoo.length} assets, no delay) ──`)
    for (const a of yahoo) await syncAsset(a, 0)
    console.log()
  }

  // Crypto: coingecko has some rate limits, use 2s
  if (crypto.length) {
    console.log(`── CoinGecko (${crypto.length} assets, 2s delay) ──`)
    for (let i = 0; i < crypto.length; i++) {
      await syncAsset(crypto[i], i + 1 < crypto.length ? 2000 : 0)
    }
    console.log()
  }

  // brapi: 15 req/min = 4s safe interval
  if (brapi.length) {
    console.log(`── brapi (${brapi.length} assets, 4s delay) ──`)
    for (let i = 0; i < brapi.length; i++) {
      await syncAsset(brapi[i], i + 1 < brapi.length ? 4000 : 0)
    }
    console.log()
  }

  console.log(`\nDone. ok=${ok}  empty=${empty}  errors=${errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
