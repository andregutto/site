import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getCurrentPrice } from '../services/priceService.js'
import type { Asset, FITranche } from '../services/priceService.js'
import { calculateTrancheProfits } from '../services/fixedIncomeService.js'
import type { FixedIncomeAsset } from '../services/fixedIncomeService.js'
import { getFxRate } from '../lib/fx.js'

const router = Router()

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

function isColumnMissing(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || Boolean(error.message?.includes('does not exist'))
}

router.get('/classes', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  let { data, error } = await supabaseAdmin
    .from('asset_classes')
    .select('id, name, color, icon')
    .eq('user_id', userId)
    .order('name')
  if (error && isColumnMissing(error)) {
    const fb = await supabaseAdmin.from('asset_classes').select('id, name, color').eq('user_id', userId).order('name')
    data = (fb.data ?? []).map(c => ({ ...c, icon: null })) as typeof data
    error = fb.error
  }
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

router.post('/classes', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { name, color, icon } = req.body as { name: string; color?: string; icon?: string }
  if (!name?.trim()) { res.status(400).json({ error: 'Nome obrigatorio' }); return }
  let r = await supabaseAdmin
    .from('asset_classes')
    .insert({ user_id: userId, name: name.trim(), color: color ?? '#6B7280', icon: icon ?? null })
    .select('id, name, color, icon')
    .single()
  if (r.error && isColumnMissing(r.error)) {
    const fb = await supabaseAdmin
      .from('asset_classes')
      .insert({ user_id: userId, name: name.trim(), color: color ?? '#6B7280' })
      .select('id, name, color')
      .single()
    r = { data: fb.data ? { ...fb.data, icon: null } : null, error: fb.error } as typeof r
  }
  if (r.error) { res.status(500).json({ error: r.error.message }); return }
  res.status(201).json(r.data)
})

