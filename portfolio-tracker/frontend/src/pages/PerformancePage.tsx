import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { usePerformanceMonthly, usePerformanceBenchmarks, usePortfolioValue, usePerformanceInception, usePerformanceDaily } from '../hooks/usePortfolio'
import { addMonths, dailyComparisonSeries } from '../lib/performanceComparison'
import { useDividendSummary, useDividends } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import { PageTitle, Segmented, StatDelta } from '../components/ui'
import { Icon } from '../components/icons'
import FxRateNote from '../components/FxRateNote'
import { ArvoTooltip, CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_SERIES } from '../components/charts'
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


type PeriodMode = 'current_month' | 'last_30d' | 'last_12m' | 'ytd' | 'inception'

const kpiLabelStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-body)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--arvo-fg-soft)',
  whiteSpace: 'nowrap',
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

  // Série diária de comparação (Carteira vs benchmarks) — algoritmo compartilhado
  // em lib/performanceComparison, o MESMO usado na linha de 30d do card de patrimônio na Hoje.
  const dailyChartData = useDailyChart
    ? dailyComparisonSeries(dailyData?.daily ?? [], benchmarks?.monthly ?? [])
        .map(p => ({ month: fmtDayLabel(p.date, intlLocale), portfolio: p.portfolio, cdi: p.cdi, ibov: p.ibov, sp500: p.sp500 }))
    : []

  const lastDailyPoint = dailyChartData[dailyChartData.length - 1]

  const { data: monthly,    loading: mLoading, refresh: refreshMonthly    } = usePerformanceMonthly(from, to)

  // Summary derived from the monthly series instead of a separate /performance/summary request:
  // both endpoints recompute the same portfolio values server-side, so for long ranges ("Início")
  // the extra request doubled the heaviest work on the page. value_start = prev_total of the first
  // month (same prev-month anchor /summary used), value_end = last month's total, contributions =
  // sum of the per-month flows — identical numbers, one request less.
  const summary = (() => {
    const rows = monthly?.monthly ?? []
    if (!rows.length) return null
    const contributions = Math.round(rows.reduce((s, m) => s + (m.contributions ?? 0), 0) * 100) / 100
    return {
      value_start:   rows[0].prev_total,
      value_end:     rows[rows.length - 1].total,
      contributions,
    }
  })()
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
    refreshMonthly()
    refreshBenchmarks()
  }, [refreshMonthly, refreshBenchmarks])

  const [showCDI,   setShowCDI]   = useState(true)
  const [showIBOV,  setShowIBOV]  = useState(false)
  const [showSP500, setShowSP500] = useState(false)
  const [chartView, setChartView] = useState<'return' | 'value'>('return')
  // Escala do gráfico de patrimônio. Log é essencial no "Início": um patrimônio
  // que multiplicou centenas de vezes deixa os primeiros anos colados no zero
  // em escala linear (não é bug de dado, é o range).
  const [valueScale, setValueScale] = useState<'linear' | 'log'>('linear')

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
      .then(() => { refreshMonthly(); refreshBenchmarks() })
      .catch(() => {})
  }, [mLoading, monthly, livePortfolio?.total_brl, refreshMonthly, refreshBenchmarks])

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
    // No período "Início" o periodStart é 0 (nada antes da criação da carteira);
    // a base vira os aportes (0.5·cfCumul), como no resumo/displayReturnPct.
    // O antigo periodStart > 0 zerava a Carteira inteira no gráfico de Retorno %.
    const portfolioPct = denom > 0
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
  // line and a cumulative contributions ("Aportes") line — analogous to the asset-level
  // `invested_brl`, this is the running total invested since portfolio inception, so the
  // gap between the two lines represents total gains from valorização/juros compostos.
  const dailyValuePts = useDailyChart ? (dailyData?.daily ?? []).filter(pt => pt.total > 0) : []
  const valueChartData = useDailyChart
    ? dailyValuePts.map(pt => ({
        month: fmtDayLabel(pt.date, intlLocale),
        value: convert(pt.total),
        target: targetAtDate(pt.date),
        contributions: convert(pt.contributions_cumulative ?? 0),
      }))
    : monthsWithData.map(m => {
        const [y, mo] = m.month.split('-').map(Number)
        const lastDay = new Date(y, mo, 0).getDate()
        return {
          month: fmtMonth(m.month, intlLocale),
          value: convert(m.total),
          target: targetAtDate(`${m.month}-${String(lastDay).padStart(2, '0')}`),
          contributions: convert(m.contributions_cumulative ?? 0),
        }
      })

  // Anchor the chart's last point (current month / today) to the live portfolio total —
  // the series is day-cached, so without this the last point showed the morning's value
  // while the page header and Dashboard show the live one. Same rule the "Fim do período"
  // card already applies.
  {
    const lastIsCurrent = useDailyChart
      ? dailyValuePts.length > 0 && dailyValuePts[dailyValuePts.length - 1].date === localDate(now)
      : monthsWithData.length > 0 && monthsWithData[monthsWithData.length - 1].month === currentYM
    const live = livePortfolio?.total_brl
    if (lastIsCurrent && live != null && live > 0 && valueChartData.length > 0) {
      valueChartData[valueChartData.length - 1].value = convert(live)
    }
  }

  // Scale the value chart's Y axis to "value" and "contributions" only, so the
  // long-horizon Freedom Plan "target" line (often several times larger) doesn't
  // compress the Aportes line against the bottom axis. The target line is allowed
  // to overflow/clip above this domain.
  const valueChartYDomain = (() => {
    const vals = valueChartData.flatMap(d => [d.value, d.contributions]).filter((v): v is number => typeof v === 'number')
    if (vals.length === 0) return ['auto', 'auto'] as const
    // Don't force 0 into the range — forcing it as a floor candidate pushed the axis
    // below zero (a negative net worth minimum that never happened) whenever the
    // actual data stayed comfortably positive and far from zero.
    const max = Math.max(...vals)
    const min = Math.min(...vals)
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.1
    return [Math.floor(min - pad), Math.ceil(max + pad)] as [number, number]
  })()

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

  const isLoading = mLoading || bLoading || (useDailyChart && dailyLoading)

  const modeButtons: Array<{ key: PeriodMode; label: string; disabled?: boolean }> = [
    { key: 'current_month', label: t.performance.currentMonth },
    { key: 'last_30d',      label: t.performance.last30d      },
    { key: 'last_12m',      label: t.performance.last12m      },
    { key: 'ytd',           label: 'YTD'                      },
    { key: 'inception',     label: t.performance.inception, disabled: !inceptionYM },
  ]

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={t.dashboard.eyebrow}
        title="Performance"
        actions={
          <>
            <div className="w-full sm:w-auto">
              <Segmented<PeriodMode>
                ariaLabel={t.performance.subtitle}
                value={mode}
                onChange={setMode}
                options={modeButtons.map(({ key, label, disabled }) => ({ value: key, label, disabled }))}
              />
            </div>

            {mode === 'ytd' && (
              <button
                onClick={() => setDailyYtd(v => !v)}
                className="px-3 py-1.5 transition-colors"
                style={{
                  fontFamily: 'var(--arvo-font-body)',
                  fontSize: 12,
                  letterSpacing: '0.04em',
                  borderRadius: 'var(--arvo-radius-xs)',
                  border: '1px solid var(--arvo-border)',
                  background: dailyYtd ? 'var(--arvo-pill-active-bg)' : 'transparent',
                  color: dailyYtd ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)',
                }}
              >{t.performance.daily}</button>
            )}

            <button
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label={t.performance.recalculateTitle}
              title={t.performance.recalculateTitle}
              className="arvo-btn arvo-btn--ghost"
              style={{ width: 32, height: 32, padding: 0 }}
            >
              <Icon name="refresh" size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          {summary && (
            <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', position: 'relative' }}>
              {/* Desktop: floats top-right of the card; mobile: static line above
                  the grid (the absolute version overlapped the 2-col KPI grid) */}
              <div className="hidden sm:block" style={{ position: 'absolute', top: 14, right: 18 }}>
                <FxRateNote />
              </div>
              <div className="sm:hidden" style={{ marginBottom: 10 }}>
                <FxRateNote style={{ display: 'inline-block' }} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={kpiLabelStyle}>{t.performance.periodStart}</span>
                  <span className="arvo-num text-base sm:text-lg" style={{ fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>
                    {summary.value_start > 0 ? fmt(summary.value_start) : '-'}
                  </span>
                </div>
                <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
                  <span style={kpiLabelStyle}>{t.performance.periodEnd}</span>
                  <span className="arvo-num text-base sm:text-lg" style={{ fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>
                    {fmt(displayValueEnd)}
                  </span>
                </div>
                <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
                  <span style={kpiLabelStyle}>{t.performance.absoluteReturn}</span>
                  <StatDelta className="text-base sm:text-lg" value={displayReturnAbs} formatted={fmt(Math.abs(displayReturnAbs))} />
                </div>
                <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
                  <span style={kpiLabelStyle}>{t.performance.returnPct}</span>
                  {displayReturnPct != null
                    ? <StatDelta className="text-base sm:text-lg" value={displayReturnPct} formatted={`${Math.abs(displayReturnPct).toFixed(2)}%`} />
                    : <span className="arvo-num text-base sm:text-lg" style={{ color: 'var(--arvo-fg-faint)' }}>-</span>
                  }
                  <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.performance.simpleDietz}</span>
                </div>
              </div>
            </div>
          )}

          {(() => {
            const chartDataActive = useDailyChart ? dailyChartData : chartData
            if (chartDataActive.length === 0) {
              return (
                <div className="rounded-2xl p-12 text-center text-[var(--arvo-fg-soft)]" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
                  <p className="text-base font-medium text-[var(--arvo-fg-muted)]">{t.performance.noData}</p>
                  <p className="text-sm mt-1">{t.performance.visitDashboard}</p>
                </div>
              )
            }
            const portfolioDot = useDailyChart ? { r: 2, fill: 'var(--arvo-fg)' } : { r: 3, fill: 'var(--arvo-fg)' }
            const portfolioActiveDot = useDailyChart ? { r: 4 } : { r: 5 }
            const legendStyle = { fontSize: 12, fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg-soft)' }
            return (
              <div className="rounded-2xl p-6" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h2 className="font-semibold text-[var(--arvo-fg)]">
                    {chartView === 'value' ? t.dashboard.patrimony : t.performance.accumulatedReturn} · {periodLabel}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Segmented<'return' | 'value'>
                      ariaLabel={t.performance.accumulatedReturn}
                      value={chartView}
                      onChange={setChartView}
                      options={[
                        { value: 'return' as const, label: t.performance.returnPct },
                        { value: 'value'  as const, label: t.dashboard.patrimony },
                      ]}
                    />
                    {chartView === 'value' && (
                      <Segmented<'linear' | 'log'>
                        ariaLabel="Escala"
                        value={valueScale}
                        onChange={setValueScale}
                        options={[
                          { value: 'linear' as const, label: t.performance.scaleLinear ?? 'Linear' },
                          { value: 'log' as const, label: t.performance.scaleLog ?? 'Log' },
                        ]}
                      />
                    )}
                    {chartView === 'return' && (
                      <div className="flex items-center gap-1.5">
                        {([
                          ['CDI', showCDI, setShowCDI, CHART_SERIES.cdi],
                          ['IBOV', showIBOV, setShowIBOV, CHART_SERIES.ibov],
                          ['S&P500', showSP500, setShowSP500, CHART_SERIES.sp500],
                        ] as const).map(([lbl, active, setter, color]) => (
                          <button
                            key={lbl}
                            onClick={() => (setter as (v: boolean) => void)(!active)}
                            className="arvo-num inline-flex items-center gap-1.5 px-2.5 py-1 transition-colors"
                            style={{
                              fontFamily: 'var(--arvo-font-body)',
                              fontSize: 12,
                              letterSpacing: '0.04em',
                              borderRadius: 'var(--arvo-radius-xs)',
                              border: `1px solid ${active ? color : 'var(--arvo-border)'}`,
                              color: active ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, opacity: active ? 1 : 0.35, flexShrink: 0 }} />
                            {lbl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ height: 'clamp(300px, 24vw, 420px)' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {chartView === 'value' ? (
                      <LineChart data={valueChartData}>
                        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="month" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis
                          tick={CHART_AXIS_TICK}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={v => {
                            const n = typeof v === 'number' ? v : 0
                            return currency === 'BRL' ? `${(n / 1000).toFixed(0)}k` : (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0))
                          }}
                          scale={valueScale}
                          domain={valueScale === 'log'
                            ? [Math.max(1, Math.floor(Number(valueChartYDomain[0]) || 1)), 'auto']
                            : valueChartYDomain}
                          allowDataOverflow={!!activePlan}
                        />
                        <Tooltip
                          content={
                            <ArvoTooltip
                              formatter={(v, name) => [
                                new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v),
                                name,
                              ]}
                            />
                          }
                        />
                        <Legend wrapperStyle={legendStyle} />
                        <Line type="monotone" dataKey="value" name={t.dashboard.patrimony} stroke={CHART_SERIES.portfolio} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="stepAfter" dataKey="contributions" name={t.performance.contributions} stroke="var(--arvo-fg-soft)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
                        {activePlan && <Line type="monotone" dataKey="target" name={t.dashboard.targetLine} stroke={CHART_SERIES.ibov} strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />}
                      </LineChart>
                    ) : (
                      <LineChart data={chartDataActive}>
                        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="month" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis
                          tick={CHART_AXIS_TICK}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={v => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                        />
                        <Tooltip
                          content={
                            <ArvoTooltip
                              formatter={(v, name) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, name]}
                            />
                          }
                        />
                        <Legend wrapperStyle={legendStyle} />
                        <Line type="monotone" dataKey="portfolio" name={t.performance.wallet} stroke={CHART_SERIES.portfolio} strokeWidth={2} dot={portfolioDot} activeDot={portfolioActiveDot} />
                        {showCDI   && <Line type="monotone" dataKey="cdi"   name="CDI"    stroke={CHART_SERIES.cdi}   strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                        {showIBOV  && <Line type="monotone" dataKey="ibov"  name="IBOV"   stroke={CHART_SERIES.ibov}  strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                        {showSP500 && <Line type="monotone" dataKey="sp500" name="S&P500" stroke={CHART_SERIES.sp500} strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
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
                { label: t.performance.wallet, value: portfolioAccum, color: CHART_SERIES.portfolio },
                { label: 'CDI',       value: cdiAccum,   color: CHART_SERIES.cdi },
                { label: 'IBOV',      value: ibovAccum,  color: CHART_SERIES.ibov },
                { label: 'S&P500',    value: sp500Accum, color: CHART_SERIES.sp500 },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl p-4 flex flex-col gap-1.5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
                  <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {label}
                  </p>
                  {value != null
                    ? <StatDelta className="text-xl" value={value} formatted={`${Math.abs(value).toFixed(2)}%`} />
                    : <span className="arvo-num text-xl" style={{ color: 'var(--arvo-fg-faint)' }}>-</span>
                  }
                </div>
              ))}
            </div>
          )}

          {monthly && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
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
                      <th className="px-4 py-3 text-right">{(t as unknown as Record<string,Record<string,string>>).dividends?.title ?? 'Dividendos'}</th>
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
                            <td className="px-4 py-3 text-right arvo-num text-[var(--arvo-fg)]">
                              {m.total > 0 ? fmt(m.total) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right arvo-num text-[var(--arvo-fg-muted)] text-xs">
                              {cf !== 0 ? `${cf > 0 ? '+' : ''}${fmt(cf)}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-right arvo-num text-xs font-medium text-green-600">
                              {(() => { const v = divByMonth.get(m.month); return v ? `+${fmt(convert(v))}` : '-' })()}
                            </td>
                            <td className={`px-4 py-3 text-right arvo-num font-medium ${
                              gain == null ? 'text-[var(--arvo-fg-soft)]' :
                              gain >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gain != null ? `${gain >= 0 ? '+' : ''}${fmt(gain)}` : '-'}
                            </td>
                            <td className={`px-4 py-3 text-right arvo-num text-xs font-semibold ${
                              gainPct == null ? 'text-[var(--arvo-fg-faint)]' :
                              gainPct >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '-'}
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
                                      <th className="py-1.5 text-right font-medium select-none">
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
                                            <td className="py-1.5 text-right arvo-num text-[var(--arvo-fg)]">
                                              {fmt(d.value)}
                                            </td>
                                            <td className="py-1.5 text-right arvo-num text-[var(--arvo-fg-muted)]">
                                              {d.contributions !== 0 ? `${d.contributions > 0 ? '+' : ''}${fmt(d.contributions)}` : '-'}
                                            </td>
                                            <td className="py-1.5 text-right arvo-num text-xs font-medium text-green-600">
                                              {(() => {
                                                const v = divByMonthAsset.get(m.month)?.get(d.asset_id)
                                                return v ? `+${fmt(convert(v))}` : '-'
                                              })()}
                                            </td>
                                            <td className={`py-1.5 text-right arvo-num font-medium ${!hasGainData ? 'text-[var(--arvo-fg-faint)]' : d.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {!hasGainData ? '-' : `${d.gain >= 0 ? '+' : ''}${fmt(d.gain)}`}
                                            </td>
                                            <td className={`py-1.5 text-right arvo-num font-semibold ${gainPct == null ? 'text-[var(--arvo-fg-faint)]' : gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '-'}
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
                            <div className="text-xs arvo-num text-[var(--arvo-fg-soft)] mt-0.5">
                              {t.performance.contributions}: {cf > 0 ? '+' : ''}{fmt(cf)}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm arvo-num font-medium text-[var(--arvo-fg)]">{m.total > 0 ? fmt(m.total) : '-'}</div>
                          <div className="flex items-center justify-end gap-2 mt-0.5">
                            {gain != null && (
                              <span className={`text-xs arvo-num font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gain >= 0 ? '+' : ''}{fmt(gain)}
                              </span>
                            )}
                            <span className={`text-xs arvo-num font-semibold ${gainPct == null ? 'text-[var(--arvo-fg-faint)]' : gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '-'}
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
                                    <div className="text-xs arvo-num text-[var(--arvo-fg)]">{fmt(d.value)}</div>
                                    <div className={`text-[11px] arvo-num font-semibold ${gp == null ? 'text-[var(--arvo-fg-faint)]' : gp >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {gp != null ? `${gp >= 0 ? '+' : ''}${gp.toFixed(2)}%` : '-'}
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
