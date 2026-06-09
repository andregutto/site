// GET /api/portfolio/value — valor atual consolidado do portfólio
import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getCurrentPrice, getDailyHistory, getMonthlyHistory, Asset, FITranche } from '../services/priceService.js'
import { getSplitEvents } from '../services/yahooService.js'
import { getFxRate } from '../lib/fx.js'
import { cache, TTL } from '../lib/cache.js'
import * as yahoo from '../services/yahooService.js'

const router = Router()

// GET /api/portfolio/value
router.get('/value', requireAuth, async (req, res: Response, next) => {
  try {
  const { userId } = req as AuthRequest

  const cacheKey = `portfolio:value:${userId}`
  const cached = cache.get<object>(cacheKey)
  if (cached) { res.json(cached); return }

  // 1. Busca todos ativos ativos do usuário com classe
  const { data: assets, error: assetsErr } = await supabaseAdmin
    .from('assets')
    .select(`
      id, code, name, asset_type, currency, exchange,
      ticker_brapi, ticker_yahoo, coingecko_id,
      fi_principal, fi_start_date, fi_type, fi_rate, fi_spread, fi_maturity,
      asset_classes ( id, name, color, name_key )
    `)
    .eq('user_id', userId)
    .eq('active', true)

  if (assetsErr) { res.status(500).json({ error: assetsErr.message }); return }
  if (!assets?.length) { res.json({ total_brl: 0, by_class: [], by_asset: [] }); return }

  const assetIds = assets.map((a) => a.id)

  // 2. Holdings e invested por ativo
  const { data: contributions } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity, date, value_brl')
    .in('asset_id', assetIds)
    .order('date', { ascending: true })

  const holdingsMap: Record<number, number> = {}
  const investedMap: Record<number, number> = {}
  const rfAssetIds = assets.filter(a => a.asset_type === 'fixed_income').map(a => a.id)
  const rfTranchesMap: Record<number, FITranche[]> = {}
  for (const c of (contributions ?? [])) {
    if (c.type === 'income') continue
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) +
      (c.type === 'buy' ? c.quantity : -c.quantity)
    if (c.value_brl && c.value_brl > 0) {
      if (c.type === 'buy') {
        investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + c.value_brl
      }
      if (rfAssetIds.includes(c.asset_id)) {
        if (!rfTranchesMap[c.asset_id]) rfTranchesMap[c.asset_id] = []
        if (c.type === 'buy') {
          rfTranchesMap[c.asset_id].push({ principal: c.value_brl, start_date: c.date })
        } else if (c.type === 'sell') {
          rfTranchesMap[c.asset_id].push({ principal: -c.value_brl, start_date: c.date })
        }
      }
    }
  }

  // 3. Último valor manual — cobre todos os asset_types (fallback para tickers sem preço público)
  const manualMap: Record<number, { value: number; currency: string; last_date: string }> = {}
  const oldestManualMap: Record<number, { value: number; currency: string; ref_date: string }> = {}
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
      // DESC order → last assignment per asset = oldest entry
      oldestManualMap[mv.asset_id] = { value: mv.value, currency: mv.currency, ref_date: mv.ref_date }
    }
  }

  // For manual assets: invested = oldest_manual_value_brl + contributions strictly after oldest date
  await Promise.all(
    assets
      .filter(a => a.asset_type === 'manual')
      .map(async (a) => {
        const oldest = oldestManualMap[a.id]
        if (!oldest) return
        const fxRate = oldest.currency === 'BRL' ? 1 : await getFxRate(oldest.currency)
        const oldestBrl = oldest.value * fxRate
        const extraContribs = (contributions ?? [])
          .filter(c => c.asset_id === a.id && c.type === 'buy' && c.value_brl && c.value_brl > 0 && c.date > oldest.ref_date)
          .reduce((s, c) => s + (c.value_brl as number), 0)
        investedMap[a.id] = Math.round((oldestBrl + extraContribs) * 100) / 100
      })
  )

  // 4. Calcula valor em BRL por ativo — todos os ativos aparecem, mesmo sem valor
  const byAsset: Array<{
    id: number; code: string; name: string
    value_brl: number; value_orig: number; currency: string
    class_id: number | null; class_name: string; class_name_key: string | null; class_color: string; class_icon?: string | null
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
      const cls = (a.asset_classes as unknown as { id: number; name: string; color: string; name_key?: string | null } | null)
      const base = {
        id: a.id, code: a.code, name: a.name,
        class_id:       cls?.id ?? null,
        class_name:     cls?.name ?? 'Sem classe',
        class_name_key: cls?.name_key ?? null,
        class_color:    cls?.color ?? '#6B7280',
        exchange:       (a.exchange as string | null) ?? null,
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
          // ticker
          holdings = holdingsMap[a.id] ?? 0
          if (holdings <= 0) return  // zero position → contributes nothing to portfolio
          try {
            const result = await getCurrentPrice(a as Asset)
            price      = result.price
            currency   = result.currency
            source     = result.source
            value_orig = holdings * price
            value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)
          } catch {
            const mv = manualMap[a.id]
            if (mv) {
              value_orig = mv.value
              currency   = mv.currency
              source     = 'manual'
              value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)
            } else {
              // Fallback: use last price_history entry to avoid dropping asset value to zero
              const { data: lastPh } = await supabaseAdmin
                .from('price_history')
                .select('price, currency')
                .eq('asset_id', a.id)
                .order('ref_date', { ascending: false })
                .limit(1)
                .single()
              if (lastPh) {
                price      = lastPh.price
                currency   = lastPh.currency
                source     = 'stale'
                value_orig = (holdings ?? 0) * (price ?? lastPh.price)
                value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)
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
        })
      } catch (err) {
        console.warn(`[portfolio] Erro ao calcular ${a.code}:`, err)
      }
    })
  )

  // 5. Agrupa por classe
  const classMap: Record<string, { name: string; name_key: string | null; color: string; value_brl: number }> = {}
  for (const a of byAsset) {
    const key = a.class_name
    if (!classMap[key]) classMap[key] = { name: a.class_name, name_key: a.class_name_key, color: a.class_color, value_brl: 0 }
    classMap[key].value_brl += a.value_brl
  }

  const total_brl = byAsset.reduce((s, a) => s + a.value_brl, 0)
  const by_class  = Object.values(classMap)
    .map((c) => ({ ...c, pct: total_brl > 0 ? (c.value_brl / total_brl) * 100 : 0 }))
    .sort((a, b) => b.value_brl - a.value_brl)

  // Câmbio para exibir total em USD e EUR
  const [fx_usd, fx_eur] = await Promise.all([
    getFxRate('USD').then((r) => 1 / r).catch(() => null),
    getFxRate('EUR').then((r) => 1 / r).catch(() => null),
  ])

  const result = {
    total_brl: Math.round(total_brl * 100) / 100,
    total_usd: fx_usd ? Math.round(total_brl * fx_usd * 100) / 100 : null,
    total_eur: fx_eur ? Math.round(total_brl * fx_eur * 100) / 100 : null,
    by_class,
    by_asset: byAsset.sort((a, b) => b.value_brl - a.value_brl),
    generated_at: new Date().toISOString(),
  }
  cache.set(cacheKey, result, TTL.PORTFOLIO_VALUE)
  res.json(result)
  } catch (err) { next(err) }
})

