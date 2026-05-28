import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageLoader } from '../../components/ArvoLoader'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface CategorySummary {
  id: number
  name: string
  name_key?: string | null
  icon: string
  color: string
  actual: number
  budget?: number
}

interface EnvelopeSummary {
  envelope_id: number
  name: string
  name_key?: string | null
  type?: string
  color: string
  icon: string
  actual: number
  budget: number
  categories: CategorySummary[]
}

interface MonthSummary {
  month: string
  income: number
  expenses: number
  by_envelope: EnvelopeSummary[]
}

interface SpendingSummary {
  months: MonthSummary[]
  income_config: { monthly_net: number; currency: string }
  envelopes: { id: number; name: string; name_key?: string | null; type?: string; color: string; icon: string; pct_target: number; budget: number }[]
}

interface CatHistoryEntry {
  id: number; name: string; icon: string; color: string
  months: { month: string; total: number }[]
}

function fmt(n: number, currency: string, compact = false) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: 0, maximumFractionDigits: compact ? 1 : 0,
  }).format(n)
}

function fmtMonth(m: string, locale = 'pt-BR') {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString(locale, { month: 'short' })
}

function fmtMonthYear(m: string, locale = 'pt-BR') {
  const [y, mo] = m.split('-')
  const name = new Date(Number(y), Number(mo) - 1)
    .toLocaleDateString(locale, { month: 'short' })
    .replace('.', '')
  return `${name}/${y.slice(2)}`
}

const ENV_TYPE_KEY: Record<string, string> = {
  essential:  'envelopeEssential',
  investment: 'envelopeInvestment',
  savings:    'envelopeSavings',
  income:     'envelopeIncome',
  free:       'envelopeFree',
}

const CHART_PALETTE = [
  '#1B4FD8', // azul arara
  '#A36A52', // terracota
  '#E8A020', // tucano âmbar
  '#7B4FCC', // índigo
  '#0A7E6E', // verde teal
  '#C86A28', // laranja escuro
  '#5B8CD8', // azul claro
]

function resolveEnvName(name: string, type: string | undefined, nameKey: string | null | undefined, keys: Record<string, string>): string {
  const k = nameKey ?? (type ? ENV_TYPE_KEY[type] : null) ?? null
  if (!k) return name
  return keys[k] ?? name
}

function resolveKey(name: string, nameKey: string | null | undefined, keys: Record<string, string>): string {
  if (!nameKey) return name
  return keys[nameKey] ?? name
}


function ChartTooltip({ active, payload, label, currency }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div style={{ background: '#fff', border: '1px solid var(--arvo-border)', borderRadius: 12, boxShadow: '0 4px 16px rgba(13,13,13,0.08)', padding: '8px 12px', fontSize: 12, minWidth: 140 }}>
      <p style={{ color: 'rgba(13,13,13,0.50)', marginBottom: 6, fontWeight: 500 }}>{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmt(p.value, currency, true)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--arvo-border)' }}>
        <span style={{ color: 'rgba(13,13,13,0.50)' }}>Total</span>
        <span style={{ fontWeight: 700, color: 'var(--arvo-fg)' }}>{fmt(total, currency, true)}</span>
      </div>
    </div>
  )
}

