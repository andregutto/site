import 'dotenv/config'
import { supabaseAdmin } from '../../shared-api/src/lib/supabase.js'

async function main() {
  const { data: ph, error: phErr } = await supabaseAdmin
    .from('price_history')
    .select('ref_date, price, currency, source')
    .eq('asset_id', 11)
    .gte('ref_date', '2026-04-20')
    .lte('ref_date', '2026-05-10')
    .order('ref_date')
  if (phErr) console.error('price_history error:', phErr)
  console.log('price_history asset_id=11 around split date:')
  ph?.forEach(r => console.log(`  ${r.ref_date}  price=${r.price}  cur=${r.currency}  source=${r.source}`))

  const { data: contrib, error: cErr } = await supabaseAdmin
    .from('contributions')
    .select('*')
    .eq('id', 838)
    .single()
  if (cErr) console.error('contributions error:', cErr)
  console.log('\ncontribution id=838:', contrib)

  const { data: asset, error: aErr } = await supabaseAdmin
    .from('assets')
    .select('id, code, ticker_yahoo, type')
    .eq('id', 11)
    .single()
  if (aErr) console.error('asset error:', aErr)
  console.log('\nasset id=11:', asset)

  const { data: c9, error: c9Err } = await supabaseAdmin
    .from('contributions')
    .select('id, asset_id, date, type, quantity, price_orig, description')
    .eq('asset_id', 9)
    .gte('date', '2021-04-01')
    .lte('date', '2021-05-31')
    .order('date')
  if (c9Err) console.error('asset 9 contrib error:', c9Err)
  console.log('\nasset_id=9 contributions Apr-May 2021:', c9)
}

main().catch(console.error)
