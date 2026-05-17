import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface FreedomPlan {
  id: number
  name: string
  is_active: boolean
  initial_capital: number
  monthly_contribution: number
  monthly_return_rate: number
  monthly_income_rate: number
  target_amount: number
  currency: string
  horizon_years: number
  notes: string | null
  created_at: string
}

interface MonthlyPerf {
  month: string
  total: number
}

interface PortfolioValue {
  total_brl: number
  total_eur: number | null
}

interface ChartPoint {
  month: string
  planned: number | null
  actual: number | null
}

function fmt(n: number, currency: string, compact = false) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: 0, maximumFractionDigits: compact ? 1 : 0,
  }).format(n)
}

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + '-01')
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

// Build planned trajectory: array of monthly wealth values
function buildPlanned(
  initial: number,
  monthlyContrib: number,
  monthlyRate: number,
  horizonMonths: number,
  startMonth: string,
): { month: string; value: number }[] {
  const result: { month: string; value: number }[] = []
  let w = initial
  for (let i = 0; i <= horizonMonths; i++) {
    result.push({ month: addMonths(startMonth, i), value: Math.round(w) })
    w = w * (1 + monthlyRate) + monthlyContrib
  }
  return result
}

// Simple form component
interface PlanFormProps {
  initial: Partial<FreedomPlan>
  currentEur: number
  onSave: (data: Omit<FreedomPlan, 'id' | 'is_active' | 'created_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function PlanForm({ initial, currentEur, onSave, onCancel, saving }: PlanFormProps) {
  const { t } = useI18n()
  const [name,         setName]         = useState(initial.name ?? '')
  const [capital,      setCapital]      = useState(String(initial.initial_capital ?? Math.round(currentEur)))
  const [contrib,      setContrib]      = useState(String(initial.monthly_contribution ?? 0))
  const [rate,         setRate]         = useState(String(((initial.monthly_return_rate ?? 0.006) * 100).toFixed(2)))
  const [incomeRate,   setIncomeRate]   = useState(String(((initial.monthly_income_rate ?? 0.005) * 100).toFixed(2)))
  const [target,       setTarget]       = useState(String(initial.target_amount ?? 0))
  const [currency,     setCurrency]     = useState(initial.currency ?? 'EUR')
  const [horizon,      setHorizon]      = useState(String(initial.horizon_years ?? 20))
  const [notes,        setNotes]        = useState(initial.notes ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave({
      name,
      initial_capital:       parseFloat(capital),
      monthly_contribution:  parseFloat(contrib),
      monthly_return_rate:   parseFloat(rate) / 100,
      monthly_income_rate:   parseFloat(incomeRate) / 100,
      target_amount:         parseFloat(target),
      currency,
      horizon_years:         parseInt(horizon),
      notes: notes || null,
    })
  }

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>{t.common.name}</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldCls} placeholder="Plano Mai/2026" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomCapital} ({currency})</label>
          <input required type="number" value={capital} onChange={e => setCapital(e.target.value)} className={fieldCls} placeholder="540000" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomContrib} / mês ({currency})</label>
          <input required type="number" value={contrib} onChange={e => setContrib(e.target.value)} className={fieldCls} placeholder="13000" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomRate} % / mês</label>
          <input required type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className={fieldCls} placeholder="0.60" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomIncomeRate} % / mês</label>
          <input required type="number" step="0.01" value={incomeRate} onChange={e => setIncomeRate(e.target.value)} className={fieldCls} placeholder="0.50" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomTarget} ({currency})</label>
          <input required type="number" value={target} onChange={e => setTarget(e.target.value)} className={fieldCls} placeholder="5000000" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomHorizon} (anos)</label>
          <input required type="number" value={horizon} onChange={e => setHorizon(e.target.value)} className={fieldCls} placeholder="20" />
        </div>
        <div>
          <label className={labelCls}>{t.finances.freedomCurrency}</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} className={fieldCls}>
            {['EUR','BRL','USD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>Notas (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={fieldCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-[#001A70] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          {saving ? '…' : t.common.save}
        </button>
        <button type="button" onClick={onCancel} className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </form>
  )
}

// Custom tooltip for chart
function ChartTooltip({ active, payload, label, currency }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map(p => p.value != null && (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value, currency)}
        </p>
      ))}
    </div>
  )
}

