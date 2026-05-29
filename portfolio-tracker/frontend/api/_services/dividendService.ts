import { supabaseAdmin } from '../_lib/supabase.js'
import { getFxRate } from '../_lib/fx.js'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })
const BASE  = 'https://brapi.dev/api'
const TOKEN = process.env.BRAPI_TOKEN ? `?token=${process.env.BRAPI_TOKEN}` : ''
const SEP   = TOKEN ? '&' : '?'

function parseDate(s: string | null | undefined): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function mapBrapiLabel(label: string): string {
  const l = (label ?? '').toUpperCase()
  if (l.includes('JCP')) return 'jcp'
  if (l.includes('RENDIMENTO')) return 'rendimento'
  if (l.includes('AMORTIZA')) return 'amortization'
  return 'dividend'
}

export interface RawDividend {
  ex_date: string; pay_date: string | null
  amount_per_share: number; dividend_type: string; source: string
}

export async function fetchBrapiDividends(ticker: string): Promise<RawDividend[]> {
  const url = `${BASE}/quote/${ticker}${TOKEN}${SEP}fundamental=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`brapi dividends ${res.status}: ${ticker}`)
  const json = await res.json() as {
    results?: Array<{ dividendsData?: { cashDividends?: Array<{
      lastDatePrior: string; paymentDate: string; rate: string | number; label: string
    }> } }>
  }
  const cashDivs = json.results?.[0]?.dividendsData?.cashDividends ?? []
  const out: RawDividend[] = []
  for (const d of cashDivs) {
    const ex_date = parseDate(d.lastDatePrior)
    if (!ex_date) continue
    const rate = typeof d.rate === 'string' ? parseFloat(d.rate) : d.rate
    if (!rate || rate <= 0) continue
    out.push({ ex_date, pay_date: parseDate(d.paymentDate), amount_per_share: rate, dividend_type: mapBrapiLabel(d.label ?? ''), source: 'brapi' })
  }
  return out
}

export async function fetchYahooDividends(ticker: string, from: string): Promise<RawDividend[]> {
  const rows = await yf.historical(ticker, {
    period1: from,
    period2: new Date().toISOString().split('T')[0],
    events: 'dividends',
  }) as Array<{ date: Date; dividends?: number }>
  return rows
    .filter(r => r.dividends != null && r.dividends > 0)
    .map(r => ({ ex_date: r.date.toISOString().split('T')[0], pay_date: null, amount_per_share: r.dividends!, dividend_type: 'dividend', source: 'yahoo' }))
}

function holdingsAt(contribs: Array<{ type: string; quantity: number; date: string }>, asOfDate: string): number {
  let h = 0
  for (const c of contribs) {
    if (c.date > asOfDate) continue
    if (c.type === 'buy')  h += c.quantity ?? 0
    if (c.type === 'sell') h -= c.quantity ?? 0
  }
  return Math.max(0, h)
}

export async function syncDividendsForUser(userId: string, force = false) {
  // force=true also includes inactive assets to backfill historical dividends
  let q = supabaseAdmin
    .from('assets').select('id, code, currency, ticker_brapi, ticker_yahoo')
    .eq('user_id', userId).eq('asset_type', 'ticker')
  if (!force) q = q.eq('active', true)
  const { data: assets } = await q

  if (!assets?.length) return { synced: 0, skipped: 0, errors: 0 }
  const assetIds = assets.map(a => a.id as number)

  if (force) {
    await supabaseAdmin
      .from('dividends')
      .delete()
      .in('asset_id', assetIds)
      .eq('user_id', userId)
  }

  const { data: latestRows } = await supabaseAdmin
    .from('dividends').select('asset_id, ex_date')
    .in('asset_id', assetIds).eq('user_id', userId).order('ex_date', { ascending: false })

  const latestMap: Record<number, string> = {}
  for (const r of (latestRows ?? [])) { if (!latestMap[r.asset_id]) latestMap[r.asset_id] = r.ex_date }

  const { data: allContribs } = await supabaseAdmin
    .from('contributions').select('asset_id, type, quantity, date')
    .in('asset_id', assetIds).in('type', ['buy', 'sell']).order('date', { ascending: true })

  const contribsByAsset: Record<number, Array<{ type: string; quantity: number; date: string }>> = {}
  for (const c of (allContribs ?? [])) {
    if (!contribsByAsset[c.asset_id]) contribsByAsset[c.asset_id] = []
    contribsByAsset[c.asset_id].push(c)
  }

  const { data: earliest } = await supabaseAdmin
    .from('contributions').select('date').in('asset_id', assetIds).order('date', { ascending: true }).limit(1).single()

  const defaultFrom = earliest?.date
    ? earliest.date.slice(0, 10)
    : new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let synced = 0, skipped = 0, errors = 0

  const upsertRows = async (asset: (typeof assets)[number], rawDivs: RawDividend[]) => {
    const contribs = contribsByAsset[asset.id] ?? []
    const fxRate = asset.currency !== 'BRL' ? await getFxRate(asset.currency).catch(() => 1) : 1
    const rows = []
    for (const d of rawDivs) {
      const holdings = holdingsAt(contribs, d.ex_date)
      if (holdings <= 0) continue
      const amount_total = holdings * d.amount_per_share
      rows.push({
        user_id: userId, asset_id: asset.id, ex_date: d.ex_date, pay_date: d.pay_date,
        amount_per_share: d.amount_per_share, amount_total: Math.round(amount_total * 10000) / 10000,
        currency: asset.ticker_brapi ? 'BRL' : (asset.currency || 'USD'),
        amount_brl: Math.round(amount_total * fxRate * 10000) / 10000,
        dividend_type: d.dividend_type, source: d.source,
      })
    }
    if (!rows.length) { skipped++; return }
    const { error } = await supabaseAdmin.from('dividends').upsert(rows, { onConflict: 'asset_id,ex_date,dividend_type' })
    if (error) { console.warn(`[dividends] upsert ${asset.code}:`, error.message); errors++ }
    else synced += rows.length
  }

  const yahooAssets = assets.filter(a => a.ticker_yahoo && !a.ticker_brapi)
  const brapiAssets = assets.filter(a => a.ticker_brapi)

  await Promise.all(yahooAssets.map(async a => {
    try {
      const from = latestMap[a.id] ?? defaultFrom
      await upsertRows(a, await fetchYahooDividends(a.ticker_yahoo!, from))
    } catch (err) { console.warn(`[dividends] yahoo ${a.code}:`, err); errors++ }
  }))

  // For brapi assets (Brazilian stocks/FIIs): Yahoo Finance with .SA suffix is the
  // primary source (free, no token). Brapi is the fallback if BRAPI_TOKEN is set.
  for (const a of brapiAssets) {
    let didSync = false

    // Primary (when token available): brapi — proper JCP/rendimento/dividend labels
    if (process.env.BRAPI_TOKEN) {
      try {
        const allDivs = await fetchBrapiDividends(a.ticker_brapi!)
        await upsertRows(a, allDivs)
        didSync = true
      } catch (err) { console.warn(`[dividends] brapi ${a.code}:`, err) }
    }

    // Primary (no token) or fallback: Yahoo Finance .SA — no JCP label differentiation
    if (!didSync) {
      try {
        const from = latestMap[a.id] ?? defaultFrom
        await upsertRows(a, await fetchYahooDividends(a.ticker_brapi! + '.SA', from))
        didSync = true
      } catch (err) {
        console.warn(`[dividends] yahoo-sa ${a.code}:`, err)
      }
    }

    if (!didSync) errors++
    await new Promise(r => setTimeout(r, 400))
  }

  return { synced, skipped, errors }
}
