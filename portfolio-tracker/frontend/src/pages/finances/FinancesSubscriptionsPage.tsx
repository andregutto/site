import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { PageLoader } from '../../components/ArvoLoader'

function _fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

type Freq = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual'

interface Subscription {
  key: string
  name: string
  frequency: Freq
  median_amount: number
  currency: string
  last_date: string
  annual_cost: number
  monthly_equivalent: number
  occurrences: number
  category: { id: number; name: string; icon: string; color: string } | null
}

const FREQ_COLORS: Record<Freq, string> = {
  weekly: '#6366f1',
  biweekly: '#8b5cf6',
  monthly: '#1B4FD8',
  quarterly: '#0891b2',
  biannual: '#059669',
  annual: '#d97706',
}

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(
    locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

export default function FinancesSubscriptionsPage() {
  const { t, locale } = useI18n()
  const { hideValues } = useCurrency()
  const fmt = (n: number, cur: string) => hideValues ? '•••' : _fmt(n, cur)

  const [loading, setLoading]           = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [dismissed, setDismissed]       = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('arvo_dismissed_subs') ?? '[]')) }
    catch { return new Set() }
  })

  useEffect(() => {
    apiFetch<{ subscriptions: Subscription[] }>('/finances/subscriptions')
      .then(d => setSubscriptions(d.subscriptions))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function dismiss(key: string) {
    const next = new Set(dismissed)
    next.add(key)
    setDismissed(next)
    localStorage.setItem('arvo_dismissed_subs', JSON.stringify([...next]))
  }

  const freqLabel: Record<Freq, string> = {
    weekly:    t.finances.frequencyWeekly,
    biweekly:  t.finances.frequencyBiweekly,
    monthly:   t.finances.frequencyMonthly,
    quarterly: t.finances.frequencyQuarterly,
    biannual:  t.finances.frequencyBiannual,
    annual:    t.finances.frequencyAnnual,
  }

  const visible = subscriptions.filter(s => !dismissed.has(s.key))
  const totalMonthly = visible.reduce((s, sub) => s + sub.monthly_equivalent, 0)
  const totalAnnual  = visible.reduce((s, sub) => s + sub.annual_cost, 0)
  const mainCurrency = visible[0]?.currency ?? 'EUR'

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>
          {t.finances.subscriptionsTitle}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>
          {t.finances.subscriptionsSubtitle}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm font-medium text-gray-700">{t.finances.noSubscriptions}</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">{t.finances.noSubscriptionsHint}</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
                {t.finances.subscriptionsTotalMonthly}
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--arvo-black)', fontFamily: 'var(--arvo-font-body)' }}>
                {fmt(totalMonthly, mainCurrency)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {visible.length} {visible.length === 1 ? t.finances.navSubscriptions.replace(/s$/, '') : t.finances.navSubscriptions}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">
                {t.finances.subscriptionsTotalAnnual}
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--arvo-black)', fontFamily: 'var(--arvo-font-body)' }}>
                {fmt(totalAnnual, mainCurrency)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{t.finances.perYear}</p>
            </div>
          </div>

          {/* Subscription cards */}
          <div className="space-y-2">
            {visible.map(sub => (
              <div key={sub.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${FREQ_COLORS[sub.frequency]}14` }}
                >
                  {sub.category ? sub.category.icon : '🔄'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">{sub.name}</span>
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: `${FREQ_COLORS[sub.frequency]}18`, color: FREQ_COLORS[sub.frequency] }}
                    >
                      {freqLabel[sub.frequency]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {t.finances.lastCharged}: {formatDate(sub.last_date, locale)}
                    {sub.category && <span className="ml-2 text-gray-300">·</span>}
                    {sub.category && <span className="ml-2">{sub.category.name}</span>}
                  </p>
                </div>

                {/* Amounts */}
                <div className="text-right shrink-0">
                  <p className="text-base font-bold text-gray-900">{fmt(sub.median_amount, sub.currency)}</p>
                  <p className="text-xs text-gray-400">{fmt(sub.annual_cost, sub.currency)}{t.finances.perYear}</p>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => dismiss(sub.key)}
                  className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors shrink-0 rounded-lg hover:bg-gray-50"
                  title="Ignorar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
