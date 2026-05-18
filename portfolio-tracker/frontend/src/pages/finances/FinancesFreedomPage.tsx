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
  start_date: string | null
}

interface MonthlyPerf {
  month: string
  total: number
}

interface PortfolioValue {
  total_brl: number
  total_eur: number | null
  total_usd: number | null
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

// Derive per-currency rates from portfolio totals (rates[c] = units of c per 1 BRL)
function deriveRates(portfolio: PortfolioValue): Record<string, number> {
  const brl = portfolio.total_brl || 1
  return {
    BRL: 1,
    EUR: portfolio.total_eur != null ? portfolio.total_eur / brl : 1 / 6.4,
    USD: portfolio.total_usd != null ? portfolio.total_usd / brl : 1 / 5.7,
  }
}

function convertAmt(value: string, from: string, to: string, rates: Record<string, number>): string {
  if (from === to || !value) return value
  const n = parseFloat(value)
  if (isNaN(n) || !isFinite(n)) return value
  const inBrl = n / (rates[from] ?? 1)
  return String(Math.round(inBrl * (rates[to] ?? 1)))
}

function portfolioInCurrency(portfolio: PortfolioValue, currency: string, rates: Record<string, number>): string {
  return String(Math.round(portfolio.total_brl * (rates[currency] ?? 1)))
}

// Simple form component
interface PlanFormProps {
  initial: Partial<FreedomPlan>
  portfolio: PortfolioValue
  ipcaAnnual?: number | null
  onSave: (data: Omit<FreedomPlan, 'id' | 'is_active' | 'created_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function PlanForm({ initial, portfolio, ipcaAnnual, onSave, onCancel, saving }: PlanFormProps) {
  const { t } = useI18n()
  const isNew = !initial.id
  const rates = deriveRates(portfolio)

  const [currency,   setCurrencyState] = useState(initial.currency ?? 'EUR')
  const [name,       setName]          = useState(initial.name ?? '')
  const [startDate,  setStartDate]     = useState(
    initial.start_date?.slice(0, 10) ?? initial.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  )
  const [capital,    setCapital]       = useState(
    initial.initial_capital != null
      ? String(initial.initial_capital)
      : portfolioInCurrency(portfolio, initial.currency ?? 'EUR', rates)
  )
  const [contrib,        setContrib]       = useState(String(initial.monthly_contribution ?? 0))
  const [rate,           setRate]          = useState(String(((initial.monthly_return_rate ?? 0.006) * 100).toFixed(2)))
  const [incomeRate,     setIncomeRate]    = useState(String(((initial.monthly_income_rate ?? 0.005) * 100).toFixed(2)))
  const [target,         setTarget]        = useState(String(initial.target_amount ?? 0))
  const [horizon,        setHorizon]       = useState(String(initial.horizon_years ?? 20))
  const [notes,          setNotes]         = useState(initial.notes ?? '')
  const [goalMode,       setGoalMode]      = useState<'capital' | 'income'>('capital')
  const [desiredIncome,  setDesiredIncome] = useState('')
  const [inflation,      setInflation]     = useState(
    !initial.id && (initial.currency ?? 'EUR') === 'BRL' && ipcaAnnual != null
      ? String(ipcaAnnual)
      : '2'
  )

  function handleCurrencyChange(newCur: string) {
    setCapital(prev => convertAmt(prev, currency, newCur, rates))
    setContrib(prev => convertAmt(prev, currency, newCur, rates))
    setTarget(prev  => convertAmt(prev, currency, newCur, rates))
    setCurrencyState(newCur)
  }

  const portfolioSuggestion = portfolioInCurrency(portfolio, currency, rates)

  const horizonMonths = parseInt(horizon) * 12
  const targetDate = (() => {
    try {
      const d = new Date(startDate + 'T12:00:00')
      d.setMonth(d.getMonth() + horizonMonths)
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    } catch { return '' }
  })()

  // Mode 2: compute target_amount from desired monthly income + inflation
  const computedTarget = (() => {
    if (goalMode !== 'income') return null
    const income = parseFloat(desiredIncome)
    const inf    = parseFloat(inflation) / 100
    const years  = parseInt(horizon)
    const ir     = parseFloat(incomeRate) / 100
    if (!income || !ir || isNaN(years)) return null
    const futureIncome = income * Math.pow(1 + inf, years)
    return Math.round(futureIncome / ir)
  })()

  const effectiveTarget = goalMode === 'income' && computedTarget != null
    ? String(computedTarget)
    : target

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave({
      name,
      start_date:            startDate || null,
      initial_capital:       parseFloat(capital),
      monthly_contribution:  parseFloat(contrib),
      monthly_return_rate:   parseFloat(rate) / 100,
      monthly_income_rate:   parseFloat(incomeRate) / 100,
      target_amount:         parseFloat(effectiveTarget),
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

        {/* Name — full width */}
        <div className="col-span-2">
          <label className={labelCls}>{t.common.name}</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldCls} placeholder="Plano Mai/2026" />
        </div>

        {/* Start date */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>Data de início do plano</label>
          <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldCls} />
        </div>

        {/* Currency selector */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>{t.finances.freedomCurrency}</label>
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 w-fit">
            {['EUR', 'BRL', 'USD'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => handleCurrencyChange(c)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                  currency === c
                    ? 'bg-white text-[#001A70] shadow-sm'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Ao trocar, os valores são convertidos.</p>
        </div>


        {/* Capital inicial */}
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>
            {t.finances.freedomCapital} ({currency})
            {isNew && Number(portfolioSuggestion) > 0 && (
              <span className="ml-1.5 text-gray-400">
                — {t.finances.freedomCapitalHint}&nbsp;
                <button
                  type="button"
                  className="text-[#001A70] hover:opacity-70 underline underline-offset-2 transition-opacity"
                  onClick={() => setCapital(portfolioSuggestion)}
                >
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(portfolioSuggestion))}
                </button>
              </span>
            )}
          </label>
          <input required type="number" value={capital} onChange={e => setCapital(e.target.value)} className={fieldCls} placeholder="540000" />
        </div>

        {/* Aporte mensal */}
        <div>
          <label className={labelCls}>{t.finances.freedomContrib} / mês ({currency})</label>
          <input required type="number" value={contrib} onChange={e => setContrib(e.target.value)} className={fieldCls} placeholder="13000" />
        </div>

        {/* Taxa de retorno */}
        <div>
          <label className={labelCls}>{t.finances.freedomRate} % / mês</label>
          <input required type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className={fieldCls} placeholder="0.60" />
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">{t.finances.freedomRateHint}</p>
        </div>

        {/* Taxa de renda passiva */}
        <div>
          <label className={labelCls}>{t.finances.freedomIncomeRate} % / mês</label>
          <input required type="number" step="0.01" value={incomeRate} onChange={e => setIncomeRate(e.target.value)} className={fieldCls} placeholder="0.50" />
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">{t.finances.freedomIncomeRateHint}</p>
        </div>

        {/* Horizonte */}
        <div>
          <label className={labelCls}>{t.finances.freedomHorizon} (anos)</label>
          <input required type="number" value={horizon} onChange={e => setHorizon(e.target.value)} className={fieldCls} placeholder="20" />
          {targetDate && <p className="text-[11px] text-gray-400 mt-1">Meta em: <strong>{targetDate}</strong></p>}
        </div>

        {/* Meta — toggle entre dois modos */}
        <div className="col-span-2">
          <div className="flex items-center gap-1 mb-2">
            <span className="text-xs text-gray-500 mr-1">{t.finances.freedomGoal}:</span>
            {(['capital', 'income'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setGoalMode(mode)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  goalMode === mode
                    ? 'bg-[#001A70] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {mode === 'capital' ? t.finances.freedomGoalModeCapital : t.finances.freedomGoalModeIncome}
              </button>
            ))}
          </div>

          {goalMode === 'capital' ? (
            <input required type="number" value={target} onChange={e => setTarget(e.target.value)} className={fieldCls} placeholder="5000000" />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>{t.finances.freedomDesiredIncome} ({currency})</label>
                  <input required type="number" value={desiredIncome} onChange={e => setDesiredIncome(e.target.value)} className={fieldCls} placeholder="5000" />
                </div>
                <div>
                  <label className={labelCls}>{t.finances.freedomInflation}</label>
                  <input required type="number" step="0.1" value={inflation} onChange={e => setInflation(e.target.value)} className={fieldCls} placeholder="2" />
                  {ipcaAnnual != null && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      IPCA 12m:&nbsp;
                      <button type="button" onClick={() => setInflation(String(ipcaAnnual))} className="text-[#001A70] underline underline-offset-2 hover:opacity-70 transition-opacity">
                        {ipcaAnnual}%
                      </button>
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">{t.finances.freedomDesiredIncomeHint}</p>
              {computedTarget != null && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500">{t.finances.freedomComputedGoal}</p>
                  <p className="text-base font-bold text-[#001A70]">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(computedTarget)}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Renda futura ajustada: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(parseFloat(desiredIncome || '0') * Math.pow(1 + parseFloat(inflation || '2') / 100, parseInt(horizon || '20'))))} / mês
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notas */}
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
  const [ipcaM12,      setIpcaM12]      = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editingPlan,  setEditingPlan]  = useState<FreedomPlan | null>(null)
  const [saving,       setSaving]       = useState(false)

  const activePlan = plans.find(p => p.is_active) ?? plans[0] ?? null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plansData, portfolioData, indicesData] = await Promise.all([
        apiFetch<FreedomPlan[]>('/finances/freedom-plans'),
        apiFetch<PortfolioValue>('/portfolio/value'),
        apiFetch<{ code: string; m12_pct: number | null }[]>('/indices'),
      ])
      setPlans(plansData)
      setPortfolio(portfolioData)
      const ipca = indicesData.find(i => i.code === 'IPCA')
      if (ipca?.m12_pct != null) setIpcaM12(Math.round(ipca.m12_pct * 10) / 10)
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

  // Plan start date (use explicit start_date if set, otherwise created_at)
  const planStart = activePlan
    ? (activePlan.start_date?.slice(0, 7) ?? activePlan.created_at.slice(0, 7))
    : currentMonth()

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
        : valueEur / 1.08
      actualMap.set(p.month, Math.round(value))
    }

