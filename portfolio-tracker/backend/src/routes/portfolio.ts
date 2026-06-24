// GET /api/portfolio/value — valor atual consolidado do portfólio
import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../../../shared-api/src/middleware/auth.js'
import { supabaseAdmin } from '../../../shared-api/src/lib/supabase.js'
import { getCurrentPrice, getDailyHistory, getMonthlyHistory, Asset, FITranche } from '../../../shared-api/src/services/priceService.js'
import { getSplitEvents } from '../../../shared-api/src/services/yahooService.js'
import { getFxRate } from '../../../shared-api/src/lib/fx.js'
import { cache, TTL } from '../../../shared-api/src/lib/cache.js'
import * as yahoo from '../../../shared-api/src/services/yahooService.js'
import {
  computeInception, computePerformanceSummary, computeMonthlySeries, computeBenchmarks,
  computeAssetReturns, fetchPrefetchedData, prefetchFIRates, localYM, localDate,
} from './performance.js'
import type { PerformanceSummary, MonthlyPoint } from './performance.js'
// computeDividendsSummary was a backend-only export; production's dividends.ts
// never had it (the snapshot endpoints below are dead code — unused, per
// the dual-server cleanup). Stub keeps this file compiling without resurrecting
// an unused feature.
async function computeDividendsSummary(_userId: string, _from: string, _to: string) {
  return { total_brl: 0, by_month: [] as { month: string; total_brl: number }[], by_asset: [] as { asset_id: number; code: string; name: string; total_brl: number }[] }
}

const router = Router()

export interface ByClassValue {
  name: string; name_key: string | null; color: string; value_brl: number; pct: number
}

export interface ByAssetValue {
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
}

export interface PortfolioValueResult {
  total_brl: number
  total_usd?: number | null
  total_eur?: number | null
  by_class: ByClassValue[]
  by_asset: ByAssetValue[]
  generated_at?: string
}

// Fonte única de verdade do valor do portfólio: usada por GET /portfolio/value
// e pelo snapshot do relatório compartilhado (buildPortfolioSnapshot).
export async function computePortfolioValue(userId: string): Promise<PortfolioValueResult> {
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

  if (assetsErr) throw new Error(assetsErr.message)
  if (!assets?.length) return { total_brl: 0, by_class: [], by_asset: [] }

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
  const byAsset: ByAssetValue[] = []

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

  return {
    total_brl: Math.round(total_brl * 100) / 100,
    total_usd: fx_usd ? Math.round(total_brl * fx_usd * 100) / 100 : null,
    total_eur: fx_eur ? Math.round(total_brl * fx_eur * 100) / 100 : null,
    by_class,
    by_asset: byAsset.sort((a, b) => b.value_brl - a.value_brl),
    generated_at: new Date().toISOString(),
  }
}

// GET /api/portfolio/value
router.get('/value', requireAuth, async (req, res: Response, next) => {
  try {
    const { userId } = req as AuthRequest

    const cacheKey = `portfolio:value:${userId}`
    const cached = cache.get<object>(cacheKey)
    if (cached) { res.json(cached); return }

    const result = await computePortfolioValue(userId)
    cache.set(cacheKey, result, TTL.PORTFOLIO_VALUE)
    res.json(result)
  } catch (err) { next(err) }
})

// All assets with unregistered splits for a user (cached 24h)
export interface SplitWarning {
  asset_id: number
  code: string
  splits: Awaited<ReturnType<typeof getSplitEvents>>
}

export async function getSplitWarnings(userId: string): Promise<SplitWarning[]> {
  const cacheKey = `portfolio:split-check:${userId}`
  const cached = cache.get<SplitWarning[]>(cacheKey)
  if (cached) return cached

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, ticker_yahoo')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'ticker')
    .not('ticker_yahoo', 'is', null)

  if (!assets?.length) return []

  const { data: allContribs } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, date, type, price_orig')
    .in('asset_id', assets.map(a => a.id))
    .order('date', { ascending: true })

  const warnings: SplitWarning[] = []

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

  cache.set(cacheKey, warnings, 24 * 60 * 60 * 1000)
  return warnings
}

