import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getCurrentPrice, getMonthlyHistory, Asset, FITranche } from '../_services/priceService.js'
import { getFxRate } from '../_lib/fx.js'
import { cache } from '../_lib/cache.js'
import * as yahoo from '../_services/yahooService.js'

const router = Router()

router.get('/value', requireAuth, async (req, res: Response) => {
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
    if (c.type !== 'buy' || !c.value_brl || c.value_brl <= 0) continue
    if (!rfTranchesMap[c.asset_id]) rfTranchesMap[c.asset_id] = []
    rfTranchesMap[c.asset_id].push({ principal: c.value_brl, start_date: c.date })
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
    class_id: number | null; class_name: string; class_color: string
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

  type Detail = { id: number; code: string; status: 'ok' | 'empty' | 'error'; points?: number; error?: string }

  let synced = 0, errors = 0
  const details: Detail[] = []

  // brapi free tier: ~15 req/min → 1 request every 5s to stay safely within limit
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]
    try {
      const history = await getMonthlyHistory(a as Asset, 72)
      if (!history.length) {
        details.push({ id: a.id, code: a.code, status: 'empty' })
      } else {
        const { error: upsertErr } = await supabaseAdmin.from('price_history').upsert(
          history.map((p) => ({ asset_id: a.id, ref_date: p.date, price: p.price, currency: p.currency, source: 'sync' })),
          { onConflict: 'asset_id,ref_date' }
        )
        if (upsertErr) throw new Error(`DB upsert: ${upsertErr.message}`)
        synced++
        details.push({ id: a.id, code: a.code, status: 'ok', points: history.length })
      }
    } catch (err) {
      errors++
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[sync-history] Erro em ${a.code}:`, msg)
      details.push({ id: a.id, code: a.code, status: 'error', error: msg })
    }
    if (i + 1 < assets.length) await new Promise(r => setTimeout(r, 5000))
  }

  res.json({ synced, errors, total: assets.length, details })
})

// ─── POST /api/portfolio/reset-price-history ─────────────────────────────────
// Purges price_history from a given date (default 2025-01-01) then re-syncs
// ALL ticker assets (active + inactive) in batches. Fixes stale / off-by-one
// data that accumulated from previous syncs and the brapi timezone bug.

router.post('/reset-price-history', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const { data: assets } = await supabaseAdmin
    .from('assets')
    .select('id,code,asset_type,currency,ticker_brapi,ticker_yahoo,coingecko_id,fi_principal,fi_start_date,fi_type,fi_rate,fi_spread')
    .eq('user_id', userId)
    .eq('asset_type', 'ticker')

  if (!assets?.length) { res.json({ deleted: 0, synced: 0, errors: 0, total: 0, details: [] }); return }

  const assetIds = assets.map(a => a.id as number)

  // Delete ALL price_history for user's assets — no date filter — so stale or
  // timezone-shifted dates from any year are fully replaced by the fresh sync.
  const { count: deleted } = await supabaseAdmin
    .from('price_history')
    .delete({ count: 'exact' })
    .in('asset_id', assetIds)

  // Clear in-memory cache so brapi / yahoo return fresh data (not stale cached responses)
  cache.deletePattern('brapi:history:')
  cache.deletePattern('yahoo:history:')
  cache.deletePattern('coingecko:history:')

  type Detail = { id: number; code: string; status: 'ok' | 'empty' | 'error'; points?: number; error?: string }

  let synced = 0, errors = 0
  const details: Detail[] = []

  // brapi free tier: ~15 req/min → 1 request every 5s to stay safely within limit
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i]
    try {
      const history = await getMonthlyHistory(a as Asset, 72)
      if (!history.length) {
        details.push({ id: a.id, code: a.code, status: 'empty' })
      } else {
        const { error: upsertErr } = await supabaseAdmin.from('price_history').upsert(
          history.map((p) => ({ asset_id: a.id, ref_date: p.date, price: p.price, currency: p.currency, source: 'reset' })),
          { onConflict: 'asset_id,ref_date' }
        )
        if (upsertErr) throw new Error(`DB: ${upsertErr.message}`)
        synced++
        details.push({ id: a.id, code: a.code, status: 'ok', points: history.length })
      }
    } catch (err) {
      errors++
      const msg = err instanceof Error ? err.message : String(err)
      details.push({ id: a.id, code: a.code, status: 'error', error: msg })
    }
    if (i + 1 < assets.length) await new Promise(r => setTimeout(r, 5000))
  }

  res.json({ deleted: deleted ?? 0, synced, errors, total: assets.length, details })
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