router.patch('/classes/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const classId = Number(req.params.id)
  const { name, color, icon } = req.body as { name?: string; color?: string; icon?: string | null }
  const updates: Record<string, string | null> = {}
  if (name) updates.name = name.trim()
  if (color) updates.color = color
  if (icon !== undefined) updates.icon = icon
  if (!Object.keys(updates).length) { res.status(400).json({ error: 'Nada para atualizar' }); return }
  let { error } = await supabaseAdmin.from('asset_classes').update(updates).eq('id', classId).eq('user_id', userId)
  if (error && isColumnMissing(error)) {
    const { icon: _i, ...rest } = updates
    error = Object.keys(rest).length
      ? (await supabaseAdmin.from('asset_classes').update(rest).eq('id', classId).eq('user_id', userId)).error
      : null
  }
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.delete('/classes/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const classId = Number(req.params.id)
  const { count } = await supabaseAdmin
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
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
      class_id: asset_class_id ?? null,
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

const PATCHABLE = ['fi_principal', 'fi_start_date', 'fi_type', 'fi_rate', 'fi_spread', 'fi_maturity', 'exchange', 'name', 'notes', 'asset_class_id', 'sector'] as const
router.patch('/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  if (!await getOwnedAsset(assetId, userId)) {
    res.status(404).json({ error: 'Ativo não encontrado' }); return
  }
  const updates = Object.fromEntries(
    Object.entries(req.body as Record<string, unknown>)
      .filter(([k]) => PATCHABLE.includes(k as typeof PATCHABLE[number]))
      .map(([k, v]) => [k === 'asset_class_id' ? 'class_id' : k, v])
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

router.delete('/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const assetId = Number(req.params.id)
  const { data: asset } = await supabaseAdmin
    .from('assets').select('id, active').eq('id', assetId).eq('user_id', userId).single()
  if (!asset) { res.status(404).json({ error: 'Ativo não encontrado' }); return }
  if (asset.active) { res.status(400).json({ error: 'Arquive o ativo antes de excluí-lo definitivamente' }); return }
  await supabaseAdmin.from('price_history').delete().eq('asset_id', assetId)
  await supabaseAdmin.from('contributions').delete().eq('asset_id', assetId)
  await supabaseAdmin.from('manual_values').delete().eq('asset_id', assetId)
  const { error } = await supabaseAdmin.from('assets').delete().eq('id', assetId).eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.get('/archived', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data: archivedAssets, error } = await supabaseAdmin
    .from('assets')
    .select('id, code, name, asset_type, currency, asset_classes(name, color)')
    .eq('user_id', userId)
    .eq('active', false)
    .order('name')
  if (error) { res.status(500).json({ error: error.message }); return }
  if (!archivedAssets?.length) { res.json([]); return }

  const assetIds = archivedAssets.map(a => a.id as number)
  const { data: contribs } = await supabaseAdmin
    .from('contributions')
    .select('asset_id, type, quantity, price_orig, currency, date')
    .in('asset_id', assetIds)
    .order('date', { ascending: true })

  const contribsByAsset = new Map<number, typeof contribs>()
  for (const c of (contribs ?? [])) {
    const arr = contribsByAsset.get(c.asset_id) ?? []
    arr.push(c)
    contribsByAsset.set(c.asset_id, arr)
  }

  const result = archivedAssets.map(a => {
    const cs = contribsByAsset.get(a.id as number) ?? []
    const buys  = cs.filter(c => c.type === 'buy')
    const sells = cs.filter(c => c.type === 'sell')
    const totalInvested = buys.reduce((s, c)  => s + (c.quantity ?? 0) * (c.price_orig ?? 0), 0)
    const totalReceived = sells.reduce((s, c) => s + (c.quantity ?? 0) * (c.price_orig ?? 0), 0)
    const firstDate = cs.length > 0 ? cs[0].date : null
    const lastDate  = cs.length > 0 ? cs[cs.length - 1].date : null
    return { ...a, contributions: cs, totalInvested, totalReceived, pnl: totalReceived - totalInvested, firstDate, lastDate }
  })

  res.json(result)
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

  const assetCurrency = asset.currency || 'BRL'
  let fxApprox = assetCurrency === 'BRL' ? 1 : 5.70  // updated to real rate inside ticker block

  let totalQty = 0
  let totalCostBrl = 0
  let totalIncomeBrl = 0
  for (const c of contribs) {
    const qty = c.quantity ?? 0
    const cFx = c.fx_rate_brl ?? (c.currency === 'BRL' ? 1 : fxApprox)
    const costBrl = c.value_brl != null
      ? c.value_brl
      : (c.price_orig != null ? c.price_orig * qty * cFx : 0)
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
  const investedBrl = totalCostBrl > 0
    ? totalCostBrl
    : (asset.asset_type === 'fixed_income' && asset.fi_principal ? asset.fi_principal : 0)
  const avgCostBrl  = holdings > 0 && totalCostBrl > 0 ? totalCostBrl / holdings : null

  const rfBuyTranches: FITranche[] = []
  const rfTranches: FITranche[] = []
  if (asset.asset_type === 'fixed_income') {
    for (const c of contribs) {
      if (!c.value_brl || c.value_brl <= 0) continue
      if (c.type === 'buy') {
        rfBuyTranches.push({ principal: c.value_brl, start_date: c.date })
        rfTranches.push({ principal: c.value_brl, start_date: c.date })
      } else if (c.type === 'sell') {
        rfTranches.push({ principal: -c.value_brl, start_date: c.date })
      }
    }
    if (rfBuyTranches.length === 0 && asset.fi_principal && asset.fi_start_date) {
      rfBuyTranches.push({ principal: asset.fi_principal, start_date: asset.fi_start_date })
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
    } else if (asset.asset_type === 'ticker') {
      const { data: mvLatest } = await supabaseAdmin
        .from('manual_values')
        .select('value, currency')
        .eq('asset_id', assetId)
        .order('ref_date', { ascending: false })
        .limit(1).maybeSingle()

      if (mvLatest) {
        const fx = mvLatest.currency === 'BRL' ? 1 : await getFxRate(mvLatest.currency)
        currentValueBrl = mvLatest.currency === 'BRL' ? mvLatest.value : mvLatest.value * fx
        priceCurrency   = mvLatest.currency
        priceSource     = 'manual'
      } else {
        const isBrapiOnly = !!asset.ticker_brapi && !asset.ticker_yahoo && !asset.coingecko_id
        let brapiOnlyUnsynced = false
        if (isBrapiOnly) {
          const { count } = await supabaseAdmin
            .from('price_history')
            .select('asset_id', { count: 'exact', head: true })
            .eq('asset_id', assetId)
          brapiOnlyUnsynced = (count ?? 0) === 0
        }
        if (brapiOnlyUnsynced) {
          currentValueBrl = investedBrl
          priceSource     = 'cost_basis'
        } else {
          // Cap at 7s to avoid 504: if all sources time out fall back to cost_basis
          const priceRace = Promise.race([
            getCurrentPrice(asset as Asset),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('price_timeout')), 7000)),
          ])
          const result = await priceRace
          currentPrice    = result.price
          priceCurrency   = result.currency
          priceSource     = result.source
          const fx = result.currency === 'BRL' ? 1 : await getFxRate(result.currency)
          currentValueBrl = holdings * result.price * fx
        }
      }
    } else {
      const result = await Promise.race([
        getCurrentPrice(
          asset as Asset,
          asset.asset_type === 'fixed_income' && rfTranches.length ? rfTranches : undefined
        ),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('price_timeout')), 10000)),
      ])
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
    if (investedBrl > 0) {
      currentValueBrl = investedBrl
      priceSource     = 'cost_basis'
    }
  }

  const gainLossBrl = currentValueBrl - investedBrl
  const gainLossPct = investedBrl > 0 ? (gainLossBrl / investedBrl) * 100 : null

  const profitByContribId = new Map<number, number>()
  if (asset.asset_type === 'fixed_income' && rfBuyTranches.length > 0) {
    try {
      // Run in parallel — calculateTrancheProfits uses BCB data already cached by calculateCurrentValue
      const [trancheResults] = await Promise.all([
        calculateTrancheProfits(asset as unknown as FixedIncomeAsset, rfBuyTranches),
      ])
      const buyContribs = contribs.filter(c => c.type === 'buy' && c.value_brl && c.value_brl > 0)
      buyContribs.forEach((c, i) => {
        if (trancheResults[i] != null) profitByContribId.set(c.id, trancheResults[i].profit_brl)
      })
    } catch { /* ignore per-tranche errors */ }
  }

  type HistoryPoint = { date: string; price: number; value_brl: number }
  let history: HistoryPoint[] = []

  type InterpPt = { ref_date: string; value: number; currency: string }

  async function buildMonthlyInterpAsync(pts: InterpPt[]): Promise<void> {
    if (pts.length === 0) return
    const mi = (s: string) => { const [y, m] = s.substring(0, 7).split('-').map(Number); return y * 12 + m }
    const interpAt = (dateStr: string): InterpPt => {
      const last = pts[pts.length - 1]
      if (dateStr >= last.ref_date) return { ...last }
      if (dateStr <  pts[0].ref_date) return { ...pts[0] }
      let before = pts[0], after = pts[1]
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i].ref_date <= dateStr && pts[i + 1].ref_date > dateStr) {
          before = pts[i]; after = pts[i + 1]; break
        }
      }
      const mB = mi(before.ref_date), mA = mi(after.ref_date), mT = mi(dateStr)
      const span = mA - mB, elapsed = mT - mB
      if (span <= 0 || elapsed <= 0) return { ...before }
      const v = (before.value > 0 && after.value > 0)
        ? before.value * Math.pow(after.value / before.value, elapsed / span)
        : before.value + (after.value - before.value) * (elapsed / span)
      return { ref_date: dateStr, value: v, currency: before.currency }
    }
    const todayYM = new Date().toISOString().substring(0, 7)
    let [curY, curM] = pts[0].ref_date.substring(0, 7).split('-').map(Number)
    const [endY, endM] = todayYM.split('-').map(Number)
    while (curY < endY || (curY === endY && curM <= endM)) {
      const lastDay = new Date(curY, curM, 0).getDate()
      const ds = `${curY}-${String(curM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const { value: v, currency: cur } = interpAt(ds)
      const fx = cur === 'BRL' ? 1 : await getFxRate(cur).catch(() => 5.70)
      history.push({ date: ds, price: v, value_brl: Math.round(v * fx * 100) / 100 })
      if (curM === 12) { curY++; curM = 1 } else { curM++ }
    }
  }

  function prependBuyAnchor(pts: InterpPt[]): void {
    const firstBuyContrib = contribs.find(c => c.type === 'buy' &&
      (Number(c.value_brl) > 0 || Number(c.price_orig) > 0))
    if (!firstBuyContrib) return
    const firstBuyVal = Number(firstBuyContrib.value_brl) > 0
      ? Number(firstBuyContrib.value_brl)
      : Number(firstBuyContrib.price_orig) * (Number(firstBuyContrib.quantity) || 1) * (Number(firstBuyContrib.fx_rate_brl) || 1)
    if (firstBuyVal > 0 && (pts.length === 0 || firstBuyContrib.date < pts[0].ref_date)) {
      pts.unshift({ ref_date: firstBuyContrib.date, value: firstBuyVal, currency: 'BRL' })
    }
  }

  if (asset.asset_type === 'ticker') {
    const today = new Date().toISOString().split('T')[0]
    const [phRes, mvRes] = await Promise.all([
      supabaseAdmin
        .from('price_history')
        .select('ref_date, price, currency')
        .eq('asset_id', assetId)
        .lte('ref_date', today)
        .order('ref_date', { ascending: true }),
      supabaseAdmin
        .from('manual_values')
        .select('ref_date, value, currency')
        .eq('asset_id', assetId)
        .order('ref_date', { ascending: true }),
    ])
    const ph = phRes.data
    const mv = mvRes.data
    fxApprox = priceCurrency === 'BRL' ? 1 : await getFxRate(priceCurrency).catch(() => 5.70)

    if (ph && ph.length > 0) {
      const phDates = new Set(ph.map(p => p.ref_date))
      const phPoints: HistoryPoint[] = ph.map((p) => {
        let qtyAt = 0
        for (const c of contribs) {
          if (c.date <= p.ref_date) qtyAt += c.type === 'buy' ? (c.quantity ?? 0) : -(c.quantity ?? 0)
        }
        qtyAt = Math.max(0, qtyAt)
        return { date: p.ref_date, price: p.price, value_brl: Math.round(qtyAt * p.price * fxApprox * 100) / 100 }
      })
      const mvPoints: HistoryPoint[] = (mv ?? [])
        .filter(m => !phDates.has(m.ref_date))
        .map(m => {
          const fx = m.currency === 'BRL' ? 1 : fxApprox
          return { date: m.ref_date, price: m.value, value_brl: Math.round(m.value * fx * 100) / 100 }
        })
      history = [...phPoints, ...mvPoints].sort((a, b) => a.date.localeCompare(b.date))
    } else if (mv && mv.length > 0) {
      const pts: InterpPt[] = mv.map(m => ({ ref_date: m.ref_date, value: m.value, currency: m.currency }))
      prependBuyAnchor(pts)
      pts.sort((a, b) => a.ref_date.localeCompare(b.ref_date))
      await buildMonthlyInterpAsync(pts)
    }
  } else if (asset.asset_type === 'manual') {
    const { data: mv } = await supabaseAdmin
      .from('manual_values')
      .select('ref_date, value, currency')
      .eq('asset_id', assetId)
      .order('ref_date', { ascending: true })

    type Pt = { ref_date: string; value: number; currency: string }
    const pts: Pt[] = (mv ?? []).map(m => ({ ref_date: m.ref_date, value: m.value, currency: m.currency }))

    const firstBuyContrib = contribs.find(c => c.type === 'buy' &&
      (Number(c.value_brl) > 0 || Number(c.price_orig) > 0))
    if (firstBuyContrib) {
      const firstBuyVal = Number(firstBuyContrib.value_brl) > 0
        ? Number(firstBuyContrib.value_brl)
        : Number(firstBuyContrib.price_orig) * (Number(firstBuyContrib.quantity) || 1) * (Number(firstBuyContrib.fx_rate_brl) || 1)
      if (firstBuyVal > 0 && (pts.length === 0 || firstBuyContrib.date < pts[0].ref_date)) {
        pts.unshift({ ref_date: firstBuyContrib.date, value: firstBuyVal, currency: 'BRL' })
      }
    }
    pts.sort((a, b) => a.ref_date.localeCompare(b.ref_date))

    if (pts.length > 0) {
      const mi = (s: string) => { const [y, m] = s.substring(0, 7).split('-').map(Number); return y * 12 + m }
      function interpAt(dateStr: string): Pt {
        const last = pts[pts.length - 1]
        if (dateStr >= last.ref_date) return { ...last }
        if (dateStr <  pts[0].ref_date) return { ...pts[0] }
        let before = pts[0], after = pts[1]
        for (let i = 0; i < pts.length - 1; i++) {
          if (pts[i].ref_date <= dateStr && pts[i + 1].ref_date > dateStr) {
            before = pts[i]; after = pts[i + 1]; break
          }
        }
        const mB = mi(before.ref_date), mA = mi(after.ref_date), mT = mi(dateStr)
        const span = mA - mB, elapsed = mT - mB
        if (span <= 0 || elapsed <= 0) return { ...before }
        const v = (before.value > 0 && after.value > 0)
          ? before.value * Math.pow(after.value / before.value, elapsed / span)
          : before.value + (after.value - before.value) * (elapsed / span)
        return { ref_date: dateStr, value: v, currency: before.currency }
      }

      const todayYM = new Date().toISOString().substring(0, 7)
      let [curY, curM] = pts[0].ref_date.substring(0, 7).split('-').map(Number)
      const [endY, endM] = todayYM.split('-').map(Number)
      while (curY < endY || (curY === endY && curM <= endM)) {
        const lastDay = new Date(curY, curM, 0).getDate()
        const dateStr = `${curY}-${String(curM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        const { value: v, currency: cur } = interpAt(dateStr)
        const fx = cur === 'BRL' ? 1 : await getFxRate(cur).catch(() => 5.70)
        history.push({ date: dateStr, price: v, value_brl: Math.round(v * fx * 100) / 100 })
        if (curM === 12) { curY++; curM = 1 } else { curM++ }
      }
    }
  }

  res.json({
    id:            asset.id,
    code:          asset.code,
    name:          asset.name,
    asset_type:    asset.asset_type,
    currency:      asset.currency,
    exchange:      asset.exchange ?? null,
    sector:        asset.sector ?? null,
    class_id:      cls?.id ?? null,
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
    contributions: (() => {
      // If RF asset has no contributions but has fi_principal/fi_start_date, synthesise the initial row
      const displayContribs = contribs.length === 0 && asset.asset_type === 'fixed_income' && asset.fi_principal && asset.fi_start_date
        ? [{ id: -1, date: asset.fi_start_date, type: 'buy', quantity: 1, price_orig: asset.fi_principal, currency: 'BRL', fx_rate_brl: 1, value_brl: asset.fi_principal, description: 'Aporte inicial (cadastro)' }]
        : contribs.slice().reverse()
      return displayContribs.map(c => {
        const cFx = (c as typeof contribs[0]).fx_rate_brl ?? (c.currency === 'BRL' ? 1 : fxApprox)
        const valueBrl = c.value_brl ?? (c.price_orig != null
          ? Math.round(c.price_orig * (c.quantity ?? 0) * cFx * 100) / 100
          : null)
        return {
          ...c,
          value_brl: valueBrl,
          profit_brl: profitByContribId.has(c.id) ? profitByContribId.get(c.id)! : null,
        }
      })
    })(),
  })
})

export default router