    const horizonMonths = activePlan.horizon_years * 12
    const chartStart = planStart
    const planEnd = addMonths(planStart, horizonMonths)
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

  // What the plan projects at the current month
  const plannedAtCurrentMonth = (() => {
    if (!activePlan) return 0
    const monthsElapsed = monthsBetween(planStart, currentMonth())
    if (monthsElapsed < 0) return activePlan.initial_capital
    let w = activePlan.initial_capital
    for (let i = 0; i < monthsElapsed; i++) {
      w = w * (1 + activePlan.monthly_return_rate) + activePlan.monthly_contribution
    }
    return Math.round(w)
  })()

  // When will the plan line reach the target?
  const reachMonth = (() => {
    if (!activePlan) return null
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
    const monthsElapsed = monthsBetween(planStart, latestActualMonth)
    if (monthsElapsed < 0) return null
    let planned = activePlan.initial_capital
    for (let i = 0; i < monthsElapsed; i++) {
      planned = planned * (1 + activePlan.monthly_return_rate) + activePlan.monthly_contribution
    }
    const diff = actualNow - planned
    const pct = planned > 0 ? (diff / planned) * 100 : 0
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
            portfolio={portfolio ?? { total_brl: 0, total_eur: null, total_usd: null }}
            ipcaAnnual={ipcaM12}
            onSave={savePlan}
            onCancel={() => { setShowForm(false); setEditingPlan(null) }}
            saving={saving}
          />
        </div>
      ) : (
        <>
          {/* Summary cards — row 1: current comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomToday}</p>
              <p className="text-lg font-bold text-gray-900">{fmt(currentValue, currency, true)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">patrimônio real agora</p>
            </div>
            <div className={`rounded-xl border shadow-sm p-4 ${planStatusText?.ahead ? 'bg-emerald-50 border-emerald-100' : planStatusText ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-500 mb-1">Previsto para hoje</p>
              <p className="text-lg font-bold text-gray-900">{fmt(plannedAtCurrentMonth, currency, true)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">segundo o plano</p>
            </div>
          </div>
          {/* Summary cards — row 2: goal metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomGoal}</p>
              <p className="text-base font-bold text-[#001A70]">{fmt(activePlan!.target_amount, currency, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomPassive} / mês</p>
              <p className="text-base font-bold text-emerald-600">{fmt(passiveIncome, currency, true)}</p>
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
