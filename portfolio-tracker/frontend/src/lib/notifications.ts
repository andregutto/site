import type { NotificationItem } from './types'
import type { Locale } from '../contexts/I18nContext'

const CURRENCY_LOCALES: Record<Locale, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }

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
