import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getCurrentPrice, Asset, FITranche } from '../_services/priceService.js'
import { calculateTrancheProfits, FixedIncomeAsset } from '../_services/fixedIncomeService.js'
import { getFxRate } from '../_lib/fx.js'

const router = Router()

// GET /api/assets — simple list of all active assets (no pricing)
router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, exchange, fi_principal, fi_start_date, fi_type, fi_maturity, asset_classes(id, name, color)')
    .eq('user_id', userId)
    .eq('active', true)
    .order('code')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

// GET /api/assets/lookup?code=AAPL&market=b3|intl|cripto
// Returns { name, coingecko_id? } for auto-filling the new asset form
router.get('/lookup', requireAuth, async (req, res: Response) => {
  const { code, market } = req.query as { code?: string; market?: string }
  if (!code || !market) { res.json({ name: null }); return }
  const ticker = code.trim().toUpperCase()

  try {
    if (market === 'b3') {
      const token = process.env.BRAPI_TOKEN
      const url = `https://brapi.dev/api/quote/${ticker}${token ? `?token=${token}` : ''}`
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) { res.json({ name: null }); return }
      const d = await r.json() as { results?: Array<{ longName?: string; shortName?: string }> }
      res.json({ name: d.results?.[0]?.longName || d.results?.[0]?.shortName || null })

    } else if (market === 'intl') {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&lang=en-US&quotesCount=5`
      const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!r.ok) { res.json({ name: null }); return }
      const d = await r.json() as { quotes?: Array<{ longname?: string; shortname?: string; symbol?: string }> }
      const match = d.quotes?.find(q => q.symbol?.toUpperCase() === ticker) ?? d.quotes?.[0]
      res.json({ name: match?.longname || match?.shortname || null })

    } else if (market === 'cripto') {
      const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(ticker)}`
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) { res.json({ name: null, coingecko_id: null }); return }
      const d = await r.json() as { coins?: Array<{ id: string; name: string; symbol: string }> }
      const match = d.coins?.find(c => c.symbol.toUpperCase() === ticker)
      res.json(match ? { name: match.name, coingecko_id: match.id } : { name: null, coingecko_id: null })

    } else {
      res.json({ name: null })
    }
  } catch {
    res.json({ name: null, coingecko_id: null })
  }
})

