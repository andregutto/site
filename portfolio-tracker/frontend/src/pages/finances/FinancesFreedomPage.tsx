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

function fmt(n: number, currency: string, compact = false, locale = 'pt-BR') {
  return new Intl.NumberFormat(locale, {
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

function fmtMonth(m: string, locale = 'pt-BR') {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString(locale, { month: 'short', year: '2-digit' })
}

function ageAtDate(birthdate: string, targetIso: string): number {
  const b = new Date(birthdate + 'T00:00:00')
  const tgt = new Date(targetIso + 'T00:00:00')
  let age = tgt.getFullYear() - b.getFullYear()
  const m = tgt.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && tgt.getDate() < b.getDate())) age--
  return age
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
    EUR: portfolio.total_eur != null && portfolio.total_eur > 0 ? portfolio.total_eur / brl : 1 / 6.4,
    USD: portfolio.total_usd != null && portfolio.total_usd > 0 ? portfolio.total_usd / brl : 1 / 5.7,
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

// Wizard form component
interface PlanFormProps {
  initial: Partial<FreedomPlan>
  portfolio: PortfolioValue
  ipcaAnnual?: number | null
  birthdate?: string | null
  onSave: (data: Omit<FreedomPlan, 'id' | 'is_active' | 'created_at'>) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
  saving: boolean
}

function PlanForm({ initial, portfolio, ipcaAnnual, birthdate, onSave, onDelete, onCancel, saving }: PlanFormProps) {
  const { t, locale } = useI18n()
  const intlLocale = ({ pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' } as Record<string, string>)[locale] ?? 'pt-BR'
  const isNew = !initial.id
  const rates = deriveRates(portfolio)

  const currentAge = birthdate
    ? Math.floor((Date.now() - new Date(birthdate + 'T00:00:00').getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  // step: 0=goal(new only), 1=info, 2=capital, 3=target, 4=strategy
  const [step, setStep]           = useState(isNew ? 0 : 1)
  const [goalMode, setGoalMode]   = useState<'capital' | 'income'>('capital')
  const [currency, setCurrencyState] = useState(initial.currency ?? 'EUR')
  const [name, setName]           = useState(initial.name ?? '')
  const [startDate, setStartDate] = useState(
    initial.start_date?.slice(0, 10) ?? initial.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  )
  const [capital, setCapital]     = useState(
    initial.initial_capital != null
      ? String(initial.initial_capital)
      : portfolioInCurrency(portfolio, initial.currency ?? 'EUR', rates)
  )
  const [contrib, setContrib]     = useState(String(initial.monthly_contribution ?? 0))
  const [rate, setRate]           = useState(String(((initial.monthly_return_rate ?? 0.006) * 100).toFixed(2)))
  const [incomeRate, setIncomeRate] = useState(String(((initial.monthly_income_rate ?? 0.005) * 100).toFixed(2)))
  const [target, setTarget]       = useState(String(initial.target_amount ?? 0))
  const [horizon, setHorizon]     = useState(String(initial.horizon_years ?? 20))
  const [notes, setNotes]         = useState(initial.notes ?? '')
  const [desiredIncome, setDesiredIncome] = useState('')
  const [inflation, setInflation] = useState(
    !initial.id && (initial.currency ?? 'EUR') === 'BRL' && ipcaAnnual != null
      ? String(ipcaAnnual)
      : '2'
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Strategy: 'fixContrib' = user sets contribution, horizon is calculated; 'fixHorizon' = user sets horizon, contrib is calculated
  const [stratMode, setStratMode] = useState<'fixContrib' | 'fixHorizon'>('fixHorizon')
  // Age mode: show target age instead of years for horizon
  const [ageMode, setAgeMode]     = useState<boolean>(!!birthdate)
  const [targetAge, setTargetAge] = useState<string>(() => {
    if (!birthdate || currentAge == null) return ''
    return String(currentAge + (initial.horizon_years ?? 20))
  })

  function handleCurrencyChange(newCur: string) {
    setCapital(prev => convertAmt(prev, currency, newCur, rates))
    setContrib(prev => convertAmt(prev, currency, newCur, rates))
    setTarget(prev => convertAmt(prev, currency, newCur, rates))
    setDesiredIncome(prev => convertAmt(prev, currency, newCur, rates))
    setCurrencyState(newCur)
  }

  const portfolioSuggestion = portfolioInCurrency(portfolio, currency, rates)

  // Effective horizon in years from user input (age or years)
  const horizonInputYears = ageMode && birthdate && targetAge && currentAge != null
    ? Math.max(0, parseInt(targetAge) - currentAge)
    : parseInt(horizon) || 0

  const computedTarget = (() => {
    if (goalMode !== 'income') return null
    const income = parseFloat(desiredIncome)
    const inf    = parseFloat(inflation) / 100
    const years  = horizonInputYears
    const ir     = parseFloat(incomeRate) / 100
    if (!income || !ir || !years) return null
    const futureIncome = income * Math.pow(1 + inf, years)
    return Math.round(futureIncome / ir)
  })()

  const effectiveTarget = goalMode === 'income' && computedTarget != null
    ? String(computedTarget)
    : target

  // When stratMode === 'fixContrib': contrib is fixed, horizon is calculated
  const calculatedHorizonMonths = (() => {
    if (stratMode !== 'fixContrib') return null
    const T = parseFloat(effectiveTarget)
    const C = parseFloat(capital)
    const r = parseFloat(rate) / 100
    const A = parseFloat(contrib)
    if (isNaN(T) || !T || isNaN(C) || isNaN(r) || r <= 0 || isNaN(A)) return null
    const maxN = 600
    let lo = 1, hi = maxN
    for (let iter = 0; iter < 30; iter++) {
      const mid = Math.floor((lo + hi) / 2)
      const pow = Math.pow(1 + r, mid)
      const val = C * pow + A * (pow - 1) / r
      if (val >= T) hi = mid
      else lo = mid + 1
    }
    const pow = Math.pow(1 + r, lo)
    const val = C * pow + A * (pow - 1) / r
    return val >= T ? lo : null
  })()
  const calculatedHorizonYears = calculatedHorizonMonths != null ? calculatedHorizonMonths / 12 : null

  // When stratMode === 'fixHorizon': horizon is fixed, contrib is calculated
  const calculatedContrib = (() => {
    if (stratMode !== 'fixHorizon') return null
    const T = parseFloat(effectiveTarget)
    const C = parseFloat(capital)
    const r = parseFloat(rate) / 100
    const n = horizonInputYears * 12
    if (isNaN(T) || !T || isNaN(C) || isNaN(r) || r <= 0 || !n) return null
    const pow = Math.pow(1 + r, n)
    if (pow <= 1) return null
    return Math.max(0, Math.round((T - C * pow) * r / (pow - 1)))
  })()

  const effectiveHorizonYears = stratMode === 'fixContrib' && calculatedHorizonYears != null
    ? Math.round(calculatedHorizonYears)
    : horizonInputYears

  const horizonMonths = effectiveHorizonYears * 12
  const targetDateISO = (() => {
    try {
      const d = new Date(startDate + 'T12:00:00')
      d.setMonth(d.getMonth() + horizonMonths)
      return d.toISOString().slice(0, 10)
    } catch { return null }
  })()
  const targetDate = targetDateISO
    ? new Date(targetDateISO + 'T12:00:00').toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })
    : ''

  const annualRatePct = (() => {
    const r = parseFloat(rate)
    if (isNaN(r) || r <= 0) return null
    return ((Math.pow(1 + r / 100, 12) - 1) * 100).toFixed(1)
  })()

  async function handleSave() {
    const savedContrib  = stratMode === 'fixHorizon' && calculatedContrib != null
      ? calculatedContrib
      : parseFloat(contrib)
    const savedHorizon  = stratMode === 'fixContrib' && calculatedHorizonYears != null
      ? Math.round(calculatedHorizonYears)
      : effectiveHorizonYears
    await onSave({
      name,
      start_date:           startDate || null,
      initial_capital:      parseFloat(capital),
      monthly_contribution: isNaN(savedContrib) ? 0 : savedContrib,
      monthly_return_rate:  parseFloat(rate) / 100,
      monthly_income_rate:  parseFloat(incomeRate) / 100,
      target_amount:        parseFloat(effectiveTarget),
      currency,
      horizon_years:        savedHorizon || parseInt(horizon) || 20,
      notes: notes || null,
    })
  }

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  // Steps 0=goal(new only), 1=info, 2=capital, 3=target, 4=strategy
  // Edit mode starts at step 1, so totalSteps = 4; new mode starts at 0, totalSteps = 5
  const firstStep   = isNew ? 0 : 1
  const lastStep    = 4
  const isLastStep  = step === lastStep

  // Indicator items: only show steps that are part of this flow
  const stepDefs = [
    { key: 0, label: t.finances.freedomStepGoal },
    { key: 1, label: t.finances.freedomStepInfo },
    { key: 2, label: t.finances.freedomStepStarting },
    { key: 3, label: t.finances.freedomStepTarget },
    { key: 4, label: t.finances.freedomStepStrategy },
  ].filter(s => s.key >= firstStep)

  const fmtCur = (n: number) =>
    new Intl.NumberFormat(intlLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {stepDefs.map((s, idx) => (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s.key === step
                  ? 'bg-[#0D0D0D] text-white shadow-sm'
                  : s.key < step
                  ? 'bg-[#0D0D0D]/20 text-[#0D0D0D]'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {s.key < step ? '✓' : idx + 1}
              </div>
              <span className={`text-[10px] mt-0.5 hidden sm:block max-w-[60px] text-center leading-tight ${
                s.key === step ? 'text-[#0D0D0D] font-semibold' : 'text-gray-400'
              }`}>{s.label}</span>
            </div>
            {idx < stepDefs.length - 1 && (
              <div className={`h-px w-6 mx-1 mb-3 sm:mb-0 transition-colors ${s.key < step ? 'bg-[#0D0D0D]/30' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ─── Step 0: Goal type (new plans only) ─── */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{t.finances.freedomStepGoal} — {t.finances.freedomStepGoalDesc}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { mode: 'capital' as const, emoji: '🏦', title: t.finances.freedomGoalCardCapitalTitle, desc: t.finances.freedomGoalCardCapitalDesc },
              { mode: 'income'  as const, emoji: '💰', title: t.finances.freedomGoalCardIncomeTitle,  desc: t.finances.freedomGoalCardIncomeDesc  },
            ]).map(({ mode, emoji, title, desc }) => (
              <button
                key={mode}
                type="button"
                onClick={() => { setGoalMode(mode); setStep(1) }}
                className={`p-5 rounded-2xl border-2 text-left transition-all hover:shadow-md ${
                  goalMode === mode
                    ? 'border-[#0D0D0D] bg-[#0D0D0D]/5 shadow-sm'
                    : 'border-gray-200 hover:border-[#0D0D0D]/40'
                }`}
              >
                <div className="text-3xl mb-3">{emoji}</div>
                <div className="font-semibold text-gray-900 mb-1">{title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 1: Info (name, currency, start date) ─── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t.common.name}</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className={fieldCls}
              placeholder="Plano Mai/2026"
            />
          </div>
          <div>
            <label className={labelCls}>{t.finances.freedomCurrency}</label>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5 w-fit">
              {['EUR', 'BRL', 'USD'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCurrencyChange(c)}
                  className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                    currency === c
                      ? 'bg-white text-[#0D0D0D] shadow-sm'
                      : 'text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{t.finances.freedomCurrencyHint}</p>
          </div>
          <div>
            <label className={labelCls}>{t.finances.freedomPlanStartDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={`${fieldCls} max-w-[200px]`}
            />
          </div>
        </div>
      )}

      {/* ─── Step 2: Initial capital ─── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t.finances.freedomStepStarting} — {t.finances.freedomStepStartingDesc}</p>
          <div>
            <label className={labelCls}>{t.finances.freedomCapital} ({currency})</label>
            {isNew && Number(portfolioSuggestion) > 0 && (
              <div className="mb-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  {t.finances.freedomCapitalHint}:&nbsp;
                  <strong className="text-[#0D0D0D]">{fmtCur(Number(portfolioSuggestion))}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCapital(portfolioSuggestion)}
                  className="text-xs text-[#0D0D0D] font-semibold hover:opacity-70 transition-opacity ml-3 whitespace-nowrap"
                >
                  {t.finances.freedomUseThisValue}
                </button>
              </div>
            )}
            <input
              autoFocus
              type="number"
              value={capital}
              onChange={e => setCapital(e.target.value)}
              className={fieldCls}
              placeholder="50000"
            />
            <p className="text-[11px] text-gray-400 mt-1">{t.finances.freedomCapitalInclude}</p>
          </div>
        </div>
      )}

      {/* ─── Step 3: Target ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {goalMode === 'capital' ? t.finances.freedomTargetCapitalDesc : t.finances.freedomTargetIncomeDesc}
          </p>

          {goalMode === 'capital' ? (
            <div>
              <label className={labelCls}>{t.finances.freedomGoal} ({currency})</label>
              <input
                autoFocus
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                className={fieldCls}
                placeholder="1000000"
              />
              <p className="text-[11px] text-gray-400 mt-1 leading-snug">{t.finances.freedomCapitalNominalHint}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t.finances.freedomDesiredIncome} ({currency})</label>
                  <input
                    autoFocus
                    type="number"
                    value={desiredIncome}
                    onChange={e => setDesiredIncome(e.target.value)}
                    className={fieldCls}
                    placeholder="5000"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t.finances.freedomInflation}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={inflation}
                    onChange={e => setInflation(e.target.value)}
                    className={fieldCls}
                    placeholder="2"
                  />
                  {ipcaAnnual != null && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      {t.finances.freedomIpcaLabel}&nbsp;
                      <button type="button" onClick={() => setInflation(String(ipcaAnnual))} className="text-[#0D0D0D] underline underline-offset-2 hover:opacity-70 transition-opacity">
                        {ipcaAnnual}%
                      </button>
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">{t.finances.freedomDesiredIncomeHint}</p>
              {computedTarget != null && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-gray-500">{t.finances.freedomComputedGoal}</p>
                  <p className="text-xl font-bold text-[#0D0D0D]">{fmtCur(computedTarget)}</p>
                  <p className="text-[10px] text-gray-500">
                    {t.finances.freedomNominalInYear} {horizonInputYears || 20} {t.finances.freedomAgeAtTarget}:&nbsp;
                    <strong>{fmtCur(Math.round(parseFloat(desiredIncome || '0') * Math.pow(1 + parseFloat(inflation || '2') / 100, horizonInputYears || 20)))}{t.finances.freedomPerMonth}</strong>
                    &nbsp;— {t.finances.freedomRealToday}: <strong>{fmtCur(parseFloat(desiredIncome || '0'))}{t.finances.freedomPerMonth}</strong>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Step 4: Strategy ─── */}
      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t.finances.freedomHowToGetThere}</p>

          {/* Strategy mode toggle */}
          <div className="flex gap-2">
            {([
              { mode: 'fixHorizon' as const, label: t.finances.freedomFixHorizonMode },
              { mode: 'fixContrib' as const, label: t.finances.freedomFixContribMode },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setStratMode(mode)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                  stratMode === mode
                    ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Contribution field */}
            <div>
              <label className={labelCls}>{t.finances.freedomContrib} {t.finances.freedomPerMonth} ({currency})</label>
              {stratMode === 'fixContrib' ? (
                <input
                  autoFocus
                  type="number"
                  value={contrib}
                  onChange={e => setContrib(e.target.value)}
                  className={fieldCls}
                  placeholder="1000"
                />
              ) : (
                <div className={`${fieldCls} bg-gray-50 text-gray-700 flex items-center gap-1`}>
                  <span>{calculatedContrib != null ? fmtCur(calculatedContrib) : '—'}</span>
                  <span className="text-[10px] text-gray-400 ml-1">{t.finances.freedomCalcLabel}</span>
                </div>
              )}
            </div>
            {/* Rate field — always editable */}
            <div>
              <label className={labelCls}>{t.finances.freedomRate} % {t.finances.freedomPerMonth}</label>
              <input
                type="number"
                step="0.01"
                value={rate}
                onChange={e => setRate(e.target.value)}
                className={fieldCls}
                placeholder="0.60"
              />
              {annualRatePct != null && (
                <p className="text-[11px] text-gray-400 mt-1">
                  ≈ <strong className="text-gray-600">{annualRatePct}% {t.finances.freedomRateAnnual}</strong>
                </p>
              )}
            </div>
          </div>

          {/* Horizon field with age/years toggle */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className={`${labelCls} mb-0`}>{t.finances.freedomHorizon} ({t.finances.freedomAgeAtTarget})</label>
              {birthdate && (
                <button
                  type="button"
                  onClick={() => {
                    if (!ageMode && currentAge != null) setTargetAge(String(currentAge + (parseInt(horizon) || 20)))
                    setAgeMode(v => !v)
                  }}
                  className="text-[10px] text-[#0D0D0D] hover:underline"
                >
                  {ageMode ? t.finances.freedomSwitchToYears : t.finances.freedomSwitchToAge}
                </button>
              )}
            </div>

            {ageMode && birthdate ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">{t.finances.freedomTargetAge}</p>
                  {stratMode === 'fixHorizon' ? (
                    <input
                      autoFocus
                      type="number"
                      value={targetAge}
                      onChange={e => setTargetAge(e.target.value)}
                      className={fieldCls}
                      placeholder={String((currentAge ?? 30) + 20)}
                    />
                  ) : (
                    <div className={`${fieldCls} bg-gray-50 text-gray-700 flex items-center gap-1`}>
                      <span>{calculatedHorizonYears != null && currentAge != null ? Math.round(currentAge + calculatedHorizonYears) : '—'}</span>
                      <span className="text-[10px] text-gray-400 ml-1">{t.finances.freedomCalcLabel}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">{t.finances.freedomAgeAtTarget}</p>
                  <div className={`${fieldCls} bg-gray-50 text-gray-500`}>
                    {stratMode === 'fixHorizon' && targetAge && currentAge != null
                      ? `${Math.max(0, parseInt(targetAge) - currentAge)} ${t.finances.freedomAgeAtTarget}`
                      : calculatedHorizonYears != null
                      ? `${Math.round(calculatedHorizonYears)} ${t.finances.freedomAgeAtTarget}`
                      : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {stratMode === 'fixHorizon' ? (
                  <input
                    type="number"
                    value={horizon}
                    onChange={e => setHorizon(e.target.value)}
                    className={`${fieldCls} max-w-[140px]`}
                    placeholder="20"
                  />
                ) : (
                  <div className={`${fieldCls} max-w-[200px] bg-gray-50 text-gray-700 flex items-center gap-1`}>
                    <span>{calculatedHorizonYears != null ? `${Math.round(calculatedHorizonYears * 10) / 10} ${t.finances.freedomAgeAtTarget}` : '—'}</span>
                    <span className="text-[10px] text-gray-400 ml-1">{t.finances.freedomCalcLabel}</span>
                  </div>
                )}
                {targetDate && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t.finances.freedomMetaEm} <strong>{targetDate}</strong>
                    {birthdate && targetDateISO && (
                      <span className="ml-1.5">· {ageAtDate(birthdate, targetDateISO)} {t.finances.freedomYearsOld}</span>
                    )}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            {t.finances.freedomAdvanced}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4 pl-3 border-l-2 border-gray-100">
              <div>
                <label className={labelCls}>{t.finances.freedomIncomeRate} % {t.finances.freedomPerMonth}</label>
                <input
                  type="number"
                  step="0.01"
                  value={incomeRate}
                  onChange={e => setIncomeRate(e.target.value)}
                  className={fieldCls}
                  placeholder="0.50"
                />
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">{t.finances.freedomIncomeRateHint}</p>
              </div>
              <div>
                <label className={labelCls}>{t.finances.freedomNotes}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={fieldCls} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Navigation ─── */}
      {step > 0 && (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors"
          >
            ← {t.finances.freedomBack}
          </button>

          <button
            type="button"
            onClick={isLastStep ? handleSave : () => setStep(s => s + 1)}
            disabled={saving}
            className="flex-1 bg-[#0D0D0D] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {saving ? '…' : isLastStep ? t.common.save : `${t.finances.freedomNext} →`}
          </button>

          {step === firstStep && (
            <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              {t.common.cancel}
            </button>
          )}

          {onDelete && isLastStep && (
            <button
              type="button"
              onClick={onDelete}
              className="text-sm text-red-400 hover:text-red-600 transition-colors"
            >
              {t.common.delete}
            </button>
          )}
        </div>
      )}
    </div>
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
  const { t, locale } = useI18n()
  const intlLocale = ({ pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' } as Record<string, string>)[locale] ?? 'pt-BR'

  const [plans,        setPlans]        = useState<FreedomPlan[]>([])
  const [perf,         setPerf]         = useState<MonthlyPerf[]>([])
  const [portfolio,    setPortfolio]    = useState<PortfolioValue | null>(null)
  const [ipcaM12,      setIpcaM12]      = useState<number | null>(null)
  const [userBirthdate, setUserBirthdate] = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [perfLoading,  setPerfLoading]  = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editingPlan,  setEditingPlan]  = useState<FreedomPlan | null>(null)
  const [saving,       setSaving]       = useState(false)

  const activePlan = plans.find(p => p.is_active) ?? plans[0] ?? null

  const loadPerf = useCallback(async () => {
    setPerfLoading(true)
    try {
      const now = currentMonth()
      const monthlyData = await apiFetch<{ monthly: MonthlyPerf[] }>(`/performance/monthly?from=2020-01&to=${now}`)
      setPerf(monthlyData.monthly ?? [])
    } catch {
      // ignore
    } finally {
      setPerfLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plansData, portfolioData, profileData] = await Promise.all([
        apiFetch<FreedomPlan[]>('/finances/freedom-plans'),
        apiFetch<PortfolioValue>('/portfolio/value'),
        apiFetch<{ birthdate?: string }>('/profile'),
      ])
      setPlans(plansData)
      setPortfolio(portfolioData)
      if (profileData.birthdate) setUserBirthdate(profileData.birthdate)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
    // Non-blocking: fetch indices separately (slow external APIs)
    apiFetch<{ code: string; m12_pct: number | null }[]>('/indices')
      .then(indicesData => {
        const ipca = indicesData.find(i => i.code === 'IPCA')
        if (ipca?.m12_pct != null) setIpcaM12(Math.round(ipca.m12_pct * 10) / 10)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    loadPerf()
  }, [load, loadPerf])

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
    if (!confirm(t.finances.freedomDeleteConfirm)) return
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

  // Real (today's purchasing power) passive income, deflated by estimated annual inflation
  const passiveIncomeReal = (() => {
    if (!activePlan || passiveIncome === 0) return null
    const inflationRate = activePlan.currency === 'BRL'
      ? (ipcaM12 ?? 5) / 100
      : 0.02
    const years = activePlan.horizon_years
    return Math.round(passiveIncome / Math.pow(1 + inflationRate, years))
  })()

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

  // Forecast when target will be reached based on CURRENT actual value.
  // Starts from today's portfolio and applies plan's return rate + contribution.
  const reachMonth = (() => {
    if (!activePlan || currentValue <= 0) return null
    if (currentValue >= activePlan.target_amount) return currentMonth()
    const now = currentMonth()
    const maxSearch = activePlan.horizon_years * 3 * 12 // search up to 3× horizon
    let w = currentValue
    for (let i = 1; i <= maxSearch; i++) {
      w = w * (1 + activePlan.monthly_return_rate) + activePlan.monthly_contribution
      if (w >= activePlan.target_amount) return addMonths(now, i)
    }
    return null
  })()

  // Years from TODAY until the forecast date (positive = future, negative = past)
  const reachYearsFromNow = reachMonth
    ? Math.round(monthsBetween(currentMonth(), reachMonth) / 12 * 10) / 10
    : null

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
          <h1 style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{t.finances.freedomTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.finances.freedomSubtitle}</p>
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
            className="px-3 py-1.5 bg-[#0D0D0D] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
          >
            + {t.finances.freedomNewPlan}
          </button>
        </div>
      </div>

      {/* Plan selector */}
      {plans.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {plans.map(p => (
            <button
              key={p.id}
              onClick={() => !p.is_active && setActive(p.id)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                p.is_active
                  ? 'bg-[#0D0D0D] text-white border-[#0D0D0D] cursor-default'
                  : 'border-gray-200 text-gray-500 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
              }`}
            >
              {p.name}
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
            className="px-5 py-2 bg-[#0D0D0D] text-white text-sm rounded-xl hover:opacity-80 transition-opacity"
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
            birthdate={userBirthdate}
            onSave={savePlan}
            onDelete={editingPlan ? () => deletePlan(editingPlan.id) : undefined}
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
              <p className="text-[10px] text-gray-400 mt-0.5">{t.finances.freedomActualNow}</p>
            </div>
            <div className={`rounded-xl border shadow-sm p-4 ${planStatusText?.ahead ? 'bg-emerald-50 border-emerald-100' : planStatusText ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomPlannedToday}</p>
              <p className="text-lg font-bold text-gray-900">{fmt(plannedAtCurrentMonth, currency, true)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{t.finances.freedomAccordingToPlan}</p>
            </div>
          </div>
          {/* Summary cards — row 2: goal metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomGoal}</p>
              <p className="text-base font-bold text-[#0D0D0D]">{fmt(activePlan!.target_amount, currency, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomPassive} {t.finances.freedomPerMonth}</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-base font-bold text-emerald-600">{fmt(passiveIncome, currency, true)}</p>
                {passiveIncomeReal != null && passiveIncomeReal !== passiveIncome && (
                  <p className="text-sm font-semibold text-emerald-500">≈ {fmt(passiveIncomeReal, currency, true)} {t.finances.freedomRealToday}</p>
                )}
              </div>
              <p className="text-[10px] text-gray-400">{(activePlan!.monthly_income_rate * 100).toFixed(1)}% {t.finances.freedomIncomeNominalTag}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-500 mb-1">{t.finances.freedomTarget}</p>
              {reachMonth ? (
                <p className="text-base font-bold text-gray-900">
                  {new Date(reachMonth + '-01').toLocaleDateString(intlLocale, { month: 'short', year: 'numeric' })}
                </p>
              ) : (
                <p className="text-base font-bold text-gray-400">—</p>
              )}
              <p className="text-[10px] text-gray-400">
                {reachYearsFromNow != null && `${t.finances.freedomIn} ${reachYearsFromNow} ${t.finances.freedomAgeAtTarget}`}
                {userBirthdate && reachMonth && ` · ${ageAtDate(userBirthdate, reachMonth + '-01')} ${t.finances.freedomAgeAtTarget}`}
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5">{t.finances.freedomBasedOnCurrent}</p>
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
                <strong>{fmt(Math.abs(planStatusText.diff), currency, true, intlLocale)}</strong>
                &nbsp;({planStatusText.ahead ? '+' : ''}{planStatusText.pct}% {t.finances.freedomVsPlanned})
              </span>
            </div>
          )}

          {/* Chart */}
          {perfLoading && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-center h-40">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[#0D0D0D] border-t-transparent" />
            </div>
          )}
          {!perfLoading && chartData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">{t.finances.freedomChartTitle}</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <XAxis
                    dataKey="month"
                    tickFormatter={m => fmtMonth(m, intlLocale)}
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
                    stroke="#C8B89A"
                    strokeDasharray="4 2"
                    label={{ value: t.finances.freedomGoal, position: 'insideTopRight', fontSize: 10, fill: '#C8B89A' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="planned"
                    name={t.finances.freedomPlanned}
                    stroke="#0D0D0D"
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
                { label: `${t.finances.freedomContrib} ${t.finances.freedomPerMonth}`, value: fmt(activePlan!.monthly_contribution, currency, false, intlLocale) },
                { label: `${t.finances.freedomRate} ${t.finances.freedomPerMonth}`, value: (activePlan!.monthly_return_rate * 100).toFixed(2) + '%' },
                { label: `${t.finances.freedomIncomeRate} ${t.finances.freedomPerMonth}`, value: (activePlan!.monthly_income_rate * 100).toFixed(2) + '%' },
                { label: t.finances.freedomHorizon, value: `${activePlan!.horizon_years} ${t.finances.freedomAgeAtTarget}` },
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
