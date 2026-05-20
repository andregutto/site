import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getCurrentPrice, getMonthlyHistory, Asset, FITranche } from '../_services/priceService.js'
import { getFxRate } from '../_lib/fx.js'
import { cache } from '../_lib/cache.js'
import * as yahoo from '../_services/yahooService.js'

const router = Router()

router.get('/value', requireAuth, async (req, res: Response, next) => {
  try {
  const { userId } = req as AuthRequest

  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('assets')
    .select(`
      id, code, name, asset_type, currency, exchange,
      ticker_brapi, ticker_yahoo, coingecko_id,
      fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, fi_maturity,
      asset_classes ( id, name, color )
    `)
    .eq('user_id', userId)
    .eq('active', true)

  if (assetsErr) { res.status(500).json({ error: assetsErr.message }); return }
  if (!assets?.length) { res.json({ total_brl: 0, by_class: [], by_asset: [] }); return }

  const assetIds = assets.map((a) => a.id)

  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity, date, value_brl')
    .in('asset_id', assetIds)
    .order('date', { ascending: true })

  const holdingsMap: Record<number, number> = {}
  const investedMap: Record<number, number> = {}
  for (const c of (contributions ?? [])) {
    if (c.type === 'income') continue
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) +
      (c.type === 'buy' ? c.quantity : -c.quantity)
    if (c.type === 'buy' && c.value_brl && c.value_brl > 0) {
      investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + c.value_brl
    }
  }

  const rfAssetIds = assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id)
  const rfTranchesMap: Record<number, FITranche[]> = {}
  for (const c of (contributions ?? [])) {
    if (!rfAssetIds.includes(c.asset_id)) continue
    if (!c.value_brl || c.value_brl <= 0) continue
    if (c.type === 'buy') {
      if (!rfTranchesMap[c.asset_id]) rfTranchesMap[c.asset_id] = []
      rfTranchesMap[c.asset_id].push({ principal: c.value_brl, start_date: c.date })
    } else if (c.type === 'sell') {
      if (!rfTranchesMap[c.asset_id]) rfTranchesMap[c.asset_id] = []
      rfTranchesMap[c.asset_id].push({ principal: -c.value_brl, start_date: c.date })
    }
  }

  // Brapi-only assets (no yahoo, no coingecko) that have never had price_history synced
  // may return stale prices from brapi.dev for delisted tickers. Use cost basis for these.
  const brapiOnlyIds = assets
    .filter(a => a.asset_type === 'ticker' && a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id)
    .map(a => a.id)
  const syncedBrapiIds = new Set<number>()
  if (brapiOnlyIds.length > 0) {
    const { data: phRows } = await supabaseAdmin
      .from('price_history')
      .select('asset_id')
      .in('asset_id', brapiOnlyIds)
      .limit(brapiOnlyIds.length * 2)
    for (const row of (phRows ?? [])) syncedBrapiIds.add(row.asset_id)
  }

  const manualMap: Record<number, { value: number; currency: string; last_date: string }> = {}
  if (assetIds.length > 0) {
    const { data: manualValues } = await supabaseAdmin
      .from('manual_values')
      .select('asset_id, value, currency, ref_date')
      .in('asset_id', assetIds)
      .order('ref_date', { ascending: false })

    const seen = new Set<number>()
    for (const mv of (manualValues ?? [])) {
      if (!seen.has(mv.asset_id)) {
        manualMap[mv.asset_id] = { value: mv.value, currency: mv.currency, last_date: mv.ref_date }
        seen.add(mv.asset_id)
      }
    }
  }

  const byAsset: Array<{
    id: number; code: string; name: string
    value_brl: number; value_orig: number; currency: string
    class_id: number | null; class_name: string; class_color: string; class_icon?: string | null
    holdings: number | null; price: number | null; source: string
    needs_manual: boolean
    invested_brl: number | null
    last_manual_date: string | null
    fi_type?: string | null
    fi_start_date?: string | null
    fi_rate?: number | null
    fi_spread?: number | null
    fi_maturity?: string | null
    exchange?: string | null
  }> = []

  await Promise.allSettled(
    assets.map(async (a) => {
      const cls = (a.asset_classes as unknown as { id: number; name: string; color: string } | null)
      const base = {
        id: a.id, code: a.code, name: a.name,
        class_id:    cls?.id ?? null,
        class_name:  cls?.name ?? 'Sem classe',
        class_color: cls?.color ?? '#6B7280',
        exchange:    (a.exchange as string | null) ?? null,
      }

      try {
        let value_brl = 0
        let value_orig = 0
        let currency   = a.currency || 'BRL'
        let price: number | null = null
        let source = ''
        let holdings: number | null = null

        if (a.asset_type === 'manual') {
          const mv = manualMap[a.id]
          if (!mv) {
            byAsset.push({ ...base, value_brl: 0, value_orig: 0, currency: a.currency || 'EUR', holdings: null, price: null, source: 'manual', needs_manual: true, invested_brl: investedMap[a.id] ?? null, last_manual_date: null })
            return
          }
          value_orig = mv.value
          currency   = mv.currency
          source     = 'manual'
          value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)

        } else if (a.asset_type === 'fixed_income') {
          const tranches = rfTranchesMap[a.id]
          const hasTranches = tranches && tranches.length > 0
          if (!a.fi_type || (a.fi_type !== 'ipca_plus' && a.fi_rate == null) ||
              (!hasTranches && (!a.fi_principal || !a.fi_start_date))) {
            byAsset.push({ ...base, value_brl: 0, value_orig: 0, currency: a.currency || 'BRL', holdings: null, price: null, source: 'fixed_income', needs_manual: true, invested_brl: investedMap[a.id] ?? null, last_manual_date: null, fi_type: a.fi_type, fi_start_date: a.fi_start_date, fi_rate: a.fi_rate, fi_spread: a.fi_spread, fi_maturity: a.fi_maturity ?? null })
            return
          }
          const result = await getCurrentPrice(a as Asset, hasTranches ? tranches : undefined)
          value_orig = result.price
          currency   = result.currency
          source     = result.source
          value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)

        } else {
          holdings = holdingsMap[a.id] ?? 0
          const hasAutoSource = !!(a.ticker_yahoo || a.coingecko_id)
          if (holdings <= 0 && hasAutoSource) return

          // manual_value is a hard override: user explicitly set the position value
          const mvOverride = manualMap[a.id]
          // brapi-only asset with no synced price_history = may be delisted; skip live price
          const brapiOnlyUnsynced = !!a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id
            && !syncedBrapiIds.has(a.id)

          if (mvOverride) {
            value_orig = mvOverride.value
            currency   = mvOverride.currency
            source     = 'manual'
            value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)
          } else if (brapiOnlyUnsynced) {
            // Never synced → brapi.dev price is unreliable; use cost basis until user syncs or sets manual value
            const invested = investedMap[a.id]
            if (invested != null && invested > 0) {
              value_brl = invested; value_orig = invested; source = 'cost_basis'
            } else {
              byAsset.push({ ...base, value_brl: 0, value_orig: 0, currency: a.currency || 'BRL', holdings, price: null, source: 'error', needs_manual: true, invested_brl: null, last_manual_date: null })
              return
            }
          } else {
            try {
              const result = await getCurrentPrice(a as Asset)
              price      = result.price
              currency   = result.currency
              source     = result.source
              value_orig = holdings * price
              value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)
            } catch {
              const invested = investedMap[a.id]
              if (invested != null && invested > 0) {
                value_brl  = invested
                value_orig = invested
                source     = 'cost_basis'
              } else {
                byAsset.push({ ...base, value_brl: 0, value_orig: 0, currency: a.currency || 'BRL', holdings, price: null, source: 'error', needs_manual: true, invested_brl: investedMap[a.id] ?? null, last_manual_date: null })
                return
              }
            }
          }
        }

        byAsset.push({
          ...base,
          value_brl: Math.round(value_brl * 100) / 100,
          value_orig: Math.round(value_orig * 100) / 100,
          currency, holdings, price, source,
          needs_manual: false,
          invested_brl: investedMap[a.id] != null ? Math.round(investedMap[a.id] * 100) / 100 : null,
          last_manual_date: source === 'manual' ? (manualMap[a.id]?.last_date ?? null) : null,
          exchange: a.exchange ?? null,
        })
      } catch (err) {
        console.warn(`[portfolio] Erro ao calcular ${a.code}:`, err)
      }
    })
  )

  const classMap: Record<string, { name: string; color: string; value_brl: number }> = {}
  for (const a of byAsset) {
    const key = a.class_name
    if (!classMap[key]) classMap[key] = { name: a.class_name, color: a.class_color, value_brl: 0 }
    classMap[key].value_brl += a.value_brl
  }

  const total_brl = byAsset.reduce((s, a) => s + a.value_brl, 0)
  const by_class  = Object.values(classMap)
    .map((c) => ({ ...c, pct: total_brl > 0 ? (c.value_brl / total_brl) * 100 : 0 }))
    .sort((a, b) => b.value_brl - a.value_brl)

  const [fx_usd, fx_eur] = await Promise.all([
    getFxRate('USD').then((r) => 1 / r).catch(() => null),
    getFxRate('EUR').then((r) => 1 / r).catch(() => null),
  ])

  res.json({
    total_brl: Math.round(total_brl * 100) / 100,
    total_usd: fx_usd ? Math.round(total_brl * fx_usd * 100) / 100 : null,
    total_eur: fx_eur ? Math.round(total_brl * fx_eur * 100) / 100 : null,
    by_class,
    by_asset: byAsset.sort((a, b) => b.value_brl - a.value_brl),
    generated_at: new Date().toISOString(),
  })
  } catch (err) { next(err) }
})

