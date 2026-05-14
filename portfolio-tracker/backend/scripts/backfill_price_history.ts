/**
 * Full price_history backfill.
 * - Ticker assets: fetches monthly closing prices via Yahoo / brapi / CoinGecko
 * - Fixed-income assets: computes monthly portfolio value from BCB rates
 *
 * Run: cd backend && npx tsx scripts/backfill_price_history.ts
 */
import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'
import { getMonthlyHistory } from '../src/services/priceService.js'
import type { Asset } from '../src/services/priceService.js'
import { calculateCurrentValue } from '../src/services/fixedIncomeService.js'
import type { FixedIncomeAsset, FITranche } from '../src/services/fixedIncomeService.js'

const USER_ID = '453bc770-0cea-4c88-b72f-babf9e50437e'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/** Returns YYYY-MM-DD for the last day of the given month (1-based). */
function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0)   // day 0 of month+1 = last day of month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Number of months from fromYM to toYM inclusive (both "YYYY-MM"). */
function monthSpan(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  return (ty * 12 + tm) - (fy * 12 + fm) + 1
}

interface DBAsset {
  id: number; code: string; asset_type: string; currency: string; active: boolean
  ticker_brapi: string | null; ticker_yahoo: string | null; coingecko_id: string | null
  fi_principal: number | null; fi_start_date: string | null
  fi_type: string | null; fi_rate: number | null; fi_spread: number | null
}