// GET /api/portfolio/split-check — all assets with unregistered splits (cached 24h)
router.get('/split-check', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const cacheKey = `portfolio:split-check:${userId}`
  const cached = cache.get<object>(cacheKey)
  if (cached) { res.json(cached); return }

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, ticker_yahoo')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'ticker')
    .not('ticker_yahoo', 'is', null)

  if (!assets?.length) { res.json({ warnings: [] }); return }

  const { data: allContribs } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, type, price_orig')
    .in('asset_id', assets.map(a => a.id))
    .order('date', { ascending: true })

  const warnings: Array<{ asset_id: number; code: string; splits: Awaited<ReturnType<typeof getSplitEvents>> }> = []

  await Promise.allSettled(assets.map(async (asset) => {
    const contribs = (allContribs ?? []).filter(c => c.asset_id === asset.id)
    if (!contribs.length) return
    const firstDate = contribs[0].date
    const splits = await getSplitEvents(asset.ticker_yahoo as string, firstDate)
    if (!splits.length) return
    const zeroPriceContribs = contribs.filter(c => c.type === 'buy' && (c.price_orig === 0 || c.price_orig === null))
    const unaccounted = splits.filter(split => {
      const splitTs = new Date(split.date).getTime()
      return !zeroPriceContribs.some(c => Math.abs(new Date(c.date).getTime() - splitTs) <= 10 * 24 * 60 * 60 * 1000)
    })
    if (unaccounted.length) warnings.push({ asset_id: asset.id, code: asset.code as string, splits: unaccounted })
  }))

  const result = { warnings }
  cache.set(cacheKey, result, 24 * 60 * 60 * 1000)
  res.json(result)
})

