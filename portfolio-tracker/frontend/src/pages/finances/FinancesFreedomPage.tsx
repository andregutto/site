import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Legend,
} from 'recharts'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { Icon } from '../../components/icons'
import { CHART_AXIS_TICK, CHART_AXIS_LINE, formatCompactCurrency } from '../../components/charts'

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
  goal_mode?: 'capital' | 'income'
  desired_income?: number | null
  income_inflation_pct?: number | null
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
  plannedExtra: number | null
  actual: number | null
  contributed: number | null
}

function _fmt(n: number, currency: string, compact = false, locale = 'pt-BR') {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: 0, maximumFractionDigits: compact ? 1 : 0,
  }).format(n)
}

const kpiLabelStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--arvo-fg-soft)',
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

// Build contributed trajectory: cumulative capital + contributions, no interest applied.
// Used to contrast against `planned` so the gap between the two reads as compound interest at work.
function buildContributed(
  initial: number,
  monthlyContrib: number,
  horizonMonths: number,
  startMonth: string,
): { month: string; value: number }[] {
  const result: { month: string; value: number }[] = []
  let w = initial
  for (let i = 0; i <= horizonMonths; i++) {
    result.push({ month: addMonths(startMonth, i), value: Math.round(w) })
    w = w + monthlyContrib
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
  hicpAnnual?: number | null
  cpiAnnual?: number | null
  userCountry?: string | null
  birthdate?: string | null
  onSave: (data: Omit<FreedomPlan, 'id' | 'is_active' | 'created_at'>) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
  saving: boolean
}

function PlanForm({ initial, portfolio, ipcaAnnual, hicpAnnual, cpiAnnual, userCountry, birthdate, onSave, onDelete, onCancel, saving }: PlanFormProps) {
  const { t, locale } = useI18n()
  const intlLocale = ({ pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' } as Record<string, string>)[locale] ?? 'pt-BR'
  const isNew = !initial.id
  const rates = deriveRates(portfolio)

  const currentAge = birthdate
    ? Math.floor((Date.now() - new Date(birthdate + 'T00:00:00').getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null

  // step: 0=goal, 1=info, 2=capital, 3=target+strategy (merged) — same flow for new and edit
  const [step, setStep]           = useState(0)
  const [goalMode, setGoalMode]   = useState<'capital' | 'income'>(initial.goal_mode ?? 'capital')
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
  const [desiredIncome, setDesiredIncome] = useState(
    initial.desired_income != null ? String(initial.desired_income) : ''
  )
  const [inflation, setInflation] = useState(() => {
    if (initial.income_inflation_pct != null) return String(initial.income_inflation_pct)
    if (initial.id) return '2'
    const country = (userCountry ?? '').toUpperCase()
    if (country === 'BR' && ipcaAnnual != null) return String(ipcaAnnual)
    if ((country === 'FR' || country === 'DE' || country === 'NL' || country === 'BE' || country === 'ES') && hicpAnnual != null) return String(hicpAnnual)
    if (country === 'US' && cpiAnnual != null) return String(cpiAnnual)
    if (country === 'BR' && (initial.currency ?? 'EUR') === 'BRL' && ipcaAnnual != null) return String(ipcaAnnual)
    return '2'
  })
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

  // Live preview data for the step-3 chart: recomputed on every keystroke from
  // the current form state, mirroring the main dashboard chart's planned/contributed logic.
  const previewEffectiveContrib = stratMode === 'fixHorizon' && calculatedContrib != null
    ? calculatedContrib
    : parseFloat(contrib) || 0
  const previewData = (() => {
    const C = parseFloat(capital) || 0
    const r = (parseFloat(rate) || 0) / 100
    const n = Math.max(1, horizonMonths || 1)
    const planned = buildPlanned(C, previewEffectiveContrib, r, n, startDate.slice(0, 7) || currentMonth())
    const contributed = buildContributed(C, previewEffectiveContrib, n, startDate.slice(0, 7) || currentMonth())
    return planned.map((p, i) => ({ month: p.month, planned: p.value, contributed: contributed[i]?.value ?? null }))
  })()
  const previewTarget = parseFloat(effectiveTarget) || 0

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
      goal_mode: goalMode,
      desired_income: goalMode === 'income' && desiredIncome ? parseFloat(desiredIncome) : null,
      income_inflation_pct: goalMode === 'income' && inflation ? parseFloat(inflation) : null,
    })
  }

  const fieldCls = 'w-full border border-[var(--arvo-border)] rounded-[3px] px-3 py-2 text-sm bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:border-[var(--arvo-gold)] focus:ring-2 focus:ring-[var(--arvo-gold)]/25'
  const labelCls = 'block text-xs text-[var(--arvo-fg-muted)] mb-1'

  // Steps 0=goal, 1=info, 2=capital, 3=target+strategy (merged) — same flow for new and edit
  const firstStep   = 0
  const lastStep    = 3
  const isLastStep  = step === lastStep

  // Indicator items: only show steps that are part of this flow
  const stepDefs = [
    { key: 0, label: t.finances.freedomStepGoal },
    { key: 1, label: t.finances.freedomStepInfo },
    { key: 2, label: t.finances.freedomStepStarting },
    { key: 3, label: t.finances.freedomStepTarget },
  ].filter(s => s.key >= firstStep)

  const fmtCur = (n: number) =>
    new Intl.NumberFormat(intlLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {stepDefs.map((s, idx) => (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s.key === step
                  ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] shadow-sm'
                  : s.key < step
                  ? 'bg-[var(--arvo-fg)]/20 text-[var(--arvo-fg)]'
                  : 'bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-soft)]'
              }`}>
                {s.key < step ? '✓' : idx + 1}
              </div>
              <span className={`text-[10px] mt-0.5 hidden sm:block max-w-[60px] text-center leading-tight ${
                s.key === step ? 'text-[var(--arvo-fg)] font-semibold' : 'text-[var(--arvo-fg-soft)]'
              }`}>{s.label}</span>
            </div>
            {idx < stepDefs.length - 1 && (
              <div className={`h-px w-6 mx-1 mb-3 sm:mb-0 transition-colors ${s.key < step ? 'bg-[var(--arvo-fg)]/30' : 'bg-[var(--arvo-track-bg)]'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ─── Step 0: Goal type (new plans only) ─── */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--arvo-fg-muted)]">{t.finances.freedomStepGoal} — {t.finances.freedomStepGoalDesc}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { mode: 'capital' as const, emoji: '🏦', title: t.finances.freedomGoalCardCapitalTitle, desc: t.finances.freedomGoalCardCapitalDesc },
              { mode: 'income'  as const, emoji: '💰', title: t.finances.freedomGoalCardIncomeTitle,  desc: t.finances.freedomGoalCardIncomeDesc  },
            ]).map(({ mode, emoji, title, desc }) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  // Switching from 'income' to 'capital': carry over the currently
                  // computed target as the starting value instead of leaving it stale/blank.
                  if (mode === 'capital' && goalMode === 'income' && computedTarget != null) {
                    setTarget(String(computedTarget))
                  }
                  setGoalMode(mode)
                  setStep(1)
                }}
                className={`p-5 rounded-2xl border-2 text-left transition-all hover:shadow-md ${
                  goalMode === mode
                    ? 'border-[var(--arvo-fg)] bg-[var(--arvo-fg)]/5 shadow-sm'
                    : 'border-[var(--arvo-border)] hover:border-[var(--arvo-fg)]/40'
                }`}
              >
                <div className="text-3xl mb-3">{emoji}</div>
                <div className="font-semibold text-[var(--arvo-fg)] mb-1">{title}</div>
                <div className="text-xs text-[var(--arvo-fg-muted)] leading-relaxed">{desc}</div>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-1">
            <button type="button" onClick={onCancel} className="text-sm text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors">
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
            <div className="flex items-center bg-[var(--arvo-track-bg)] rounded-lg p-0.5 gap-0.5 w-fit">
              {['EUR', 'BRL', 'USD'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCurrencyChange(c)}
                  className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                    currency === c
                      ? 'bg-[var(--arvo-surface)] text-[var(--arvo-fg)] shadow-sm'
                      : 'text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--arvo-fg-soft)] mt-1">{t.finances.freedomCurrencyHint}</p>
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
          <p className="text-sm text-[var(--arvo-fg-muted)]">{t.finances.freedomStepStarting} — {t.finances.freedomStepStartingDesc}</p>
          <div>
            <label className={labelCls}>{t.finances.freedomCapital} ({currency})</label>
            {isNew && Number(portfolioSuggestion) > 0 && (
              <div className="mb-2 rounded-lg px-3 py-2.5 flex items-center justify-between" style={{ background: 'var(--arvo-surface-2)', border: '1px solid var(--arvo-border)' }}>
                <span className="text-xs text-[var(--arvo-fg-muted)]">
                  {t.finances.freedomCapitalHint}:&nbsp;
                  <strong className="text-[var(--arvo-fg)]">{fmtCur(Number(portfolioSuggestion))}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCapital(portfolioSuggestion)}
                  className="text-xs text-[var(--arvo-fg)] font-semibold hover:opacity-70 transition-opacity ml-3 whitespace-nowrap"
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
            <p className="text-[11px] text-[var(--arvo-fg-soft)] mt-1">{t.finances.freedomCapitalInclude}</p>
          </div>
        </div>
      )}

      {/* ─── Step 3: Target ─── */}
      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--arvo-fg-muted)]">
            {goalMode === 'capital' ? t.finances.freedomTargetCapitalDesc : t.finances.freedomTargetIncomeDesc}
          </p>

          {/* Live preview chart — updates as capital/contribution/rate/horizon change below */}
          <div className="rounded-2xl border border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] p-3">
            <h4 className="text-xs font-semibold text-[var(--arvo-fg-muted)] mb-2">{t.finances.freedomPreviewChartTitle}</h4>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={previewData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="previewPlannedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--arvo-blue)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="var(--arvo-blue)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="previewContributedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--arvo-terracotta)" stopOpacity={0.20} />
                    <stop offset="100%" stopColor="var(--arvo-terracotta)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tickFormatter={m => fmtMonth(m, intlLocale)} tick={{ ...CHART_AXIS_TICK, fontSize: 10, fill: 'var(--arvo-fg-muted)' }} axisLine={CHART_AXIS_LINE} tickLine={false} interval={Math.floor(previewData.length / 6)} />
                <YAxis tickFormatter={v => formatCompactCurrency(v, currency, intlLocale)} tick={{ ...CHART_AXIS_TICK, fontSize: 10, fill: 'var(--arvo-fg-muted)' }} axisLine={CHART_AXIS_LINE} tickLine={false} width={56} />
                <Tooltip content={<ChartTooltip currency={currency} locale={intlLocale} />} />
                {previewTarget > 0 && (
                  <ReferenceLine y={previewTarget} stroke="var(--arvo-gold)" strokeDasharray="4 2" label={{ value: t.finances.freedomGoal, position: 'insideTopRight', fontSize: 9, fill: 'var(--arvo-gold-text)' }} />
                )}
                <Area type="monotone" dataKey="contributed" stroke="none" fill="url(#previewContributedGradient)" connectNulls legendType="none" tooltipType="none" />
                <Area type="monotone" dataKey="planned" stroke="none" fill="url(#previewPlannedGradient)" connectNulls legendType="none" tooltipType="none" />
                <Line type="monotone" dataKey="contributed" name={t.finances.freedomContributed} stroke="var(--arvo-terracotta)" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="planned" name={t.finances.freedomPlanned} stroke="var(--arvo-fg)" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

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
              <p className="text-[11px] text-[var(--arvo-fg-soft)] mt-1 leading-snug">{t.finances.freedomCapitalNominalHint}</p>
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
                  <div className="mt-1.5 space-y-1">
                    <p className="text-[11px] text-[var(--arvo-fg-soft)]">{t.finances.freedomInflationRef}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ipcaAnnual != null && (
                        <button type="button" onClick={() => setInflation(String(ipcaAnnual))}
                          className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:bg-[var(--arvo-fg)] hover:text-[var(--arvo-pill-active-fg)]"
                          style={{ background: 'var(--arvo-track-bg)', color: 'var(--arvo-fg-muted)', borderColor: 'var(--arvo-border)' }}>
                          {t.finances.freedomInflationIpca}: {ipcaAnnual}%
                        </button>
                      )}
                      {hicpAnnual != null && (
                        <button type="button" onClick={() => setInflation(String(hicpAnnual))}
                          className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:bg-[var(--arvo-fg)] hover:text-[var(--arvo-pill-active-fg)]"
                          style={{ background: 'var(--arvo-track-bg)', color: 'var(--arvo-fg-muted)', borderColor: 'var(--arvo-border)' }}>
                          {t.finances.freedomInflationHicp}: {hicpAnnual}%
                        </button>
                      )}
                      {cpiAnnual != null && (
                        <button type="button" onClick={() => setInflation(String(cpiAnnual))}
                          className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:bg-[var(--arvo-fg)] hover:text-[var(--arvo-pill-active-fg)]"
                          style={{ background: 'var(--arvo-track-bg)', color: 'var(--arvo-fg-muted)', borderColor: 'var(--arvo-border)' }}>
                          {t.finances.freedomInflationCpi}: {cpiAnnual}%
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[var(--arvo-fg-soft)] leading-snug">{t.finances.freedomDesiredIncomeHint}</p>
              {computedTarget != null && (
                <div className="rounded-xl px-4 py-3 space-y-1" style={{ background: 'var(--arvo-surface-2)', border: '1px solid var(--arvo-gold)' }}>
                  <p className="text-xs text-[var(--arvo-fg-muted)]">{t.finances.freedomComputedGoal}</p>
                  <p className="text-xl font-bold text-[var(--arvo-fg)]">{fmtCur(computedTarget)}</p>
                  <p className="text-[10px] text-[var(--arvo-fg-muted)]">
                    {t.finances.freedomNominalInYear} {horizonInputYears || 20} {t.finances.freedomAgeAtTarget}:&nbsp;
                    <strong>{fmtCur(Math.round(parseFloat(desiredIncome || '0') * Math.pow(1 + parseFloat(inflation || '2') / 100, horizonInputYears || 20)))}{t.finances.freedomPerMonth}</strong>
                    &nbsp;— {t.finances.freedomRealToday}: <strong>{fmtCur(parseFloat(desiredIncome || '0'))}{t.finances.freedomPerMonth}</strong>
                  </p>
                  <p className="text-[10px] text-[var(--arvo-fg-soft)] leading-snug pt-1" style={{ borderTop: '1px solid var(--arvo-border-soft)' }}>
                    {t.finances.freedomComputedGoalLiveHint}
                  </p>
                </div>
              )}
            </div>
          )}

          <hr className="border-[var(--arvo-border)]" />

          <p className="text-sm text-[var(--arvo-fg-muted)]">{t.finances.freedomHowToGetThere}</p>

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
                    ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] border-[var(--arvo-fg)]'
                    : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] border-[var(--arvo-border)] hover:border-[var(--arvo-fg-faint)]'
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
                <div className={`${fieldCls} bg-[var(--arvo-surface-2)] text-[var(--arvo-fg)] flex items-center gap-1`}>
                  <span>{calculatedContrib != null ? fmtCur(calculatedContrib) : '—'}</span>
                  <span className="text-[10px] text-[var(--arvo-fg-soft)] ml-1">{t.finances.freedomCalcLabel}</span>
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
                <p className="text-[11px] text-[var(--arvo-fg-soft)] mt-1">
                  ≈ <strong className="text-[var(--arvo-fg-muted)]">{annualRatePct}% {t.finances.freedomRateAnnual}</strong>
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
                  className="text-[10px] text-[var(--arvo-fg)] hover:underline"
                >
                  {ageMode ? t.finances.freedomSwitchToYears : t.finances.freedomSwitchToAge}
                </button>
              )}
            </div>

            {ageMode && birthdate ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[var(--arvo-fg-soft)] mb-1">{t.finances.freedomTargetAge}</p>
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
                    <div className={`${fieldCls} bg-[var(--arvo-surface-2)] text-[var(--arvo-fg)] flex items-center gap-1`}>
                      <span>{calculatedHorizonYears != null && currentAge != null ? Math.round(currentAge + calculatedHorizonYears) : '—'}</span>
                      <span className="text-[10px] text-[var(--arvo-fg-soft)] ml-1">{t.finances.freedomCalcLabel}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[var(--arvo-fg-soft)] mb-1">{t.finances.freedomAgeAtTarget}</p>
                  <div className={`${fieldCls} bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)]`}>
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
                  <div className={`${fieldCls} max-w-[200px] bg-[var(--arvo-surface-2)] text-[var(--arvo-fg)] flex items-center gap-1`}>
                    <span>{calculatedHorizonYears != null ? `${Math.round(calculatedHorizonYears * 10) / 10} ${t.finances.freedomAgeAtTarget}` : '—'}</span>
                    <span className="text-[10px] text-[var(--arvo-fg-soft)] ml-1">{t.finances.freedomCalcLabel}</span>
                  </div>
                )}
                {targetDate && (
                  <p className="text-[11px] text-[var(--arvo-fg-soft)] mt-1">
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
            className="text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] flex items-center gap-1 transition-colors"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            {t.finances.freedomAdvanced}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4 pl-3 border-l-2 border-[var(--arvo-border)]">
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
                <p className="text-[11px] text-[var(--arvo-fg-soft)] mt-1 leading-snug">{t.finances.freedomIncomeRateHint}</p>
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
            className="px-4 py-2 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] border border-[var(--arvo-border)] rounded-lg transition-colors"
          >
            ← {t.finances.freedomBack}
          </button>

          <button
            type="button"
            onClick={isLastStep ? handleSave : () => setStep(s => s + 1)}
            disabled={saving}
            className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {saving ? '…' : isLastStep ? t.common.save : `${t.finances.freedomNext} →`}
          </button>

          <button type="button" onClick={onCancel} className="text-sm text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors">
            {t.common.cancel}
          </button>

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
function ChartTooltip({ active, payload, label, currency, locale = 'pt-BR' }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; currency: string; locale?: string
}) {
  const { hideValues } = useCurrency()
  const fmt = (n: number, cur: string, compact = false, loc = 'pt-BR') => hideValues ? '•••' : _fmt(n, cur, compact, loc)
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="text-[var(--arvo-fg-muted)] mb-1">{label}</p>
      {payload.map(p => p.value != null && (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value, currency, false, locale)}
        </p>
      ))}
    </div>
  )
}