export default function FinancesOverviewPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { currency: displayCurrency, fxRates } = useCurrency()

  const [showHomePrompt, setShowHomePrompt] = useState(() =>
    user?.user_metadata?.default_section !== 'finances' &&
    !localStorage.getItem('arvo_finances_home_prompt_dismissed')
  )
  const [savingHome, setSavingHome] = useState(false)

  async function confirmHomeSection() {
    setSavingHome(true)
    try {
      await apiFetch('/api/profile', { method: 'PATCH', body: JSON.stringify({ default_section: 'finances' }) })
      await supabase.auth.refreshSession()
    } finally {
      localStorage.setItem('arvo_finances_home_prompt_dismissed', '1')
      setShowHomePrompt(false)
      setSavingHome(false)
    }
  }

  function dismissHomePrompt() {
    localStorage.setItem('arvo_finances_home_prompt_dismissed', '1')
    setShowHomePrompt(false)
  }
  const browserLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB'
  const nameKeys: Record<string, string> = {
    envelopeEssential:     t.finances.envelopeEssential,
    envelopeInvestment:    t.finances.envelopeInvestment,
    envelopeSavings:       t.finances.envelopeSavings,
    envelopeFree:          t.finances.envelopeFree,
    envelopeIncome:        t.finances.envelopeIncome,
    envelopeNonEssential:  t.finances.envelopeNonEssential,
    envelopeTorrar:        t.finances.envelopeTorrar,
    categoryTransfer:      t.finances.categoryTransfer,
    categorySalary:        t.finances.categorySalary,
    categoryUncategorized: t.finances.categoryUncategorized,
    categoryGroceries:     t.finances.categoryGroceries,
    categoryRestaurant:    t.finances.categoryRestaurant,
    categoryTransport:     t.finances.categoryTransport,
    categoryHealth:        t.finances.categoryHealth,
    categoryEntertainment: t.finances.categoryEntertainment,
    categoryHousing:       t.finances.categoryHousing,
    categoryStreaming:      t.finances.categoryStreaming,
    categorySubscriptions: t.finances.categorySubscriptions,
    categoryPharmacy:      t.finances.categoryPharmacy,
    categoryClothing:      t.finances.categoryClothing,
    categoryTravel:        t.finances.categoryTravel,
    categoryCoffee:        t.finances.categoryCoffee,
    categoryUtilities:     t.finances.categoryUtilities,
    categoryEducation:     t.finances.categoryEducation,
    categoryPersonalCare:  t.finances.categoryPersonalCare,
    categoryElectronics:   t.finances.categoryElectronics,
    categoryAirbnb:          t.finances.categoryAirbnb,
    categoryOther:           t.finances.categoryOther,
    categoryGifts:           t.finances.categoryGifts,
    categoryShopping:        t.finances.categoryShopping,
    categoryTaxes:           t.finances.categoryTaxes,
    categoryFees:            t.finances.categoryFees,
    categoryBarsRestaurants: t.finances.categoryBarsRestaurants,
    categoryShowsParties:    t.finances.categoryShowsParties,
    categoryPhone:           t.finances.categoryPhone,
    categoryInvestment:      t.finances.categoryInvestment,
  }

  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  function fmtMonthFull(m: string) {
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString(browserLocale, { month: 'long', year: 'numeric' })
  }

  function prevMonth() {
    setMonth(prev => {
      const [y, mo] = prev.split('-').map(Number)
      const d = new Date(y, mo - 2, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  function nextMonth() {
    setMonth(prev => {
      if (prev >= defaultMonth) return prev
      const [y, mo] = prev.split('-').map(Number)
      const d = new Date(y, mo, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  const [month,          setMonth]          = useState(defaultMonth)
  const [historyMonths,  setHistoryMonths]  = useState<6 | 12 | 60>(6)
  const [data,           setData]           = useState<SpendingSummary | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [expandedEnvIds, setExpandedEnvIds] = useState<Set<number>>(new Set())

  const [catHistory,    setCatHistory]    = useState<CatHistoryEntry[]>([])
  const [selectedCatId, setSelectedCatId] = useState<number | ''>('')
  const [catHistLoading, setCatHistLoading] = useState(false)

  useEffect(() => {
    const now = new Date()
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (historyMonths - 1))
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    setCatHistLoading(true)
    apiFetch<CatHistoryEntry[]>(`/finances/categories/monthly-history?from=${from}&to=${to}`)
      .then(setCatHistory)
      .catch(() => {})
      .finally(() => setCatHistLoading(false))
  }, [historyMonths])

  useEffect(() => {
    setLoading(true)
    apiFetch<SpendingSummary>(`/finances/spending-summary?months=${historyMonths}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [historyMonths])

  const historyLabel = (n: 6 | 12 | 60) => {
    if (n === 6) return '6M'
    if (n === 12) return locale === 'en' ? '1Y' : '1A'
    return locale === 'pt' ? 'Tudo' : locale === 'fr' ? 'Tout' : 'All'
  }

  const toggleEnv = (id: number) => {
    setExpandedEnvIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return (
    <div className="space-y-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{t.finances.overviewTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.finances.overviewSubtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={prevMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(13,13,13,0.40)', borderRadius: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontSize: 13, fontFamily: 'var(--arvo-font-body)', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--arvo-black)', minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{fmtMonthFull(month)}</span>
          <button onClick={nextMonth} disabled={month >= defaultMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: month >= defaultMonth ? 'rgba(13,13,13,0.18)' : 'rgba(13,13,13,0.40)', borderRadius: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <PageLoader />
      </div>
    </div>
  )

  if (!data || data.income_config.monthly_net === 0) return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{t.finances.overviewTitle}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.finances.overviewSubtitle}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-3">💰</p>
        <p className="text-gray-600 font-medium text-sm mb-1">{t.finances.configureIncome}</p>
        <p className="text-gray-400 text-xs mb-4">{t.finances.configureHint}</p>
        <Link to="/finances/budget" className="inline-block bg-[#0D0D0D] text-white text-sm px-5 py-2 rounded-xl hover:opacity-80 transition-opacity">
          {t.finances.configureBudget}
        </Link>
      </div>
    </div>
  )

  const incomeCurrency = data.income_config.currency
  const currency = displayCurrency
  // Convert from income currency to display currency via BRL as pivot
  const cx = (n: number): number => {
    if (incomeCurrency === displayCurrency) return n
    const toRate = (fxRates as Record<string, number>)[incomeCurrency] ?? 1
    const brl = n * toRate
    if (displayCurrency === 'BRL') return brl
    const fromRate = (fxRates as Record<string, number>)[displayCurrency] ?? 1
    return brl / fromRate
  }
  const configuredIncome = data.income_config.monthly_net

  const currentMonthData = data.months.find(m => m.month === month)
    ?? { month, income: 0, expenses: 0, by_envelope: [] }

  const receivedIncome = currentMonthData.income
  const totalExpenses  = currentMonthData.expenses
  const netBalance     = receivedIncome - totalExpenses

  // Envelope bars for current month
  const envelopeBars = data.envelopes.map(env => {
    const envData = currentMonthData.by_envelope.find(e => e.envelope_id === env.id)
    const actual     = envData?.actual ?? 0
    const categories = envData?.categories ?? []
    const budget     = env.budget
    const pctOfIncome = configuredIncome > 0 ? (actual / configuredIncome) * 100 : 0
    const over = budget > 0 && actual > budget
    return { ...env, actual, budget, pctOfIncome, over, categories }
  })

  // Exclude income-type envelopes from budget comparison (their budget is the salary target, not an expense cap)
  const totalBudgeted   = envelopeBars.filter(e => e.type !== 'income').reduce((s, e) => s + e.budget, 0)
  const isWithinBudget  = totalExpenses === 0 || totalExpenses <= totalBudgeted
  const overspentAmount = totalExpenses > totalBudgeted ? totalExpenses - totalBudgeted : 0

  // Top categories from current month (actual categories, not envelopes)
  const topCategories = currentMonthData.by_envelope
    .flatMap(e => e.categories ?? [])
    .filter(c => c.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 5)

  // Chart data
  let chartData = data.months.map(ms => {
    const row: Record<string, number | string> = {
      month:    historyMonths >= 12 ? fmtMonthYear(ms.month, browserLocale) : fmtMonth(ms.month, browserLocale),
      rawMonth: ms.month,
    }
    for (const env of ms.by_envelope.filter(e => e.envelope_id !== -1 && e.actual > 0)) {
      row[env.name] = env.actual
    }
    return row
  })
  // For "Tudo", trim leading months with no data so the chart starts from first transaction
  if (historyMonths > 12) {
    const firstNonEmpty = chartData.findIndex(r => Object.keys(r).some(k => k !== 'month' && k !== 'rawMonth'))
    if (firstNonEmpty > 0) chartData = chartData.slice(firstNonEmpty)
  }

  const hasHistory = data.months.some(m => m.expenses > 0)

  return (
    <div className="space-y-5">
      {showHomePrompt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(200,184,154,0.12)', border: '1px solid rgba(200,184,154,0.35)', borderRadius: 12, padding: '10px 14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(13,13,13,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
          </svg>
          <p style={{ flex: 1, fontSize: 13, fontFamily: 'var(--arvo-font-body)', color: 'rgba(13,13,13,0.70)', lineHeight: 1.4, margin: 0 }}>
            {t.finances.homePromptText}
          </p>
          <button
            onClick={confirmHomeSection}
            disabled={savingHome}
            style={{ flexShrink: 0, fontSize: 12, fontFamily: 'var(--arvo-font-body)', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--arvo-black)', background: 'rgba(200,184,154,0.25)', border: '1px solid rgba(200,184,154,0.5)', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', opacity: savingHome ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {t.finances.homePromptConfirm}
          </button>
          <button
            onClick={dismissHomePrompt}
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: 'rgba(13,13,13,0.35)' }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Header + month nav inline */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{t.finances.overviewTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.finances.overviewSubtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={prevMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(13,13,13,0.40)', borderRadius: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span style={{ fontSize: 13, fontFamily: 'var(--arvo-font-body)', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--arvo-black)', minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>{fmtMonthFull(month)}</span>
          <button onClick={nextMonth} disabled={month >= defaultMonth} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'none', border: 'none', cursor: 'pointer', color: month >= defaultMonth ? 'rgba(13,13,13,0.18)' : 'rgba(13,13,13,0.40)', borderRadius: 8 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>

      {/* Hero card — white with gold glow */}
      <div style={{ background: '#FFFFFF', color: 'var(--arvo-fg)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden', border: '1px solid rgba(200,184,154,0.35)', boxShadow: '0 4px 24px rgba(200,184,154,0.18), 0 1px 0 rgba(200,184,154,0.22)' }}>
        {/* Gold glow — top-right */}
        <div style={{ position: 'absolute', top: -100, right: -60, width: 320, height: 320, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        {/* Gold glow — bottom-left */}
        <div style={{ position: 'absolute', bottom: -70, left: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(200,184,154,0.07)', filter: 'blur(48px)', pointerEvents: 'none' }} />
        {/* Gold shimmer line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.65), transparent)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-gold-text)', margin: 0 }}>{t.finances.overviewBalance}</p>
            <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 42, letterSpacing: '0.02em', lineHeight: 1.05, marginTop: 10, color: receivedIncome > 0 && netBalance < 0 ? 'var(--arvo-red)' : 'var(--arvo-black)' }}>
              {receivedIncome > 0 ? fmt(cx(netBalance), currency, true) : '—'}
            </p>
          </div>
          <div style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 999, fontSize: 11, fontFamily: "var(--arvo-font-body)", letterSpacing: '0.06em',
            background: totalExpenses === 0 ? 'rgba(0,0,0,0.04)' : isWithinBudget ? 'rgba(31,138,91,0.10)' : 'rgba(214,59,47,0.10)',
            color: totalExpenses === 0 ? 'rgba(13,13,13,0.40)' : isWithinBudget ? 'var(--arvo-green)' : 'var(--arvo-red)',
            border: `1px solid ${totalExpenses === 0 ? 'rgba(0,0,0,0.08)' : isWithinBudget ? 'rgba(31,138,91,0.25)' : 'rgba(214,59,47,0.25)'}`,
          }}>
            {totalExpenses === 0 ? '—' : isWithinBudget ? t.finances.overviewOnTrack : t.finances.overviewOverspent}
            {overspentAmount > 0 && ` +${fmt(cx(overspentAmount), currency, true)}`}
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 2, marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(13,13,13,0.08)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.62)' }}>{t.finances.income}</span>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.04em', color: receivedIncome > 0 && receivedIncome >= configuredIncome ? 'var(--arvo-green)' : receivedIncome > 0 ? 'var(--arvo-ocre)' : 'var(--arvo-fg)' }}>
              {receivedIncome > 0 ? fmt(cx(receivedIncome), currency, true) : '—'}
            </span>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, color: 'rgba(13,13,13,0.58)' }}>
              {t.finances.overviewPlanned} {fmt(cx(configuredIncome), currency, true)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.62)' }}>{t.finances.expenses}</span>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.04em', color: totalExpenses > totalBudgeted && totalBudgeted > 0 ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
              {totalExpenses > 0 ? fmt(cx(totalExpenses), currency, true) : '—'}
            </span>
            {totalBudgeted > 0 && (
              <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, color: 'rgba(13,13,13,0.58)' }}>
                {t.finances.overviewPlanned} {fmt(cx(totalBudgeted), currency, true)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.62)' }}>{t.finances.heroSavingsRate}</span>
            <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.04em', color: receivedIncome > 0 && netBalance >= 0 ? 'var(--arvo-green)' : receivedIncome > 0 ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
              {receivedIncome > 0 ? `${Math.round((netBalance / receivedIncome) * 100)}%` : '—'}
            </span>
            {receivedIncome > 0 && (
              <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, color: 'rgba(13,13,13,0.38)' }}>{t.finances.overviewStatus}</span>
            )}
          </div>
        </div>
      </div>

      {/* Envelope spending vs budget */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg)', fontWeight: 600 }}>{t.finances.overviewSpendingVsBudget}</h2>
          <Link to="/finances/budget" className="text-xs text-[#0D0D0D] hover:opacity-70 transition-opacity">
            {t.finances.navBudget} →
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {envelopeBars.map(env => (
            <div key={env.id}>
              <div
                className={`px-5 py-3 flex items-center gap-3 transition-colors ${env.categories.length > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={() => env.categories.length > 0 && toggleEnv(env.id)}
              >
                <span className="text-xl leading-none w-7 shrink-0">{env.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize: 14, color: 'var(--arvo-fg-muted)', fontFamily: "var(--arvo-font-body)" }}>{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
                      {env.categories.length > 0 && (
                        <span className="text-[10px] text-gray-400 leading-none">
                          {expandedEnvIds.has(env.id) ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div>
                        <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.58)', marginRight: 4 }}>{t.finances.overviewSpent}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: env.over ? '#C0392B' : 'var(--arvo-fg-muted)' }}>
                          {fmt(cx(env.actual), currency, true)}
                        </span>
                      </div>
                      {env.budget > 0 && (
                        <div>
                          <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.58)', marginRight: 4 }}>{t.finances.overviewBudgeted}</span>
                          <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.58)' }}>{fmt(cx(env.budget), currency, true)}</span>
                        </div>
                      )}
                      {env.budget > 0 && env.actual > 0 && (
                        <div>
                          {(() => {
                            const pct = Math.round((env.actual - env.budget) / env.budget * 100)
                            const over = pct > 0
                            return (
                              <span style={{ fontSize: 11, fontWeight: 600, color: over ? '#C0392B' : 'var(--arvo-green)' }}>
                                {over ? `+${pct}%` : `${pct}%`} {t.finances.ofTarget}
                              </span>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: env.budget > 0 ? `${Math.min((env.actual / env.budget) * 100, 100)}%` : '0%',
                        backgroundColor: env.over ? '#ef4444' : env.actual === 0 ? '#e5e7eb' : env.color,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.58)' }}>{env.pctOfIncome.toFixed(1)}% {t.finances.overviewSpent}</span>
                    <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.58)' }}>{t.finances.target}: {env.pct_target}% {t.finances.ofIncome}</span>
                  </div>
                </div>
              </div>
              {/* Expanded categories */}
              {expandedEnvIds.has(env.id) && env.categories.length > 0 && (
                <div className="bg-gray-50 border-t border-gray-100">
                  {env.categories.map(cat => {
                    const catBudget = cat.budget ?? 0
                    const budgetPct = catBudget > 0 ? Math.min((cat.actual / catBudget) * 100, 100) : 0
                    const envPct = env.actual > 0 ? (cat.actual / env.actual) * 100 : 0
                    const over = catBudget > 0 && cat.actual > catBudget
                    return (
                      <div key={cat.id} className="px-5 py-2 flex items-center gap-3 pl-14 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => navigate(`/finances/transactions?category_id=${cat.id}`)}>
                        <span className="text-base leading-none w-5 shrink-0">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span style={{ fontSize: 12, color: 'var(--arvo-fg-muted)' }} className="truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                            <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.58)', flexShrink: 0, marginLeft: 8 }}>{envPct.toFixed(0)}% {t.finances.ofEnvelope}</span>
                          </div>
                          <div className="mt-0.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: catBudget > 0 ? `${budgetPct}%` : `${Math.min(envPct, 100)}%`, backgroundColor: over ? '#ef4444' : cat.color }} />
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.58)' }}>{fmt(cx(cat.actual), currency, true)} {t.finances.overviewSpent}</span>
                            {catBudget > 0 && <span style={{ fontSize: 11, flexShrink: 0, color: over ? '#C0392B' : 'rgba(13,13,13,0.58)' }}>{budgetPct.toFixed(0)}% {t.finances.ofBudget}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top categories this month */}
      {topCategories.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg)', fontWeight: 600 }}>{t.finances.overviewTopCategories}</h2>
            <Link to="/finances/transactions" className="text-xs text-[#0D0D0D] hover:opacity-70 transition-opacity">
              {t.finances.navTransactions} →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {topCategories.map((cat, i) => {
              const pct = totalExpenses > 0 ? (cat.actual / totalExpenses) * 100 : 0
              return (
                <div key={cat.id} className="px-5 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => navigate(`/finances/transactions?category_id=${cat.id}`)}>
                  <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.50)', width: 16, flexShrink: 0 }}>{i + 1}</span>
                  <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 14, color: 'var(--arvo-fg-muted)', fontFamily: "var(--arvo-font-body)" }} className="truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)', flexShrink: 0, marginLeft: 8 }}>{fmt(cx(cat.actual), currency, true)}</span>
                    </div>
                    <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.58)', width: 32, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Historical trend with time range toggle */}
      {hasHistory && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg)', fontWeight: 600 }}>{t.finances.overviewHistory}</h2>
            <div className="flex gap-1">
              {([6, 12, 60] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setHistoryMonths(n)}
                  style={{
                    padding: '4px 10px', fontSize: 12, borderRadius: 8, fontWeight: 500, transition: 'all 0.15s',
                    background: historyMonths === n ? 'var(--arvo-black)' : 'transparent',
                    color: historyMonths === n ? '#fff' : 'rgba(13,13,13,0.50)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {historyLabel(n)}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(d) => {
                if (d?.activeLabel) {
                  const raw = chartData.find(r => r.month === d.activeLabel)?.rawMonth
                  if (raw) setMonth(raw as string)
                }
              }}
            >
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                interval={historyMonths <= 6 ? 0 : historyMonths <= 12 ? 1 : Math.max(0, Math.ceil(chartData.length / 8) - 1)}
              />
              <YAxis tickFormatter={v => fmt(cx(v as number), currency, true)} tick={{ fontSize: 10 }} width={70} />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.envelopes.map((env, i) => (
                <Bar
                  key={env.id}
                  dataKey={env.name}
                  name={resolveEnvName(env.name, env.type, env.name_key, nameKeys)}
                  stackId="a"
                  fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                  radius={i === data.envelopes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category history chart — shares historyMonths toggle from envelope chart above */}
      {(catHistLoading || catHistory.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg)', fontWeight: 600 }}>{t.finances.categoryHistory}</h2>
            <select
              value={selectedCatId}
              onChange={e => setSelectedCatId(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '4px 10px', fontSize: 12, background: 'white', color: 'var(--arvo-fg)' }}
            >
              <option value="">{t.finances.selectCategory}</option>
              {catHistory.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          {catHistLoading ? (
            <div className="h-48 flex items-end gap-1 px-2 pb-1">
              {[60,45,70,55,80,65,50,75,60,85,70,55].map((h, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${h}%` }} />
              ))}
            </div>
          ) : (() => {
            const filtered = selectedCatId !== '' ? catHistory.filter(c => c.id === selectedCatId) : catHistory
            if (!filtered.length) return null
            const allMonths = Array.from(new Set(filtered.flatMap(c => c.months.map(m => m.month)))).sort()
            const catChartData = allMonths.map(month => {
              const row: Record<string, string | number> = {
                month: historyMonths >= 12 ? fmtMonthYear(month, browserLocale) : fmtMonth(month, browserLocale),
              }
              for (const cat of filtered) {
                const m = cat.months.find(m2 => m2.month === month)
                row[cat.name] = m?.total ?? 0
              }
              return row
            })
            const isStacked = selectedCatId === ''
            return (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catChartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={historyMonths <= 6 ? 0 : historyMonths <= 12 ? 1 : Math.max(0, Math.ceil(catChartData.length / 8) - 1)} />
                  <YAxis tickFormatter={v => fmt(cx(Number(v)), currency, true)} tick={{ fontSize: 10 }} width={70} />
                  <Tooltip content={<ChartTooltip currency={currency} />} />
                  {filtered.map((cat, i) => (
                    <Bar
                      key={cat.id}
                      dataKey={cat.name}
                      name={cat.name}
                      fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                      stackId={isStacked ? 'a' : undefined}
                      radius={!isStacked || i === filtered.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )
          })()}
        </div>
      )}

      {/* Empty state / next steps */}
      {!hasHistory && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
          <h3 className="font-semibold text-indigo-900 text-sm mb-2">{t.finances.overviewNextSteps}</h3>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-xs text-indigo-700">
              <span>📋</span>
              <Link to="/finances/transactions" className="hover:underline">{t.finances.noTransactionsHint}</Link>
            </li>
            <li className="flex items-center gap-2 text-xs text-indigo-700">
              <span>📊</span>
              <Link to="/finances/budget" className="hover:underline">{t.finances.overviewReviewBudget}</Link>
            </li>
            <li className="flex items-center gap-2 text-xs text-indigo-700">
              <span>🎯</span>
              <Link to="/freedom" className="hover:underline">{t.finances.overviewFreedomPlan}</Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