// POST /api/portfolio/sync-history — popula price_history para todos os ativos ticker
router.post('/sync-history', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id,code,asset_type,currency,ticker_brapi,ticker_yahoo,coingecko_id,fi_principal,fi_start_date,fi_type,fi_rate,fi_spread')
    .eq('user_id', userId)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({ synced: 0, errors: 0, total: 0, details: [] }); return }

  const assetIds = assets.map(a => a.id as number)
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

  type Detail = { id: number; code: string; status: 'ok' | 'empty' | 'error'; points?: number; error?: string }

  const syncOne = async (a: (typeof assets)[number]): Promise<Detail> => {
    try {
      const history = await getDailyHistory(a as Asset, monthsBack * 30)
      if (!history.length) return { id: a.id, code: a.code, status: 'empty' }
      const { error: upsertErr } = await supabaseAdmin.from('price_history').upsert(
        history.map(p => ({ asset_id: a.id, ref_date: p.date, price: p.price, currency: p.currency, source: 'sync' })),
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

  // Yahoo and CoinGecko: process in parallel (no rate-limit constraints)
  const fastAssets  = assets.filter(a => a.ticker_yahoo || a.coingecko_id)
  const brapiAssets = assets.filter(a => a.ticker_brapi && !a.ticker_yahoo && !a.coingecko_id)

  const fastResults = await Promise.all(fastAssets.map(syncOne))
  const synced = fastResults.filter(r => r.status === 'ok').length
  const errors  = fastResults.filter(r => r.status === 'error').length

  res.json({ synced, errors, total: assets.length, details: fastResults })

  // Brapi: sequential 4 s delay — fire-and-forget (express server stays alive, so this completes)
  ;(async () => {
    for (let i = 0; i < brapiAssets.length; i++) {
      await syncOne(brapiAssets[i])
      if (i + 1 < brapiAssets.length) await new Promise(r => setTimeout(r, 4000))
    }
  })().catch(() => {})
})

// POST /api/portfolio/reset-baseline
// Deletes all contributions dated SOURCE_DATE and recreates them at TARGET_DATE
// with historical prices from Yahoo Finance.
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

  // Fetch all historical prices in parallel
  const priceEntries = await Promise.all(
    oldContribs.map(async (c) => {
      const a = assetMap.get(c.asset_id)
      const price = a?.ticker_yahoo ? await yahoo.getPriceAtDate(a.ticker_yahoo, TARGET_DATE) : null
      return { assetId: c.asset_id, price }
    })
  )
  const priceMap = new Map(priceEntries.map(e => [e.assetId, e.price]))

  type ResultRow = { code: string; price: number | null; status: string }
  const results: ResultRow[] = []
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
    results.push({ code: a?.code ?? String(c.asset_id), price, status: price != null ? 'ok' : 'sem_preco' })
  }

  const { error: delErr } = await supabaseAdmin
    .from('contributions').delete().in('id', oldContribs.map(c => c.id))
  if (delErr) { res.status(500).json({ error: delErr.message }); return }

  const { error: insErr } = await supabaseAdmin.from('contributions').insert(toInsert)
  if (insErr) { res.status(500).json({ error: insErr.message }); return }

  res.json({ deleted: oldContribs.length, created: toInsert.length, results })
})

// GET /api/portfolio/sync-status — how many ticker assets have price_history rows
router.get('/sync-status', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, ticker_brapi, ticker_yahoo, coingecko_id')
    .eq('user_id', userId)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({ total: 0, withHistory: 0, empty: 0, emptyAssets: [] }); return }

  const assetIds = assets.map(a => a.id as number)

  const { data: counts } = await supabaseAdmin
    .from('price_history')
    .select('asset_id')
    .in('asset_id', assetIds)

  const withHistory = new Set((counts ?? []).map(r => r.asset_id))

  const emptyAssets = assets
    .filter(a => !withHistory.has(a.id))
    .map(a => a.code as string)

  res.json({
    total: assets.length,
    withHistory: withHistory.size,
    empty: emptyAssets.length,
    emptyAssets,
  })
})

// ─── Portfolio share-link ─────────────────────────────────────────────────────

