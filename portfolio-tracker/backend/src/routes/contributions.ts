// CRUD de aportes
import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

// GET /api/contributions — todos os aportes do usuário
router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const { data, error } = await supabaseAdmin
    .from('contributions')
    .select(`
      id, date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, description,
      assets!inner( id, code, name, currency, user_id, asset_classes(name, color) )
    `)
    .eq('assets.user_id', userId)
    .order('date', { ascending: false })
    .limit(200)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

// POST /api/contributions — registra novo aporte/resgate
router.post('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { asset_id, date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, amount_orig, description } = req.body as {
    asset_id:     number
    date:         string
    type:         'buy' | 'sell'
    quantity:     number
    price_orig?:  number
    currency?:    string
    fx_rate_brl?: number
    value_brl?:   number
    amount_orig?: number
    description?: string
  }

  if (!asset_id || !date || !type || !quantity) {
    res.status(400).json({ error: 'asset_id, date, type e quantity são obrigatórios' }); return
  }

  // Valida ownership
  const { data: asset } = await supabaseAdmin
    .from('assets')
    .select('id, asset_type, currency')
    .eq('id', asset_id)
    .eq('user_id', userId)
    .single()
  if (!asset) { res.status(404).json({ error: 'Ativo não encontrado' }); return }

  const { data, error } = await supabaseAdmin
    .from('contributions')
    .insert({
      asset_id, date, type, quantity,
      price_orig:  price_orig  ?? null,
      currency:    currency    ?? null,
      fx_rate_brl: fx_rate_brl ?? null,
      value_brl:   value_brl   ?? null,
      description: description ?? null,
    })
    .select('id')
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }

  // For manual assets with a buy, auto-update manual_values by adding the aporte
  if (asset.asset_type === 'manual' && type === 'buy' && amount_orig != null && amount_orig > 0) {
    const contribCurrency = currency ?? asset.currency ?? 'BRL'
    const refDate = date.slice(0, 7) + '-01' // first of month

    // Get the most recent manual_value (for base value)
    const { data: latestValues } = await supabaseAdmin
      .from('manual_values')
      .select('value, currency, ref_date')
      .eq('asset_id', asset_id)
      .order('ref_date', { ascending: false })
      .limit(2)

    const existingForMonth = latestValues?.find(v => v.ref_date === refDate)
    const latestBefore = latestValues?.find(v => v.ref_date !== refDate) ?? latestValues?.[0]

    const base = existingForMonth ?? latestBefore
    // Only auto-update when currencies match; skip if mismatch to avoid corruption
    if (base && base.currency !== contribCurrency) return res.status(201).json({ id: data.id, ok: true })
    let newValue = amount_orig
    if (base) newValue = (base.value as number) + amount_orig

    await supabaseAdmin
      .from('manual_values')
      .upsert({
        asset_id,
        ref_date: refDate,
        value: newValue,
        currency: contribCurrency,
        notes: `Aporte registrado em ${date}`,
      }, { onConflict: 'asset_id,ref_date' })
  }

  res.status(201).json({ id: data.id, ok: true })
})

// PATCH /api/contributions/:id — edita aporte
router.patch('/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const contribId = Number(req.params.id)

  const { data: contrib } = await supabaseAdmin
    .from('contributions')
    .select('id, asset_id, assets!inner(user_id)')
    .eq('id', contribId)
    .eq('assets.user_id', userId)
    .single()
  if (!contrib) { res.status(404).json({ error: 'Aporte não encontrado' }); return }

  const { date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, description } = req.body as {
    date?:        string
    type?:        'buy' | 'sell' | 'income'
    quantity?:    number
    price_orig?:  number | null
    currency?:    string | null
    fx_rate_brl?: number | null
    value_brl?:   number | null
    description?: string | null
  }

  if (type && !['buy', 'sell', 'income'].includes(type)) {
    res.status(400).json({ error: 'type deve ser buy, sell ou income' }); return
  }

  const updates: Record<string, unknown> = {}
  if (date        !== undefined) updates.date        = date
  if (type        !== undefined) updates.type        = type
  if (quantity    !== undefined) updates.quantity    = quantity
  if (price_orig  !== undefined) updates.price_orig  = price_orig
  if (currency    !== undefined) updates.currency    = currency
  if (fx_rate_brl !== undefined) updates.fx_rate_brl = fx_rate_brl
  if (value_brl   !== undefined) updates.value_brl   = value_brl
  if (description !== undefined) updates.description = description

  const { error } = await supabaseAdmin
    .from('contributions')
    .update(updates)
    .eq('id', contribId)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

// DELETE /api/contributions/:id — remove aporte
router.delete('/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const contribId = Number(req.params.id)

  // Valida ownership via join
  const { data: contrib } = await supabaseAdmin
    .from('contributions')
    .select('id, assets!inner(user_id)')
    .eq('id', contribId)
    .eq('assets.user_id', userId)
    .single()
  if (!contrib) { res.status(404).json({ error: 'Aporte não encontrado' }); return }

  const { error } = await supabaseAdmin
    .from('contributions')
    .delete()
    .eq('id', contribId)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