// GET /api/portfolio/split-check
router.get('/split-check', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const warnings = await getSplitWarnings(userId)
  res.json({ warnings })
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

export interface SnapshotAsset {
  id: number; code: string; name: string
  value: number; pct: number
  class_name: string; class_name_key: string | null; class_color: string
  exchange: string | null; currency: string
  return_pct: number | null
}

export interface SnapshotGroupValue {
  key: string; label: string; value: number; pct: number
}

export interface SnapshotClassValue {
  key: string; name: string; name_key: string | null; color: string
  value: number; pct: number; target_pct: number | null
}

export interface SnapshotPerformance {
  from: string; to: string
  value_start: number; value_end: number
  contributions: number
  return_abs: number; return_pct: number | null
}

export interface SnapshotBenchmarkPct {
  portfolio_pct: number | null
  cdi_pct: number | null; ibov_pct: number | null; sp500_pct: number | null
}

export interface SnapshotBenchmarks {
  period: SnapshotBenchmarkPct
  since_inception: SnapshotBenchmarkPct
  monthly: Array<{ month: string; portfolio_cum: number | null; cdi_cum: number | null; ibov_cum: number | null; sp500_cum: number | null }>
}

export interface SnapshotMonthlyPoint {
  month: string; total: number; contributions_cumulative: number
}

export interface SnapshotDiversification {
  hhi_asset: number; hhi_asset_normalized: number
  hhi_geography: number; hhi_geography_normalized: number
  hhi_sector: number; hhi_sector_normalized: number
  effective_n: number
  top5_pct: number
  n_positions: number
}

export interface SnapshotDividends {
  total_12m: number
  by_month: Array<{ month: string; total: number }>
  top_payers: Array<{ asset_id: number; code: string; name: string; total: number }>
  yield_pct: number | null
}

export interface PortfolioSnapshot {
  generated_at: string
  display_currency: string
  period: 'inception' | '12m' | 'ytd'
  period_from: string | null
  period_to: string
  inception: string | null

  total: number
  invested: number
  asset_count: number
  class_count: number

  performance: SnapshotPerformance | null
  inception_performance: SnapshotPerformance | null
  monthly: SnapshotMonthlyPoint[]
  benchmarks: SnapshotBenchmarks | null

  by_class: SnapshotClassValue[]
  by_geography: SnapshotGroupValue[]
  by_sector: SnapshotGroupValue[]
  by_currency: SnapshotGroupValue[]

  diversification: SnapshotDiversification

  top_assets: SnapshotAsset[]
  top_gainers: SnapshotAsset[]
  top_losers: SnapshotAsset[]

  dividends: SnapshotDividends
}

function calcHHI(shares: number[]): number {
  return shares.reduce((s, x) => s + x * x, 0)
}

// Normalized HHI: 0 = perfectly equal, 1 = fully concentrated (mirrors DiversificationPage)
function normalizeHHI(hhi: number, n: number): number {
  if (n <= 1) return 0
  const min = 1 / n
  return (hhi - min) / (1 - min)
}

// Mirrors DiversificationPage's getCountryKey — exchange/source/currency based.
function getCountryKey(asset: ByAssetValue): string {
  const exch = (asset.exchange ?? '').toUpperCase()
  if (asset.source === 'fixed_income') return 'BR'
  if (['BVMF', 'B3', 'BOVESPA', 'SAO'].some(e => exch.startsWith(e))) return 'BR'
  if (['NYSE', 'NASDAQ', 'AMEX', 'NYSEARCA', 'NYQ', 'NMS', 'PCX', 'NGM', 'BATS', 'CBOE'].includes(exch)) return 'US'
  if (['XPAR', 'XETR', 'XLON', 'LSE', 'EURONEXT', 'XAMS', 'XBRU', 'XMIL', 'XMAD', 'AMS', 'FRA', 'EPA'].includes(exch)) return 'EU'
  if (asset.source === 'coingecko') return 'CRYPTO'
  if (asset.currency === 'BRL') return 'BR'
  if (asset.currency === 'USD') return 'US'
  if (asset.currency === 'EUR') return 'EU'
  return 'OTHER'
}

function sectorKey(sector: string | null): string {
  const s = sector ?? 'Outros'
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '')
}

