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
  const { total_brl, total_display, currency: displayCurrency } = req.body as { total_brl?: number; total_display?: number; currency?: string }

  const { data: existing } = await supabaseAdmin
    .from('achievements')
    .select('achievement_key')
    .eq('user_id', userId)
  const earned = new Set((existing ?? []).map((r: { achievement_key: string }) => r.achievement_key))

  const [
    { data: userRecord },
    { data: assets },
    { data: contribs },
  ] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from('assets').select('id, currency, asset_type, class_id, asset_classes(name)').eq('user_id', userId).eq('active', true),
    supabaseAdmin.from('contributions').select('date, asset_id, assets!inner(user_id)').eq('assets.user_id', userId).order('date'),
  ])

  const meta = userRecord?.user?.user_metadata ?? {}
  type AssetRow = { id: number; currency: string; asset_type: string; class_id: number | null; asset_classes: { name: string } | { name: string }[] | null }
  const assetList = ((assets ?? []) as unknown) as AssetRow[]
  const currencies = new Set(assetList.map(a => a.currency))
  const classIds = new Set(assetList.map(a => a.class_id).filter(Boolean))
  const contribDates = (contribs ?? []).map((c: { date: string }) => c.date)

  const assetIds = assetList.map(a => a.id)
  const { data: history } = assetIds.length > 0
    ? await supabaseAdmin.from('price_history').select('ref_date').in('asset_id', assetIds).order('ref_date', { ascending: true })
    : { data: [] as { ref_date: string }[] }
  const historyRows = (history ?? []) as Array<{ ref_date: string }>

  const toAward: string[] = []
  const check = (key: string, cond: boolean) => { if (!earned.has(key) && cond) toAward.push(key) }

  check('first_step', true)
  check('identity', !!(meta.first_name && meta.last_name && meta.country && meta.birthdate && meta.avatar_url))
  check('first_seed', contribDates.length > 0)
  check('global_roots', assetList.some(a => a.currency !== 'BRL'))

  if (total_brl !== undefined) {
    const td = total_display ?? total_brl
    const isBRL = !displayCurrency || displayCurrency === 'BRL'
    check('builder',       isBRL ? total_brl >= 10_000 : td >= 2_000)
    check('five_digits',     td >= 10_000)
    check('six_digits',      td >= 100_000)
    check('quarter_million', td >= 250_000)
    check('half_million',    td >= 500_000)
    check('million_club',    td >= 1_000_000)
    check('three_million', td >= 3_000_000)
    check('five_million',  td >= 5_000_000)
    check('ten_million',   td >= 10_000_000)
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
  check('pension', assetList.some(a => /previd|pgbl|vgbl/i.test(className(a))))
  check('brick_by_brick', assetList.some(a => /im[oó]v[ei]|real.?estate/i.test(className(a)) && a.asset_type === 'manual'))
  check('fii_investor',   assetList.some(a => /\bfii\b|imobili[aá]rio|reit/i.test(className(a)) || (/im[oó]v[ei]|real.?estate/i.test(className(a)) && a.asset_type === 'ticker')))
  check('discipline', hasConsecutiveMonths(contribDates, 3))
  check('consistency', hasConsecutiveMonths(contribDates, 6))

  if (historyRows.length >= 2) {
    const first = new Date(historyRows[0].ref_date)
    const last  = new Date(historyRows[historyRows.length - 1].ref_date)
    check('historian', (last.getTime() - first.getTime()) / 86_400_000 >= 365)
  }

  check('balancer', Object.keys(meta.allocation_targets ?? {}).length > 0)
  check('multicurrency', currencies.has('BRL') && currencies.has('EUR') && currencies.has('USD'))

  // Finance module checks
  const needsFinance = ['fin_first_txn','fin_csv_import','fin_first_account','fin_budget_ready',
    'fin_first_moment','fin_freedom','fin_hundred_txn','fin_categorized','coruja'].some(k => !earned.has(k))
  if (needsFinance) {
    const [txnRes, accountRes, momentRes, planRes, envelopeRes] = await Promise.all([
      supabaseAdmin.from('finance_transactions').select('id, source, category_id').eq('user_id', userId),
      supabaseAdmin.from('finance_accounts').select('id').eq('user_id', userId).limit(1),
      supabaseAdmin.from('finance_moments').select('id').eq('user_id', userId).limit(1),
      supabaseAdmin.from('finance_freedom_plans').select('id').eq('user_id', userId).limit(1),
      supabaseAdmin.from('finance_envelopes').select('id').eq('user_id', userId).limit(1),
    ])
    const txns = txnRes.data ?? []
    check('fin_first_txn',     txns.length > 0)
    check('fin_csv_import',    txns.some((t: { source: string }) => t.source?.startsWith('csv:')))
    check('fin_first_account', (accountRes.data ?? []).length > 0)
    check('fin_budget_ready',  (envelopeRes.data ?? []).length > 0)
    check('fin_first_moment',  (momentRes.data ?? []).length > 0)
    check('fin_freedom',       (planRes.data ?? []).length > 0)
    check('fin_hundred_txn',   txns.length >= 100)
    check('fin_categorized',   txns.filter((t: { category_id: number | null }) => t.category_id != null).length >= 50)
    check('coruja',            assetList.length > 0 && txns.length > 0)
  }

  let newlyEarned: string[] = []
  if (toAward.length > 0) {
    const rows = toAward.map(key => ({ user_id: userId, achievement_key: key }))
    const { error: insertErr } = await supabaseAdmin
      .from('achievements')
      .upsert(rows, { onConflict: 'user_id,achievement_key', ignoreDuplicates: true })
    if (!insertErr) newlyEarned = toAward
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
