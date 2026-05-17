import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'

const USER_ID = '453bc770-0cea-4c88-b72f-babf9e50437e'

async function main() {
  const { count } = await supabaseAdmin.from('price_history').select('*', { count: 'exact', head: true })
  console.log('Total price_history rows:', count)

  const { data: btcAsset } = await supabaseAdmin.from('assets').select('id,code,ticker_yahoo').eq('user_id', USER_ID).eq('code', 'BTC').single()
  console.log('BTC asset:', btcAsset)

  if (btcAsset) {
    const { data: btcPH } = await supabaseAdmin
      .from('price_history').select('ref_date, price, currency')
      .eq('asset_id', btcAsset.id).order('ref_date', { ascending: false }).limit(18)
    console.log('\nBTC price history (last 18):')
    btcPH?.forEach(r => console.log(`  ${r.ref_date}  price=${r.price.toFixed(2)}  cur=${r.currency}`))
  }

  const { data: yearDist } = await supabaseAdmin.from('price_history')
    .select('ref_date').gte('ref_date', '2025-10-01')
  const months = new Set(yearDist?.map(r => r.ref_date.substring(0,7)))
  console.log('\nMonths from Oct 2025 onward in price_history:', [...months].sort())
  console.log('Total rows Oct 2025+:', yearDist?.length)

  const { data: assets2026 } = await supabaseAdmin.from('price_history')
    .select('asset_id').gte('ref_date', '2026-01-01').lte('ref_date', '2026-04-30').limit(1000)
  const ids = new Set(assets2026?.map(r => r.asset_id))
  console.log('\nAssets with Jan-Apr 2026 data:', ids.size, 'ids:', [...ids].sort((a,b)=>a-b))
}

main().catch(console.error)
