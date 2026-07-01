// Lightweight regression check for stock-split holdings adjustment.
// No test framework is wired up yet (see CLAUDE.md) — run directly with:
//   npx tsx src/routes/performance.split.test.ts
import { computeSplitFactorEvents, getSplitAdjustmentFactor, type PrefetchedData } from '../../../shared-api/src/routes/performance.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const contribs: PrefetchedData['contributions'] = [
  { asset_id: 11, type: 'buy', quantity: 205, value_brl: 6000, price_orig: 30, fx_rate_brl: 1, currency: 'BRL', date: '2024-01-10', description: 'Compra' },
  { asset_id: 11, type: 'buy', quantity: 821, value_brl: 0, price_orig: 0, fx_rate_brl: 1, currency: 'BRL', date: '2026-04-30', description: 'Desdobro (B3 Movimentação)' },
]

const events = computeSplitFactorEvents(contribs, 11)
assert(events.length === 1, 'detects exactly one split event')
assert(Math.abs(events[0].factor - 1026 / 205) < 1e-9, 'split factor matches holdings_after/holdings_before')
assert(events[0].date === '2026-04-30', 'split event dated on the synthetic contribution date')

const factorBefore = getSplitAdjustmentFactor(events, '2026-04-20')
const factorOnDay = getSplitAdjustmentFactor(events, '2026-04-30')
const factorAfter = getSplitAdjustmentFactor(events, '2026-05-04')
assert(Math.abs(factorBefore - 1026 / 205) < 1e-9, 'pre-split dates get the full split factor applied')
assert(factorOnDay === 1, 'the split date itself is unadjusted (nominal holdings already include it)')
assert(factorAfter === 1, 'post-split dates are unadjusted')

// Continuity check: nominal holdings(t) * price(t) should not jump ~5x across the split when
// the price series itself does not drop (i.e. is already split-adjusted, as Yahoo's is).
const nominalBefore = 205
const nominalAfter = 1026
const price = 33 // same on both sides — Yahoo's split-adjusted series shows no jump
const adjValueBefore = nominalBefore * factorBefore * price
const valueAfter = nominalAfter * factorOnDay * price
const pctDiff = Math.abs(adjValueBefore - valueAfter) / valueAfter
assert(pctDiff < 0.01, `adjusted value is continuous across the split (diff=${(pctDiff * 100).toFixed(3)}%)`)

console.log('\nAll split-adjustment regression checks passed.')
