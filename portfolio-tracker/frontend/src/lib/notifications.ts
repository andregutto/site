import type { NotificationItem } from './types'
import type { Locale } from '../contexts/I18nContext'
import type { IconName } from '../components/icons'

const CURRENCY_LOCALES: Record<Locale, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }

export const SEVERITY_COLORS: Record<NotificationItem['severity'], string> = {
  info: 'var(--arvo-blue)',
  warning: 'var(--arvo-ocre)',
  danger: 'var(--arvo-red)',
  success: 'var(--arvo-green)',
}

export const TYPE_ICONS: Record<string, IconName> = {
  achievement: 'trophy',
  bank_connected: 'bank',
  bank_connect_error: 'alert',
  split_warning: 'scissors',
  stale_manual_asset: 'clock',
  budget_alert: 'wallet',
  shared_category_alert: 'users',
  home_prompt: 'home',
  budget_reminder_setup: 'clock',
  budget_reminder_due: 'clock',
  subscription_detected: 'repeat',
  shared_group_invite: 'share',
  trip_invite: 'share',
  trip_added: 'share',
  friend_invite: 'users',
  friend_accepted: 'users',
  friend_invite_accepted: 'users',
}

export function formatTimestamp(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(
    locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  )
}

export function formatMoney(value: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[locale] ?? 'pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveNotificationText(item: NotificationItem, t: any, locale: Locale): { title: string; subtitle?: string } {
  const n = t.notifications as Record<string, string>
  switch (item.type) {
    case 'achievement': {
      const key = String(item.params.achievement_key ?? '')
      const def = (t.achievementDefs as Record<string, { name: string; desc: string }>)[key]
      return { title: def?.name ?? key, subtitle: n.type_achievement }
    }
    case 'bank_connected':
      return { title: n.type_bank_connected }
    case 'bank_connect_error':
      return { title: n.type_bank_connect_error }
    case 'subscription_detected': {
      const name = String(item.params.name ?? '')
      const amount = Number(item.params.monthly_equivalent ?? 0)
      const currency = String(item.params.currency ?? 'BRL')
      return { title: n.type_subscription_detected.replace('{name}', name).replace('{amount}', formatMoney(amount, currency, locale)) }
    }
    case 'split_warning': {
      const code = String(item.params.code ?? '')
      const ratio = String(item.params.ratio ?? '')
      return { title: n.type_split_warning.replace('{code}', code).replace('{ratio}', ratio) }
    }
    case 'stale_manual_asset': {
      const code = String(item.params.code ?? '')
      const days = String(item.params.days ?? '')
      return { title: n.type_stale_manual_asset.replace('{code}', code).replace('{n}', days) }
    }
    case 'shared_group_invite': {
      const inviter = String(item.params.inviter_name ?? '')
      const group = String(item.params.group_name ?? '')
      return { title: n.type_shared_group_invite.replace('{inviter}', inviter).replace('{group}', group) }
    }
    case 'trip_invite': {
      const inviter = String(item.params.inviter_name ?? '')
      const trip = String(item.params.trip_title ?? '')
      return { title: n.type_trip_invite.replace('{inviter}', inviter).replace('{trip}', trip) }
    }
    case 'trip_added': {
      const inviter = String(item.params.inviter_name ?? '')
      const trip = String(item.params.trip_title ?? '')
      return { title: n.type_trip_added.replace('{inviter}', inviter).replace('{trip}', trip) }
    }
    case 'friend_invite': {
      const inviter = String(item.params.inviter_name ?? '')
      const username = item.params.inviter_username ? `@${item.params.inviter_username}` : ''
      return { title: n.type_friend_invite.replace('{inviter}', inviter), subtitle: username || undefined }
    }
    case 'friend_accepted': {
      const friend = String(item.params.friend_name ?? '')
      const username = item.params.friend_username ? `@${item.params.friend_username}` : ''
      return { title: n.type_friend_accepted.replace('{friend}', friend), subtitle: username || undefined }
    }
    case 'friend_invite_accepted': {
      const inviter = String(item.params.inviter_name ?? '')
      const username = item.params.inviter_username ? `@${item.params.inviter_username}` : ''
      return { title: n.type_friend_invite_accepted.replace('{inviter}', inviter), subtitle: username || undefined }
    }
    case 'budget_alert': {
      const nameKey = item.params.name_key ? String(item.params.name_key) : null
      const finance = t.finances as Record<string, string>
      const name = (nameKey && finance[nameKey]) || String(item.params.name ?? '')
      const icon = String(item.params.icon ?? '')
      const pct = String(item.params.pct ?? '')
      return { title: n.type_budget_alert.replace('{name}', icon ? `${icon} ${name}` : name).replace('{pct}', pct) }
    }
    default:
      return { title: item.key }
  }
}
