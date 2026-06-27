import 'dotenv/config'
import {
  fetchPrefetchedData,
  computePortfolioValueAtDay,
  computeSplitFactorEvents,
  getSplitAdjustmentFactor,
} from '../src/routes/performance.js'

const USER_ID = '453bc770-0cea-4c88-b72f-babf9e50437e'

async function main() {
  const data = await fetchPrefetchedData(USER_ID, '2026-04-01')

  const events = computeSplitFactorEvents(data.contributions, 11)
  console.log('Split events for asset_id=11:', events)

  const pricesByAsset: Record<number, Array<{ ref_date: string; price: number; currency: string }>> = {}
  for (const p of data.prices) (pricesByAsset[p.asset_id] ??= []).push(p)

  const dates = ['2026-04-20', '2026-04-22', '2026-04-23', '2026-04-24', '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-04', '2026-05-05']
  for (const d of dates) {
    const factor = getSplitAdjustmentFactor(events, d)
    const { total } = await computePortfolioValueAtDay(data, d, pricesByAsset)
    console.log(`${d}  splitAdjFactor=${factor.toFixed(4)}  portfolioTotal=${total.toFixed(2)}`)
  }
}

main().catch(console.error)
