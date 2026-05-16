import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { data, error } = await supabaseAdmin
    .from('achievements')
    .select('achievement_key, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: true })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data ?? [])
})

router.post('/check', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { total_brl } = req.body as { total_brl?: number }

  const { data: existing } = await supabaseAdmin
    .from('achievements')
    .select('achievement_key')
    .eq('user_id', userId)
  const earned = new Set((existing ?? []).map((r: { achievement_key: string }) => r.achievement_key))

  const [
    { data: userRecord },
    { data: assets },
    { data: contribs },
    { data: history },
  ] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('assets').select('id, currency, asset_class_id, asset_classes(name)').eq('user_id', userId).eq('active', true),
    supabaseAdmin.from('contributions').select('date, asset_id, assets!inner(user_id)').eq('assets.user_id', userId).order('date'),
    supabaseAdmin.from('price_history').select('date').eq('user_id', userId).order('date', { ascending: true }),
  ])

  const meta = userRecord?.user?.user_metadata ?? {}
  type AssetRow = { id: number; currency: string; asset_class_id: number | null; asset_classes: { name: string } | { name: string }[] | null }
  const assetList = ((assets ?? []) as unknown) as AssetRow[]
  const currencies = new Set(assetList.map(a => a.currency))
  const classIds = new Set(assetList.map(a => a.asset_class_id).filter(Boolean))
  const contribDates = (contribs ?? []).map((c: { date: string }) => c.date)
  const historyRows = (history ?? []) as Array<{ date: string }>

  const toAward: string[] = []
  const check = (key: string, cond: boolean) => { if (!earned.has(key) && cond) toAward.push(key) }

  check('first_step', true)
  check('identity', !!(meta.first_name && meta.last_name && meta.country))
  check('first_seed', contribDates.length > 0)
  check('global_roots', assetList.some(a => a.currency !== 'BRL'))

  if (total_brl !== undefined) {
    check('builder',      total_brl >= 10_000)
    check('five_digits',  total_brl >= 100_000)
    check('six_digits',   total_brl >= 500_000)
    check('million_club', total_brl >= 1_000_000)
  }

  const className = (a: AssetRow) => {
    const ac = a.asset_classes
    if (!ac) return ''
    return Array.isArray(ac) ? (ac[0]?.name ?? '') : ac.name
  }

  check('diversified',  classIds.size >= 3)
  check('crypto_native', assetList.some(a => /cripto|crypto|bitcoin|digital/i.test(className(a))))
  check('global_investor', currencies.size >= 3)
  check('expat', currencies.size >= 2)
  check('pension', assetList.some(a => /previdên|previdencia|pgbl|vgbl/i.test(className(a))))
  check('brick_by_brick', assetList.some(a => /imóv|imov|real.?estate/i.test(className(a))))
  check('discipline', hasConsecutiveMonths(contribDates, 3))
  check('consistency', hasConsecutiveMonths(contribDates, 6))

  if (historyRows.length >= 2) {
    const first = new Date(historyRows[0].date)
    const last  = new Date(historyRows[historyRows.length - 1].date)
    check('historian', (last.getTime() - first.getTime()) / 86_400_000 >= 365)
  }

  check('balancer', Object.keys(meta.allocation_targets ?? {}).length > 0)
  check('multicurrency', currencies.has('BRL') && currencies.has('EUR') && currencies.has('USD'))

  let newlyEarned: string[] = []
  if (toAward.length > 0) {
    const rows = toAward.map(key => ({ user_id: userId, achievement_key: key }))
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('achievements')
      .upsert(rows, { onConflict: 'user_id,achievement_key', ignoreDuplicates: true })
      .select('achievement_key')
    if (!insertErr && inserted) {
      newlyEarned = inserted.map((r: { achievement_key: string }) => r.achievement_key)
    }
  }

  res.json({ newly_earned: newlyEarned })
})

function hasConsecutiveMonths(dates: string[], n: number): boolean {
  if (dates.length === 0) return false
  const months = [...new Set(dates.map(d => d.slice(0, 7)))].sort()
  if (months.length < n) return false
  let streak = 1, max = 1
  for (let i = 1; i < months.length; i++) {
    const [py, pm] = months[i - 1].split('-').map(Number)
    const [cy, cm] = months[i].split('-').map(Number)
    if (cy * 12 + cm - (py * 12 + pm) === 1) { streak++; max = Math.max(max, streak) }
    else streak = 1
  }
  return max >= n
}

export default router