function periodFromFor(period: 'inception' | '12m' | 'ytd', inception: string | null, toStr: string): string | null {
  if (period === 'inception') return inception
  const [toY, toM] = toStr.split('-').map(Number)
  if (period === 'ytd') return `${toY}-01`
  let y = toY, m = toM - 11
  if (m <= 0) { m += 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}

function aggregateByKey(
  byAsset: ByAssetValue[], totalBrl: number,
  keyFn: (a: ByAssetValue) => string, labelFn: (a: ByAssetValue) => string,
  cvt: (n: number) => number,
): SnapshotGroupValue[] {
  const map = new Map<string, { label: string; value_brl: number }>()
  for (const a of byAsset) {
    const key = keyFn(a)
    const existing = map.get(key)
    if (existing) existing.value_brl += a.value_brl
    else map.set(key, { label: labelFn(a), value_brl: a.value_brl })
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, value: cvt(v.value_brl), pct: totalBrl > 0 ? (v.value_brl / totalBrl) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

function toSnapshotPerformance(p: PerformanceSummary, cvt: (n: number) => number): SnapshotPerformance {
  return {
    from: p.from, to: p.to,
    value_start: cvt(p.value_start), value_end: cvt(p.value_end),
    contributions: cvt(p.contributions),
    return_abs: cvt(p.return_abs), return_pct: p.return_pct,
  }
}

// Chains monthly Modified-Dietz returns into a cumulative index (base = 1), so the
// portfolio's trajectory can be plotted alongside computeBenchmarks' cdi/ibov/sp500_cum.
function computePortfolioCum(monthly: MonthlyPoint[]): number[] {
  let cum = 1
  return monthly.map(m => {
    const base = m.prev_total + 0.5 * m.contributions
    const returnAbs = m.total - m.prev_total - m.contributions
    const r = base > 0 ? returnAbs / base : 0
    cum *= (1 + r)
    return Math.round(cum * 10000) / 10000
  })
}

// Reescreve o snapshot do relatório compartilhado a partir de computePortfolioValue
// (fonte única de verdade) + séries de performance/benchmarks/dividendos já existentes.
export async function buildPortfolioSnapshot(
  userId: string, displayCurrency = 'BRL', period: 'inception' | '12m' | 'ytd' = 'inception'
): Promise<PortfolioSnapshot> {
  const toStr = localYM(new Date())

  const [result, inception, sectorMap, classRowsRes] = await Promise.all([
    computePortfolioValue(userId),
    computeInception(userId),
    getSectorMap(userId),
    supabaseAdmin.from('asset_classes').select('name, target_pct').eq('user_id', userId),
  ])

  const targetMap = new Map(
    ((classRowsRes.data ?? []) as Array<{ name: string; target_pct: number | null }>)
      .map(c => [c.name, c.target_pct])
  )

  const fxToDisplay = displayCurrency === 'BRL' ? 1 : 1 / (await getFxRate(displayCurrency))
  const cvt = (n: number) => Math.round(n * fxToDisplay * 100) / 100
  const periodFrom = periodFromFor(period, inception, toStr)

  // ─── Performance, evolution, benchmarks — degrade gracefully without inception ──
  let performance: SnapshotPerformance | null = null
  let inceptionPerformance: SnapshotPerformance | null = null
  let monthly: SnapshotMonthlyPoint[] = []
  let benchmarks: SnapshotBenchmarks | null = null
  let assetReturns: Record<number, number | null> = {}

  if (inception) {
    const prefetched = await fetchPrefetchedData(userId)
    await prefetchFIRates(prefetched)

    const [inceptionPerfRaw, monthlySeries, benchmarksFull] = await Promise.all([
      computePerformanceSummary(userId, inception, toStr, prefetched),
      computeMonthlySeries(userId, inception, toStr, prefetched),
      computeBenchmarks(inception, toStr),
    ])

    const samePeriod  = !periodFrom || periodFrom === inception
    const periodPerfRaw = samePeriod ? inceptionPerfRaw : await computePerformanceSummary(userId, periodFrom!, toStr, prefetched)
    const periodBench   = samePeriod ? benchmarksFull   : await computeBenchmarks(periodFrom!, toStr)

    inceptionPerformance = toSnapshotPerformance(inceptionPerfRaw, cvt)
    performance          = toSnapshotPerformance(periodPerfRaw, cvt)

    monthly = monthlySeries.monthly.map(m => ({
      month: m.month, total: cvt(m.total), contributions_cumulative: cvt(m.contributions_cumulative),
    }))

    const portfolioCum = computePortfolioCum(monthlySeries.monthly)
    benchmarks = {
      period: {
        portfolio_pct: performance.return_pct,
        cdi_pct: periodBench.cdi_pct, ibov_pct: periodBench.ibov_pct, sp500_pct: periodBench.sp500_pct,
      },
      since_inception: {
        portfolio_pct: inceptionPerformance.return_pct,
        cdi_pct: benchmarksFull.cdi_pct, ibov_pct: benchmarksFull.ibov_pct, sp500_pct: benchmarksFull.sp500_pct,
      },
      monthly: benchmarksFull.monthly.map((b, i) => ({ ...b, portfolio_cum: portfolioCum[i] ?? null })),
    }

    assetReturns = await computeAssetReturns(userId, periodFrom ?? toStr, toStr)
  }

  // ─── Alocação multidimensional (sobre TODO o by_asset) ─────────────────────
  const by_class: SnapshotClassValue[] = result.by_class.map(c => ({
    key: c.name_key ?? c.name, name: c.name, name_key: c.name_key, color: c.color,
    value: cvt(c.value_brl), pct: c.pct, target_pct: targetMap.get(c.name) ?? null,
  }))

  const by_geography = aggregateByKey(result.by_asset, result.total_brl, getCountryKey, getCountryKey, cvt)
  const by_sector = aggregateByKey(
    result.by_asset, result.total_brl,
    a => sectorKey(sectorMap[a.code] ?? null),
    a => sectorMap[a.code] ?? 'Outros',
    cvt,
  )
  const by_currency = aggregateByKey(result.by_asset, result.total_brl, a => a.currency, a => a.currency, cvt)

  // ─── Concentração / diversificação (mesma fórmula de DiversificationPage) ──
  const positiveAssets = result.by_asset.filter(a => a.value_brl > 0)
  const assetShares = positiveAssets.map(a => result.total_brl > 0 ? a.value_brl / result.total_brl : 0)
  const hhiAsset  = calcHHI(assetShares)
  const hhiGeo    = calcHHI(by_geography.map(g => g.pct / 100))
  const hhiSector = calcHHI(by_sector.map(g => g.pct / 100))

  const sortedByValue = [...positiveAssets].sort((a, b) => b.value_brl - a.value_brl)
  const top5Brl = sortedByValue.slice(0, 5).reduce((s, a) => s + a.value_brl, 0)

  const diversification: SnapshotDiversification = {
    hhi_asset: Math.round(hhiAsset * 10000) / 10000,
    hhi_asset_normalized: Math.round(normalizeHHI(hhiAsset, positiveAssets.length) * 10000) / 10000,
    hhi_geography: Math.round(hhiGeo * 10000) / 10000,
    hhi_geography_normalized: Math.round(normalizeHHI(hhiGeo, by_geography.length) * 10000) / 10000,
    hhi_sector: Math.round(hhiSector * 10000) / 10000,
    hhi_sector_normalized: Math.round(normalizeHHI(hhiSector, by_sector.length) * 10000) / 10000,
    effective_n: hhiAsset > 0 ? Math.round((1 / hhiAsset) * 100) / 100 : 0,
    top5_pct: result.total_brl > 0 ? Math.round((top5Brl / result.total_brl) * 10000) / 100 : 0,
    n_positions: positiveAssets.length,
  }

  // ─── Holdings e destaques de desempenho ────────────────────────────────────
  const snapshotAssets: SnapshotAsset[] = sortedByValue.map(a => ({
    id: a.id, code: a.code, name: a.name,
    value: cvt(a.value_brl), pct: result.total_brl > 0 ? (a.value_brl / result.total_brl) * 100 : 0,
    class_name: a.class_name, class_name_key: a.class_name_key, class_color: a.class_color,
    exchange: a.exchange ?? null, currency: a.currency,
    return_pct: assetReturns[a.id] ?? null,
  }))

  const top_assets  = snapshotAssets.slice(0, 15)
  const withReturns = snapshotAssets.filter(a => a.return_pct !== null)
  const top_gainers = [...withReturns].sort((a, b) => (b.return_pct as number) - (a.return_pct as number)).slice(0, 5)
  const top_losers  = [...withReturns].sort((a, b) => (a.return_pct as number) - (b.return_pct as number)).slice(0, 5)

  // ─── Renda passiva (12 meses) ───────────────────────────────────────────────
  const today = new Date()
  const since12m = new Date(today)
  since12m.setFullYear(since12m.getFullYear() - 1)
  const divSummary = await computeDividendsSummary(userId, localDate(since12m), localDate(today))

  const dividends: SnapshotDividends = {
    total_12m: cvt(divSummary.total_brl),
    by_month: divSummary.by_month.map(m => ({ month: m.month, total: cvt(m.total_brl) })),
    top_payers: divSummary.by_asset.slice(0, 5).map(a => ({ asset_id: a.asset_id, code: a.code, name: a.name, total: cvt(a.total_brl) })),
    yield_pct: result.total_brl > 0 ? Math.round((divSummary.total_brl / result.total_brl) * 10000) / 100 : null,
  }

  const investedBrlTotal = result.by_asset.reduce((s, a) => s + (a.invested_brl ?? 0), 0)

  return {
    generated_at: new Date().toISOString(), display_currency: displayCurrency,
    period, period_from: periodFrom, period_to: toStr, inception,
    total: cvt(result.total_brl), invested: cvt(investedBrlTotal),
    asset_count: positiveAssets.length, class_count: result.by_class.length,
    performance, inception_performance: inceptionPerformance, monthly, benchmarks,
    by_class, by_geography, by_sector, by_currency,
    diversification,
    top_assets, top_gainers, top_losers,
    dividends,
  }
}

router.get('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('portfolio_shares').select('token, show_values, hide_holdings, label, updated_at, is_active')
    .eq('user_id', userId).eq('is_active', true).maybeSingle()
  if (!data) { res.json(null); return }
  res.json(data)
})

router.post('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    show_values = false, hide_holdings = false, label = null,
    display_currency = 'BRL', period = 'inception',
  } = req.body ?? {}
  const snapshot = await buildPortfolioSnapshot(userId, display_currency, period)

  const { data: existing } = await supabaseAdmin
    .from('portfolio_shares').select('id, token').eq('user_id', userId).maybeSingle()

  if (existing) {
    await supabaseAdmin.from('portfolio_shares')
      .update({ show_values, hide_holdings, label, is_active: true, updated_at: new Date().toISOString(), snapshot })
      .eq('id', existing.id)
    res.json({ token: existing.token, show_values, hide_holdings, label, updated_at: new Date().toISOString() })
    return
  }
  const { data: share, error } = await supabaseAdmin
    .from('portfolio_shares').insert({ user_id: userId, show_values, hide_holdings, label, snapshot }).select('token').single()
  if (error || !share) { res.status(500).json({ error: error?.message ?? 'Failed' }); return }
  res.json({ token: share.token, show_values, hide_holdings, label, updated_at: new Date().toISOString() })
})

