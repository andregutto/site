import type { NotificationItem } from './types'
import type { Locale } from '../contexts/I18nContext'

const CURRENCY_LOCALES: Record<Locale, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }

export const SEVERITY_COLORS: Record<NotificationItem['severity'], string> = {
  info: 'var(--arvo-blue)',
  warning: 'var(--arvo-ocre)',
  danger: 'var(--arvo-red)',
  success: 'var(--arvo-green)',
}

export const TYPE_ICONS: Record<string, string> = {
  achievement: '🏆',
  bank_connected: '🏦',
  bank_connect_error: '⚠️',
  split_warning: '✂️',
  budget_alert: '💰',
  shared_category_alert: '👥',
  home_prompt: '🏠',
  budget_reminder_setup: '⏰',
  budget_reminder_due: '⏰',
  subscription_detected: '🔄',
  shared_group_invite: '✉️',
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
    case 'shared_group_invite': {
      const inviter = String(item.params.inviter_name ?? '')
      const group = String(item.params.group_name ?? '')
      return { title: n.type_shared_group_invite.replace('{inviter}', inviter).replace('{group}', group) }
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
