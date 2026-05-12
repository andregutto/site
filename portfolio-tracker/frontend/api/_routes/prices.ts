import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../_middleware/auth'
import { supabaseAdmin } from '../_lib/supabase'
import { getCurrentPrice, getMonthlyHistory, Asset } from '../_services/priceService'

const router = Router()

async function loadAsset(assetId: number, userId: string): Promise<Asset | null> {
  const { data } = await supabaseAdmin
    .from('assets')
    .select('id,asset_type,currency,ticker_brapi,ticker_yahoo,coingecko_id,fi_principal,fi_start_date,fi_type,fi_rate,fi_spread')
    .eq('id', assetId)
    .eq('user_id', userId)
    .eq('active', true)
    .single()
  return data as Asset | null
}

router.get('/:id/current', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const asset = await loadAsset(Number(req.params.id), userId)
  if (!asset) { res.status(404).json({ error: 'Ativo não encontrado' }); return }
  if (asset.asset_type === 'manual') {
    res.status(400).json({ error: 'Ativos manuais não têm cotação automática' }); return
  }

  try {
    const result = await getCurrentPrice(asset)
    res.json(result)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

router.get('/:id/history', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const asset  = await loadAsset(Number(req.params.id), userId)
  if (!asset) { res.status(404).json({ error: 'Ativo não encontrado' }); return }
  if (asset.asset_type !== 'ticker') {
    res.status(400).json({ error: 'Histórico automático só disponível para tickers' }); return
  }

  const months = Math.min(parseInt(req.query.months as string || '24'), 60)

  try {
    const history = await getMonthlyHistory(asset, months)

    if (history.length > 0) {
      const rows = history.map((p) => ({
        asset_id: asset.id,
        ref_date: p.date.substring(0, 7) + '-01',
        price:    p.price,
        currency: p.currency,
        source:   'cache',
      }))
      await supabaseAdmin
        .from('price_history')
        .upsert(rows, { onConflict: 'asset_id,ref_date', ignoreDuplicates: false })
    }

    res.json(history)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
})

export default router