router.post('/sync-history', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  // Sync ALL ticker assets (active + sold/inactive) so that historical portfolio
  // values computed by getPortfolioValueAtMonth can use real prices for past months.
  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id,code,asset_type,currency,ticker_brapi,ticker_yahoo,coingecko_id,fi_principal,fi_start_date,fi_type,fi_rate,fi_spread')
    .eq('user_id', userId)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({ synced: 0, errors: 0, total: 0, details: [] }); return }

  const syncAssetIds = assets.map(a => a.id as number)
  const { data: earliestContrib } = await supabaseAdmin
    .from('contributions')
    .select('date')
    .in('asset_id', syncAssetIds)
    .order('date', { ascending: true })
    .limit(1)
    .single()
  const syncMonthsBack = earliestContrib?.date
    ? Math.max(3, Math.ceil((Date.now() - new Date(earliestContrib.date).getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1)
    : 36

  type Detail = { id: number; code: string; status: 'ok' | 'empty' | 'error'; points?: number; error?: string }

  const syncOne = async (a: (typeof assets)[number], source: string): Promise<Detail> => {
    try {
      const history = await getMonthlyHistory(a as Asset, syncMonthsBack)
      if (!history.length) return { id: a.id, code: a.code, status: 'empty' }
      const { error: upsertErr } = await supabaseAdmin.from('price_history').upsert(
        history.map(p => ({ asset_id: a.id, ref_date: p.date, price: p.price, currency: p.currency, source })),
        { onConflict: 'asset_id,ref_date' }
      )
      if (upsertErr) throw new Error(`DB upsert: ${upsertErr.message}`)
      return { id: a.id, code: a.code, status: 'ok', points: history.length }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[sync-history] ${a.code}:`, msg)
      return { id: a.id, code: a.code, status: 'error', error: msg }
    }
  }

  // Yahoo and CoinGecko have no tight rate limits — process in parallel before responding.
  // brapi free tier (~15 req/min) would require 4 s/req × N assets which exceeds Vercel's
  // serverless timeout, so brapi runs fire-and-forget after the response is sent.
  const fastAssets  = assets.filter(a => a.ticker_yahoo || a.coingecko_id)
  const brapiAssets = assets.filter(a => a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id)

  const fastResults = await Promise.all(fastAssets.map(a => syncOne(a, 'sync')))
  const synced = fastResults.filter(r => r.status === 'ok').length
  const errors  = fastResults.filter(r => r.status === 'error').length

  res.json({ synced, errors, total: assets.length, details: fastResults })

  // Brapi: sequential with 4 s delay — fire-and-forget (may not complete on Vercel)
  ;(async () => {
    for (let i = 0; i < brapiAssets.length; i++) {
      await syncOne(brapiAssets[i], 'sync')
      if (i + 1 < brapiAssets.length) await new Promise(r => setTimeout(r, 4000))
    }
  })().catch(() => {})
})

// ─── POST /api/portfolio/reset-price-history ─────────────────────────────────
// Purges all price_history for the user's ticker assets, then re-syncs.
// Yahoo + CoinGecko assets are synced synchronously before responding (parallel,
// fast enough for Vercel's serverless timeout). Brapi-only assets are synced
// fire-and-forget after the response — they may not complete on Vercel due to
// the 15 req/min rate limit; re-run the backend sync script for full coverage.

router.post('/reset-price-history', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id,code,asset_type,currency,ticker_brapi,ticker_yahoo,coingecko_id,fi_principal,fi_start_date,fi_type,fi_rate,fi_spread')
    .eq('user_id', userId)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({ status: 'started', deleted: 0, total: 0 }); return }

  const assetIds = assets.map(a => a.id as number)

  // Determine how many months back to fetch based on user's earliest contribution
  const { data: earliest } = await supabaseAdmin
    .from('contributions')
    .select('date')
    .in('asset_id', assetIds)
    .order('date', { ascending: true })
    .limit(1)
    .single()
  const monthsBack = earliest?.date
    ? Math.max(3, Math.ceil((Date.now() - new Date(earliest.date).getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1)
    : 36

  const { count: deleted } = await supabaseAdmin
    .from('price_history')
    .delete({ count: 'exact' })
    .in('asset_id', assetIds)

  // Clear in-memory cache so requests fetch fresh data
  cache.deletePattern('brapi:history:')
  cache.deletePattern('yahoo:history:')
  cache.deletePattern('coingecko:history:')

  const syncOne = async (a: (typeof assets)[number], source: string) => {
    try {
      const history = await getMonthlyHistory(a as Asset, monthsBack)
      if (history.length) {
        const { error: upsertErr } = await supabaseAdmin.from('price_history').upsert(
          history.map(p => ({ asset_id: a.id, ref_date: p.date, price: p.price, currency: p.currency, source })),
          { onConflict: 'asset_id,ref_date' }
        )
        if (upsertErr) console.warn(`[reset] DB upsert ${a.code}:`, upsertErr.message)
        else console.log(`[reset] ${a.code} ok (${history.length} pts)`)
      } else {
        console.log(`[reset] ${a.code} empty`)
      }
    } catch (err) {
      console.warn(`[reset] ${a.code} error:`, err instanceof Error ? err.message : String(err))
    }
  }

  // Yahoo + CoinGecko: sync in parallel synchronously before responding.
  // These complete well within Vercel's serverless timeout.
  const fastAssets  = assets.filter(a => a.ticker_yahoo || a.coingecko_id)
  const brapiAssets = assets.filter(a => a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id)

  await Promise.all(fastAssets.map(a => syncOne(a, 'reset')))

  // Yahoo + CoinGecko data is now in DB — respond so the UI unblocks
  res.json({ status: 'started', deleted: deleted ?? 0, total: assets.length })

  // Brapi: fire-and-forget — may not complete on Vercel; use the backend sync script
  // (tsx scripts/sync-price-history.ts) for full Brazilian-stock coverage.
  ;(async () => {
    for (let i = 0; i < brapiAssets.length; i++) {
      await syncOne(brapiAssets[i], 'reset')
      if (i + 1 < brapiAssets.length) await new Promise(r => setTimeout(r, 4000))
    }
    console.log('[reset-price-history] brapi background sync complete')
  })().catch(err => console.error('[reset-price-history] fatal:', err))
})

router.post('/reset-baseline', requireAuth, async (req, res: Response) => {
  const { userId }   = req as AuthRequest
  const SOURCE_DATE  = '2023-01-01'
  const TARGET_DATE  = '2025-01-01'

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, ticker_yahoo, currency')
    .eq('user_id', userId)
    .eq('asset_type', 'ticker')

  const assetMap = new Map((assets ?? []).map(a => [a.id as number, a]))
  const assetIds = [...assetMap.keys()]
  if (assetIds.length === 0) { res.json({ deleted: 0, created: 0, results: [] }); return }

  const { data: oldContribs } = await supabaseAdmin
    .from('contributions')
    .select('id, asset_id, quantity, currency')
    .in('asset_id', assetIds)
    .eq('date', SOURCE_DATE)
    .eq('type', 'buy')

  if (!oldContribs?.length) {
    res.json({ message: `Nenhuma contribuição ${SOURCE_DATE} encontrada`, deleted: 0, created: 0, results: [] }); return
  }

  const [usdBrl, eurBrl] = await Promise.all([getFxRate('USD'), getFxRate('EUR')])

  const priceEntries = await Promise.all(
    oldContribs.map(async (c) => {
      const a = assetMap.get(c.asset_id)
      const price = a?.ticker_yahoo ? await yahoo.getPriceAtDate(a.ticker_yahoo, TARGET_DATE) : null
      return { assetId: c.asset_id, price }
    })
  )
  const priceMap = new Map(priceEntries.map(e => [e.assetId, e.price]))

  type ResultRow = { code: string; price: number | null; status: string }
  const resultRows: ResultRow[] = []
  const toInsert: Record<string, unknown>[] = []

  for (const c of oldContribs) {
    const a     = assetMap.get(c.asset_id)
    const price = priceMap.get(c.asset_id) ?? null
    const qty   = c.quantity ?? 0
    const cur   = a?.currency || 'BRL'
    const fx    = cur === 'USD' ? usdBrl : cur === 'EUR' ? eurBrl : 1

    const row: Record<string, unknown> = {
      asset_id: c.asset_id,
      date:     TARGET_DATE,
      type:     'buy',
      quantity: qty,
      currency: cur,
    }
    if (price != null) {
      row.price_orig   = price
      row.fx_rate_brl  = cur !== 'BRL' ? fx : null
      row.value_brl    = Math.round(price * qty * fx * 100) / 100
    }
    toInsert.push(row)
    resultRows.push({ code: a?.code ?? String(c.asset_id), price, status: price != null ? 'ok' : 'sem_preco' })
  }

  const { error: delErr } = await supabaseAdmin
    .from('contributions').delete().in('id', oldContribs.map(c => c.id))
  if (delErr) { res.status(500).json({ error: delErr.message }); return }

  const { error: insErr } = await supabaseAdmin.from('contributions').insert(toInsert)
  if (insErr) { res.status(500).json({ error: insErr.message }); return }

  res.json({ deleted: oldContribs.length, created: toInsert.length, results: resultRows })
})

export default router
