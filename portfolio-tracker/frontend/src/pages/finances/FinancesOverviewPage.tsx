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
  id: number; name: string; name_key?: string | null; icon: string; color: string
  months: { month: string; total: number }[]
}

function fmt(n: number, currency: string, compact = false, locale = 'pt-BR') {
  return new Intl.NumberFormat(locale, {
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


function ChartTooltip({ active, payload, label, currency, locale = 'pt-BR' }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency: string
  locale?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  return (
    <div style={{ background: '#fff', border: '1px solid var(--arvo-border)', borderRadius: 12, boxShadow: '0 4px 16px rgba(13,13,13,0.08)', padding: '8px 12px', fontSize: 12, minWidth: 140 }}>
      <p style={{ color: 'rgba(13,13,13,0.50)', marginBottom: 6, fontWeight: 500 }}>{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmt(p.value, currency, true, locale)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--arvo-border)' }}>
        <span style={{ color: 'rgba(13,13,13,0.50)' }}>Total</span>
        <span style={{ fontWeight: 700, color: 'var(--arvo-fg)' }}>{fmt(total, currency, true, locale)}</span>
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
  const cycleDay: number = (user?.user_metadata?.month_cycle_day as number) || 1
  const defaultMonth = (() => {
    if (cycleDay > 1 && today.getDate() >= cycleDay) {
      const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
    }
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  })()

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.finances.overviewTitle}</h1>
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

  const incomeEnvelopeBar = envelopeBars.find(e => e.type === 'income')
  const expenseEnvelopeBars = envelopeBars.filter(e => e.type !== 'income')

  // Top categories from current month (expense only)
  const topCategories = currentMonthData.by_envelope
    .filter(e => e.type !== 'income')
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
    for (const env of ms.by_envelope.filter(e => e.envelope_id !== -1 && e.type !== 'income' && e.actual > 0)) {
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

  // Month projection — historical daily average approach
  const isCurrentMonth = month === defaultMonth
  const MS_DAY = 86400000

  function fmDateRange(ym: string, cd: number) {
    const [y, mo] = ym.split('-').map(Number)
    if (cd <= 1) return { start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) }
    return { start: new Date(y, mo - 2, cd), end: new Date(y, mo - 1, cd - 1) }
  }

  const fmDates = fmDateRange(month, cycleDay)
  const todayMs   = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startMs   = new Date(fmDates.start.getFullYear(), fmDates.start.getMonth(), fmDates.start.getDate()).getTime()
  const endMs     = new Date(fmDates.end.getFullYear(), fmDates.end.getMonth(), fmDates.end.getDate()).getTime()
  const daysTotal    = Math.round((endMs - startMs) / MS_DAY) + 1
  const daysElapsed  = isCurrentMonth ? Math.max(1, Math.round((todayMs - startMs) / MS_DAY) + 1) : daysTotal
  const daysRemaining = isCurrentMonth ? Math.max(0, daysTotal - daysElapsed) : 0

  // #1 Outlier-resistant projection: median of per-month daily averages
  const pastMonthsData = data.months.filter(m => m.month < month && m.expenses > 0).slice(-3)
  const perMonthStats = pastMonthsData.map(m => {
    const r = fmDateRange(m.month, cycleDay)
    const days = Math.round((r.end.getTime() - r.start.getTime()) / MS_DAY) + 1
    return { expenses: m.expenses, days, dailyAvg: m.expenses / days }
  })
  const sortedAvgs = [...perMonthStats].sort((a, b) => a.dailyAvg - b.dailyAvg)
  const histDailyAvg = sortedAvgs.length > 0
    ? sortedAvgs[Math.floor(sortedAvgs.length / 2)].dailyAvg
    : 0
  const avgMonthDays = perMonthStats.length > 0
    ? perMonthStats.reduce((s, m) => s + m.days, 0) / perMonthStats.length
    : 30

  // #2 Recurring detection: categories present in ALL past months, stable and large, missing this month
  const catHistMap = new Map<number, { amounts: number[]; name: string; icon: string }>()
  for (const pm of pastMonthsData) {
    for (const env of pm.by_envelope) {
      if (env.type === 'income') continue
      for (const cat of env.categories ?? []) {
        const prev = catHistMap.get(cat.id) ?? { amounts: [], name: cat.name, icon: cat.icon }
        catHistMap.set(cat.id, { ...prev, amounts: [...prev.amounts, cat.actual] })
      }
    }
  }
  const currentCatActuals = new Map<number, number>()
  for (const env of currentMonthData.by_envelope) {
    for (const cat of env.categories ?? []) currentCatActuals.set(cat.id, cat.actual)
  }
  const missingRecurrents: { id: number; name: string; icon: string; amount: number }[] = []
  let missingTotal = 0
  if (isCurrentMonth && pastMonthsData.length > 0 && totalBudgeted > 0) {
    for (const [catId, hist] of catHistMap.entries()) {
      if (hist.amounts.length < pastMonthsData.length) continue // must appear in every past month
      const sorted = [...hist.amounts].sort((a, b) => a - b)
      const minAmt = sorted[0]
      const maxAmt = sorted[sorted.length - 1]
      const medianAmt = sorted[Math.floor(sorted.length / 2)]
      // Skip if amounts are inconsistent (one big month ≠ true recurring)
      if (maxAmt > minAmt * 3) continue
      // Only significant fixed items: median ≥ 20% of budget
      if (medianAmt < totalBudgeted * 0.20) continue
      const current = currentCatActuals.get(catId) ?? 0
      if (current < minAmt * 0.25) { // less than 25% of lowest historical month → not yet recorded
        missingRecurrents.push({ id: catId, name: hist.name, icon: hist.icon, amount: Math.round(medianAmt) })
        missingTotal += medianAmt
      }
    }
  }
  // Subtract recurring component from daily avg to avoid double-counting
  const adjustedDailyAvg = Math.max(0, histDailyAvg - (avgMonthDays > 0 ? missingTotal / avgMonthDays : 0))

  // For current month: project using actual + missing recurrents + adjusted daily avg × remaining
  // For past months: display value = actual expenses (the real result)
  const projected = isCurrentMonth && (histDailyAvg > 0 || missingTotal > 0)
    ? Math.round(totalExpenses + missingTotal + adjustedDailyAvg * daysRemaining)
    : null
  const displayValue = projected ?? (!isCurrentMonth && totalExpenses > 0 ? totalExpenses : null)
  const displayPct  = displayValue != null && totalBudgeted > 0 ? Math.min(Math.round((displayValue / totalBudgeted) * 100), 100) : null
  const displayOver = displayValue != null && totalBudgeted > 0 && displayValue > totalBudgeted

  // #3 Budget alert: envelopes at 80–99% of budget this month
  const approachingBudgetEnvs = isCurrentMonth
    ? expenseEnvelopeBars.filter(e => e.budget > 0 && !e.over && e.actual / e.budget >= 0.80)
    : []

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.finances.overviewTitle}</h1>
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

        <div className="lg:grid lg:grid-cols-2 lg:gap-8" style={{ position: 'relative', zIndex: 2 }}>
          {/* Left: balance + KPIs */}
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
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

            <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(13,13,13,0.08)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
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
            {/* Mobile projection strip — hidden on desktop */}
            {displayValue != null && (
              <div className="lg:hidden" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(13,13,13,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }}>
                    {isCurrentMonth ? t.finances.overviewProjection : t.finances.overviewResult}
                    {isCurrentMonth && <span style={{ marginLeft: 5, letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>· {t.finances.overviewDayOf} {daysElapsed} {t.finances.overviewDayOfSep} {daysTotal}</span>}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 16, letterSpacing: '0.02em', color: displayOver ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
                      {fmt(cx(displayValue), currency, true)}
                    </span>
                    {totalBudgeted > 0 && (
                      <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.38)' }}>/ {fmt(cx(totalBudgeted), currency, true)}</span>
                    )}
                  </div>
                </div>
                {totalBudgeted > 0 && displayPct != null && (
                  <>
                    <div style={{ height: 3, background: 'rgba(13,13,13,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', borderRadius: 2, transition: 'width 0.5s ease', width: `${displayPct}%`, background: displayOver ? 'var(--arvo-red)' : 'var(--arvo-green)' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: displayOver ? 'var(--arvo-red)' : 'var(--arvo-green)' }}>
                      {displayOver
                        ? `+${fmt(cx(displayValue - totalBudgeted), currency, true)} ${t.finances.overviewOverBudget}`
                        : `${fmt(cx(totalBudgeted - displayValue), currency, true)} ${t.finances.overviewUnderBudget}`}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: month projection — desktop only */}
          <div className="hidden lg:flex lg:flex-col lg:justify-center" style={{ borderLeft: '1px solid rgba(13,13,13,0.07)', paddingLeft: 28 }}>
            <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)', marginBottom: 2 }}>
              {isCurrentMonth ? t.finances.overviewProjection : t.finances.overviewResult}
            </p>
            <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, color: 'rgba(13,13,13,0.38)', fontStyle: 'italic', marginBottom: 4 }}>
              {isCurrentMonth ? t.finances.overviewProjectionHint : t.finances.overviewResultHint}
            </p>
            <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 11, color: 'rgba(13,13,13,0.45)', marginBottom: 14 }}>
              {t.finances.overviewDayOf} {daysElapsed} {t.finances.overviewDayOfSep} {daysTotal}
              {isCurrentMonth && daysRemaining > 0 && <span style={{ marginLeft: 6 }}>· {daysRemaining} {t.finances.overviewDaysLeft}</span>}
            </p>

            {displayValue != null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--arvo-font-body)", fontSize: 26, letterSpacing: '0.02em', color: displayOver ? 'var(--arvo-red)' : 'var(--arvo-fg)' }}>
                    {fmt(cx(displayValue), currency, true)}
                  </span>
                  {totalBudgeted > 0 && (
                    <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.40)' }}>/ {fmt(cx(totalBudgeted), currency, true)}</span>
                  )}
                </div>
                {totalBudgeted > 0 && displayPct != null && (
                  <>
                    <div style={{ height: 4, background: 'rgba(13,13,13,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{
                        height: '100%', borderRadius: 2, transition: 'width 0.5s ease',
                        width: `${displayPct}%`,
                        background: displayOver ? 'var(--arvo-red)' : 'var(--arvo-green)',
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: displayOver ? 'var(--arvo-red)' : 'var(--arvo-green)', marginBottom: 10, display: 'block' }}>
                      {displayOver
                        ? `+${fmt(cx(displayValue - totalBudgeted), currency, true)} ${t.finances.overviewOverBudget}`
                        : `${fmt(cx(totalBudgeted - displayValue), currency, true)} ${t.finances.overviewUnderBudget}`}
                    </span>
                  </>
                )}
                {isCurrentMonth && histDailyAvg > 0 && (
                  <p style={{ fontSize: 10, color: 'rgba(13,13,13,0.35)', marginTop: 4 }}>
                    {t.finances.overviewHistAvg} {fmt(cx(histDailyAvg), currency, true)}{t.finances.overviewPerDay} · {pastMonthsData.length} {t.finances.overviewNMonths}
                  </p>
                )}
                {isCurrentMonth && missingRecurrents.length > 0 && (
                  <p style={{ fontSize: 10, color: 'rgba(13,13,13,0.42)', marginTop: 4 }}>
                    {t.finances.overviewRecurringIncluded}: {missingRecurrents.map(r => `${r.icon} ${fmt(cx(r.amount), currency, true)}`).join(' · ')}
                  </p>
                )}
              </>
            ) : isCurrentMonth ? (
              <p style={{ fontSize: 12, color: 'rgba(13,13,13,0.38)', fontStyle: 'italic' }}>
                {daysElapsed} {t.finances.overviewInsufficientData}
              </p>
            ) : (
              <p style={{ fontSize: 22, fontFamily: "var(--arvo-font-body)", color: 'rgba(13,13,13,0.20)' }}>—</p>
            )}
          </div>
        </div>
      </div>

      {/* #3 Budget alert: envelopes approaching limit */}
      {approachingBudgetEnvs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.28)', borderRadius: 12, padding: '8px 14px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--arvo-ocre)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p style={{ flex: 1, fontSize: 12, color: 'var(--arvo-ocre)', margin: 0, fontFamily: 'var(--arvo-font-body)' }}>
            {approachingBudgetEnvs.map(e => `${e.icon} ${resolveEnvName(e.name, e.type, e.name_key, nameKeys)} (${Math.round((e.actual / e.budget) * 100)}%)`).join('  ·  ')} — {t.finances.overviewNearLimit}
          </p>
        </div>
      )}

      {/* Income envelope section */}
      {incomeEnvelopeBar && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div
            className={`px-5 py-3 flex items-center gap-3 transition-colors ${incomeEnvelopeBar.categories.length > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}`}
            onClick={() => incomeEnvelopeBar.categories.length > 0 && toggleEnv(incomeEnvelopeBar.id)}
          >
            <span className="text-lg leading-none w-6 shrink-0">{incomeEnvelopeBar.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span style={{ fontSize: 13, color: 'var(--arvo-fg-muted)', fontFamily: "var(--arvo-font-body)", fontWeight: 600 }} className="truncate">{t.finances.overviewIncomeSection}</span>
                  {incomeEnvelopeBar.categories.length > 0 && (
                    <span className="text-[9px] text-gray-400 leading-none shrink-0">{expandedEnvIds.has(incomeEnvelopeBar.id) ? '▲' : '▼'}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--arvo-green)' }}>
                    {fmt(cx(incomeEnvelopeBar.actual), currency, true)}
                  </span>
                  {incomeEnvelopeBar.budget > 0 && (
                    <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.38)' }}>/ {fmt(cx(incomeEnvelopeBar.budget), currency, true)}</span>
                  )}
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: incomeEnvelopeBar.budget > 0 ? `${Math.min((incomeEnvelopeBar.actual / incomeEnvelopeBar.budget) * 100, 100)}%` : '0%',
                    backgroundColor: incomeEnvelopeBar.actual === 0 ? '#e5e7eb' : incomeEnvelopeBar.color,
                  }}
                />
              </div>
            </div>
          </div>
          {expandedEnvIds.has(incomeEnvelopeBar.id) && incomeEnvelopeBar.categories.length > 0 && (
            <div className="bg-gray-50 border-t border-gray-100">
              {incomeEnvelopeBar.categories.map(cat => (
                <div key={cat.id} className="px-5 py-2 flex items-center gap-3 pl-14 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => navigate(`/finances/transactions?category_id=${cat.id}`)}>
                  <span className="text-base leading-none w-5 shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, color: 'var(--arvo-fg-muted)' }} className="truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--arvo-green)', flexShrink: 0, marginLeft: 8 }}>{fmt(cx(cat.actual), currency, true)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Envelope spending vs budget */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg)', fontWeight: 600 }}>{t.finances.overviewSpendingVsBudget}</h2>
          <Link to="/finances/budget" className="text-xs text-[#0D0D0D] hover:opacity-70 transition-opacity">
            {t.finances.navBudget} →
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {expenseEnvelopeBars.map(env => (
            <div key={env.id}>
              <div
                className={`px-5 py-3 flex items-center gap-3 transition-colors ${env.categories.length > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                onClick={() => env.categories.length > 0 && toggleEnv(env.id)}
              >
                <span className="text-lg leading-none w-6 shrink-0">{env.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span style={{ fontSize: 13, color: 'var(--arvo-fg-muted)', fontFamily: "var(--arvo-font-body)" }} className="truncate">{resolveEnvName(env.name, env.type, env.name_key, nameKeys)}</span>
                      {env.categories.length > 0 && (
                        <span className="text-[9px] text-gray-400 leading-none shrink-0">{expandedEnvIds.has(env.id) ? '▲' : '▼'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span style={{ fontSize: 13, fontWeight: 600, color: env.over ? '#C0392B' : 'var(--arvo-fg)' }}>
                        {fmt(cx(env.actual), currency, true)}
                      </span>
                      {env.budget > 0 && (
                        <span style={{ fontSize: 12, color: 'rgba(13,13,13,0.38)' }}>/ {fmt(cx(env.budget), currency, true)}</span>
                      )}
                      {env.budget > 0 && env.actual > 0 && (() => {
                        const pct = Math.round((env.actual - env.budget) / env.budget * 100)
                        return (
                          <span style={{ fontSize: 11, fontWeight: 600, color: pct > 0 ? '#C0392B' : 'var(--arvo-green)', minWidth: 30, textAlign: 'right' }}>
                            {pct > 0 ? `+${pct}%` : `${pct}%`}
                          </span>
                        )
                      })()}
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
                      <div key={cat.id} className="px-4 py-2 flex items-center gap-2.5 pl-12 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => navigate(`/finances/transactions?category_id=${cat.id}`)}>
                        <span className="text-sm leading-none w-5 shrink-0">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span style={{ fontSize: 12, color: 'var(--arvo-fg-muted)' }} className="truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span style={{ fontSize: 12, fontWeight: 600, color: over ? '#C0392B' : 'var(--arvo-fg-muted)' }}>{fmt(cx(cat.actual), currency, true)}</span>
                              {catBudget > 0 && <span style={{ fontSize: 11, color: 'rgba(13,13,13,0.38)' }}>/ {fmt(cx(catBudget), currency, true)}</span>}
                            </div>
                          </div>
                          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: catBudget > 0 ? `${budgetPct}%` : `${Math.min(envPct, 100)}%`, backgroundColor: over ? '#ef4444' : cat.color }} />
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
              <Tooltip content={<ChartTooltip currency={currency} locale={browserLocale} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.envelopes.filter(e => e.type !== 'income').map((env, i, arr) => (
                <Bar
                  key={env.id}
                  dataKey={env.name}
                  name={resolveEnvName(env.name, env.type, env.name_key, nameKeys)}
                  stackId="a"
                  fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                  radius={i === arr.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category history chart — shares historyMonths toggle from envelope chart above */}
      {(catHistLoading || catHistory.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="mb-4">
            <h2 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 14, color: 'var(--arvo-fg)', fontWeight: 600 }} className="mb-3">{t.finances.categoryHistory}</h2>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedCatId('')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  selectedCatId === ''
                    ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
                }`}
              >{t.finances.selectCategory}</button>
              {catHistory.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCatId(selectedCatId === c.id ? '' : c.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedCatId === c.id
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                  style={selectedCatId === c.id ? { backgroundColor: c.color || CHART_PALETTE[i % CHART_PALETTE.length] } : {}}
                >
                  <span>{c.icon}</span>
                  <span>{resolveKey(c.name, c.name_key, nameKeys)}</span>
                </button>
              ))}
            </div>
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
                  <Tooltip content={<ChartTooltip currency={currency} locale={browserLocale} />} />
                  {filtered.map((cat, i) => (
                    <Bar
                      key={cat.id}
                      dataKey={cat.name}
                      name={resolveKey(cat.name, cat.name_key, nameKeys)}
                      fill={cat.color || CHART_PALETTE[i % CHART_PALETTE.length]}
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
