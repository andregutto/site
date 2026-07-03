// GET /api/portfolio/value — valor atual consolidado do portfólio
import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getCurrentPrice, getDailyHistory, Asset, FITranche } from '../services/priceService.js'
import { getSplitEvents } from '../services/yahooService.js'
import { getFxRate } from '../lib/fx.js'
import { cache, TTL } from '../lib/cache.js'
import * as yahoo from '../services/yahooService.js'
import { buildPortfolioSnapshot } from '../services/snapshotService.js'

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
// e (via buildPortfolioSnapshot, em services/snapshotService.ts) pelo relatório
// compartilhado — snapshotService mantém sua própria cópia mais completa (com
// performance/benchmarks/dividendos) em vez de reusar esta diretamente, então
// as duas ainda podem divergir; ver nota no PR que uniu backend/frontend-api.
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

// All manual assets whose last registered value is 30+ days old (cached 6h —
// shorter than split-check since this changes daily, not just on corporate actions).
export interface StaleManualAsset {
  asset_id: number
  code: string
  days: number
  last_manual_date: string
}

export async function getStaleManualAssets(userId: string): Promise<StaleManualAsset[]> {
  const cacheKey = `portfolio:stale-manual:${userId}`
  const cached = cache.get<StaleManualAsset[]>(cacheKey)
  if (cached) return cached

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id, code')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('asset_type', 'manual')

  if (!assets?.length) return []

  const { data: manualValues } = await supabaseAdmin
    .from('manual_values')
    .select('asset_id, ref_date')
    .in('asset_id', assets.map(a => a.id))
    .order('ref_date', { ascending: false })

  const lastDateByAsset: Record<number, string> = {}
  for (const mv of (manualValues ?? [])) {
    if (!lastDateByAsset[mv.asset_id]) lastDateByAsset[mv.asset_id] = mv.ref_date
  }

  const stale: StaleManualAsset[] = []
  const now = Date.now()
  for (const asset of assets) {
    const lastDate = lastDateByAsset[asset.id]
    if (!lastDate) continue
    const days = Math.floor((now - new Date(lastDate).getTime()) / 86_400_000)
    if (days >= 30) stale.push({ asset_id: asset.id, code: asset.code as string, days, last_manual_date: lastDate })
  }

  cache.set(cacheKey, stale, 6 * 60 * 60 * 1000)
  return stale
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
// O snapshot em si (métricas de performance, benchmarks, dividendos etc. — não
// só o valor atual) é montado por buildPortfolioSnapshot em services/snapshotService.ts,
// que é a mesma função usada pela página pública de relatório (routes/public.ts).

router.get('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data } = await supabaseAdmin
    .from('portfolio_shares').select('token, show_values, hide_holdings, label, updated_at, is_active')
    .eq('user_id', userId).eq('is_active', true).maybeSingle()
  if (!data) { res.json(null); return }
  res.json(data)
})

// POST /api/portfolio/share-link — create or update, always refresh snapshot.
// portfolio_value (opcional): valor já calculado no frontend, evita recalcular
// tudo de novo em buildPortfolioSnapshot quando a página já tem os dados em mãos.
router.post('/share-link', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const {
    show_values = false, hide_holdings = false, label = null,
    display_currency = 'BRL', period = 'inception', portfolio_value,
  } = req.body ?? {}
  const snapshot = await buildPortfolioSnapshot(userId, display_currency, period, portfolio_value ?? undefined)

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
