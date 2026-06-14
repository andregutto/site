import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceDot, Legend,
} from 'recharts'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { Banner } from '../../components/ui'
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

const kpiValueStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-body)',
  letterSpacing: '0.04em',
  color: 'var(--arvo-fg)',
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
  const [inflation, setInflation] = useState(() => {
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

  const fieldCls = 'w-full border border-[var(--arvo-border)] rounded-[3px] px-3 py-2 text-sm bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:border-[var(--arvo-gold)] focus:ring-2 focus:ring-[var(--arvo-gold)]/25'
  const labelCls = 'block text-xs text-[var(--arvo-fg-muted)] mb-1'

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
                onClick={() => { setGoalMode(mode); setStep(1) }}
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
              <div className="mb-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 flex items-center justify-between">
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
                          className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--arvo-track-bg)] hover:bg-[var(--arvo-fg)] hover:text-[var(--arvo-pill-active-fg)] transition-colors">
                          {t.finances.freedomInflationIpca}: {ipcaAnnual}%
                        </button>
                      )}
                      {hicpAnnual != null && (
                        <button type="button" onClick={() => setInflation(String(hicpAnnual))}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--arvo-track-bg)] hover:bg-[var(--arvo-fg)] hover:text-[var(--arvo-pill-active-fg)] transition-colors">
                          {t.finances.freedomInflationHicp}: {hicpAnnual}%
                        </button>
                      )}
                      {cpiAnnual != null && (
                        <button type="button" onClick={() => setInflation(String(cpiAnnual))}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--arvo-track-bg)] hover:bg-[var(--arvo-fg)] hover:text-[var(--arvo-pill-active-fg)] transition-colors">
                          {t.finances.freedomInflationCpi}: {cpiAnnual}%
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[var(--arvo-fg-soft)] leading-snug">{t.finances.freedomDesiredIncomeHint}</p>
              {computedTarget != null && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs text-[var(--arvo-fg-muted)]">{t.finances.freedomComputedGoal}</p>
                  <p className="text-xl font-bold text-[var(--arvo-fg)]">{fmtCur(computedTarget)}</p>
                  <p className="text-[10px] text-[var(--arvo-fg-muted)]">
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

          {step === firstStep && (
            <button type="button" onClick={onCancel} className="text-sm text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors">
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
  const { currency: displayCurrency, convert, fxRates, hideValues } = useCurrency()
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
        apiFetch<{ birthdate?: string; country?: string }>('/profile'),
      ])
      setPlans(plansData)
      setPortfolio(portfolioData)
      if (profileData.birthdate) setUserBirthdate(profileData.birthdate)
      if (profileData.country) setUserCountry(profileData.country)
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

  // Chart data converted to display currency
  const displayChartData = chartData.map(pt => ({
    ...pt,
    planned: pt.planned != null ? Math.round(cxFreedom(pt.planned)) : null,
    actual:  pt.actual  != null ? Math.round(cxFreedom(pt.actual))  : null,
  }))

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

  // Convert a value from activePlan.currency to the app display currency
  function cxFreedom(value: number): number {
    const planCur = activePlan?.currency ?? 'EUR'
    if (planCur === displayCurrency) return value
    const inBrl = planCur === 'BRL' ? value
      : planCur === 'EUR' ? value * fxRates.EUR
      : value * (fxRates.USD ?? 5.7)
    return convert(inBrl)
  }

  // "Ano-alvo" — fixed horizon end year (the plan's committed target date)
  const targetYear = activePlan
    ? parseInt(addMonths(planStart, activePlan.horizon_years * 12).slice(0, 4), 10)
    : null

  // "FIRE" milestone — last point of the trajectory (horizon end), at the goal value
  const fireMonth = chartData.length > 0 ? chartData[chartData.length - 1].month : null
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
          <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{t.finances.freedomTitle}</h1>
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
          <div className="flex justify-center mb-4 text-[var(--arvo-fg-soft)]"><Icon name="target" size={40} /></div>
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
          {/* KPIs em faixa */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={kpiLabelStyle}>{t.finances.freedomToday}</span>
                <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>{fmt(cxFreedom(currentValue), displayCurrency, true)}</span>
                <span className="text-[10px]" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.freedomActualNow}</span>
              </div>
              <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
                <span style={kpiLabelStyle}>{t.finances.freedomGoal}</span>
                <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>{fmt(cxFreedom(activePlan!.target_amount), displayCurrency, true)}</span>
              </div>
              <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
                <span style={kpiLabelStyle}>{t.finances.freedomPassive} {t.finances.freedomPerMonth}</span>
                <span className="arvo-num arvo-delta-pos text-base sm:text-lg">{fmt(cxFreedom(passiveIncome), displayCurrency, true)}</span>
                {passiveIncomeReal != null && passiveIncomeReal !== passiveIncome && (
                  <span className="arvo-num arvo-delta-pos text-xs">≈ {fmt(cxFreedom(passiveIncomeReal), displayCurrency, true)} {t.finances.freedomRealToday}</span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--arvo-fg-soft)' }}>{(activePlan!.monthly_income_rate * 100).toFixed(1)}% {t.finances.freedomIncomeNominalTag}</span>
              </div>
              <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
                <span style={kpiLabelStyle}>{t.finances.freedomTarget}</span>
                {reachMonth ? (
                  <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>
                    {new Date(reachMonth + '-01').toLocaleDateString(intlLocale, { month: 'short', year: 'numeric' })}
                  </span>
                ) : (
                  <span className="arvo-num text-base sm:text-lg" style={{ color: 'var(--arvo-fg-faint)' }}>—</span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--arvo-fg-soft)' }}>
                  {reachYearsFromNow != null && `${t.finances.freedomIn} ${reachYearsFromNow} ${t.finances.freedomAgeAtTarget}`}
                  {userBirthdate && reachMonth && ` · ${ageAtDate(userBirthdate, reachMonth + '-01')} ${t.finances.freedomAgeAtTarget}`}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--arvo-fg-faint)' }}>{t.finances.freedomBasedOnCurrent}</span>
              </div>
            </div>
          </div>

          {/* Previsto para hoje */}
          <div className="rounded-xl p-4" style={{ background: 'var(--arvo-surface-2)', border: '1px solid var(--arvo-border)' }}>
            <p className="text-xs" style={{ color: 'var(--arvo-fg-muted)' }}>{t.finances.freedomPlannedToday}</p>
            <p className="arvo-num text-lg font-bold" style={{ color: 'var(--arvo-fg)' }}>{fmt(cxFreedom(plannedAtCurrentMonth), displayCurrency, true)}</p>
            <p className="text-[10px]" style={{ color: 'var(--arvo-fg-soft)' }}>{t.finances.freedomAccordingToPlan}</p>
          </div>

          {/* Status banner */}
          {planStatusText && (
            <Banner variant={planStatusText.ahead ? 'info' : 'alert'}>
              <Icon name={planStatusText.ahead ? 'check' : 'alert'} size={12} className="inline-block mr-1.5 -mb-0.5" />
              {planStatusText.ahead ? t.finances.freedomAhead : t.finances.freedomBehind}:&nbsp;
              <strong className="arvo-num">{fmt(cxFreedom(Math.abs(planStatusText.diff)), displayCurrency, true, intlLocale)}</strong>
              &nbsp;({planStatusText.ahead ? '+' : ''}{planStatusText.pct}% {t.finances.freedomVsPlanned})
            </Banner>
          )}

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
                      <stop offset="0%" stopColor="var(--arvo-blue)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="var(--arvo-blue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    tickFormatter={m => fmtMonth(m, intlLocale)}
                    tick={CHART_AXIS_TICK}
                    axisLine={CHART_AXIS_LINE}
                    tickLine={false}
                    interval={Math.floor(displayChartData.length / 8)}
                  />
                  <YAxis
                    domain={[0, (max: number) => Math.max(max, fireValue ?? 0)]}
                    tickFormatter={v => hideValues ? '•••' : formatCompactCurrency(v, displayCurrency, intlLocale)}
                    tick={CHART_AXIS_TICK}
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
                    dataKey="planned"
                    stroke="none"
                    fill="url(#freedomAreaGradient)"
                    connectNulls
                    legendType="none"
                    tooltipType="none"
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
              <p className="text-[10px] text-[var(--arvo-fg-soft)] mt-2 text-right">
                {t.finances.freedomApprox}
              </p>
            </div>
          )}

          {/* Plan details */}
          <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5">
            <h3 className="text-sm font-semibold text-[var(--arvo-fg)] mb-3">{activePlan!.name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {[
                { label: t.finances.freedomCapital, value: fmt(cxFreedom(activePlan!.initial_capital), displayCurrency) },
                { label: `${t.finances.freedomContrib} ${t.finances.freedomPerMonth}`, value: fmt(cxFreedom(activePlan!.monthly_contribution), displayCurrency, false, intlLocale) },
                { label: `${t.finances.freedomRate} ${t.finances.freedomPerMonth}`, value: (activePlan!.monthly_return_rate * 100).toFixed(2) + '%' },
                { label: `${t.finances.freedomIncomeRate} ${t.finances.freedomPerMonth}`, value: (activePlan!.monthly_income_rate * 100).toFixed(2) + '%' },
                { label: t.finances.freedomHorizon, value: `${activePlan!.horizon_years} ${t.finances.freedomAgeAtTarget}` },
                { label: t.finances.freedomCurrency, value: `${planCurrency}${planCurrency !== displayCurrency ? ` → ${displayCurrency}` : ''}` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-[var(--arvo-fg-soft)]">{label}</p>
                  <p className="font-medium text-[var(--arvo-fg)]">{value}</p>
                </div>
              ))}
            </div>
            {activePlan!.notes && (
              <p className="text-xs text-[var(--arvo-fg-soft)] mt-3 border-t border-[var(--arvo-border-soft)] pt-3">{activePlan!.notes}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