async function main() {
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // FI: populate up to the previous completed month (current month data is incomplete)
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYM = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`

  console.log(`Backfill started: ${now.toISOString()}`)
  console.log(`Ticker target: through ~${currentYM}  |  FI target: through ${prevYM}\n`)

  // ── Fetch all assets ─────────────────────────────────────────────
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('assets')
    .select('id, code, asset_type, currency, active, ticker_brapi, ticker_yahoo, coingecko_id, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('user_id', USER_ID)

  if (assetsErr || !assets?.length) {
    console.error('Failed to fetch assets:', assetsErr?.message ?? 'none found'); process.exit(1)
  }
  console.log(`Found ${assets.length} assets.\n`)

  // ── Fetch all buy contributions (for first-buy date + FI tranches) ──
  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, value_brl')
    .in('asset_id', assets.map((a: DBAsset) => a.id))
    .eq('type', 'buy')
    .order('date', { ascending: true })

  const firstBuyMap: Record<number, string> = {}
  const tranchesByAsset: Record<number, FITranche[]> = {}
  for (const c of contributions ?? []) {
    if (!firstBuyMap[c.asset_id]) firstBuyMap[c.asset_id] = c.date
    const vBrl = Number(c.value_brl)
    if (vBrl > 0) {
      if (!tranchesByAsset[c.asset_id]) tranchesByAsset[c.asset_id] = []
      tranchesByAsset[c.asset_id].push({ principal: vBrl, start_date: c.date as string })
    }
  }

  const tickerAssets = (assets as DBAsset[]).filter(a => a.asset_type === 'ticker')
  const fiAssets     = (assets as DBAsset[]).filter(a => a.asset_type === 'fixed_income')

  // ═══════════════════════════════════════════════════════════════════
  // TICKER ASSETS
  // ═══════════════════════════════════════════════════════════════════
  console.log(`═══ TICKER ASSETS (${tickerAssets.length}) ═══\n`)

  const yahoo  = tickerAssets.filter(a => a.ticker_yahoo)
  const crypto = tickerAssets.filter(a => a.coingecko_id && !a.ticker_yahoo)
  const brapi  = tickerAssets.filter(a => a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id)

  let tOk = 0, tEmpty = 0, tErrors = 0

  async function syncTicker(a: DBAsset) {
    const firstDate = firstBuyMap[a.id]
    if (!firstDate) { console.log(`  [skip]   ${a.code}: no buy contributions`); return }

    const startYM = firstDate.substring(0, 7)
    const months  = monthSpan(startYM, currentYM) + 2   // +2 buffer

    try {
      const history = await getMonthlyHistory(a as Asset, months)
      if (!history.length) {
        console.log(`  [empty]  ${a.code} (${months}mo requested)`); tEmpty++; return
      }
      const rows = history.map(p => ({
        asset_id: a.id,
        ref_date: p.date,
        price:    Math.round(p.price * 10000) / 10000,
        currency: p.currency,
        source:   'backfill',
      }))
      const { error: uErr } = await supabaseAdmin.from('price_history')
        .upsert(rows, { onConflict: 'asset_id,ref_date' })
      if (uErr) throw new Error(uErr.message)
      console.log(`  [ok]     ${a.code.padEnd(14)} ${rows.length} pts  ${history[0].date} → ${history[history.length - 1].date}`)
      tOk++
    } catch (err) {
      console.warn(`  [error]  ${a.code}: ${err instanceof Error ? err.message : err}`)
      tErrors++
    }
  }

  if (yahoo.length) {
    console.log(`── Yahoo Finance (${yahoo.length}, parallel) ──`)
    await Promise.all(yahoo.map(syncTicker))
    console.log()
  }
  if (crypto.length) {
    console.log(`── CoinGecko (${crypto.length}, 2 s delay) ──`)
    for (let i = 0; i < crypto.length; i++) {
      await syncTicker(crypto[i])
      if (i + 1 < crypto.length) await sleep(2000)
    }
    console.log()
  }
  if (brapi.length) {
    console.log(`── brapi (${brapi.length}, 4 s delay, max 24 months) ──`)
    for (let i = 0; i < brapi.length; i++) {
      await syncTicker(brapi[i])
      if (i + 1 < brapi.length) await sleep(4000)
    }
    console.log()
  }
  console.log(`Ticker: ok=${tOk}  empty=${tEmpty}  errors=${tErrors}\n`)

  // ═══════════════════════════════════════════════════════════════════
  // FIXED-INCOME ASSETS
  // ═══════════════════════════════════════════════════════════════════
  console.log(`═══ FIXED-INCOME ASSETS (${fiAssets.length}) ═══\n`)

  for (const a of fiAssets) {
    if (!a.fi_type) { console.log(`  [skip]   ${a.code}: fi_type not set`); continue }

    const startDate = a.fi_start_date ?? firstBuyMap[a.id]
    if (!startDate) { console.log(`  [skip]   ${a.code}: no start date`); continue }

    const startYM = startDate.substring(0, 7)
    const [sy, sm] = startYM.split('-').map(Number)
    const [ey, em] = prevYM.split('-').map(Number)

    const hasNativePrincipal = (a.fi_principal ?? 0) > 0 && !!a.fi_start_date
    const allTranches = tranchesByAsset[a.id] ?? []

    const fiObj: FixedIncomeAsset = {
      fi_principal:  a.fi_principal ?? 0,
      fi_start_date: a.fi_start_date ?? startDate,
      fi_type:       a.fi_type as FixedIncomeAsset['fi_type'],
      fi_rate:       a.fi_rate,
      fi_spread:     a.fi_spread,
    }

    const rows: Array<{ asset_id: number; ref_date: string; price: number; currency: string; source: string }> = []
    let ok = 0, errors = 0

    let y = sy, m = sm
    while (y < ey || (y === ey && m <= em)) {
      const refDateStr = lastDayOfMonth(y, m)
      const refDate    = new Date(refDateStr + 'T12:00:00Z')

      try {
        let value: number
        if (hasNativePrincipal) {
          value = await calculateCurrentValue(fiObj, undefined, refDate)
        } else {
          const activeTranches = allTranches.filter(t => t.start_date <= refDateStr)
          if (!activeTranches.length) { m++; if (m > 12) { m = 1; y++ }; continue }
          value = await calculateCurrentValue(fiObj, activeTranches, refDate)
        }
        rows.push({
          asset_id: a.id,
          ref_date: refDateStr,
          price:    Math.round(value * 100) / 100,
          currency: a.currency,
          source:   'backfill',
        })
        ok++
      } catch (err) {
        errors++
        if (errors <= 3) console.warn(`    ${a.code} ${refDateStr}: ${err instanceof Error ? err.message : err}`)
      }

      m++
      if (m > 12) { m = 1; y++ }
    }

    if (rows.length) {
      const { error: uErr } = await supabaseAdmin.from('price_history')
        .upsert(rows, { onConflict: 'asset_id,ref_date' })
      if (uErr) {
        console.warn(`  [error]  ${a.code} upsert: ${uErr.message}`)
      } else {
        console.log(`  [ok]     ${a.code.padEnd(14)} ${ok} pts, ${errors} errs  ${rows[0].ref_date} → ${rows[rows.length - 1].ref_date}`)
      }
    } else {
      console.log(`  [empty]  ${a.code}: 0 pts (${errors} errors)`)
    }
  }

  console.log('\n✅ Backfill complete.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
