import { Router, Response } from 'express'
import { requireAuth, AuthRequest } from '../../../shared-api/src/middleware/auth.js'
import { supabaseAdmin } from '../../../shared-api/src/lib/supabase.js'
import { getActiveSubscriptions, getBudgetAlerts, getMonthlyReviewAlerts, getPendingMomentInvites, getRecentMomentAdditions, getRecentSettlements } from '../../../shared-api/src/routes/finances.js'
import { getSplitWarnings, getStaleManualAssets } from './portfolio.js'
import { getPendingGroupInvites } from '../../../shared-api/src/routes/shared.js'
import { getPendingTripInvites, getRecentTripAdditions } from '../../../shared-api/src/routes/voyage.js'
import { getPendingFriendInvites, getRecentFriendAcceptances } from '../../../shared-api/src/routes/people.js'

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

  const [achievementsRes, subsResult, notifDismissalsRes, budgetAlerts, monthlyReviewAlerts, splitWarnings, staleManualAssets, pendingInvites, pendingTripInvites, pendingFriendInvites, recentFriendAcceptances, recentTripAdditions, pendingMomentInvites, recentMomentAdditions, recentSettlements] = await Promise.all([
    supabaseAdmin.from('achievements').select('achievement_key, earned_at').eq('user_id', userId).order('earned_at', { ascending: true }),
    getActiveSubscriptions(userId),
    supabaseAdmin.from('notification_dismissals').select('key, type, params, severity, link, occurred_at, dismissed_at').eq('user_id', userId),
    getBudgetAlerts(userId),
    getMonthlyReviewAlerts(userId),
    getSplitWarnings(userId),
    getStaleManualAssets(userId),
    getPendingGroupInvites(userId),
    getPendingTripInvites(userId),
    getPendingFriendInvites(userId),
    getRecentFriendAcceptances(userId),
    getRecentTripAdditions(userId),
    getPendingMomentInvites(userId),
    getRecentMomentAdditions(userId),
    getRecentSettlements(userId),
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

  // Category 10: subscriptions detected -> active (unless dismissed)
  for (const sub of subsResult.subscriptions) {
    if (dismissedKeys.has(sub.key)) continue
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

  // Category 19: over-budget 3 closed months in a row -> suggests reviewing the plan
  if (monthlyReviewAlerts.streak && !dismissedKeys.has(monthlyReviewAlerts.streak.key)) {
    const s = monthlyReviewAlerts.streak
    active.push({
      key: s.key,
      type: 'overbudget_streak',
      severity: 'warning',
      params: { months: s.months },
      link: '/finances/budget',
      occurred_at: `${s.last_month}-01T00:00:00.000Z`,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 20: last closed month ended with expenses > income
  if (monthlyReviewAlerts.negative && !dismissedKeys.has(monthlyReviewAlerts.negative.key)) {
    const n = monthlyReviewAlerts.negative
    active.push({
      key: n.key,
      type: 'negative_balance',
      severity: 'danger',
      params: { month: n.month },
      link: '/finances',
      occurred_at: `${n.month}-01T00:00:00.000Z`,
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

  // Category 16: manual assets stale 30+ days -> active (unless dismissed for this staleness period)
  for (const s of staleManualAssets) {
    const key = `stale_manual_asset:${s.asset_id}:${s.last_manual_date}`
    if (dismissedKeys.has(key)) continue
    active.push({
      key,
      type: 'stale_manual_asset',
      severity: 'warning',
      params: { code: s.code, days: s.days },
      link: `/assets/${s.asset_id}`,
      occurred_at: s.last_manual_date,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 11: pending shared-group invites -> active (unless dismissed)
  for (const inv of pendingInvites) {
    if (dismissedKeys.has(inv.key)) continue
    active.push({
      key: inv.key,
      type: 'shared_group_invite',
      severity: 'info',
      params: { group_name: inv.group_name, inviter_name: inv.inviter_name, token: inv.token },
      link: `/invite/${inv.token}`,
      occurred_at: inv.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 12: pending voyage trip invites -> active (unless dismissed)
  for (const inv of pendingTripInvites) {
    if (dismissedKeys.has(inv.key)) continue
    active.push({
      key: inv.key,
      type: 'trip_invite',
      severity: 'info',
      params: { trip_title: inv.trip_title, inviter_name: inv.inviter_name, token: inv.token },
      link: `/voyage/invite/${inv.token}`,
      occurred_at: inv.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 13: pending friend invites addressed to me -> active (unless dismissed)
  for (const inv of pendingFriendInvites) {
    if (dismissedKeys.has(inv.key)) continue
    active.push({
      key: inv.key,
      type: 'friend_invite',
      severity: 'info',
      params: { inviter_name: inv.inviter_name, inviter_username: inv.inviter_username, token: inv.token },
      link: '/people',
      occurred_at: inv.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 14: friend invites I sent that were just accepted -> active (unless dismissed)
  for (const acc of recentFriendAcceptances) {
    if (dismissedKeys.has(acc.key)) continue
    active.push({
      key: acc.key,
      type: 'friend_accepted',
      severity: 'success',
      params: { friend_name: acc.friend_name, friend_username: acc.friend_username },
      link: '/people',
      occurred_at: acc.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 15: added directly to a trip (via @username or known e-mail) -> active (unless dismissed)
  for (const add of recentTripAdditions) {
    if (dismissedKeys.has(add.key)) continue
    active.push({
      key: add.key,
      type: 'trip_added',
      severity: 'success',
      params: { trip_title: add.trip_title, inviter_name: add.inviter_name },
      link: `/voyage/${add.trip_id}`,
      occurred_at: add.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 17: pending finance moment invites -> active (unless dismissed)
  for (const inv of pendingMomentInvites) {
    if (dismissedKeys.has(inv.key)) continue
    active.push({
      key: inv.key,
      type: 'moment_invite',
      severity: 'info',
      params: { moment_name: inv.moment_name, inviter_name: inv.inviter_name, token: inv.token },
      link: `/finances/moments/invite/${inv.token}`,
      occurred_at: inv.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 18: added directly to a moment (auto-accept) -> active (unless dismissed)
  for (const add of recentMomentAdditions) {
    if (dismissedKeys.has(add.key)) continue
    active.push({
      key: add.key,
      type: 'moment_added',
      severity: 'success',
      params: { moment_title: add.moment_name, inviter_name: add.inviter_name },
      link: '/finances/moments',
      occurred_at: add.occurred_at,
      dismissed_at: null,
      dismissible: true,
    })
  }

  // Category 21: alguém acertou contas comigo (não-acionável, só FYI — como friend_accepted)
  for (const s of recentSettlements) {
    if (dismissedKeys.has(s.key)) continue
    active.push({
      key: s.key,
      type: 'settlement_received',
      severity: 'success',
      params: { from_user_name: s.from_user_name, amounts: s.amounts },
      link: '/people',
      occurred_at: s.occurred_at,
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

// DELETE /api/notifications/dismiss — limpa todo o histórico do usuário
router.delete('/dismiss', requireAuth, async (req, res: Response) => {
  const { userId } = req as AuthRequest
  const { error } = await supabaseAdmin
    .from('notification_dismissals')
    .delete()
    .eq('user_id', userId)
  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ ok: true })
})

export default router
