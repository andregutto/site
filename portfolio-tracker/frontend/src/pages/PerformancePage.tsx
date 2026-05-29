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

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

function fmtDayLabel(dateStr: string) {
  const [, m, day] = dateStr.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${parseInt(day)}/${names[parseInt(m) - 1]}`
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
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
      <p className="text-gray-400 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${
        positive === true ? 'text-green-600' :
        positive === false ? 'text-red-600' :
        'text-gray-900'
      }`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function PerformancePage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentYM   = localYM(now)

  const navigate = useNavigate()
  const { convert, currency } = useCurrency()
  const { t } = useI18n()
  const { data: livePortfolio } = usePortfolioValue()
  const inceptionYM = usePerformanceInception()

  function fmt(valueBrl: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency,
      maximumFractionDigits: 0,
    }).format(convert(valueBrl))
  }

  const [mode, setMode] = useState<PeriodMode>('ytd')

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
      case 'current_month': return fmtMonth(currentYM)
      case 'last_30d':      return `${fmtMonth(addMonths(currentYM, -1))} – ${fmtMonth(currentYM)}`
      case 'last_12m':      return `${fmtMonth(addMonths(currentYM, -11))} – ${fmtMonth(currentYM)}`
      case 'ytd':           return `Jan/${currentYear.toString().slice(2)} – ${fmtMonth(currentYM)}`
      case 'inception':     return inceptionYM ? `${fmtMonth(inceptionYM)} – ${fmtMonth(currentYM)}` : `– ${fmtMonth(currentYM)}`
    }
  })()

  const useDailyChart = mode === 'current_month' || mode === 'last_30d'
  const dailyFrom = useDailyChart
    ? mode === 'current_month'
      ? `${currentYM}-01`
      : localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29))
    : null
  const dailyTo = useDailyChart ? localDate(now) : null
  const { data: dailyData, loading: dailyLoading } = usePerformanceDaily(dailyFrom, dailyTo)

  const dailyChartData = useDailyChart ? (() => {
    const pts = (dailyData?.daily ?? []).filter(pt => pt.total > 0)
    if (pts.length === 0) return []
    const periodStart = pts[0].total - (pts[0].contributions ?? 0)
    let cfCumul = 0
    return pts.map(pt => {
      cfCumul += (pt.contributions ?? 0)
      const denom = periodStart + 0.5 * cfCumul
      const retPct = periodStart > 0 && denom > 0
        ? Math.round(((pt.total - periodStart - cfCumul) / denom) * 10000) / 100
        : 0
      return { month: fmtDayLabel(pt.date), portfolio: retPct }
    })
  })() : []

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
  // Fetch benchmarks from one month before `from` so we have the pre-period base for normalization
  const { data: benchmarks, loading: bLoading, refresh: refreshBenchmarks } = usePerformanceBenchmarks(addMonths(from, -1), to)

  const handleRefresh = useCallback(() => {
    refreshSummary()
    refreshMonthly()
    refreshBenchmarks()
  }, [refreshSummary, refreshMonthly, refreshBenchmarks])

  const [showCDI,   setShowCDI]   = useState(true)
  const [showIBOV,  setShowIBOV]  = useState(false)
  const [showSP500, setShowSP500] = useState(false)
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
    if (detailSort !== col) return <span className="text-gray-300">↕</span>
    return <span className="text-[#0D0D0D]">{detailDir === 'asc' ? '↑' : '↓'}</span>
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
      month:     fmtMonth(m.month),
      portfolio: portfolioPct,
      cdi:       (b?.cdi_cum != null && baseCDI != null) ? pct(b.cdi_cum, baseCDI) : null,
      ibov:      (b?.ibov_cum  != null && baseIBOV  != null) ? pct(b.ibov_cum,  baseIBOV)  : null,
      sp500:     (b?.sp500_cum != null && baseSP500 != null) ? pct(b.sp500_cum, baseSP500) : null,
    }
  })

  const lastPoint = chartData[chartData.length - 1]
  const cdiAccum  = lastPoint?.cdi   ?? null
  const ibovAccum = lastPoint?.ibov  ?? null
  const sp500Accum = lastPoint?.sp500 ?? null

  // "Fim do período" card: use live total when available so the BRL amount matches dashboard.
  const endsAtCurrentMonth = to === currentYM
  const liveTotal = livePortfolio?.total_brl ?? null
  const displayValueEnd = endsAtCurrentMonth && liveTotal !== null ? liveTotal : (summary?.value_end ?? 0)

  // Return % always uses summary.value_end — stable, no race condition with livePortfolio.
  const summaryValueEnd  = summary?.value_end ?? 0
  const displayReturnAbs = summary ? summaryValueEnd - summary.value_start - summary.contributions : 0
  const dietzDenom       = summary ? summary.value_start + 0.5 * summary.contributions : 0
  const displayReturnPct = dietzDenom > 0 ? (displayReturnAbs / dietzDenom) * 100 : null

  // portfolioAccum must be declared AFTER displayReturnPct
  const portfolioAccum = displayReturnPct

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
          <h1 style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>Performance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{t.performance.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {modeButtons.map(({ key, label, disabled }) => (
            <button
              key={key}
              onClick={() => !disabled && setMode(key)}
              disabled={disabled}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                disabled
                  ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed'
                  : mode === key
                    ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
              }`}
            >{label}</button>
          ))}

          <span className="text-gray-200 text-sm">|</span>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            title={t.performance.recalculateTitle}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-[#0D0D0D] hover:text-[#0D0D0D] transition-colors disabled:opacity-40"
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

          {useDailyChart ? (
            dailyChartData.length > 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-4">{t.performance.accumulatedReturn} · {periodLabel}</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickFormatter={v => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`}
                      />
                      <Tooltip
                        formatter={(v) => [`${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`]}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="portfolio" name={t.performance.wallet} stroke="#0D0D0D" strokeWidth={2} dot={{ r: 2, fill: '#0D0D0D' }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
                <p className="text-base font-medium text-gray-500">{t.performance.noData}</p>
                <p className="text-sm mt-1">{t.performance.visitDashboard}</p>
              </div>
            )
          ) : chartData.length > 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="font-semibold text-gray-800">{t.performance.accumulatedReturn} · {periodLabel}</h2>
                <div className="flex items-center gap-2">
                  {([['CDI', showCDI, setShowCDI, '#16a34a'], ['IBOV', showIBOV, setShowIBOV, '#7c3aed'], ['S&P500', showSP500, setShowSP500, '#f59e0b']] as const).map(
                    ([lbl, active, setter, color]) => (
                      <button
                        key={lbl}
                        onClick={() => (setter as (v: boolean) => void)(!active)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                          active ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                        }`}
                        style={active ? { backgroundColor: color as string, borderColor: color as string } : {}}
                      >{lbl}</button>
                    )
                  )}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                    />
                    <Tooltip
                      formatter={(v) => [`${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="portfolio" name={t.performance.wallet}  stroke="#0D0D0D" strokeWidth={2}   dot={{ r: 3, fill: '#0D0D0D' }} activeDot={{ r: 5 }} />
                    {showCDI   && <Line type="monotone" dataKey="cdi"   name="CDI"    stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showIBOV  && <Line type="monotone" dataKey="ibov"  name="IBOV"   stroke="#7c3aed" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showSP500 && <Line type="monotone" dataKey="sp500" name="S&P500" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
              <p className="text-base font-medium text-gray-500">{t.performance.noData}</p>
              <p className="text-sm mt-1">{t.performance.visitDashboard}</p>
            </div>
          )}

          {/* Benchmark comparison cards — only for monthly % chart */}
          {!useDailyChart && chartData.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: t.performance.wallet, value: portfolioAccum, text: 'text-[#0D0D0D]' },
                { label: 'CDI',       value: cdiAccum,       text: 'text-green-600' },
                { label: 'IBOV',      value: ibovAccum,      text: 'text-violet-700' },
                { label: 'S&P500',    value: sp500Accum,     text: 'text-amber-600' },
              ].map(({ label, value, text }) => (
                <div key={label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                  <p className="text-gray-400 text-xs">{label}</p>
                  <p className={`text-xl font-bold mt-1 ${value != null ? text : 'text-gray-300'}`}>
                    {value != null ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {monthly && (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{t.performance.monthlyEvolution}</h2>
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">{t.performance.month}</th>
                      <th className="px-4 py-3 text-right">{t.performance.wealth}</th>
                      <th className="px-4 py-3 text-right">{t.performance.contributions}</th>
                      <th className="px-4 py-3 text-right text-green-700">{(t as unknown as Record<string,Record<string,string>>).dividends?.title ?? 'Dividendos'}</th>
                      <th className="px-4 py-3 text-right">{t.performance.gainLoss}</th>
                      <th className="px-4 py-3 text-right">{t.performance.returnAbbr}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
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
                            className={`${hasDetail ? 'cursor-pointer' : ''} hover:bg-gray-50 transition-colors`}
                          >
                            <td className="px-4 py-3 font-medium text-gray-700">
                              <span className="flex items-center gap-1.5">
                                {hasDetail && (
                                  <span className={`text-gray-400 text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                )}
                                {fmtMonth(m.month)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-900">
                              {m.total > 0 ? fmt(m.total) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 text-xs">
                              {cf !== 0 ? `${cf > 0 ? '+' : ''}${fmt(cf)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-medium text-green-600">
                              {(() => { const v = divByMonth.get(m.month); return v ? `+${fmt(convert(v))}` : '—' })()}
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${
                              gain == null ? 'text-gray-400' :
                              gain >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gain != null ? `${gain >= 0 ? '+' : ''}${fmt(gain)}` : '—'}
                            </td>
                            <td className={`px-4 py-3 text-right text-xs font-semibold ${
                              gainPct == null ? 'text-gray-300' :
                              gainPct >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—'}
                            </td>
                          </tr>
                          {isExpanded && m.detail && (
                            <tr key={`${m.month}-detail`} className="bg-gray-50/70">
                              <td colSpan={6} className="px-6 pb-3 pt-1">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400 border-b border-gray-200">
                                      <th className="py-1.5 text-left font-medium">{t.performance.asset}</th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-gray-600 select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('value') }}>
                                        {t.performance.finalValue} <DetailSortIcon col="value" />
                                      </th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-gray-600 select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('contributions') }}>
                                        {t.performance.contributions} <DetailSortIcon col="contributions" />
                                      </th>
                                      <th className="py-1.5 text-right font-medium text-green-700 select-none">
                                        {(t as unknown as Record<string,Record<string,string>>).dividends?.title ?? 'Div.'}
                                      </th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-gray-600 select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('gain') }}>
                                        {t.performance.gainLoss} <DetailSortIcon col="gain" />
                                      </th>
                                      <th className="py-1.5 text-right font-medium cursor-pointer hover:text-gray-600 select-none" onClick={e => { e.stopPropagation(); toggleDetailSort('pct') }}>
                                        % <DetailSortIcon col="pct" />
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
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
                                            className="cursor-pointer hover:bg-[#0D0D0D]/5 transition-colors rounded"
                                          >
                                            <td className="py-1.5 text-gray-700">
                                              <span className="font-semibold hover:text-[#0D0D0D] transition-colors">{d.code}</span>
                                              {d.name && d.name !== d.code && (
                                                <span className="text-gray-400 ml-1 truncate max-w-[120px] inline-block align-bottom">{d.name}</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 text-right text-gray-800">
                                              {fmt(d.value)}
                                            </td>
                                            <td className="py-1.5 text-right text-gray-500">
                                              {d.contributions !== 0 ? `${d.contributions > 0 ? '+' : ''}${fmt(d.contributions)}` : '—'}
                                            </td>
                                            <td className="py-1.5 text-right text-xs font-medium text-green-600">
                                              {(() => {
                                                const v = divByMonthAsset.get(m.month)?.get(d.asset_id)
                                                return v ? `+${fmt(convert(v))}` : '—'
                                              })()}
                                            </td>
                                            <td className={`py-1.5 text-right font-medium ${!hasGainData ? 'text-gray-300' : d.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {!hasGainData ? '—' : `${d.gain >= 0 ? '+' : ''}${fmt(d.gain)}`}
                                            </td>
                                            <td className={`py-1.5 text-right font-semibold ${gainPct == null ? 'text-gray-300' : gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
              <div className="sm:hidden divide-y divide-gray-50">
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
                        className={`px-4 py-3 flex items-center gap-3 ${hasDetail ? 'cursor-pointer' : ''} hover:bg-gray-50 transition-colors`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {hasDetail && (
                              <span className={`text-gray-400 text-xs transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            )}
                            <span className="font-medium text-gray-700 text-sm">{fmtMonth(m.month)}</span>
                          </div>
                          {cf !== 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {t.performance.contributions}: {cf > 0 ? '+' : ''}{fmt(cf)}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-gray-900">{m.total > 0 ? fmt(m.total) : '—'}</div>
                          <div className="flex items-center justify-end gap-2 mt-0.5">
                            {gain != null && (
                              <span className={`text-xs font-medium ${gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gain >= 0 ? '+' : ''}{fmt(gain)}
                              </span>
                            )}
                            <span className={`text-xs font-semibold ${gainPct == null ? 'text-gray-300' : gainPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isExpanded && m.detail && (
                        <div className="bg-gray-50/70 px-4 pb-3">
                          <div className="divide-y divide-gray-100">
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
                                  <span className="text-xs font-semibold text-gray-700">{d.code}</span>
                                  <div className="text-right">
                                    <div className="text-xs text-gray-800">{fmt(d.value)}</div>
                                    <div className={`text-[11px] font-semibold ${gp == null ? 'text-gray-300' : gp >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