export default function FinancesFreedomPage() {
  const { t, locale } = useI18n()
  const intlLocale = ({ pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' } as Record<string, string>)[locale] ?? 'pt-BR'
  const { currency: displayCurrency, convert, fxRates, hideValues, fmt: fmtBrl } = useCurrency()
  const fmt = (n: number, currency: string, compact = false, locale = 'pt-BR') => hideValues ? '•••' : _fmt(n, currency, compact, locale)

  const [plans,        setPlans]        = useState<FreedomPlan[]>([])
  const [perf,         setPerf]         = useState<MonthlyPerf[]>([])
  const [portfolio,    setPortfolio]    = useState<PortfolioValue | null>(null)
  const [ipcaM12,      setIpcaM12]      = useState<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hicpM12,      _setHicpM12]     = useState<number | null>(2.5)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [cpiM12,       _setCpiM12]      = useState<number | null>(3.0)
  const [userBirthdate, setUserBirthdate] = useState<string | null>(null)
  const [userCountry,  setUserCountry]  = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [perfLoading,  setPerfLoading]  = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [editingPlan,  setEditingPlan]  = useState<FreedomPlan | null>(null)
  const [saving,       setSaving]       = useState(false)

  const activePlan = plans.find(p => p.is_active) ?? plans[0] ?? null

  const loadPerf = useCallback(async (from: string) => {
    setPerfLoading(true)
    try {
      const now = currentMonth()
      const monthlyData = await apiFetch<{ monthly: MonthlyPerf[] }>(`/performance/monthly?from=${from}&to=${now}`)
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
        apiFetch<{ birthdate?: string; country?: string }>('/profile'),
      ])
      setPlans(plansData)
      setPortfolio(portfolioData)
      if (profileData.birthdate) setUserBirthdate(profileData.birthdate)
      if (profileData.country) setUserCountry(profileData.country)
      // Only fetch as much monthly history as the chart can actually use
      // (plan start − 1 year of lead-in) instead of a fixed 2020-01 floor —
      // shrinks the payload a lot for accounts with many years of history.
      const active = plansData.find(p => p.is_active) ?? plansData[0] ?? null
      const start = active ? (active.start_date?.slice(0, 7) ?? active.created_at.slice(0, 7)) : currentMonth()
      loadPerf(addMonths(start, -12))
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
  }, [loadPerf])

  useEffect(() => {
    load()
  }, [load])

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
    const planEnd = addMonths(planStart, horizonMonths)
    // Lead in up to 1 year of real history before the plan started, so the
    // trajectory reads as "where you came from" instead of starting cold.
    const chartStart = addMonths(planStart, -12)
    // Extrapolate a few years past the committed horizon so users can see
    // what continuing the same contribution/rate looks like beyond the goal.
    const extraMonths = Math.min(60, Math.max(24, Math.round(horizonMonths * 0.25)))
    const chartEnd = addMonths(planEnd, extraMonths)

    // Build planned trajectory (initial capital → committed horizon → extrapolated tail)
    const planned = buildPlanned(
      activePlan.initial_capital,
      activePlan.monthly_contribution,
      activePlan.monthly_return_rate,
      horizonMonths + extraMonths,
      planStart,
    )
    const plannedMap = new Map(planned.map(p => [p.month, p.value]))

    // Cumulative contributions (no interest) — the gap to `planned` visualizes compound interest at work.
    const contributed = buildContributed(
      activePlan.initial_capital,
      activePlan.monthly_contribution,
      horizonMonths + extraMonths,
      planStart,
    )
    const contributedMap = new Map(contributed.map(p => [p.month, p.value]))

    // Generate all months from chartStart to chartEnd
    let m = chartStart
    while (m <= chartEnd) {
      const isPast = m < planStart
      const isExtra = m > planEnd
      chartData.push({
        month: m,
        planned: isPast ? null : (isExtra ? null : plannedMap.get(m) ?? null),
        // Extrapolated tail carries the same value as `planned` at planEnd so the two lines join seamlessly.
        plannedExtra: (isExtra || m === planEnd) && !isPast ? plannedMap.get(m) ?? null : null,
        actual: actualMap.get(m) ?? null,
        contributed: isPast ? null : (contributedMap.get(m) ?? null),
      })
      m = addMonths(m, 1)
    }
  }

  // Chart data converted to display currency
  const displayChartData = chartData.map(pt => ({
    ...pt,
    planned:      pt.planned      != null ? Math.round(cxFreedom(pt.planned))      : null,
    plannedExtra: pt.plannedExtra != null ? Math.round(cxFreedom(pt.plannedExtra)) : null,
    actual:       pt.actual       != null ? Math.round(cxFreedom(pt.actual))       : null,
    contributed:  pt.contributed  != null ? Math.round(cxFreedom(pt.contributed))  : null,
  }))

  // Summary cards — derived from the same fxRates the dashboard uses (via
  // portfolio.total_brl), instead of portfolio.total_eur/total_usd (which are
  // baked in by the portfolio API's own FX snapshot and can drift from the
  // live rate here), so the headline number always matches the dashboard.
  const currentValue = (() => {
    if (!activePlan || !portfolio) return 0
    if (activePlan.currency === 'BRL') return portfolio.total_brl
    if (activePlan.currency === 'EUR') return portfolio.total_brl / fxRates.EUR
    return portfolio.total_brl / (fxRates.USD ?? 5.7)
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

  // Compare the live reforecast against the plan's originally committed horizon:
  // how many years earlier/later than the committed end date this reforecast lands.
  const scheduleDeltaYears = (() => {
    if (!activePlan || reachMonth == null) return null
    const committedEndMonth = addMonths(planStart, activePlan.horizon_years * 12)
    return Math.round(monthsBetween(reachMonth, committedEndMonth) / 12 * 10) / 10
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

  // Convert a value from activePlan.currency to BRL
  function planToBrl(value: number): number {
    const planCur = activePlan?.currency ?? 'EUR'
    if (planCur === 'BRL') return value
    if (planCur === 'EUR') return value * fxRates.EUR
    return value * (fxRates.USD ?? 5.7)
  }

  // Convert a value from activePlan.currency to the app display currency
  function cxFreedom(value: number): number {
    const planCur = activePlan?.currency ?? 'EUR'
    if (planCur === displayCurrency) return value
    return convert(planToBrl(value))
  }

  const targetBrl = activePlan ? planToBrl(activePlan.target_amount) : 0

  // "Ano-alvo" — fixed horizon end year (the plan's committed target date)
  const targetYear = activePlan
    ? parseInt(addMonths(planStart, activePlan.horizon_years * 12).slice(0, 4), 10)
    : null

  // "FIRE" milestone — last point of the trajectory (horizon end), at the goal value
  const fireMonth = activePlan ? addMonths(planStart, activePlan.horizon_years * 12) : null
  const fireValue = activePlan ? Math.round(cxFreedom(activePlan.target_amount)) : null

  if (loading) {
    return (
      <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-12 text-center text-[var(--arvo-fg-soft)] text-sm">
        {t.common.loading}
      </div>
    )
  }

  const planCurrency = activePlan?.currency ?? 'EUR'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Tenor Sans', serif", fontSize: 20, letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>{t.finances.freedomTitle}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-muted)' }}>{t.finances.freedomSubtitle}</p>
        </div>
        <div className="flex items-center gap-4">
          {activePlan && targetYear && (
            <div className="text-right">
              <p className="text-[10px] uppercase" style={{ letterSpacing: '0.18em', color: 'var(--arvo-fg-soft)' }}>{t.finances.freedomGoal}</p>
              <p className="arvo-accent-blue" style={{ fontFamily: "'Tenor Sans', serif", fontSize: 28, letterSpacing: '0.01em', lineHeight: 1, margin: '2px 0 0' }}>{targetYear}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {plans.length > 0 && (
              <button
                onClick={() => { setEditingPlan(activePlan); setShowForm(true) }}
                className="px-3 py-1.5 border border-[var(--arvo-border)] text-sm text-[var(--arvo-fg-muted)] rounded-lg hover:bg-[var(--arvo-surface-2)] transition-colors"
              >
                {t.common.edit}
              </button>
            )}
            <button
              onClick={() => { setEditingPlan(null); setShowForm(true) }}
              className="px-3 py-1.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm rounded-lg hover:opacity-80 transition-opacity"
            >
              + {t.finances.freedomNewPlan}
            </button>
          </div>
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
                  ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] border-[var(--arvo-fg)] cursor-default'
                  : 'border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)]'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {!activePlan && !showForm ? (
        /* Empty state */
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-12 text-center">
          <div className="flex justify-center mb-4 text-[var(--arvo-fg-soft)]"><Icon name="trophy" size={40} /></div>
          <p className="text-[var(--arvo-fg)] font-medium mb-1">{t.finances.freedomEmptyTitle}</p>
          <p className="text-sm text-[var(--arvo-fg-soft)] mb-5">{t.finances.freedomEmptyBody}</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm rounded-xl hover:opacity-80 transition-opacity"
          >
            {t.finances.freedomCreatePlan}
          </button>
        </div>
      ) : showForm ? (
        /* Plan form */
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6">
          <h3 className="font-semibold text-[var(--arvo-fg)] mb-4">
            {editingPlan ? t.finances.freedomEditPlan : t.finances.freedomNewPlan}
          </h3>
          <PlanForm
            initial={editingPlan ?? {}}
            portfolio={portfolio ?? { total_brl: 0, total_eur: null, total_usd: null }}
            ipcaAnnual={ipcaM12}
            hicpAnnual={hicpM12}
            cpiAnnual={cpiM12}
            userCountry={userCountry}
            birthdate={userBirthdate}
            onSave={savePlan}
            onDelete={editingPlan ? () => deletePlan(editingPlan.id) : undefined}
            onCancel={() => { setShowForm(false); setEditingPlan(null) }}
            saving={saving}
          />
        </div>
      ) : (
        <>
          {/* Hero: progress toward goal — same restrained gold treatment as the dashboard's ValueCards hero */}
          <div
            className="rounded-2xl p-5 sm:p-6"
            style={{
              background: 'var(--arvo-surface)',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(200,184,154,0.35)',
              boxShadow: '0 4px 24px rgba(200,184,154,0.18), 0 1px 0 rgba(200,184,154,0.22)',
            }}
          >
            {/* Gold glow — top-right, matching ValueCards */}
            <div style={{ position: 'absolute', top: -120, right: -60, width: 360, height: 360, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(70px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.65), transparent)', pointerEvents: 'none' }} />

            <div className="flex items-center gap-6 sm:gap-8 flex-wrap sm:flex-nowrap" style={{ position: 'relative', zIndex: 2 }}>
              {/* Progress ring */}
              {(() => {
                const pct = Math.min(100, Math.max(0, ((portfolio?.total_brl ?? 0) / (targetBrl || 1)) * 100))
                const size = 116, r = 46, c = 2 * Math.PI * r
                return (
                  <div className="relative shrink-0 mx-auto sm:mx-0" style={{ width: size, height: size }}>
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--arvo-track-bg)" strokeWidth={9} />
                      <circle
                        cx={size / 2} cy={size / 2} r={r} fill="none"
                        stroke="url(#freedomRingGradient)"
                        strokeWidth={9}
                        strokeLinecap="round"
                        strokeDasharray={c}
                        strokeDashoffset={c - (pct / 100) * c}
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                      />
                      <defs>
                        <linearGradient id="freedomRingGradient" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="var(--arvo-gold)" />
                          <stop offset="100%" stopColor="var(--arvo-blue)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                      <span className="arvo-num" style={{ fontFamily: "'Tenor Sans', serif", fontSize: 26, color: 'var(--arvo-fg)', lineHeight: 1 }}>
                        {Math.round(pct * 10) / 10}%
                      </span>
                      <span className="mt-1 leading-tight" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>{t.finances.freedomOfGoal}</span>
                    </div>
                  </div>
                )
              })()}

              <div className="flex-1 min-w-[220px] flex items-center gap-8 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)' }}>
                    <Icon name="wallet" size={16} />
                  </div>
                  <div>
                    <span style={kpiLabelStyle}>{t.finances.freedomActualNow}</span>
                    <p
                      className="arvo-num text-[26px] sm:text-[32px]"
                      style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.02em', lineHeight: 1.05, color: 'var(--arvo-fg)', margin: '4px 0 0' }}
                    >
                      {fmtBrl(portfolio?.total_brl ?? 0, 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--arvo-gold-soft, var(--arvo-surface))', border: '1px solid var(--arvo-gold)', color: 'var(--arvo-gold-text)' }}>
                    <Icon name="trophy" size={16} />
                  </div>
                  <div>
                    <span style={kpiLabelStyle}>{t.finances.freedomGoal}</span>
                    <p className="arvo-num text-lg sm:text-xl" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.02em', color: 'var(--arvo-fg)', margin: '4px 0 0' }}>
                      {fmtBrl(targetBrl, 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Supporting tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 mt-7 pt-6" style={{ borderTop: '1px solid var(--arvo-border)' }}>
              <div className="flex gap-2.5">
                <Icon name="coin" size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--arvo-green)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={kpiLabelStyle}>{t.finances.freedomPassive} {t.finances.freedomPerMonth}</span>
                  <span className="arvo-num arvo-delta-pos text-base sm:text-lg">{fmt(cxFreedom(passiveIncome), displayCurrency, true)}</span>
                  {passiveIncomeReal != null && passiveIncomeReal !== passiveIncome && (
                    <span className="arvo-num arvo-delta-pos text-xs">≈ {fmt(cxFreedom(passiveIncomeReal), displayCurrency, true)} {t.finances.freedomRealToday}</span>
                  )}
                  <span className="text-[11px]" style={{ color: 'var(--arvo-fg-muted)' }}>{(activePlan!.monthly_income_rate * 100).toFixed(1)}% {t.finances.freedomIncomeNominalTag}</span>
                </div>
              </div>

              <div className="flex gap-2.5 sm:border-l sm:pl-6" style={{ borderColor: 'var(--arvo-border)' }}>
                <Icon name="clock" size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--arvo-blue)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={kpiLabelStyle}>{t.finances.freedomTarget}</span>
                  {reachMonth ? (
                    <span className="arvo-num text-base sm:text-lg" style={{ fontWeight: 600, color: 'var(--arvo-blue)' }}>
                      {new Date(reachMonth + '-01').toLocaleDateString(intlLocale, { month: 'short', year: 'numeric' })}
                    </span>
                  ) : (
                    <span className="arvo-num text-base sm:text-lg" style={{ color: 'var(--arvo-fg-faint)' }}>—</span>
                  )}
                  <span className="text-[11px]" style={{ color: 'var(--arvo-fg-muted)' }}>
                    {reachYearsFromNow != null && `${t.finances.freedomIn} ${reachYearsFromNow} ${t.finances.freedomAgeAtTarget}`}
                    {userBirthdate && reachMonth && ` · ${ageAtDate(userBirthdate, reachMonth + '-01')} ${t.finances.freedomAgeAtTarget}`}
                  </span>
                  {scheduleDeltaYears != null && Math.abs(scheduleDeltaYears) >= 0.5 && (
                    <span className={`arvo-num text-[11px] font-semibold ${scheduleDeltaYears > 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                      {scheduleDeltaYears > 0
                        ? `${t.finances.freedomAheadOfSchedule} ${scheduleDeltaYears} ${t.finances.freedomAgeAtTarget}`
                        : `${t.finances.freedomBehindSchedule} ${Math.abs(scheduleDeltaYears)} ${t.finances.freedomAgeAtTarget}`}
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.freedomBasedOnCurrent} — {t.finances.freedomNotThePlanGoal}</span>
                </div>
              </div>

              <div className="flex gap-2.5 sm:border-l sm:pl-6 col-span-2 sm:col-span-1" style={{ borderColor: 'var(--arvo-border)' }}>
                <Icon name="refresh" size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--arvo-gold-text)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={kpiLabelStyle}>{t.finances.freedomPlannedToday}</span>
                  <span className="arvo-num text-base sm:text-lg" style={{ fontWeight: 600, color: 'var(--arvo-gold-text)' }}>{fmt(cxFreedom(plannedAtCurrentMonth), displayCurrency, true)}</span>
                  <span className="text-[11px]" style={{ color: 'var(--arvo-fg-muted)' }}>{t.finances.freedomAccordingToPlan}</span>
                  {planStatusText && (
                    <span className={`arvo-num text-[11px] font-semibold ${planStatusText.ahead ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                      {planStatusText.ahead ? '+' : '−'}{fmt(cxFreedom(Math.abs(planStatusText.diff)), displayCurrency, true, intlLocale)}
                      &nbsp;({planStatusText.ahead ? '+' : ''}{planStatusText.pct}% {t.finances.freedomVsPlanned})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          {perfLoading && (
            <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5 flex items-center justify-center h-40">
              <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--arvo-fg)] border-t-transparent" />
            </div>
          )}
          {!perfLoading && chartData.length > 0 && (
            <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5">
              <h3 className="text-sm font-semibold text-[var(--arvo-fg)] mb-4">{t.finances.freedomChartTitle}</h3>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={displayChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id="freedomAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--arvo-blue)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="var(--arvo-blue)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="freedomActualGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--arvo-green)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--arvo-green)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="freedomExtraGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--arvo-gold)" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="var(--arvo-gold)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="freedomContributedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--arvo-terracotta)" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="var(--arvo-terracotta)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tickFormatter={m => fmtMonth(m, intlLocale)}
                    tick={{ ...CHART_AXIS_TICK, fontSize: 11, fill: 'var(--arvo-fg-muted)' }}
                    axisLine={CHART_AXIS_LINE}
                    tickLine={false}
                    interval={Math.floor(displayChartData.length / 8)}
                  />
                  {/* Cap at ~1.15x the goal/current value (not the extrapolated tail's peak) so
                      history and near-term data stay readable; the projection just exits the top. */}
                  <YAxis
                    domain={[0, () => Math.max(fireValue ?? 0, cxFreedom(currentValue)) * 1.15]}
                    tickFormatter={v => hideValues ? '•••' : formatCompactCurrency(v, displayCurrency, intlLocale)}
                    tick={{ ...CHART_AXIS_TICK, fontSize: 11, fill: 'var(--arvo-fg-muted)' }}
                    axisLine={CHART_AXIS_LINE}
                    tickLine={false}
                    width={70}
                  />
                  <Tooltip content={<ChartTooltip currency={displayCurrency} locale={intlLocale} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine
                    y={cxFreedom(activePlan!.target_amount)}
                    stroke="var(--arvo-gold)"
                    strokeDasharray="4 2"
                    label={{ value: t.finances.freedomGoal, position: 'insideTopRight', fontSize: 10, fill: 'var(--arvo-gold-text)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="contributed"
                    stroke="none"
                    fill="url(#freedomContributedGradient)"
                    connectNulls
                    legendType="none"
                    tooltipType="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="planned"
                    stroke="none"
                    fill="url(#freedomAreaGradient)"
                    connectNulls
                    legendType="none"
                    tooltipType="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="plannedExtra"
                    stroke="none"
                    fill="url(#freedomExtraGradient)"
                    connectNulls
                    legendType="none"
                    tooltipType="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke="none"
                    fill="url(#freedomActualGradient)"
                    connectNulls
                    legendType="none"
                    tooltipType="none"
                  />
                  <Line
                    type="monotone"
                    dataKey="contributed"
                    name={t.finances.freedomContributed}
                    stroke="var(--arvo-terracotta)"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="planned"
                    name={t.finances.freedomPlanned}
                    stroke="var(--arvo-fg)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="plannedExtra"
                    name={t.finances.freedomProjected}
                    stroke="var(--arvo-gold-text)"
                    strokeWidth={1.5}
                    strokeDasharray="2 3"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name={t.finances.freedomActual}
                    stroke="var(--arvo-green)"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                  {fireMonth && fireValue != null && (
                    <ReferenceDot
                      x={fireMonth}
                      y={fireValue}
                      r={5}
                      fill="var(--arvo-gold)"
                      stroke="var(--arvo-surface)"
                      strokeWidth={2}
                      label={{ value: 'FIRE', position: 'top', fontSize: 10, fill: 'var(--arvo-gold-text)' }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-[var(--arvo-fg-muted)] mt-2 text-right">
                {t.finances.freedomApprox}
              </p>
            </div>
          )}

          {/* Plan details */}
          <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5">
            <h3 className="text-sm font-semibold text-[var(--arvo-fg)] mb-4">{activePlan!.name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: t.finances.freedomCapital, value: fmt(cxFreedom(activePlan!.initial_capital), displayCurrency) },
                { label: `${t.finances.freedomContrib} ${t.finances.freedomPerMonth}`, value: fmt(cxFreedom(activePlan!.monthly_contribution), displayCurrency, false, intlLocale) },
                { label: `${t.finances.freedomRate} ${t.finances.freedomPerMonth}`, value: (activePlan!.monthly_return_rate * 100).toFixed(2) + '%' },
                { label: `${t.finances.freedomIncomeRate} ${t.finances.freedomPerMonth}`, value: (activePlan!.monthly_income_rate * 100).toFixed(2) + '%' },
                { label: t.finances.freedomHorizon, value: `${activePlan!.horizon_years} ${t.finances.freedomAgeAtTarget}` },
                { label: t.finances.freedomCurrency, value: `${planCurrency}${planCurrency !== displayCurrency ? ` → ${displayCurrency}` : ''}` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--arvo-surface-2)' }}>
                  <p className="text-[11px] text-[var(--arvo-fg-soft)]">{label}</p>
                  <p className="arvo-num font-medium text-[var(--arvo-fg)] mt-0.5">{value}</p>
                </div>
              ))}
            </div>
            {activePlan!.notes && (
              <p className="text-xs text-[var(--arvo-fg-soft)] mt-4 border-t border-[var(--arvo-border-soft)] pt-3">{activePlan!.notes}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