export default function FinancesFreedomPage() {
  const { t } = useI18n()

  const [plans,        setPlans]        = useState<FreedomPlan[]>([])
  const [perf,         setPerf]         = useState<MonthlyPerf[]>([])
  const [portfolio,    setPortfolio]    = useState<PortfolioValue | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editingPlan,  setEditingPlan]  = useState<FreedomPlan | null>(null)
  const [saving,       setSaving]       = useState(false)

  const activePlan = plans.find(p => p.is_active) ?? plans[0] ?? null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plansData, portfolioData] = await Promise.all([
        apiFetch<FreedomPlan[]>('/finances/freedom-plans'),
        apiFetch<PortfolioValue>('/portfolio'),
      ])
      setPlans(plansData)
      setPortfolio(portfolioData)
      // Fetch monthly performance for actual trajectory
      const now = currentMonth()
      const from = '2020-01'
      const monthly = await apiFetch<{ monthly: MonthlyPerf[] }>(`/performance/monthly?from=${from}&to=${now}`)
      setPerf(monthly.monthly ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function savePlan(data: Omit<FreedomPlan, 'id' | 'is_active' | 'created_at'>) {
    setSaving(true)
    try {
      if (editingPlan) {
        await apiFetch(`/finances/freedom-plans/${editingPlan.id}`, {
          method: 'PATCH', body: JSON.stringify(data),
        })
      } else {
        await apiFetch('/finances/freedom-plans', {
          method: 'POST', body: JSON.stringify(data),
        })
      }
      setShowForm(false)
      setEditingPlan(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deletePlan(id: number) {
    if (!confirm('Excluir este plano?')) return
    await apiFetch(`/finances/freedom-plans/${id}`, { method: 'DELETE' })
    await load()
  }

  async function setActive(id: number) {
    await apiFetch(`/finances/freedom-plans/${id}`, {
      method: 'PATCH', body: JSON.stringify({ is_active: true }),
    })
    await load()
  }

  // Compute chart data
  const chartData: ChartPoint[] = []
  if (activePlan) {
    const currency = activePlan.currency
    const currentEur = portfolio?.total_eur ?? 0
    const currentBrl = portfolio?.total_brl ?? 1
    const fxToEur = currentBrl > 0 ? currentEur / currentBrl : 1 / 6.4

    // Convert BRL performance history to plan currency
    const actualMap = new Map<string, number>()
    for (const p of perf) {
      const valueEur = p.total * fxToEur
      const value = currency === 'EUR' ? valueEur
        : currency === 'BRL' ? p.total
        : valueEur / 1.08  // rough USD approximation
      actualMap.set(p.month, Math.round(value))
    }

    // Plan start = plan creation month
    const planStart = activePlan.created_at.slice(0, 7)
    const horizonMonths = activePlan.horizon_years * 12
    const planEnd = addMonths(planStart, horizonMonths)
    const chartStart = perf.length > 0 ? perf[0].month : planStart
    const chartEnd = planEnd

    // Build planned trajectory
    const planned = buildPlanned(
      activePlan.initial_capital,
      activePlan.monthly_contribution,
      activePlan.monthly_return_rate,
      horizonMonths,
      planStart,
    )
    const plannedMap = new Map(planned.map(p => [p.month, p.value]))

    // Generate all months from chartStart to chartEnd
    let m = chartStart
    while (m <= chartEnd) {
      chartData.push({
        month: m,
        planned: plannedMap.get(m) ?? null,
        actual: actualMap.get(m) ?? null,
      })
      m = addMonths(m, 1)
    }
  }

  // Summary cards
  const currentValue = (() => {
    if (!activePlan || !portfolio) return 0
    const eur = portfolio.total_eur ?? 0
    if (activePlan.currency === 'EUR') return eur
    if (activePlan.currency === 'BRL') return portfolio.total_brl
    return eur / 1.08
  })()

  const passiveIncome = activePlan
    ? activePlan.target_amount * activePlan.monthly_income_rate
    : 0

  // When will the plan line reach the target?
  const reachMonth = (() => {
    if (!activePlan) return null
    const planStart = activePlan.created_at.slice(0, 7)
    const horizonMonths = activePlan.horizon_years * 12
    let w = activePlan.initial_capital
    for (let i = 0; i <= horizonMonths; i++) {
      if (w >= activePlan.target_amount) return addMonths(planStart, i)
      w = w * (1 + activePlan.monthly_return_rate) + activePlan.monthly_contribution
    }
    return addMonths(planStart, horizonMonths)
  })()

  // How many months ahead/behind is actual vs plan?
  const latestActualMonth = perf.length > 0 ? perf[perf.length - 1].month : null
  const planStatusText = (() => {
    if (!latestActualMonth || !activePlan) return null
    const fxToEur = (portfolio?.total_brl ?? 1) > 0
      ? (portfolio?.total_eur ?? 0) / (portfolio?.total_brl ?? 1)
      : 1 / 6.4
    const latestPerf = perf.find(p => p.month === latestActualMonth)
    if (!latestPerf) return null
    const actualNow = activePlan.currency === 'EUR'
      ? latestPerf.total * fxToEur
      : latestPerf.total
    const planStart = activePlan.created_at.slice(0, 7)
    const monthsElapsed = monthsBetween(planStart, latestActualMonth)
    if (monthsElapsed < 0) return null
    let plannedNow = activePlan.initial_capital
    for (let i = 0; i < monthsElapsed; i++) {
      plannedNow = plannedNow * (1 + activePlan.monthly_return_rate) + activePlan.monthly_contribution
    }
    const diff = actualNow - plannedNow
    const pct = plannedNow > 0 ? (diff / plannedNow) * 100 : 0
    return { diff: Math.round(diff), pct: pct.toFixed(1), ahead: diff >= 0 }
  })()

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        {t.common.loading}
      </div>
    )
  }

  const currency = activePlan?.currency ?? 'EUR'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.freedomTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.freedomSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {plans.length > 0 && (
            <button
              onClick={() => { setEditingPlan(activePlan); setShowForm(true) }}
              className="px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t.common.edit}
            </button>
          )}
          <button
            onClick={() => { setEditingPlan(null); setShowForm(true) }}
            className="px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
          >
            + {t.finances.freedomNewPlan}
          </button>
        </div>
      </div>

      {/* Plan selector */}
      {plans.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {plans.map(p => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                p.is_active
                  ? 'bg-[#001A70] text-white border-[#001A70]'
                  : 'border-gray-200 text-gray-500 hover:border-[#001A70] hover:text-[#001A70]'
              }`}
            >
              {p.name}
              {plans.length > 1 && (
                <span
                  onClick={e => { e.stopPropagation(); deletePlan(p.id) }}
                  className="ml-1.5 text-current opacity-50 hover:opacity-100"
                >×</span>
              )}
            </button>
          ))}
        </div>
      )}

      {!activePlan && !showForm ? (
        /* Empty state */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">🎯</p>
          <p className="text-gray-700 font-medium mb-1">{t.finances.freedomEmptyTitle}</p>
          <p className="text-sm text-gray-400 mb-5">{t.finances.freedomEmptyBody}</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2 bg-[#001A70] text-white text-sm rounded-xl hover:opacity-80 transition-opacity"
          >
            {t.finances.freedomCreatePlan}
          </button>
        </div>
      ) : showForm ? (
        /* Plan form */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingPlan ? t.finances.freedomEditPlan : t.finances.freedomNewPlan}
          </h3>
          <PlanForm
            initial={editingPlan ?? {}}
            currentEur={portfolio?.total_eur ?? 0}
            onSave={savePlan}
            onCancel={() => { setShowForm(false); setEditingPlan(null) }}
            saving={saving}
          />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomToday}</p>
              <p className="text-lg font-bold text-gray-900">{fmt(currentValue, currency, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomGoal}</p>
              <p className="text-lg font-bold text-[#001A70]">{fmt(activePlan!.target_amount, currency, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomPassive} / mês</p>
              <p className="text-lg font-bold text-emerald-600">{fmt(passiveIncome, currency, true)}</p>
              <p className="text-[10px] text-gray-400">{(activePlan!.monthly_income_rate * 100).toFixed(1)}% × meta</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomTarget}</p>
              {reachMonth && (
                <p className="text-base font-bold text-gray-900">
                  {new Date(reachMonth + '-01').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                </p>
              )}
              <p className="text-[10px] text-gray-400">{activePlan!.horizon_years} anos de plano</p>
            </div>
          </div>

          {/* Status banner */}
          {planStatusText && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
              planStatusText.ahead
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-amber-50 text-amber-700 border border-amber-100'
            }`}>
              <span>{planStatusText.ahead ? '✅' : '⚠️'}</span>
              <span>
                {planStatusText.ahead ? t.finances.freedomAhead : t.finances.freedomBehind}:&nbsp;
                <strong>{fmt(Math.abs(planStatusText.diff), currency, true)}</strong>
                &nbsp;({planStatusText.ahead ? '+' : ''}{planStatusText.pct}% vs plano)
              </span>
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">{t.finances.freedomChartTitle}</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <XAxis
                    dataKey="month"
                    tickFormatter={fmtMonth}
                    tick={{ fontSize: 10 }}
                    interval={Math.floor(chartData.length / 8)}
                  />
                  <YAxis
                    tickFormatter={v => fmt(v, currency, true)}
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip content={<ChartTooltip currency={currency} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine
                    y={activePlan!.target_amount}
                    stroke="#C9A227"
                    strokeDasharray="4 2"
                    label={{ value: t.finances.freedomGoal, position: 'insideTopRight', fontSize: 10, fill: '#C9A227' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="planned"
                    name={t.finances.freedomPlanned}
                    stroke="#001A70"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name={t.finances.freedomActual}
                    stroke="#10B981"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-gray-400 mt-2 text-right">
                {t.finances.freedomApprox}
              </p>
            </div>
          )}

          {/* Plan details */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{activePlan!.name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {[
                { label: t.finances.freedomCapital, value: fmt(activePlan!.initial_capital, currency) },
                { label: t.finances.freedomContrib + ' / mês', value: fmt(activePlan!.monthly_contribution, currency) },
                { label: t.finances.freedomRate + ' / mês', value: (activePlan!.monthly_return_rate * 100).toFixed(2) + '%' },
                { label: t.finances.freedomIncomeRate + ' / mês', value: (activePlan!.monthly_income_rate * 100).toFixed(2) + '%' },
                { label: t.finances.freedomHorizon, value: activePlan!.horizon_years + ' anos' },
                { label: t.finances.freedomCurrency, value: activePlan!.currency },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-medium text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            {activePlan!.notes && (
              <p className="text-xs text-gray-400 mt-3 border-t border-gray-50 pt-3">{activePlan!.notes}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