router.patch('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { show_values, hide_holdings } = req.body ?? {}
  const update: Record<string, boolean> = {}
  if (show_values !== undefined) update.show_values = show_values
  if (hide_holdings !== undefined) update.hide_holdings = hide_holdings
  await supabaseAdmin.from('portfolio_shares')
    .update(update)
    .eq('user_id', userId).eq('is_active', true)
  res.json({ ok: true })
})

router.delete('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  await supabaseAdmin.from('portfolio_shares').update({ is_active: false }).eq('user_id', userId)
  res.json({ ok: true })
})

// GET /api/portfolio/sector-data — fetch real sector data per asset code via Yahoo Finance
const YAHOO_SECTOR_MAP: Record<string, string> = {
  'Financial Services': 'Financeiro',
  'Financial': 'Financeiro',
  'Energy': 'Energia',
  'Basic Materials': 'Materiais Básicos',
  'Consumer Cyclical': 'Consumo Cíclico',
  'Consumer Defensive': 'Consumo Essencial',
  'Industrials': 'Industrial',
  'Technology': 'Tecnologia',
  'Healthcare': 'Saúde',
  'Real Estate': 'Imóveis',
  'Utilities': 'Utilidades Públicas',
  'Communication Services': 'Telecom',
  'Communications': 'Telecom',
}

