import { useState, useEffect, type CSSProperties } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import LanguageSelector from '../components/LanguageSelector'
import { Icon } from '../components/icons'
import { resolveMomentIcon } from '../lib/momentIcons'

interface PublicMoment {
  name: string; icon: string; color: string; cover_image_url: string | null
  cover_image_position: string | null
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

const labelStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--arvo-fg-soft)',
}

const kpiValueStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-display)',
  fontSize: 24,
  letterSpacing: '0.02em',
  color: 'var(--arvo-fg)',
}

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
      <div className="min-h-screen" style={{ background: 'var(--arvo-bg)' }}>
        <div className="h-52 sm:h-64 animate-pulse" style={{ background: 'var(--arvo-border)' }} />
        <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
          <div className="space-y-2">
            <div className="h-6 w-2/3 rounded-md animate-pulse" style={{ background: 'var(--arvo-border)' }} />
            <div className="h-3.5 w-1/3 rounded-md animate-pulse" style={{ background: 'var(--arvo-border)' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--arvo-border)' }} />
            <div className="h-20 rounded-2xl animate-pulse" style={{ background: 'var(--arvo-border)' }} />
          </div>
          <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--arvo-border)' }} />
          <div className="h-48 rounded-2xl animate-pulse" style={{ background: 'var(--arvo-border)' }} />
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center relative" style={{ background: 'var(--arvo-bg)' }}>
        <div className="absolute top-4 right-4"><LanguageSelector /></div>
        <Icon name="clock" size={32} style={{ color: 'var(--arvo-fg-soft)' }} />
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontWeight: 600, color: 'var(--arvo-fg)' }}>{t.finances.publicExpiredTitle}</p>
        <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.publicExpiredBody}</p>
      </div>
    )
  }

  if (status === 'not_found' || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center relative" style={{ background: 'var(--arvo-bg)' }}>
        <div className="absolute top-4 right-4"><LanguageSelector /></div>
        <Icon name="search" size={32} style={{ color: 'var(--arvo-fg-soft)' }} />
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontWeight: 600, color: 'var(--arvo-fg)' }}>{t.finances.publicNotFound}</p>
        <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.publicNotFoundBody}</p>
      </div>
    )
  }

  const { moment, summary, transactions } = data
  const momentIcon = resolveMomentIcon(moment.icon)

  return (
    <div className="min-h-screen" style={{ background: 'var(--arvo-bg)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Hero */}
      {moment.cover_image_url ? (
        <div className="h-52 sm:h-64 overflow-hidden relative">
          <img src={moment.cover_image_url} alt={moment.name} className="w-full h-full object-cover"
            style={{ objectPosition: moment.cover_image_position ?? '50% 50%' }} />
          <div className="absolute top-3 right-3"><LanguageSelector /></div>
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, ${moment.color}30 0%, ${moment.color}70 100%)` }}>
          <Icon name={momentIcon} size={56} style={{ color: moment.color }} />
          <div className="absolute top-3 right-3"><LanguageSelector /></div>
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Title */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            {moment.cover_image_url && (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${moment.color}20`, color: moment.color }}>
                <Icon name={momentIcon} size={16} />
              </div>
            )}
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 'var(--arvo-text-h3)', letterSpacing: 'var(--arvo-track-normal)', color: 'var(--arvo-fg)', margin: 0 }}>
              {moment.name}
            </h1>
          </div>
          {(moment.start_date || moment.description) && (
            <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>
              {moment.start_date && moment.end_date
                ? `${fmtDate(moment.start_date, dateLocale)} – ${fmtDate(moment.end_date, dateLocale)}`
                : moment.start_date
                ? `${t.finances.publicFromDate} ${fmtDate(moment.start_date, dateLocale)}`
                : moment.description}
            </p>
          )}
          {moment.description && moment.start_date && (
            <p className="text-sm mt-1" style={{ color: 'var(--arvo-fg-muted)' }}>{moment.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <p style={{ ...labelStyle, marginBottom: 6 }}>{t.finances.publicTotalSpent}</p>
            <p className="arvo-num" style={kpiValueStyle}>{fmt(summary.total, summary.currency, dateLocale)}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <p style={{ ...labelStyle, marginBottom: 6 }}>{t.finances.momentTransactions}</p>
            <p className="arvo-num" style={kpiValueStyle}>{transactions.length}</p>
          </div>
        </div>

        {/* Category breakdown */}
        {summary.by_category.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <p style={{ ...labelStyle, marginBottom: 16 }}>{t.finances.publicByCategory}</p>
            <div className="space-y-2.5">
              {summary.by_category.map(cat => {
                const pct = summary.total > 0 ? (cat.total / summary.total) * 100 : 0
                return (
                  <div key={cat.name} className="flex items-center gap-2">
                    <span className="text-sm w-5 text-center shrink-0">{cat.icon}</span>
                    <span className="text-xs w-28 truncate shrink-0" style={{ color: 'var(--arvo-fg-muted)' }}>{resolveKey(cat.name, cat.name_key, nameKeys, t.finances.noCategory)}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--arvo-track-bg)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                    </div>
                    <span className="text-xs font-medium w-20 text-right shrink-0 arvo-num" style={{ color: 'var(--arvo-fg)' }}>
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
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
              <p style={labelStyle}>{t.finances.momentTransactions}</p>
            </div>
            {transactions.map((tx, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 text-sm" style={{ borderTop: i > 0 ? '1px solid var(--arvo-border-soft)' : 'none' }}>
                <span className="text-xs w-16 shrink-0" style={{ color: 'var(--arvo-fg-soft)' }}>
                  {fmtShortDate(tx.date, dateLocale)}
                </span>
                <span className="text-sm">{(tx.category as { icon: string } | null)?.icon ?? '❓'}</span>
                <span className="flex-1 truncate text-xs" style={{ color: 'var(--arvo-fg-muted)' }}>
                  {tx.description ?? (tx.category as { name: string } | null)?.name ?? '-'}
                </span>
                <span className="text-xs font-semibold shrink-0 arvo-num" style={{ color: 'var(--arvo-fg)' }}>
                  {fmt(Math.abs(tx.amount), tx.currency, dateLocale)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4" style={{ borderTop: '1px solid var(--arvo-border-soft)' }}>
          <Link to="/" className="text-xs transition-colors hover:text-[var(--arvo-fg)]" style={{ color: 'var(--arvo-fg-soft)' }}>
            {t.finances.publicCreatedWith} <span className="font-semibold" style={{ color: 'var(--arvo-fg)' }}>arvo.andregutto.com</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
