import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth.js'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

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

router.post('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { asset_id, date, type, quantity, price_orig, currency, fx_rate_brl, value_brl, description } = req.body as {
    asset_id:    number
    date:        string
    type:        'buy' | 'sell' | 'income'
    quantity?:   number
    price_orig?: number
    currency?:   string
    fx_rate_brl?: number
    value_brl?:  number
    description?: string
  }

  const qty = type === 'income' ? (quantity ?? 0) : quantity
  if (!asset_id || !date || !type || (type !== 'income' && qty == null)) {
    res.status(400).json({ error: 'asset_id, date, type e quantity são obrigatórios' }); return
  }
  if (!['buy', 'sell', 'income'].includes(type)) {
    res.status(400).json({ error: 'type deve ser buy, sell ou income' }); return
  }

  const { data: asset } = await supabaseAdmin
    .from('assets')
    .select('id')
    .eq('id', asset_id)
    .eq('user_id', userId)
    .single()
  if (!asset) { res.status(404).json({ error: 'Ativo não encontrado' }); return }

  const { data, error } = await supabaseAdmin
    .from('contributions')
    .insert({
      asset_id, date, type, quantity: qty,
      price_orig:  price_orig  ?? null,
      currency:    currency    ?? null,
      fx_rate_brl: fx_rate_brl ?? null,
      value_brl:   value_brl   ?? null,
      description: description ?? null,
    })
    .select('id')
    .single()

  if (error) { res.status(500).json({ error: error.message }); return }
  res.status(201).json({ id: data.id, ok: true })
})

router.delete('/:id', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const contribId = Number(req.params.id)

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
