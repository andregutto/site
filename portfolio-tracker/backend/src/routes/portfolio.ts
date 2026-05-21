// GET /api/portfolio/value — valor atual consolidado do portfólio
import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getCurrentPrice, getMonthlyHistory, Asset } from '../services/priceService.js'
import { getFxRate } from '../lib/fx.js'
import * as yahoo from '../services/yahooService.js'

const router = Router()

// GET /api/portfolio/value
router.get('/value', requireAuth, async (req, res: Response, next) => {
  try {
  const { userId } = req as AuthRequest

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
    .select('asset_id, type, quantity, value_brl')
    .in('asset_id', assetIds)

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

  // 3. Último valor manual — cobre todos os asset_types (fallback para tickers sem preço público)
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

  // 4. Calcula valor em BRL por ativo — todos os ativos aparecem, mesmo sem valor
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
          if (!a.fi_principal || !a.fi_start_date || !a.fi_type || (a.fi_type !== 'ipca_plus' && a.fi_rate == null)) {
            byAsset.push({ ...base, value_brl: 0, value_orig: 0, currency: a.currency || 'BRL', holdings: null, price: null, source: 'fixed_income', needs_manual: true, invested_brl: investedMap[a.id] ?? null, last_manual_date: null, fi_type: a.fi_type, fi_start_date: a.fi_start_date, fi_rate: a.fi_rate, fi_spread: a.fi_spread, fi_maturity: a.fi_maturity ?? null })
            return
          }
          const result = await getCurrentPrice(a as Asset)
          value_orig = result.price
          currency   = result.currency
          source     = result.source
          value_brl  = currency === 'BRL' ? value_orig : value_orig * await getFxRate(currency)

        } else {
          // ticker
          holdings = holdingsMap[a.id] ?? 0
          const hasAutoSource = !!(a.ticker_yahoo || a.coingecko_id)
          if (holdings <= 0 && hasAutoSource) return
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
              byAsset.push({ ...base, value_brl: 0, value_orig: 0, currency: a.currency || 'BRL', holdings, price: null, source: 'error', needs_manual: true, invested_brl: investedMap[a.id] ?? null, last_manual_date: null })
              return
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
      const history = await getMonthlyHistory(a as Asset, monthsBack)
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

export default router