// GET /api/assets/classes — list asset classes for the user
router.get('/classes', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('asset_classes')
    .select('id, name, color')
    .eq('user_id', userId)
    .order('name')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

// POST /api/assets/classes — create a class
router.post('/classes', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, color } = req.body as { name: string; color?: string }
  if (!name?.trim()) { res.status(400).json({ error: 'Nome obrigatorio' }); return }
  const { data, error } = await supabaseAdmin
    .from('asset_classes')
    .insert({ user_id: userId, name: name.trim(), color: color ?? '#6B7280' })
    .select('id, name, color')
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

// PATCH /api/assets/classes/:id — rename or recolor
router.patch('/classes/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const classId = Number(req.params.id)
  const { name, color } = req.body as { name?: string; color?: string }
  const updates: Record<string, string> = {}
  if (name) updates.name = name.trim()
  if (color) updates.color = color
  if (!Object.keys(updates).length) { res.status(400).json({ error: 'Nada para atualizar' }); return }
  const { error } = await supabaseAdmin
    .from('asset_classes')
    .update(updates)
    .eq('id', classId)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// DELETE /api/assets/classes/:id
router.delete('/classes/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const classId = Number(req.params.id)
  const { count } = await supabaseAdmin
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('asset_class_id', classId)
    .eq('user_id', userId)
    .eq('active', true)
  if (count && count > 0) {
    res.status(409).json({ error: `Classe em uso por ${count} ativo(s). Mova-os antes de excluir.` }); return
  }
  const { error } = await supabaseAdmin
    .from('asset_classes')
    .delete()
    .eq('id', classId)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /api/assets — create a new asset
router.post('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { code, name, asset_type, currency, asset_class_id, ticker_yahoo, ticker_brapi, coingecko_id } = req.body as {
    code: string; name: string; asset_type: string; currency: string
    asset_class_id?: number | null; ticker_yahoo?: string; ticker_brapi?: string; coingecko_id?: string
  }
  if (!code || !name || !asset_type || !currency) {
    res.status(400).json({ error: 'code, name, asset_type e currency são obrigatórios' }); return
  }
  const { data, error } = await supabaseAdmin
    .from('assets')
    .insert({
      user_id:        userId,
      code:           code.trim().toUpperCase(),
      name:           name.trim(),
      asset_type,
      currency,
      asset_class_id: asset_class_id ?? null,
      ticker_yahoo:   ticker_yahoo   ?? null,
      ticker_brapi:   ticker_brapi   ?? null,
      coingecko_id:   coingecko_id   ?? null,
      active:         true,
    })
    .select('id, code, name, asset_type, currency')
    .single()
  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json(data)
})

async function getOwnedAsset(assetId: number, userId: string) {
  const { data } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, fi_principal, fi_start_date, fi_type, fi_rate, fi_spread')
    .eq('id', assetId)
    .eq('user_id', userId)
    .single()
  return data
}

// POST /api/assets/:id/migrate-to-fi — converte ativo manual em renda fixa
router.post('/:id/migrate-to-fi', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  const asset = await getOwnedAsset(assetId, userId)
  if (!asset) { res.status(404).json({ error: 'Ativo nao encontrado' }); return }
  if (asset.asset_type !== 'manual') { res.status(400).json({ error: 'Apenas ativos manuais podem ser migrados' }); return }

  const { fi_type, fi_rate, fi_spread, fi_maturity, exchange, fi_principal, fi_start_date } = req.body as {
    fi_type: string; fi_rate?: number | null; fi_spread?: number | null
    fi_maturity?: string | null; exchange?: string | null
    fi_principal?: number; fi_start_date?: string
  }

  if (!fi_type) { res.status(400).json({ error: 'fi_type e obrigatorio' }); return }
  if (fi_type !== 'ipca_plus' && (fi_rate == null || fi_rate <= 0)) {
    res.status(400).json({ error: 'fi_rate e obrigatorio para este tipo' }); return
  }

  const { data: existingContribs } = await supabaseAdmin
    .from('contributions')
    .select('value_brl, date')
    .eq('asset_id', assetId)
    .eq('type', 'buy')
    .order('date', { ascending: true })

  let effectivePrincipal: number
  let effectiveStartDate: string

  if (existingContribs?.length) {
    effectivePrincipal = existingContribs.reduce((s, c) => s + (c.value_brl ?? 0), 0)
    effectiveStartDate = existingContribs[0].date
  } else {
    if (!fi_principal || fi_principal <= 0) {
      res.status(400).json({ error: 'fi_principal e obrigatorio quando nao ha aportes registrados' }); return
    }
    if (!fi_start_date) {
      res.status(400).json({ error: 'fi_start_date e obrigatorio quando nao ha aportes registrados' }); return
    }
    effectivePrincipal = fi_principal
    effectiveStartDate = fi_start_date
    const { error: cErr } = await supabaseAdmin.from('contributions').insert({
      asset_id: assetId, date: fi_start_date, type: 'buy',
      quantity: 1, price_orig: fi_principal, currency: 'BRL', value_brl: fi_principal,
    })
    if (cErr) { res.status(500).json({ error: cErr.message }); return }
  }

  const updates: Record<string, unknown> = {
    asset_type:    'fixed_income',
    fi_type,
    fi_principal:  effectivePrincipal,
    fi_start_date: effectiveStartDate,
  }
  if (fi_rate   != null) updates.fi_rate   = fi_rate
  if (fi_spread != null) updates.fi_spread = fi_spread
  if (fi_maturity)       updates.fi_maturity = fi_maturity
  if (exchange)          updates.exchange    = exchange

  const { error } = await supabaseAdmin.from('assets').update(updates).eq('id', assetId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /api/assets/:id/fi-deposit — aporte adicional em renda fixa
router.post('/:id/fi-deposit', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  const asset = await getOwnedAsset(assetId, userId)
  if (!asset) { res.status(404).json({ error: 'Ativo nao encontrado' }); return }
  if (asset.asset_type !== 'fixed_income') { res.status(400).json({ error: 'Ativo nao e renda fixa' }); return }

  const { date, value_brl, notes } = req.body as { date: string; value_brl: number; notes?: string }
  if (!date || !value_brl || value_brl <= 0) {
    res.status(400).json({ error: 'date e value_brl sao obrigatorios' }); return
  }

  const { error: cErr } = await supabaseAdmin.from('contributions').insert({
    asset_id: assetId, date, type: 'buy',
    quantity: 1, price_orig: value_brl, currency: 'BRL',
    value_brl, description: notes ?? null,
  })
  if (cErr) { res.status(500).json({ error: cErr.message }); return }

  const currentPrincipal = asset.fi_principal ?? 0
  const { error: pErr } = await supabaseAdmin
    .from('assets')
    .update({ fi_principal: currentPrincipal + value_brl })
    .eq('id', assetId)
  if (pErr) { res.status(500).json({ error: pErr.message }); return }

  res.json({ ok: true })
})

router.get('/:id/manual-values', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  if (!await getOwnedAsset(assetId, userId)) {
    res.status(404).json({ error: 'Ativo não encontrado' }); return
  }
  const { data, error } = await supabaseAdmin
    .from('manual_values')
    .select('id, ref_date, value, currency, notes, created_at')
    .eq('asset_id', assetId)
    .order('ref_date', { ascending: false })
    .limit(24)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

router.post('/:id/manual-value', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  if (!await getOwnedAsset(assetId, userId)) {
    res.status(404).json({ error: 'Ativo não encontrado' }); return
  }
  const { ref_date, value, currency, notes } = req.body as {
    ref_date: string; value: number; currency: string; notes?: string
  }
  if (!ref_date || value == null || !currency) {
    res.status(400).json({ error: 'ref_date, value e currency são obrigatórios' }); return
  }
  const { error } = await supabaseAdmin
    .from('manual_values')
    .upsert(
      { asset_id: assetId, ref_date, value, currency, notes: notes ?? null },
      { onConflict: 'asset_id,ref_date' }
    )
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.delete('/:id/manual-value/:valueId', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  const valueId = Number(req.params.valueId)
  if (!await getOwnedAsset(assetId, userId)) {
    res.status(404).json({ error: 'Ativo não encontrado' }); return
  }
  const { error } = await supabaseAdmin
    .from('manual_values')
    .delete()
    .eq('id', valueId)
    .eq('asset_id', assetId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

const PATCHABLE = ['fi_principal', 'fi_start_date', 'fi_type', 'fi_rate', 'fi_spread', 'fi_maturity', 'exchange', 'name', 'notes', 'asset_class_id'] as const
router.patch('/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  if (!await getOwnedAsset(assetId, userId)) {
    res.status(404).json({ error: 'Ativo não encontrado' }); return
  }
  const updates = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>).filter(([k]) => PATCHABLE.includes(k as typeof PATCHABLE[number]))
  )
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'Nenhum campo válido para atualizar' }); return
  }
  const { error } = await supabaseAdmin
    .from('assets')
    .update(updates)
    .eq('id', assetId)
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /api/assets/:id/archive — marks asset as inactive (soft delete)
router.post('/:id/archive', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  if (!await getOwnedAsset(assetId, userId)) {
    res.status(404).json({ error: 'Ativo não encontrado' }); return
  }
  const { error } = await supabaseAdmin
    .from('assets').update({ active: false }).eq('id', assetId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// POST /api/assets/:id/unarchive — restores archived asset
router.post('/:id/unarchive', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  const { data } = await supabaseAdmin
    .from('assets').select('id').eq('id', assetId).eq('user_id', userId).single()
  if (!data) { res.status(404).json({ error: 'Ativo não encontrado' }); return }
  const { error } = await supabaseAdmin
    .from('assets').update({ active: true }).eq('id', assetId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// GET /api/assets/archived — list inactive assets
router.get('/archived', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, asset_classes(name, color)')
    .eq('user_id', userId)
    .eq('active', false)
    .order('name')
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

router.get('/:id/detail', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)

  const { data: asset } = await supabaseAdmin
    .from('assets')
    .select('*, asset_classes(id, name, color)')
    .eq('id', assetId)
    .eq('user_id', userId)
    .single()

  if (!asset) { res.status(404).json({ error: 'Ativo não encontrado' }); return }

  const cls = asset.asset_classes as { id: number; name: string; color: string } | null

  const { data: rawContribs } = await supabaseAdmin
    .from('contributions')
    .select('id, date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, description')
    .eq('asset_id', assetId)
    .order('date', { ascending: true })

  const contribs = rawContribs ?? []

  let totalQty = 0
  let totalCostBrl = 0
  let totalIncomeBrl = 0
  for (const c of contribs) {
    const qty = c.quantity ?? 0
    const costBrl = c.value_brl != null
      ? c.value_brl
      : (c.price_orig != null ? c.price_orig * qty * (c.fx_rate_brl ?? 5.70) : 0)
    if (c.type === 'income') {
      totalIncomeBrl += c.value_brl ?? 0
    } else if (c.type === 'buy') {
      totalQty   += qty
      totalCostBrl += costBrl
    } else {
      if (totalQty > 0) totalCostBrl = totalCostBrl * (1 - qty / totalQty)
      totalQty = Math.max(0, totalQty - qty)
    }
  }
  const holdings    = Math.max(0, totalQty)
  const investedBrl = totalCostBrl
  const avgCostBrl  = holdings > 0 && totalCostBrl > 0 ? totalCostBrl / holdings : null

  // Build tranches from buy contributions (RF assets)
  const rfTranches: FITranche[] = []
  if (asset.asset_type === 'fixed_income') {
    for (const c of contribs) {
      if (c.type !== 'buy' || !c.value_brl || c.value_brl <= 0) continue
      rfTranches.push({ principal: c.value_brl, start_date: c.date })
    }
    if (rfTranches.length === 0 && asset.fi_principal && asset.fi_start_date) {
      rfTranches.push({ principal: asset.fi_principal, start_date: asset.fi_start_date })
    }
  }

  let currentValueBrl = 0
  let currentPrice: number | null = null
  let priceCurrency = asset.currency || 'BRL'
  let priceSource   = ''

  try {
    if (asset.asset_type === 'manual') {
      const { data: mv } = await supabaseAdmin
        .from('manual_values')
        .select('value, currency')
        .eq('asset_id', assetId)
        .order('ref_date', { ascending: false })
        .limit(1).single()
      if (mv) {
        currentValueBrl = mv.currency === 'BRL' ? mv.value : mv.value * await getFxRate(mv.currency)
        priceCurrency   = mv.currency
        priceSource     = 'manual'
      }
    } else {
      const result = await getCurrentPrice(
        asset as Asset,
        asset.asset_type === 'fixed_income' && rfTranches.length ? rfTranches : undefined
      )
      currentPrice  = result.price
      priceCurrency = result.currency
      priceSource   = result.source
      if (asset.asset_type === 'fixed_income') {
        currentValueBrl = result.price
      } else {
        const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
        currentValueBrl = holdings * result.price * fx
      }
    }
  } catch {
    // No price source available: use cost basis so value = invested, gain/loss = 0
    if (asset.asset_type === 'ticker' && investedBrl > 0) {
      currentValueBrl = investedBrl
      priceSource     = 'cost_basis'
    }
  }

  const gainLossBrl = currentValueBrl - investedBrl
  const gainLossPct = investedBrl > 0 ? (gainLossBrl / investedBrl) * 100 : null

  // Per-contribution profit for RF assets (fetches BCB rates once, applies per tranche)
  const profitByContribId = new Map<number, number>()
  if (asset.asset_type === 'fixed_income' && rfTranches.length > 0) {
    try {
      const trancheResults = await calculateTrancheProfits(asset as unknown as FixedIncomeAsset, rfTranches)
      const buyContribs = contribs.filter(c => c.type === 'buy' && c.value_brl && c.value_brl > 0)
      buyContribs.forEach((c, i) => {
        if (trancheResults[i] != null) profitByContribId.set(c.id, trancheResults[i].profit_brl)
      })
    } catch { /* ignore per-tranche errors */ }
  }

  type HistoryPoint = { date: string; price: number; value_brl: number }
  let history: HistoryPoint[] = []

  if (asset.asset_type === 'ticker') {
    const today = new Date().toISOString().split('T')[0]
    const { data: ph } = await supabaseAdmin
      .from('price_history')
      .select('ref_date, price, currency')
      .eq('asset_id', assetId)
      .lte('ref_date', today)
      .order('ref_date', { ascending: true })

    const fxApprox = priceCurrency === 'BRL' ? 1 : await getFxRate(priceCurrency).catch(() => 5.70)
    history = (ph ?? []).map((p) => {
      let qtyAt = 0
      for (const c of contribs) {
        if (c.date <= p.ref_date) qtyAt += c.type === 'buy' ? (c.quantity ?? 0) : -(c.quantity ?? 0)
      }
      qtyAt = Math.max(0, qtyAt)
      return {
        date:      p.ref_date,
        price:     p.price,
        value_brl: Math.round(qtyAt * p.price * fxApprox * 100) / 100,
      }
    })
  } else if (asset.asset_type === 'manual') {
    const { data: mv } = await supabaseAdmin
      .from('manual_values')
      .select('ref_date, value, currency')
      .eq('asset_id', assetId)
      .order('ref_date', { ascending: true })
    for (const m of (mv ?? [])) {
      const fx = m.currency === 'BRL' ? 1 : await getFxRate(m.currency).catch(() => 5.70)
      history.push({ date: m.ref_date, price: m.value, value_brl: Math.round(m.value * fx * 100) / 100 })
    }
  }

  res.json({
    id:            asset.id,
    code:          asset.code,
    name:          asset.name,
    asset_type:    asset.asset_type,
    currency:      asset.currency,
    exchange:      asset.exchange ?? null,
    class_name:    cls?.name ?? 'Sem classe',
    class_color:   cls?.color ?? '#6B7280',
    fi_type:       asset.fi_type ?? null,
    fi_principal:  asset.fi_principal ?? null,
    fi_rate:       asset.fi_rate ?? null,
    fi_spread:     asset.fi_spread ?? null,
    fi_start_date: asset.fi_start_date ?? null,
    current_value_brl: Math.round(currentValueBrl * 100) / 100,
    current_price: currentPrice,
    price_currency: priceCurrency,
    price_source:   priceSource,
    holdings:       asset.asset_type === 'ticker' ? holdings : null,
    avg_cost_brl:   avgCostBrl !== null ? Math.round(avgCostBrl * 100) / 100 : null,
    invested_brl:   Math.round(investedBrl * 100) / 100,
    gain_loss_brl:  Math.round(gainLossBrl * 100) / 100,
    gain_loss_pct:  gainLossPct !== null ? Math.round(gainLossPct * 100) / 100 : null,
    total_income_brl: Math.round(totalIncomeBrl * 100) / 100,
    history,
    contributions: contribs.slice().reverse().map(c => ({
      ...c,
      profit_brl: profitByContribId.has(c.id) ? profitByContribId.get(c.id)! : null,
    })),
  })
})

export default router
