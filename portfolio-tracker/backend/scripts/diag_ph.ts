import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'

const USER_ID = '453bc770-0cea-4c88-b72f-babf9e50437e'

async function main() {
  const { data: assets } = await supabaseAdmin
    .from('assets').select('id, code').eq('user_id', USER_ID)
    .in('code', ['BTC', 'ITSA3', 'PETR4', 'WEGE3'])

  for (const a of assets ?? []) {
    const { data: ph } = await supabaseAdmin
      .from('price_history').select('ref_date, price')
      .eq('asset_id', a.id).gte('ref_date', '2025-08-01')
      .order('ref_date', { ascending: true })
    console.log(`\n${a.code} (id=${a.id}):`)
    ph?.forEach(r => console.log(`  ${r.ref_date}  ${Number(r.price).toFixed(4)}`))
  }

  console.log('\n--- Asset count per month ---')
  for (const ym of ['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05']) {
    const { data } = await supabaseAdmin.from('price_history')
      .select('asset_id').gte('ref_date', ym + '-01').lte('ref_date', ym + '-31')
    const ids = new Set(data?.map(r => r.asset_id))
    console.log(`  ${ym}: ${ids.size} assets`)
  }
}

main().catch(console.error)
