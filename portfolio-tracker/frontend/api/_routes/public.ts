import { Router, Response } from 'express'
import { supabaseAdmin } from '../_lib/supabase.js'

const router = Router()

// GET /api/public/moments/:token — no auth required
router.get('/moments/:token', async (req, res: Response) => {
  const { token } = req.params

  const { data: moment } = await supabaseAdmin
    .from('finance_moments')
    .select('id, name, icon, color, cover_image_url, start_date, end_date, description, share_expires_at, share_hide_descriptions')
    .eq('share_token', token)
    .single()

  if (!moment) { res.status(404).json({ error: 'not_found' }); return }
  if (moment.share_expires_at && new Date(moment.share_expires_at) < new Date()) {
    res.status(410).json({ error: 'expired' }); return
  }

  const { data: txns } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, date, description, amount, currency, finance_categories(id, name, icon, color)')
    .eq('moment_id', moment.id)
    .order('date', { ascending: false })

  const expenses = (txns ?? []).filter(t => t.amount < 0)
  const total    = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)

  const catMap: Record<string, { name: string; icon: string; color: string; total: number }> = {}
  for (const tx of expenses) {
    const cat = tx.finance_categories as unknown as { id: number; name: string; icon: string; color: string } | null
    const key = cat ? String(cat.id) : 'none'
    if (!catMap[key]) catMap[key] = { name: cat?.name ?? 'Sem categoria', icon: cat?.icon ?? '❓', color: cat?.color ?? '#9CA3AF', total: 0 }
    catMap[key].total += Math.abs(tx.amount)
  }

  res.json({
    moment: {
      name: moment.name, icon: moment.icon, color: moment.color,
      cover_image_url: moment.cover_image_url,
      start_date: moment.start_date, end_date: moment.end_date,
      description: moment.description,
      share_expires_at: moment.share_expires_at,
    },
    summary: {
      total: Math.round(total * 100) / 100,
      currency: expenses[0]?.currency ?? 'EUR',
      by_category: Object.values(catMap).sort((a, b) => b.total - a.total),
    },
    transactions: expenses.map(t => ({
      date: t.date,
      description: moment.share_hide_descriptions ? null : t.description,
      amount: t.amount,
      currency: t.currency,
      category: t.finance_categories,
    })),
  })
})

export default router
