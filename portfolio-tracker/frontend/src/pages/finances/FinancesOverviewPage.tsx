import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface CategorySummary {
  id: number
  name: string
  icon: string
  color: string
  actual: number
}

interface EnvelopeSummary {
  envelope_id: number
  name: string
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
  envelopes: { id: number; name: string; color: string; icon: string; pct_target: number; budget: number }[]
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

function MonthPicker({ value, onChange, locale }: { value: string; onChange: (m: string) => void; locale: string }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
      {months.map(m => {
        const [y, mo] = m.split('-')
        return <option key={m} value={m}>{new Date(Number(y), Number(mo) - 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</option>
      })}
    </select>
  )
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
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs min-w-[140px]">
      <p className="text-gray-500 mb-1.5 font-medium">{label}</p>
      {payload.map(p => p.value > 0 && (
        <div key={p.name} className="flex items-center justify-between gap-3 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold">{fmt(p.value, currency, true)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 mt-1 pt-1 border-t border-gray-100">
        <span className="text-gray-500">Total</span>
        <span className="font-bold text-gray-900">{fmt(total, currency, true)}</span>
      </div>
    </div>
  )
}

export default function FinancesOverviewPage() {
  const { t, locale } = useI18n()
  const browserLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB'

  const today = new Date()
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [month,          setMonth]          = useState(defaultMonth)
  const [historyMonths,  setHistoryMonths]  = useState<6 | 12 | 24>(6)
  const [data,           setData]           = useState<SpendingSummary | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [expandedEnvIds, setExpandedEnvIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLoading(true)
    apiFetch<SpendingSummary>(`/finances/spending-summary?months=${historyMonths}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [historyMonths])

  const historyLabel = (n: 6 | 12 | 24) => {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.finances.overviewTitle}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.finances.overviewSubtitle}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        {t.common.loading}
      </div>
    </div>
  )

  if (!data || data.income_config.monthly_net === 0) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.finances.overviewTitle}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.finances.overviewSubtitle}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-3">💰</p>
        <p className="text-gray-600 font-medium text-sm mb-1">{t.finances.configureIncome}</p>
        <p className="text-gray-400 text-xs mb-4">{t.finances.configureHint}</p>
        <Link to="/finances/budget" className="inline-block bg-[#001A70] text-white text-sm px-5 py-2 rounded-xl hover:opacity-80 transition-opacity">
          {t.finances.configureBudget}
        </Link>
      </div>
    </div>
  )

  const currency = data.income_config.currency
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

  const totalBudgeted   = envelopeBars.reduce((s, e) => s + e.budget, 0)
  const isWithinBudget  = totalExpenses === 0 || totalExpenses <= totalBudgeted
  const overspentAmount = totalExpenses > totalBudgeted ? totalExpenses - totalBudgeted : 0

  // Top categories from current month (actual categories, not envelopes)
  const topCategories = currentMonthData.by_envelope
    .flatMap(e => e.categories ?? [])
    .filter(c => c.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 5)

  // Chart data
  const chartData = data.months.map(ms => {
    const row: Record<string, number | string> = {
      month:    fmtMonth(ms.month, browserLocale),
      rawMonth: ms.month,
    }
    for (const env of ms.by_envelope.filter(e => e.envelope_id !== -1 && e.actual > 0)) {
      row[env.name] = env.actual
    }
    return row
  })

  const hasHistory = data.months.some(m => m.expenses > 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.overviewTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.overviewSubtitle}</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} locale={browserLocale} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Received income — highlight actual, show planned as subtitle */}
        <div className={`rounded-xl border shadow-sm p-4 ${receivedIncome > 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-100'}`}>
          <p className="text-xs text-gray-500 mb-1">{t.finances.income}</p>
          <p className={`text-lg font-bold ${receivedIncome > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
            {receivedIncome > 0 ? fmt(receivedIncome, currency, true) : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {t.finances.overviewPlanned} {fmt(configuredIncome, currency, true)}
          </p>
        </div>
        {/* Expenses — highlight actual, show planned as subtitle */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-1">{t.finances.expenses}</p>
          <p className={`text-lg font-bold ${totalExpenses > totalBudgeted && totalBudgeted > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {totalExpenses > 0 ? fmt(totalExpenses, currency, true) : '—'}
          </p>
          {totalBudgeted > 0 && (
            <p className="text-[10px] text-gray-400 mt-0.5">{t.finances.overviewPlanned} {fmt(totalBudgeted, currency, true)}</p>
          )}
        </div>
        {/* Balance */}
        <div className={`rounded-xl border shadow-sm p-4 ${receivedIncome > 0 ? (netBalance >= 0 ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100') : 'bg-white border-gray-100'}`}>
          <p className="text-xs text-gray-500 mb-1">{t.finances.overviewBalance}</p>
          <p className={`text-lg font-bold ${receivedIncome > 0 && netBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {receivedIncome > 0 ? fmt(netBalance, currency, true) : '—'}
          </p>
        </div>
        {/* Status */}
        <div className={`rounded-xl border shadow-sm p-4 ${isWithinBudget ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
          <p className="text-xs text-gray-500 mb-1">{t.finances.overviewStatus}</p>
          <p className={`text-sm font-semibold ${isWithinBudget ? 'text-emerald-700' : 'text-red-600'}`}>
            {totalExpenses === 0 ? '—' : isWithinBudget ? t.finances.overviewOnTrack : t.finances.overviewOverspent}
          </p>
          {overspentAmount > 0 && (
            <p className="text-[10px] text-red-500 mt-0.5">+{fmt(overspentAmount, currency, true)}</p>
          )}
        </div>
      </div>

      {/* Envelope spending vs budget */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">{t.finances.overviewSpendingVsBudget}</h2>
          <Link to="/finances/budget" className="text-xs text-[#001A70] hover:opacity-70 transition-opacity">
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
                      <span className="text-sm text-gray-700">{env.name}</span>
                      {env.categories.length > 0 && (
                        <span className="text-[10px] text-gray-400 leading-none">
                          {expandedEnvIds.has(env.id) ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div>
                        <span className="text-[10px] text-gray-400 mr-1">{t.finances.overviewSpent}</span>
                        <span className={`text-xs font-semibold ${env.over ? 'text-red-500' : 'text-gray-700'}`}>
                          {fmt(env.actual, currency, true)}
                        </span>
                      </div>
                      {env.budget > 0 && (
                        <div>
                          <span className="text-[10px] text-gray-400 mr-1">{t.finances.overviewBudgeted}</span>
                          <span className="text-xs text-gray-400">{fmt(env.budget, currency, true)}</span>
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
                    <span className="text-[10px] text-gray-400">{env.pctOfIncome.toFixed(1)}% {t.finances.ofIncome}</span>
                    <span className="text-[10px] text-gray-400">{t.finances.target}: {env.pct_target}%</span>
                  </div>
                </div>
              </div>
              {/* Expanded categories */}
              {expandedEnvIds.has(env.id) && env.categories.length > 0 && (
                <div className="bg-gray-50 border-t border-gray-100">
                  {env.categories.map(cat => {
                    const pct = env.actual > 0 ? (cat.actual / env.actual) * 100 : 0
                    return (
                      <div key={cat.id} className="px-5 py-2 flex items-center gap-3 pl-14">
                        <span className="text-base leading-none w-5 shrink-0">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600 truncate">{cat.name}</span>
                            <span className="text-xs font-medium text-gray-700 shrink-0 ml-2">
                              {fmt(cat.actual, currency, true)}
                            </span>
                          </div>
                          <div className="mt-0.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 w-7 text-right shrink-0">{pct.toFixed(0)}%</span>
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
            <h2 className="font-semibold text-gray-800 text-sm">{t.finances.overviewTopCategories}</h2>
            <Link to="/finances/transactions" className="text-xs text-[#001A70] hover:opacity-70 transition-opacity">
              {t.finances.navTransactions} →
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {topCategories.map((cat, i) => {
              const pct = totalExpenses > 0 ? (cat.actual / totalExpenses) * 100 : 0
              return (
                <div key={cat.id} className="px-5 py-2.5 flex items-center gap-3">
                  <span className="text-xs text-gray-300 w-4 shrink-0">{i + 1}</span>
                  <span className="text-base leading-none w-6 shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 truncate">{cat.name}</span>
                      <span className="text-sm font-medium text-gray-900 shrink-0 ml-2">{fmt(cat.actual, currency, true)}</span>
                    </div>
                    <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
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
            <h2 className="font-semibold text-gray-800 text-sm">{t.finances.overviewHistory}</h2>
            <div className="flex gap-1">
              {([6, 12, 24] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setHistoryMonths(n)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors font-medium ${
                    historyMonths === n
                      ? 'bg-[#001A70] text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
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
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => fmt(v, currency, true)} tick={{ fontSize: 10 }} width={70} />
              <Tooltip content={<ChartTooltip currency={currency} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.envelopes.map((env, i) => (
                <Bar
                  key={env.id}
                  dataKey={env.name}
                  stackId="a"
                  fill={env.color}
                  radius={i === data.envelopes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
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
