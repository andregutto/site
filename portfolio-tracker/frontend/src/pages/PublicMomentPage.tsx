import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import LanguageSelector from '../components/LanguageSelector'

interface PublicMoment {
  name: string; icon: string; color: string; cover_image_url: string | null
  start_date: string | null; end_date: string | null; description: string | null
  share_expires_at: string | null
}
interface PublicData {
  moment: PublicMoment
  summary: { total: number; currency: string; by_category: { name: string | null; name_key: string | null; icon: string; color: string; total: number }[] }
  transactions: { date: string; description: string | null; amount: number; currency: string; category: { name: string; name_key: string | null; icon: string; color: string } | null }[]
}

function resolveKey(name: string | null | undefined, nameKey: string | null | undefined, keys: Record<string, string>, fallback: string): string {
  if (nameKey && keys[nameKey]) return keys[nameKey]
  return name ?? fallback
}

function fmt(n: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string, locale: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtShortDate(d: string, locale: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: 'short' })
}

const LOCALE_MAP: Record<string, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }

export default function PublicMomentPage() {
  const { token } = useParams<{ token: string }>()
  const { t, locale } = useI18n()
  const dateLocale = LOCALE_MAP[locale] ?? 'pt-BR'
  const nameKeys: Record<string, string> = {
    categoryTransfer: t.finances.categoryTransfer, categorySalary: t.finances.categorySalary,
    categoryUncategorized: t.finances.categoryUncategorized, categoryGroceries: t.finances.categoryGroceries,
    categoryRestaurant: t.finances.categoryRestaurant, categoryTransport: t.finances.categoryTransport,
    categoryHealth: t.finances.categoryHealth, categoryEntertainment: t.finances.categoryEntertainment,
    categoryHousing: t.finances.categoryHousing, categoryStreaming: t.finances.categoryStreaming,
    categorySubscriptions: t.finances.categorySubscriptions, categoryPharmacy: t.finances.categoryPharmacy,
    categoryClothing: t.finances.categoryClothing, categoryTravel: t.finances.categoryTravel,
    categoryCoffee: t.finances.categoryCoffee, categoryUtilities: t.finances.categoryUtilities,
    categoryEducation: t.finances.categoryEducation, categoryPersonalCare: t.finances.categoryPersonalCare,
    categoryElectronics: t.finances.categoryElectronics, categoryAirbnb: t.finances.categoryAirbnb,
    categoryOther: t.finances.categoryOther, categoryGifts: t.finances.categoryGifts,
    categoryShopping: t.finances.categoryShopping, categoryTaxes: t.finances.categoryTaxes,
    categoryFees: t.finances.categoryFees, categoryBarsRestaurants: t.finances.categoryBarsRestaurants,
    categoryShowsParties: t.finances.categoryShowsParties, categoryPhone: t.finances.categoryPhone,
    categoryInvestment: t.finances.categoryInvestment,
  }
  const [data,    setData]    = useState<PublicData | null>(null)
  const [status,  setStatus]  = useState<'loading' | 'ok' | 'not_found' | 'expired'>('loading')

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/moments/${token}`)
      .then(async r => {
        if (r.status === 404) { setStatus('not_found'); return }
        if (r.status === 410) { setStatus('expired'); return }
        if (!r.ok) { setStatus('not_found'); return }
        setData(await r.json())
        setStatus('ok')
      })
      .catch(() => setStatus('not_found'))
  }, [token])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">{t.finances.publicLoading}</div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="absolute top-4 right-4"><LanguageSelector /></div>
        <p className="text-4xl">⏰</p>
        <p className="text-gray-900 font-semibold">{t.finances.publicExpiredTitle}</p>
        <p className="text-sm text-gray-400">{t.finances.publicExpiredBody}</p>
      </div>
    )
  }

  if (status === 'not_found' || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="absolute top-4 right-4"><LanguageSelector /></div>
        <p className="text-4xl">🔍</p>
        <p className="text-gray-900 font-semibold">{t.finances.publicNotFound}</p>
        <p className="text-sm text-gray-400">{t.finances.publicNotFoundBody}</p>
      </div>
    )
  }

  const { moment, summary, transactions } = data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      {moment.cover_image_url ? (
        <div className="h-52 sm:h-64 overflow-hidden relative">
          <img src={moment.cover_image_url} alt={moment.name} className="w-full h-full object-cover" />
          <div className="absolute top-3 right-3"><LanguageSelector /></div>
        </div>
      ) : (
        <div className="h-40 flex items-center justify-between px-4 text-6xl relative" style={{ background: `linear-gradient(135deg, ${moment.color}30 0%, ${moment.color}70 100%)` }}>
          <span className="mx-auto">{moment.icon}</span>
          <div className="absolute top-3 right-3"><LanguageSelector /></div>
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Title */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            {moment.cover_image_url && <span className="text-2xl">{moment.icon}</span>}
            <h1 className="text-2xl font-bold text-gray-900">{moment.name}</h1>
          </div>
          {(moment.start_date || moment.description) && (
            <p className="text-sm text-gray-400">
              {moment.start_date && moment.end_date
                ? `${fmtDate(moment.start_date, dateLocale)} – ${fmtDate(moment.end_date, dateLocale)}`
                : moment.start_date
                ? `${t.finances.publicFromDate} ${fmtDate(moment.start_date, dateLocale)}`
                : moment.description}
            </p>
          )}
          {moment.description && moment.start_date && (
            <p className="text-sm text-gray-500 mt-1">{moment.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{t.finances.publicTotalSpent}</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(summary.total, summary.currency, dateLocale)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">{t.finances.momentTransactions}</p>
            <p className="text-2xl font-bold text-gray-700">{transactions.length}</p>
          </div>
        </div>

        {/* Category breakdown */}
        {summary.by_category.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">{t.finances.publicByCategory}</p>
            <div className="space-y-2.5">
              {summary.by_category.map(cat => {
                const pct = summary.total > 0 ? (cat.total / summary.total) * 100 : 0
                return (
                  <div key={cat.name} className="flex items-center gap-2">
                    <span className="text-sm w-5 text-center shrink-0">{cat.icon}</span>
                    <span className="text-xs text-gray-600 w-28 truncate shrink-0">{resolveKey(cat.name, cat.name_key, nameKeys, t.finances.noCategory)}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-20 text-right shrink-0">
                      {fmt(cat.total, summary.currency, dateLocale)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Transactions */}
        {transactions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-700">{t.finances.momentTransactions}</p>
            </div>
            {transactions.map((tx, i) => (
              <div key={i} className={`flex items-center gap-3 px-5 py-3 text-sm ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                <span className="text-xs text-gray-400 w-16 shrink-0">
                  {fmtShortDate(tx.date, dateLocale)}
                </span>
                <span className="text-sm">{(tx.category as { icon: string } | null)?.icon ?? '❓'}</span>
                <span className="flex-1 text-gray-700 truncate text-xs">
                  {tx.description ?? (tx.category as { name: string } | null)?.name ?? '—'}
                </span>
                <span className="text-xs font-semibold text-gray-900 shrink-0">
                  {fmt(Math.abs(tx.amount), tx.currency, dateLocale)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4 border-t border-gray-100">
          <Link to="/" className="text-xs text-gray-400 hover:text-[#0D0D0D] transition-colors">
            {t.finances.publicCreatedWith} <span className="font-semibold text-[#0D0D0D]">portfolio.andregutto.com</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