function mapSectorPt(sector: string | null, classNameKey?: string | null): string | null {
  if (sector && sector.length > 0) return YAHOO_SECTOR_MAP[sector] ?? sector
  const k = (classNameKey ?? '').toLowerCase()
  if (k.includes('caixa') || k.includes('cash')) return 'Caixa'
  if (k.includes('rendafixa') || k.includes('previdencia')) return 'Renda Fixa'
  if (k.includes('fii') || k.includes('imoveis') || k.includes('imóveis')) return 'Imóveis'
  if (k.includes('cripto') || k.includes('crypto')) return 'Cripto'
  if (k.includes('acoes') || k.includes('ações') || k.includes('equit')) return 'Ações'
  if (k.includes('etf')) return 'ETF'
  return null
}

const SECTOR_DAY_TTL = 24 * 60 * 60 * 1000

export async function getSectorMap(userId: string): Promise<Record<string, string | null>> {
  const cacheKey = `portfolio:sectors:${userId}`
  const cached = cache.get<Record<string, string | null>>(cacheKey)
  if (cached) return cached

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code, asset_type, ticker_brapi, ticker_yahoo, coingecko_id, asset_classes(name_key)')
    .eq('user_id', userId)
    .eq('active', true)

  const sectors: Record<string, string | null> = {}

  await Promise.allSettled(
    (assets ?? []).map(async (a) => {
      const classKey = (a.asset_classes as { name_key?: string } | null)?.name_key ?? null
      if (a.asset_type === 'fixed_income') {
        sectors[a.code] = 'Renda Fixa'; return
      }
      if (a.coingecko_id) {
        sectors[a.code] = 'Cripto'; return
      }
      const yahooTicker = (a.ticker_yahoo as string | null) ?? (a.ticker_brapi ? `${a.ticker_brapi}.SA` : null)
      if (yahooTicker) {
        const raw = await yahoo.getAssetSector(yahooTicker)
        sectors[a.code] = mapSectorPt(raw, classKey)
      } else {
        sectors[a.code] = mapSectorPt(null, classKey)
      }
    })
  )

  cache.set(cacheKey, sectors, SECTOR_DAY_TTL)
  return sectors
}

router.get('/sector-data', requireAuth, async (req, res: Response) => {
  try {
    const { userId } = (req as AuthRequest)
    const sectors = await getSectorMap(userId)
    res.json({ sectors })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