interface SnapshotAsset {
  code: string; name: string; value_brl: number; pct: number
  class_name: string; class_color: string; exchange: string | null
}
interface PortfolioSnapshot {
  total_brl: number; portfolio_value: number; invested_value: number
  total_return_pct: number | null; display_currency: string
  asset_count: number; generated_at: string
  by_class: Array<{ name: string; key: string | null; color: string; value: number; pct: number }>
  top_assets: SnapshotAsset[]
  dividends_12m: number
  monthly_dividends: Array<{ month: string; amount: number }>
}

async function buildPortfolioSnapshot(userId: string, displayCurrency = 'BRL'): Promise<PortfolioSnapshot> {
  const [assetsRes, fxRes] = await Promise.all([
    supabaseAdmin
      .from('assets')
      .select('id, code, name, currency, asset_type, exchange, fi_principal, asset_classes(id, name, color, name_key)')
      .eq('user_id', userId)
      .eq('active', true),
    supabaseAdmin
      .from('fx_rates')
      .select('currency_from, rate')
      .eq('currency_to', 'BRL')
      .order('fetched_at', { ascending: false })
      .limit(30),
  ])

  const assets = assetsRes.data ?? []
  const assetIds = assets.map(a => a.id)
  if (!assetIds.length) {
    return { total_brl: 0, portfolio_value: 0, invested_value: 0, total_return_pct: null, display_currency: displayCurrency, asset_count: 0, generated_at: new Date().toISOString(), by_class: [], top_assets: [], dividends_12m: 0, monthly_dividends: [] }
  }

  const fxMap: Record<string, number> = { BRL: 1, USD: 5.70, EUR: 6.40, GBP: 7.20 }
  for (const r of (fxRes.data ?? [])) if (!fxMap[r.currency_from]) fxMap[r.currency_from] = r.rate

  const [contribRes, priceRes, manualRes] = await Promise.all([
    supabaseAdmin.from('contributions').select('asset_id, type, quantity, value_brl').in('asset_id', assetIds),
    supabaseAdmin.from('price_history').select('asset_id, value, currency, date')
      .in('asset_id', assetIds)
      .gte('date', new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0])
      .order('date', { ascending: false }),
    supabaseAdmin.from('manual_values').select('asset_id, value, currency, ref_date')
      .in('asset_id', assetIds)
      .order('ref_date', { ascending: false }),
  ])

  const holdingsMap: Record<number, number> = {}
  const investedMap: Record<number, number> = {}
  for (const c of (contribRes.data ?? [])) {
    if (c.type === 'income') continue
    holdingsMap[c.asset_id] = (holdingsMap[c.asset_id] ?? 0) + (c.type === 'buy' ? c.quantity : -c.quantity)
    if (c.type === 'buy' && c.value_brl) investedMap[c.asset_id] = (investedMap[c.asset_id] ?? 0) + c.value_brl
  }

  const lastPriceMap: Record<number, { value: number; currency: string }> = {}
  for (const p of (priceRes.data ?? [])) if (!lastPriceMap[p.asset_id]) lastPriceMap[p.asset_id] = { value: p.value, currency: p.currency }

  const manualMap: Record<number, { value: number; currency: string }> = {}
  for (const mv of (manualRes.data ?? [])) if (!manualMap[mv.asset_id]) manualMap[mv.asset_id] = { value: mv.value, currency: mv.currency }

  const byAsset: Array<{ id: number; code: string; name: string; value_brl: number; class_name: string; class_name_key: string | null; class_color: string; exchange: string | null }> = []

  for (const a of assets) {
    const cls = a.asset_classes as unknown as { name: string; color: string; name_key: string | null } | null
    let value_brl = 0

    if (a.asset_type === 'manual') {
      const mv = manualMap[a.id]
      if (mv) value_brl = mv.value * (fxMap[mv.currency] ?? 1)
    } else if (a.asset_type === 'fixed_income') {
      const lp = lastPriceMap[a.id]
      value_brl = lp ? lp.value * (fxMap[lp.currency] ?? 1) : (a.fi_principal ?? 0)
    } else {
      const h = holdingsMap[a.id] ?? 0
      if (h <= 0) continue
      const mv = manualMap[a.id]
      if (mv) { value_brl = mv.value * (fxMap[mv.currency] ?? 1) }
      else {
        const lp = lastPriceMap[a.id]
        value_brl = lp ? lp.value * h * (fxMap[lp.currency] ?? 1) : (investedMap[a.id] ?? 0)
      }
    }
    if (value_brl <= 0) continue
    byAsset.push({ id: a.id, code: a.code, name: a.name, value_brl: Math.round(value_brl * 100) / 100, class_name: cls?.name ?? '—', class_name_key: cls?.name_key ?? null, class_color: cls?.color ?? '#6B7280', exchange: (a.exchange as string | null) ?? null })
  }

  const total_brl = byAsset.reduce((s, a) => s + a.value_brl, 0)
  const invested_brl_total = byAsset.reduce((s, a) => s + (investedMap[a.id] ?? 0), 0)
  const total_return_pct = invested_brl_total > 0 ? (total_brl - invested_brl_total) / invested_brl_total : null
  const brlToDisplay = displayCurrency !== 'BRL' ? 1 / (fxMap[displayCurrency] ?? 1) : 1
  const cvt = (n: number) => Math.round(n * brlToDisplay * 100) / 100

  const classMap: Record<string, { name: string; key: string | null; color: string; value: number }> = {}
  for (const a of byAsset) {
    if (!classMap[a.class_name]) classMap[a.class_name] = { name: a.class_name, key: a.class_name_key, color: a.class_color, value: 0 }
    classMap[a.class_name].value += a.value_brl
  }
  const by_class = Object.values(classMap)
    .map(c => ({ ...c, pct: total_brl > 0 ? c.value / total_brl : 0 }))
    .sort((a, b) => b.value - a.value)

  const sorted = [...byAsset].sort((a, b) => b.value_brl - a.value_brl)
  const top_assets: SnapshotAsset[] = sorted.slice(0, 12).map(a => ({
    code: a.code, name: a.name, value_brl: cvt(a.value_brl),
    pct: total_brl > 0 ? a.value_brl / total_brl : 0,
    class_name: a.class_name, class_color: a.class_color, exchange: a.exchange,
  }))

  const since12m = new Date(); since12m.setFullYear(since12m.getFullYear() - 1)
  const { data: dividends } = await supabaseAdmin
    .from('dividend_events').select('pay_date, amount_brl')
    .eq('user_id', userId).gte('pay_date', since12m.toISOString().split('T')[0])

  const dividends_12m = (dividends ?? []).reduce((s, d) => s + (d.amount_brl ?? 0), 0)
  const monthDiv: Record<string, number> = {}
  for (const d of (dividends ?? [])) {
    const m = d.pay_date.slice(0, 7)
    monthDiv[m] = (monthDiv[m] ?? 0) + (d.amount_brl ?? 0)
  }
  const monthly_dividends = Object.entries(monthDiv).sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }))

  return {
    total_brl: Math.round(total_brl * 100) / 100,
    portfolio_value: cvt(total_brl),
    invested_value: cvt(invested_brl_total),
    total_return_pct,
    display_currency: displayCurrency,
    asset_count: byAsset.length,
    generated_at: new Date().toISOString(),
    by_class: by_class.map(c => ({ ...c, value: cvt(c.value) })),
    top_assets,
    dividends_12m: cvt(dividends_12m),
    monthly_dividends: monthly_dividends.map(d => ({ ...d, amount: cvt(d.amount) })),
  }
}

