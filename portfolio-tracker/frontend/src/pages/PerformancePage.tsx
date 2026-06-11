import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { usePerformanceSummary, usePerformanceMonthly, usePerformanceBenchmarks, usePortfolioValue, usePerformanceInception, usePerformanceDaily } from '../hooks/usePortfolio'
import { useDividendSummary, useDividends } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

interface FreedomPlan {
  id: number; is_active: boolean
  initial_capital: number; monthly_contribution: number; monthly_return_rate: number
  currency: string; start_date: string | null; created_at: string
}

function fmtMonth(ym: string, locale = 'pt-BR') {
  const [y, m] = ym.split('-')
  const monthName = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(parseInt(y), parseInt(m) - 1, 1))
  return `${monthName.replace('.', '')}/${y.slice(2)}`
}

function fmtDayLabel(dateStr: string, locale = 'pt-BR') {
  const [, m, day] = dateStr.split('-')
  const monthName = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, parseInt(m) - 1, 1))
  return `${parseInt(day)}/${monthName.replace('.', '')}`
}

function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return localYM(d)
}

type PeriodMode = 'current_month' | 'last_30d' | 'last_12m' | 'ytd' | 'inception'

function SummaryCard({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean | null
}) {
  return (
    <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm">
      <p className="text-[var(--arvo-fg-soft)] text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${
        positive === true ? 'text-green-600' :
        positive === false ? 'text-red-600' :
        'text-[var(--arvo-fg)]'
      }`}>{value}</p>
      {sub && <p className="text-xs text-[var(--arvo-fg-soft)] mt-1">{sub}</p>}
    </div>
  )
}

export default function PerformancePage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentYM   = localYM(now)

  const navigate = useNavigate()
  const { convert, currency, fxRates } = useCurrency()
  const { t, locale } = useI18n()
  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
  const { data: livePortfolio } = usePortfolioValue()
  const inceptionYM = usePerformanceInception()

  function fmt(valueBrl: number) {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency', currency,
      maximumFractionDigits: 0,
    }).format(convert(valueBrl))
  }

  const [mode, setMode] = useState<PeriodMode>('ytd')
  const [dailyYtd, setDailyYtd] = useState(false)

  function derivePeriod(): { from: string; to: string } {
    switch (mode) {
      case 'current_month': return { from: currentYM,                    to: currentYM }
      case 'last_30d':      return { from: addMonths(currentYM, -1),     to: currentYM }
      case 'last_12m':      return { from: addMonths(currentYM, -11),    to: currentYM }
      case 'ytd':           return { from: `${currentYear}-01`,           to: currentYM }
      case 'inception':     return { from: inceptionYM ?? `${currentYear}-01`, to: currentYM }
    }
  }

  const { from, to } = derivePeriod()
  const periodLabel = (() => {
    switch (mode) {
      case 'current_month': return fmtMonth(currentYM, intlLocale)
      case 'last_30d':      return `${fmtMonth(addMonths(currentYM, -1), intlLocale)} – ${fmtMonth(currentYM, intlLocale)}`
      case 'last_12m':      return `${fmtMonth(addMonths(currentYM, -11), intlLocale)} – ${fmtMonth(currentYM, intlLocale)}`
      case 'ytd':           return `Jan/${currentYear.toString().slice(2)} – ${fmtMonth(currentYM, intlLocale)}`
      case 'inception':     return inceptionYM ? `${fmtMonth(inceptionYM, intlLocale)} – ${fmtMonth(currentYM, intlLocale)}` : `– ${fmtMonth(currentYM, intlLocale)}`
    }
  })()

  const useDailyChart = mode === 'current_month' || mode === 'last_30d' || (mode === 'ytd' && dailyYtd)
  const dailyFrom = useDailyChart
    ? mode === 'current_month'
      ? `${currentYM}-01`
      : mode === 'ytd'
        ? `${currentYear}-01-01`
        : localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29))
    : null
  const dailyTo = useDailyChart ? localDate(now) : null
  const { data: dailyData, loading: dailyLoading } = usePerformanceDaily(dailyFrom, dailyTo)

  // Fetch benchmarks from one month before `from` so we have the pre-period base for normalization
  // Must be declared before dailyChartData which calls interpolateBenchmarkCumAtDate
  const { data: benchmarks, loading: bLoading, refresh: refreshBenchmarks } = usePerformanceBenchmarks(addMonths(from, -1), to)

  // Interpolate monthly benchmark cum factors to a specific day (linear within the month).
  function interpolateBenchmarkCumAtDate(dateStr: string): { cdi: number | null; ibov: number | null; sp500: number | null } {
    const bm = benchmarks?.monthly ?? []
    if (!bm.length) return { cdi: null, ibov: null, sp500: null }
    const ym = dateStr.substring(0, 7)
    const day = parseInt(dateStr.split('-')[2])
    const [y, m] = ym.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const t = day / daysInMonth
    const monthMap = new Map(bm.map(b => [b.month, b]))
    const prevYm = addMonths(ym, -1)
    const prev = monthMap.get(prevYm)
    const cur  = monthMap.get(ym)
    function interp(pv: number | null | undefined, cv: number | null | undefined): number | null {
      if (cv == null) return null
      const p = pv ?? cv
      return p + (cv - p) * t
    }
    return {
      cdi:   interp(prev?.cdi_cum,   cur?.cdi_cum),
      ibov:  interp(prev?.ibov_cum,  cur?.ibov_cum),
      sp500: interp(prev?.sp500_cum, cur?.sp500_cum),
    }
  }

  const dailyChartData = useDailyChart ? (() => {
    const pts = (dailyData?.daily ?? []).filter(pt => pt.total > 0)
    if (pts.length === 0) return []
    const periodStart = pts[0].total - (pts[0].contributions ?? 0)
    const baseBm = interpolateBenchmarkCumAtDate(pts[0].date)
    let cfCumul = 0
    return pts.map(pt => {
      cfCumul += (pt.contributions ?? 0)
      const denom = periodStart + 0.5 * cfCumul
      const retPct = periodStart > 0 && denom > 0
        ? Math.round(((pt.total - periodStart - cfCumul) / denom) * 10000) / 100
        : 0
      const dayBm = interpolateBenchmarkCumAtDate(pt.date)
      const cdi   = dayBm.cdi   != null && baseBm.cdi   != null && baseBm.cdi   > 0 ? Math.round((dayBm.cdi   / baseBm.cdi   - 1) * 10000) / 100 : null
      const ibov  = dayBm.ibov  != null && baseBm.ibov  != null && baseBm.ibov  > 0 ? Math.round((dayBm.ibov  / baseBm.ibov  - 1) * 10000) / 100 : null
      const sp500 = dayBm.sp500 != null && baseBm.sp500 != null && baseBm.sp500 > 0 ? Math.round((dayBm.sp500 / baseBm.sp500 - 1) * 10000) / 100 : null
      return { month: fmtDayLabel(pt.date, intlLocale), portfolio: retPct, cdi, ibov, sp500 }
    })
  })() : []

  const lastDailyPoint = dailyChartData[dailyChartData.length - 1]

  const { data: summary,    loading: sLoading, refresh: refreshSummary    } = usePerformanceSummary(from, to)
  const { data: monthly,    loading: mLoading, refresh: refreshMonthly    } = usePerformanceMonthly(from, to)
  const divDateFrom = `${from}-01`
  const divDateTo   = new Date().toISOString().split('T')[0]
  const { data: divSummary } = useDividendSummary(divDateFrom, divDateTo)
  const divByMonth = new Map((divSummary?.by_month ?? []).map(m => [m.month, m.total_brl]))

  // Per-asset dividend breakdown for expanded detail rows
  const { data: allDivRows } = useDividends(divDateFrom, divDateTo)
  const divByMonthAsset = new Map<string, Map<number, number>>()
  for (const r of allDivRows ?? []) {
    const month = r.ex_date.slice(0, 7)
    if (!divByMonthAsset.has(month)) divByMonthAsset.set(month, new Map())
    const am = divByMonthAsset.get(month)!
    am.set(r.asset_id, (am.get(r.asset_id) ?? 0) + r.amount_brl)
  }
  const handleRefresh = useCallback(() => {
    refreshSummary()
    refreshMonthly()
    refreshBenchmarks()
  }, [refreshSummary, refreshMonthly, refreshBenchmarks])

  const [showCDI,   setShowCDI]   = useState(true)
  const [showIBOV,  setShowIBOV]  = useState(false)
  const [showSP500, setShowSP500] = useState(false)
  const [chartView, setChartView] = useState<'return' | 'value'>('return')

  const [activePlan, setActivePlan] = useState<FreedomPlan | null | undefined>(undefined)
  useEffect(() => {
    apiFetch<FreedomPlan[]>('/finances/freedom-plans')
      .then(plans => setActivePlan(plans.find(p => p.is_active) ?? plans[0] ?? null))
      .catch(() => setActivePlan(null))
  }, [])

  // Target line: project freedom plan trajectory onto the chart
  const planStartDate = activePlan ? (activePlan.start_date ?? activePlan.created_at.slice(0, 10)) : null
  function targetAtDate(dateStr: string): number | null {
    if (!activePlan || !planStartDate) return null
    const t = (new Date(dateStr + 'T12:00:00').getTime() - new Date(planStartDate + 'T12:00:00').getTime()) / (30.4375 * 24 * 3600 * 1000)
    const brlPerUnit = activePlan.currency === 'BRL' ? 1 : (fxRates[activePlan.currency] ?? 1)
    const IC = convert(activePlan.initial_capital * brlPerUnit)
    const MC = convert(activePlan.monthly_contribution * brlPerUnit)
    const r  = activePlan.monthly_return_rate
    const v  = r === 0 ? IC + MC * t : IC * Math.pow(1 + r, t) + MC * (Math.pow(1 + r, t) - 1) / r
    return v > 0 ? v : null
  }
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const toggleMonth = useCallback((m: string) => setExpandedMonths(prev => {
    const next = new Set(prev)
    next.has(m) ? next.delete(m) : next.add(m)
    return next
  }), [])

  type DetailSortKey = 'value' | 'contributions' | 'gain' | 'pct'
  const [detailSort, setDetailSort] = useState<DetailSortKey>('value')
  const [detailDir,  setDetailDir]  = useState<'asc' | 'desc'>('desc')
  function toggleDetailSort(key: DetailSortKey) {
    if (detailSort === key) setDetailDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setDetailSort(key); setDetailDir('desc') }
  }
  function DetailSortIcon({ col }: { col: DetailSortKey }) {
    if (detailSort !== col) return <span className="text-[var(--arvo-fg-faint)]">↕</span>
    return <span className="text-[var(--arvo-fg)]">{detailDir === 'asc' ? '↑' : '↓'}</span>
  }

  const benchmarkMap = new Map(
    (benchmarks?.monthly ?? []).map(b => [b.month, b])
  )

  // Auto-sync price history when chart would be empty but portfolio has value.
  // Fires once per page load; covers users who added assets without B3 import.
  const autoSynced = useRef(false)
  useEffect(() => {
    if (autoSynced.current) return
    if (mLoading) return
    if ((monthly?.monthly.filter(m => m.total > 0).length ?? 0) > 0) return
    if (!livePortfolio?.total_brl || livePortfolio.total_brl <= 0) return
    autoSynced.current = true
    apiFetch('/portfolio/sync-history', { method: 'POST' })
      .then(() => { refreshSummary(); refreshMonthly(); refreshBenchmarks() })
      .catch(() => {})
  }, [mLoading, monthly, livePortfolio?.total_brl, refreshSummary, refreshMonthly, refreshBenchmarks])

  const monthsWithData = monthly?.monthly.filter(m => m.total > 0) ?? []
  const firstMonth = monthsWithData[0]?.month ?? ''

  // Normalize benchmarks from the month BEFORE the first portfolio month (= true period start)
  const prevFirstMonth = firstMonth ? addMonths(firstMonth, -1) : ''
  const baseBench  = benchmarkMap.get(prevFirstMonth)
  const baseCDI    = baseBench?.cdi_cum   ?? benchmarkMap.get(firstMonth)?.cdi_cum ?? null
  const baseIBOV   = baseBench?.ibov_cum  ?? null
  const baseSP500  = baseBench?.sp500_cum ?? null

  const pct = (v: number, base: number) => Math.round((v / base - 1) * 10000) / 100

  // Running Simple Dietz from the period start: for each month compute
  //   (total_i - periodStart - cfCumul_i) / (periodStart + 0.5 * cfCumul_i)
  // At the last month this equals displayReturnPct exactly, so every chart point,
  // the top summary card and the Carteira comparison card all use the same formula.
  const periodStart = monthsWithData[0]?.prev_total ?? 0
  let cfCumul = 0
  const chartData = monthsWithData.map((m) => {
    cfCumul += (m.contributions ?? 0)
    const denom = periodStart + 0.5 * cfCumul
    const portfolioPct = periodStart > 0 && denom > 0
      ? Math.round(((m.total - periodStart - cfCumul) / denom) * 10000) / 100
      : 0
    const b = benchmarkMap.get(m.month)
    return {
      month:     fmtMonth(m.month, intlLocale),
      portfolio: portfolioPct,
      cdi:       (b?.cdi_cum != null && baseCDI != null) ? pct(b.cdi_cum, baseCDI) : null,
      ibov:      (b?.ibov_cum  != null && baseIBOV  != null) ? pct(b.ibov_cum,  baseIBOV)  : null,
      sp500:     (b?.sp500_cum != null && baseSP500 != null) ? pct(b.sp500_cum, baseSP500) : null,
    }
  })

  const lastPoint = chartData[chartData.length - 1]
  const cdiAccum   = useDailyChart ? (lastDailyPoint?.cdi   ?? null) : (lastPoint?.cdi   ?? null)
  const ibovAccum  = useDailyChart ? (lastDailyPoint?.ibov  ?? null) : (lastPoint?.ibov  ?? null)
  const sp500Accum = useDailyChart ? (lastDailyPoint?.sp500 ?? null) : (lastPoint?.sp500 ?? null)

  // Absolute portfolio value series (Patrimônio view), with optional Freedom Plan target
  // line and a cumulative contributions ("Aportes") line — the gap between the two
  // represents gains from valorização/juros compostos.
  const dailyValuePts = useDailyChart ? (dailyData?.daily ?? []).filter(pt => pt.total > 0) : []
  const dailyValueBase = dailyValuePts.length > 0 ? dailyValuePts[0].total - (dailyValuePts[0].contributions ?? 0) : 0
  let valueCfCumul = 0
  const valueChartData = useDailyChart
    ? dailyValuePts.map(pt => {
        valueCfCumul += (pt.contributions ?? 0)
        return {
          month: fmtDayLabel(pt.date, intlLocale),
          value: convert(pt.total),
          target: targetAtDate(pt.date),
          contributions: convert(dailyValueBase + valueCfCumul),
        }
      })
    : monthsWithData.map(m => {
        const [y, mo] = m.month.split('-').map(Number)
        const lastDay = new Date(y, mo, 0).getDate()
        valueCfCumul += (m.contributions ?? 0)
        return {
          month: fmtMonth(m.month, intlLocale),
          value: convert(m.total),
          target: targetAtDate(`${m.month}-${String(lastDay).padStart(2, '0')}`),
          // No periodStart offset here (unlike daily): "inception" mode starts at the
          // first tracked contribution, so Aportes is purely the running sum of
          // contributions from that point — periodStart includes pre-existing asset
          // value with no associated contribution, which would distort this line.
          contributions: convert(valueCfCumul),
        }
      })

  // "Fim do período" card: use live total when available so the BRL amount matches dashboard.
  const endsAtCurrentMonth = to === currentYM
  const liveTotal = livePortfolio?.total_brl ?? null
  const displayValueEnd = endsAtCurrentMonth && liveTotal !== null ? liveTotal : (summary?.value_end ?? 0)

  // Return % always uses summary.value_end — stable, no race condition with livePortfolio.
  const summaryValueEnd  = summary?.value_end ?? 0
  const displayReturnAbs = summary ? summaryValueEnd - summary.value_start - summary.contributions : 0
  const dietzDenom       = summary ? summary.value_start + 0.5 * summary.contributions : 0
  const displayReturnPct = dietzDenom > 0 ? (displayReturnAbs / dietzDenom) * 100 : null

  const portfolioAccum = useDailyChart
    ? (lastDailyPoint?.portfolio ?? displayReturnPct)
    : displayReturnPct

  const isLoading = sLoading || mLoading || bLoading || (useDailyChart && dailyLoading)

  const modeButtons: Array<{ key: PeriodMode; label: string; disabled?: boolean }> = [
    { key: 'current_month', label: t.performance.currentMonth },
    { key: 'last_30d',      label: t.performance.last30d      },
    { key: 'last_12m',      label: t.performance.last12m      },
    { key: 'ytd',           label: 'YTD'                      },
    { key: 'inception',     label: t.performance.inception, disabled: !inceptionYM },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>Performance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-muted)' }}>{t.performance.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {modeButtons.map(({ key, label, disabled }) => (
            <button
              key={key}
              onClick={() => !disabled && setMode(key)}
              disabled={disabled}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                disabled
                  ? 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-faint)] border-[var(--arvo-border)] cursor-not-allowed'
                  : mode === key
                    ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] border-[var(--arvo-fg)]'
                    : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] border-[var(--arvo-border)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)]'
              }`}
            >{label}</button>
          ))}

          {mode === 'ytd' && (
            <button
              onClick={() => setDailyYtd(v => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                dailyYtd
                  ? 'bg-[#1B4FD8] text-white border-[#1B4FD8]'
                  : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] border-[var(--arvo-border)] hover:border-[#1B4FD8] hover:text-[#1B4FD8]'
              }`}
            >{t.performance.daily}</button>
          )}

          <span className="text-[var(--arvo-fg-faint)] text-sm">|</span>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            title={t.performance.recalculateTitle}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors disabled:opacity-40"
          >
            {isLoading ? t.performance.calculating : t.performance.recalculate}
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label={t.performance.periodStart}
                value={summary.value_start > 0 ? fmt(summary.value_start) : '—'}
              />
              <SummaryCard label={t.performance.periodEnd} value={fmt(displayValueEnd)} />
              <SummaryCard
                label={t.performance.absoluteReturn}
                value={`${displayReturnAbs >= 0 ? '+' : ''}${fmt(displayReturnAbs)}`}
                positive={displayReturnAbs >= 0}
              />
              <SummaryCard
                label={t.performance.returnPct}
                value={displayReturnPct != null ? `${displayReturnPct >= 0 ? '+' : ''}${displayReturnPct.toFixed(2)}%` : '—'}
                sub={t.performance.simpleDietz}
                positive={displayReturnPct != null ? displayReturnPct >= 0 : null}
              />
            </div>
          )}

          {(() => {
            const chartDataActive = useDailyChart ? dailyChartData : chartData
            if (chartDataActive.length === 0) {
              return (
                <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-12 text-center text-[var(--arvo-fg-soft)] shadow-sm">
                  <p className="text-base font-medium text-[var(--arvo-fg-muted)]">{t.performance.noData}</p>
                  <p className="text-sm mt-1">{t.performance.visitDashboard}</p>
                </div>
              )
            }
            const portfolioDot = useDailyChart ? { r: 2, fill: 'var(--arvo-fg)' } : { r: 3, fill: 'var(--arvo-fg)' }
            const portfolioActiveDot = useDailyChart ? { r: 4 } : { r: 5 }
            return (
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h2 className="font-semibold text-[var(--arvo-fg)]">
                    {chartView === 'value' ? t.dashboard.patrimony : t.performance.accumulatedReturn} · {periodLabel}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex rounded-lg border border-[var(--arvo-border)] overflow-hidden text-xs font-semibold">
                      <button
                        onClick={() => setChartView('return')}
                        className={`px-2.5 py-1 transition-colors ${chartView === 'return' ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)]' : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]'}`}
                      >{t.performance.returnPct}</button>
                      <button
                        onClick={() => setChartView('value')}
                        className={`px-2.5 py-1 transition-colors border-l border-[var(--arvo-border)] ${chartView === 'value' ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)]' : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]'}`}
                      >{t.dashboard.patrimony}</button>
                    </div>
                    {chartView === 'return' && (
                      <div className="flex items-center gap-2">
                        {([['CDI', showCDI, setShowCDI, '#16a34a'], ['IBOV', showIBOV, setShowIBOV, '#7c3aed'], ['S&P500', showSP500, setShowSP500, '#f59e0b']] as const).map(
                          ([lbl, active, setter, color]) => (
                            <button
                              key={lbl}
                              onClick={() => (setter as (v: boolean) => void)(!active)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                                active ? 'text-white border-transparent' : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-soft)] border-[var(--arvo-border)] hover:border-[var(--arvo-fg-faint)]'
                              }`}
                              style={active ? { backgroundColor: color as string, borderColor: color as string } : {}}
                            >{lbl}</button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === 'value' ? (
                      <LineChart data={valueChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--arvo-border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} interval="preserveStartEnd" />
                        <YAxis
                          tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }}
                          tickFormatter={v => {
                            const n = typeof v === 'number' ? v : 0
                            return currency === 'BRL' ? `${(n / 1000).toFixed(0)}k` : (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0))
                          }}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          formatter={(v, name) => [
                            new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(typeof v === 'number' ? v : 0),
                            name,
                          ]}
                          contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border)', fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="value" name={t.dashboard.patrimony} stroke="var(--arvo-fg)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="contributions" name={t.performance.contributions} stroke="var(--arvo-fg-soft)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
                        {activePlan && <Line type="monotone" dataKey="target" name={t.dashboard.targetLine} stroke="#1B4FD8" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />}
                      </LineChart>
                    ) : (
                      <LineChart data={chartDataActive}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--arvo-border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }} interval="preserveStartEnd" />
                        <YAxis
                          tick={{ fontSize: 11, fill: 'var(--arvo-fg-soft)' }}
                          tickFormatter={v => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                        />
                        <Tooltip
                          formatter={(v) => [`${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`]}
                          contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border)', fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="portfolio" name={t.performance.wallet} stroke="var(--arvo-fg)" strokeWidth={2} dot={portfolioDot} activeDot={portfolioActiveDot} />
                        {showCDI   && <Line type="monotone" dataKey="cdi"   name="CDI"    stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                        {showIBOV  && <Line type="monotone" dataKey="ibov"  name="IBOV"   stroke="#7c3aed" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                        {showSP500 && <Line type="monotone" dataKey="sp500" name="S&P500" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}

          {/* Benchmark comparison cards */}
          {(useDailyChart ? dailyChartData.length > 0 : chartData.length > 0) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: t.performance.wallet, value: portfolioAccum, text: 'text-[var(--arvo-fg)]' },
                { label: 'CDI',       value: cdiAccum,       text: 'text-green-600' },
                { label: 'IBOV',      value: ibovAccum,      text: 'text-violet-700' },
                { label: 'S&P500',    value: sp500Accum,     text: 'text-amber-600' },
              ].map(({ label, value, text }) => (
                <div key={label} className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-4 shadow-sm">
                  <p className="text-[var(--arvo-fg-soft)] text-xs">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${value != null ? text : 'text-[var(--arvo-fg-faint)]'}`}>
                    {value != null ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {monthly && (
            <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-[var(--arvo-border)]">
                <h2 className="font-semibold text-[var(--arvo-fg)]">{t.performance.monthlyEvolution}</h2>
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">{t.performance.month}</th>
                      <th className="px-4 py-3 text-right">{t.performance.wealth}</th>
                      <th className="px-4 py-3 text-right">{t.performance.contributions}</th>
                      <th className="px-4 py-3 text-right text-green-700">{(t as unknown as Record<string,Record<string,string>>).dividends?.title ?? 'Dividendos'}</th>
                      <th className="px-4 py-3 text-right">{t.performance.gainLoss}</th>
                      <th className="px-4 py-3 text-right">{t.performance.returnAbbr}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                    {monthly.monthly.map((m) => {
                      const cf        = m.contributions ?? 0
                      const gain      = m.prev_total > 0 ? m.total - m.prev_total - cf : null
                      const denom     = m.prev_total + 0.5 * cf
                      const gainPct   = gain != null && denom > 0 ? (gain / denom) * 100 : null
                      const isExpanded = expandedMonths.has(m.month)
                      const hasDetail  = (m.detail?.length ?? 0) > 0
                      return (
                        <>
                          <tr
                            key={m.month}
                            onClick={() => hasDetail && toggleMonth(m.month)}
                            className={`${hasDetail ? 'cursor-pointer' : ''} hover:bg-[var(--arvo-surface-2)] transition-colors`}
                          >
                            <td className="px-4 py-3 font-medium text-[var(--arvo-fg)]">
                              <span className="flex items-center gap-1.5">
                                {hasDetail && (
                                  <span className={`text-[var(--arvo-fg-soft)] text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                )}
                                {fmtMonth(m.month, intlLocale)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-[var(--arvo-fg)]">
                              {m.total > 0 ? fmt(m.total) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-[var(--arvo-fg-muted)] text-xs">
                              {cf !== 0 ? `${cf > 0 ? '+' : ''}${fmt(cf)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-medium text-green-600">
                              {(() => { const v = divByMonth.get(m.month); return v ? `+${fmt(convert(v))}` : '—' })()}
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${
                              gain == null ? 'text-[var(--arvo-fg-soft)]' :
                              gain >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gain != null ? `${gain >= 0 ? '+' : ''}${fmt(gain)}` : '—'}
                            </td>
                            <td className={`px-4 py-3 text-right text-xs font-semibold ${
                              gainPct == null ? 'text-[var(--arvo-fg-faint)]' :
                              gainPct >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—'}
                            </td>
                          </tr>
                          {isExpanded && m.detail && (
                            <tr key={`${m.month}-detail`} className="bg-[var(--arvo-surface-2)]/70">
                              <td colSpan={6} className="px-6 pb-3 pt-1">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                                      <th className="py-1.5 text-left font-medium">{t.performance.asset}</th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-[var(--arvo-fg-muted)] select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('value') }}>
                                        {t.performance.finalValue} <DetailSortIcon col="value" />
                                      </th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-[var(--arvo-fg-muted)] select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('contributions') }}>
                                        {t.performance.contributions} <DetailSortIcon col="contributions" />
                                      </th>
                                      <th className="py-1.5 text-right font-medium text-green-700 select-none">
                                        {(t as unknown as Record<string,Record<string,string>>).dividends?.title ?? 'Div.'}
                                      </th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-[var(--arvo-fg-muted)] select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('gain') }}>
                                        {t.performance.gainLoss} <DetailSortIcon col="gain" />
                                      </th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-[var(--arvo-fg-muted)] select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('pct') }}>
                                        % <DetailSortIcon col="pct" />
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--arvo-border)]">
                                    {m.detail
                                      .filter(d => d.value > 0)
                                      .slice()
                                      .sort((a, b) => {
                                        let cmp = 0
                                        if (detailSort === 'value') cmp = a.value - b.value
                                        else if (detailSort === 'contributions') cmp = a.contributions - b.contributions
                                        else if (detailSort === 'gain') cmp = a.gain - b.gain
                                        else {
                                          const da = a.prev_value + 0.5 * a.contributions
                                          const db = b.prev_value + 0.5 * b.contributions
                                          const pa = da > 0 ? a.gain / da : -Infinity
                                          const pb = db > 0 ? b.gain / db : -Infinity
                                          cmp = pa - pb
                                        }
                                        return detailDir === 'asc' ? cmp : -cmp
                                      })
                                      .map(d => {
                                        const hasGainData = d.prev_value > 0
                                        const denom = d.prev_value + 0.5 * d.contributions
                                        const gainPct = hasGainData && denom > 0 ? (d.gain / denom) * 100 : null
                                        return (
                                          <tr
                                            key={d.asset_id}
                                            onClick={() => navigate(`/assets/${d.asset_id}`)}
                                            className="cursor-pointer hover:bg-[var(--arvo-fg)]/5 transition-colors rounded"
                                          >
                                            <td className="py-1.5 text-[var(--arvo-fg)]">
                                              <span className="font-semibold hover:text-[var(--arvo-fg)] transition-colors">{d.code}</span>
                                              {d.name && d.name !== d.code && (
                                                <span className="text-[var(--arvo-fg-soft)] ml-1 truncate max-w-[120px] inline-block align-bottom">{d.name}</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 text-right text-[var(--arvo-fg)]">
                                              {fmt(d.value)}
                                            </td>
                                            <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">
                                              {d.contributions !== 0 ? `${d.contributions > 0 ? '+' : ''}${fmt(d.contributions)}` : '—'}
                                            </td>
                                            <td className="py-1.5 text-right text-xs font-medium text-green-600">
                                              {(() => {
                                                const v = divByMonthAsset.get(m.month)?.get(d.asset_id)
                                                return v ? `+${fmt(convert(v))}` : '—'
                                              })()}
                                            </td>
                                            <td className={`py-1.5 text-right font-medium ${!hasGainData ? 'text-[var(--arvo-fg-faint)]' : d.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {!hasGainData ? '—' : `${d.gain >= 0 ? '+' : ''}${fmt(d.gain)}`}
                                            </td>
                                            <td className={`py-1.5 text-right font-semibold ${gainPct == null ? 'text-[var(--arvo-fg-faint)]' : gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—'}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)]">
                {monthly.monthly.map((m) => {
                  const cf      = m.contributions ?? 0
                  const gain    = m.prev_total > 0 ? m.total - m.prev_total - cf : null
                  const denom   = m.prev_total + 0.5 * cf
                  const gainPct = gain != null && denom > 0 ? (gain / denom) * 100 : null
                  const isExpanded = expandedMonths.has(m.month)
                  const hasDetail  = (m.detail?.length ?? 0) > 0
                  return (
                    <div key={m.month}>
                      <div
                        onClick={() => hasDetail && toggleMonth(m.month)}
                        className={`px-4 py-3 flex items-center gap-3 ${hasDetail ? 'cursor-pointer' : ''} hover:bg-[var(--arvo-surface-2)] transition-colors`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {hasDetail && (
                              <span className={`text-[var(--arvo-fg-soft)] text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            )}
                            <span className="font-medium text-[var(--arvo-fg)] text-sm">{fmtMonth(m.month, intlLocale)}</span>
                          </div>
                          {cf !== 0 && (
                            <div className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">
                              {t.performance.contributions}: {cf > 0 ? '+' : ''}{fmt(cf)}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-[var(--arvo-fg)]">{m.total > 0 ? fmt(m.total) : '—'}</div>
                          <div className="flex items-center justify-end gap-2 mt-0.5">
                            {gain != null && (
                              <span className={`text-xs font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gain >= 0 ? '+' : ''}{fmt(gain)}
                              </span>
                            )}
                            <span className={`text-xs font-semibold ${gainPct == null ? 'text-[var(--arvo-fg-faint)]' : gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isExpanded && m.detail && (
                        <div className="bg-[var(--arvo-surface-2)]/70 px-4 pb-3">
                          <div className="divide-y divide-[var(--arvo-border)]">
                            {m.detail.filter(d => d.value > 0).sort((a, b) => b.value - a.value).map(d => {
                              const hasGainData = d.prev_value > 0
                              const dd = d.prev_value + 0.5 * d.contributions
                              const gp = hasGainData && dd > 0 ? (d.gain / dd) * 100 : null
                              return (
                                <div
                                  key={d.asset_id}
                                  onClick={() => navigate(`/assets/${d.asset_id}`)}
                                  className="py-2 flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
                                >
                                  <span className="text-xs font-semibold text-[var(--arvo-fg)]">{d.code}</span>
                                  <div className="text-right">
                                    <div className="text-xs text-[var(--arvo-fg)]">{fmt(d.value)}</div>
                                    <div className={`text-[11px] font-semibold ${gp == null ? 'text-[var(--arvo-fg-faint)]' : gp >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {gp != null ? `${gp >= 0 ? '+' : ''}${gp.toFixed(2)}%` : '—'}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
