import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getActiveSubscriptions, getBudgetAlerts } from './finances.js'
import { getSplitWarnings } from './portfolio.js'

const router = Router()

interface NotificationItem {
  key: string
  type: string
  severity: 'info' | 'warning' | 'danger' | 'success'
  params: Record<string, unknown>
  link?: string
  occurred_at: string
  dismissed_at: string | null
  dismissible: boolean
}

const NON_DISMISSIBLE_HISTORY_TYPES = new Set(['bank_connected', 'bank_connect_error'])

router.get('/', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest

  const [achievementsRes, subsResult, subDismissalsRes, notifDismissalsRes, budgetAlerts, splitWarnings] = await Promise.all([
    supabaseAdmin.from('achievements').select('achievement_key, earned_at').eq('user_id', userId).order('earned_at', { ascending: true }),
    getActiveSubscriptions(userId),
    supabaseAdmin.from('finance_subscription_dismissals').select('key, name, dismissed_at').eq('user_id', userId),
    supabaseAdmin.from('notification_dismissals').select('key, type, params, severity, link, occurred_at, dismissed_at').eq('user_id', userId),
    getBudgetAlerts(userId),
    getSplitWarnings(userId),
  ])

  const dismissedKeys = new Set((notifDismissalsRes.data ?? []).map(n => n.key))

  const active: NotificationItem[] = []
  const history: NotificationItem[] = []

  // Category 1: achievements -> history only
  for (const a of achievementsRes.data ?? []) {
    history.push({
      key: `achievement:${a.achievement_key}`,
      type: 'achievement',
      severity: 'success',
      params: { achievement_key: a.achievement_key },
      occurred_at: a.earned_at,
      dismissed_at: a.earned_at,
      dismissible: false,
    })
  }

  // Category 10: subscriptions detected -> active + history (dismissed)
  for (const sub of subsResult.subscriptions) {
    active.push({
      key: sub.key,
      type: 'subscription_detected',
      severity: 'info',
      params: {
        name: sub.name,
        monthly_equivalent: sub.monthly_equivalent,
        currency: sub.currency,
        frequency: sub.frequency,
        category_name_key: sub.category?.name_key ?? null,
      },
      link: '/finances/insights',
      occurred_at: sub.last_date,
      dismissed_at: null,
      dismissible: true,
    })
  }
  for (const d of subDismissalsRes.data ?? []) {
    history.push({
      key: d.key,
      type: 'subscription_detected',
      severity: 'info',
      params: { name: d.name },
      link: '/finances/insights',
      occurred_at: d.dismissed_at,
      dismissed_at: d.dismissed_at,
      dismissible: true,
    })
  }

  // Category 4: budget alerts -> active (unless already dismissed for this month)
  for (const alert of budgetAlerts) {
    const key = `budget_alert:${alert.envelope_id}:${alert.month}`
    if (dismissedKeys.has(key)) continue
    active.push({
      key,
      type: 'budget_alert',
      severity: 'warning',
      params: { name: alert.name, name_key: alert.name_key, icon: alert.icon, pct: alert.pct },
      link: '/finances',
      occurred_at: `${alert.month}-01T00:00:00.000Z`,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 3: split warnings -> active (unless dismissed)
  for (const w of splitWarnings) {
    const key = `split_warning:${w.asset_id}`
    if (dismissedKeys.has(key)) continue
    active.push({
      key,
      type: 'split_warning',
      severity: 'warning',
      params: { code: w.code, ratio: w.splits.map(s => s.ratio).join(', ') },
      link: `/assets/${w.asset_id}`,
      occurred_at: w.splits[w.splits.length - 1]?.date ?? new Date().toISOString(),
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Generic notification_dismissals rows (e.g. category 2 bank connect events, plus
  // any dismissed recurring alert from categories 3/4/5/6/7/8) -> history
  for (const n of notifDismissalsRes.data ?? []) {
    history.push({
      key: n.key,
      type: n.type,
      severity: (n.severity ?? 'info') as NotificationItem['severity'],
      params: n.params ?? {},
      link: n.link ?? undefined,
      occurred_at: n.occurred_at,
      dismissed_at: n.dismissed_at,
      dismissible: !NON_DISMISSIBLE_HISTORY_TYPES.has(n.type),
    })
  }

  history.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

  res.json({ active, history, unread_count: active.length })
})

router.post('/dismiss', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { key, type, params, severity, link, occurred_at } = req.body as {
    key?: string; type?: string; params?: Record<string, unknown>
    severity?: string; link?: string; occurred_at?: string
  }
  if (!key || !type) { res.status(400).json({ error: 'key and type required' }); return }

  const row: Record<string, unknown> = {
    user_id: userId,
    key,
    type,
    params: params ?? {},
    severity: severity ?? 'info',
    link: link ?? null,
  }
  if (occurred_at) row.occurred_at = occurred_at

  const { error } = await supabaseAdmin
    .from('notification_dismissals')
    .upsert(row, { onConflict: 'user_id,key' })
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

router.delete('/dismiss/:key', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { key } = req.params
  const { error } = await supabaseAdmin
    .from('notification_dismissals')
    .delete()
    .eq('user_id', userId)
    .eq('key', key)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