router.get('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('portfolio_shares').select('token, show_values, label, updated_at, is_active')
    .eq('user_id', userId).eq('is_active', true).maybeSingle()
  if (!data) { res.json(null); return }
  res.json(data)
})

router.post('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { show_values = false, label = null, display_currency = 'BRL' } = req.body ?? {}
  const snapshot = await buildPortfolioSnapshot(userId, display_currency)

  const { data: existing } = await supabaseAdmin
    .from('portfolio_shares').select('id, token').eq('user_id', userId).maybeSingle()

  if (existing) {
    await supabaseAdmin.from('portfolio_shares')
      .update({ show_values, label, is_active: true, updated_at: new Date().toISOString(), snapshot })
      .eq('id', existing.id)
    res.json({ token: existing.token, show_values, label, updated_at: new Date().toISOString() })
    return
  }
  const { data: share, error } = await supabaseAdmin
    .from('portfolio_shares').insert({ user_id: userId, show_values, label, snapshot }).select('token').single()
  if (error || !share) { res.status(500).json({ error: error?.message ?? 'Failed' }); return }
  res.json({ token: share.token, show_values, label, updated_at: new Date().toISOString() })
})

router.patch('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { show_values } = req.body ?? {}
  await supabaseAdmin.from('portfolio_shares')
    .update({ show_values })
    .eq('user_id', userId).eq('is_active', true)
  res.json({ ok: true })
})

router.delete('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  await supabaseAdmin.from('portfolio_shares').update({ is_active: false }).eq('user_id', userId)
  res.json({ ok: true })
})

export default router
