import { useState, useMemo } from 'react'
import { useDividends, useDividendSummary, useDividendSync } from '../hooks/useDividends'
import { PageLoader } from '../components/ArvoLoader'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { StatDelta } from '../components/ui'
import { ArvoTooltip, CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_SERIES } from '../components/charts'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

type Period = 'ytd' | 'last12m' | 'all'
type Tab    = 'history' | 'projection'

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function DividendsPage() {
  const { convert, currency, hideValues } = useCurrency()
  const { t } = useI18n()
  const d = t.dividends
  const now         = new Date()
  const todayStr    = now.toISOString().split('T')[0]
  const currentYear = now.getFullYear()
  const currentYM   = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [tab,          setTab]          = useState<Tab>('history')
  const [period,       setPeriod]       = useState<Period>('ytd')
  const [sortCol,      setSortCol]      = useState<'total_brl' | 'count'>('total_brl')
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc')
  const [showAllPayers, setShowAllPayers] = useState(false)

  const { from, to } = useMemo(() => {
    if (period === 'ytd')     return { from: `${currentYear}-01-01`, to: todayStr }
    if (period === 'last12m') {
      const x = new Date(now); x.setFullYear(x.getFullYear() - 1)
      return { from: x.toISOString().split('T')[0], to: todayStr }
    }
    return { from: '2000-01-01', to: todayStr }
  }, [period, todayStr, currentYear])

  const from36m = (() => { const x = new Date(now); x.setMonth(x.getMonth() - 35); return x.toISOString().split('T')[0] })()
  const ytdFrom = `${currentYear}-01-01`

  const { data: summary,    loading: sLoading, refresh: refreshSummary } = useDividendSummary(from, to)
  const { data: rows,       loading: rLoading, refresh: refreshRows    } = useDividends(from, to)
  const { data: summary36m, loading: s36Loading } = useDividendSummary(from36m, todayStr)
  const { data: ytdSummary } = useDividendSummary(ytdFrom, todayStr)
  const { sync, syncing } = useDividendSync()

  function fmt(brl: number) {
    if (hideValues) return '•••'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(convert(brl))
  }
  function fmtFull(brl: number) {
    if (hideValues) return '•••'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(convert(brl))
  }
  function fmtDate(s: string | null | undefined) {
    if (!s) return '—'
    const [y, m, day] = s.split('-')
    return `${day}/${m}/${y}`
  }
  function typeLabel(type: string) {
    if (type === 'jcp')          return d.typeJcp
    if (type === 'rendimento')   return d.typeRendimento
    if (type === 'amortization') return d.typeAmortization
    return d.typeDividend
  }

  const chartData = (summary?.by_month ?? []).map(m => ({
    month: fmtMonth(m.month), value: convert(m.total_brl),
  }))

  const monthlyDelta = useMemo(() => {
    const months = summary?.by_month ?? []
    if (months.length < 2) return null
    const prev = months[months.length - 2].total_brl
    const last = months[months.length - 1].total_brl
    if (prev <= 0) return null
    return ((last - prev) / prev) * 100
  }, [summary?.by_month])

  const byAssetSorted = useMemo(() => {
    const list = [...(summary?.by_asset ?? [])]
    list.sort((a, b) => {
      const cmp = sortCol === 'total_brl' ? a.total_brl - b.total_brl : a.count - b.count
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [summary?.by_asset, sortCol, sortDir])

  function toggleSort(col: 'total_brl' | 'count') {
    if (sortCol === col) setSortDir(x => x === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  // ── Projection logic (seasonal) ───────────────────────────────────────────
  const { projChartData, total12m, avgMonthly6m, projected12m } = useMemo(() => {
    if (!summary36m) return { projChartData: [], total12m: 0, avgMonthly6m: 0, projected12m: 0 }
    const byMonth = Object.fromEntries(summary36m.by_month.map(m => [m.month, m.total_brl]))

    const hist12: string[] = []
    for (let i = 12; i >= 1; i--) hist12.push(addMonths(currentYM, -i))
    const total12m = hist12.reduce((s, m) => s + (byMonth[m] ?? 0), 0)

    const hist6 = hist12.slice(-6)
    const avgMonthly6m = hist6.reduce((s, m) => s + (byMonth[m] ?? 0), 0) / 6

    // Build per-calendar-month averages from 36m of history for seasonal projection
    const calTotals: Record<number, { sum: number; count: number }> = {}
    for (const { month, total_brl } of summary36m.by_month) {
      if (total_brl <= 0) continue
      const cal = parseInt(month.slice(5, 7))
      if (!calTotals[cal]) calTotals[cal] = { sum: 0, count: 0 }
      calTotals[cal].sum += total_brl
      calTotals[cal].count += 1
    }
    const overallAvg = avgMonthly6m
    const seasonalFor = (cal: number) => {
      const d = calTotals[cal]
      return d && d.count > 0 ? d.sum / d.count : overallAvg
    }

    const hist24: string[] = []
    for (let i = 24; i >= 1; i--) hist24.push(addMonths(currentYM, -i))
    hist24.push(currentYM)

    const historical = hist24.map(ym => ({
      label: fmtMonth(ym),
      received: Math.round(convert(byMonth[ym] ?? 0) * 100) / 100,
      projected: 0,
    }))

    const projMonths = Array.from({ length: 12 }, (_, i) => {
      const ym = addMonths(currentYM, i + 1)
      const cal = parseInt(ym.slice(5, 7))
      return { label: fmtMonth(ym), received: 0, projected: Math.round(convert(seasonalFor(cal)) * 100) / 100 }
    })

    return {
      projChartData: [...historical, ...projMonths],
      total12m,
      avgMonthly6m,
      projected12m: projMonths.reduce((s, m) => s + m.projected, 0),
    }
  }, [summary36m, currentYM, convert])

  const ytdTotal   = ytdSummary?.total_brl ?? 0
  const totalBrl   = summary?.total_brl ?? 0
  const isLoading  = tab === 'history' ? sLoading || rLoading : s36Loading

  const periodBtns: { key: Period; label: string }[] = [
    { key: 'ytd',     label: `YTD ${currentYear}` },
    { key: 'last12m', label: t.performance.last12m ?? 'Últimos 12m' },
    { key: 'all',     label: t.performance.inception ?? 'Todo período' },
  ]

  async function handleSync() {
    await sync(true)
    refreshSummary(); refreshRows()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>{d.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'history' && periodBtns.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                period === key ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] border-[var(--arvo-fg)]' : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] border-[var(--arvo-border)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)]'
              }`}>{label}</button>
          ))}
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors disabled:opacity-40">
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? d.syncing : d.syncBtn}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--arvo-track-bg)] p-1 rounded-xl w-fit">
        {([['history', d.history], ['projection', d.passiveTitle]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === key ? 'bg-[var(--arvo-surface)] shadow-sm text-[var(--arvo-fg)]' : 'text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]'
            }`}
          >{label}</button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : (
        tab === 'history' ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm">
                <p className="text-[var(--arvo-fg-soft)] text-xs uppercase tracking-wide">{d.totalReceived}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold arvo-num" style={{ color: 'var(--arvo-fg)' }}>{fmt(totalBrl)}</p>
                  {monthlyDelta != null && (
                    <StatDelta className="text-xs" value={monthlyDelta} formatted={`${Math.abs(monthlyDelta).toFixed(0)}%`} />
                  )}
                </div>
                <p className="text-xs text-[var(--arvo-fg-soft)] mt-1">{d.inPeriod}</p>
              </div>
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm">
                <p className="text-[var(--arvo-fg-soft)] text-xs uppercase tracking-wide">{d.count}</p>
                <p className="text-2xl font-bold mt-1 arvo-num" style={{ color: 'var(--arvo-fg)' }}>{rows.length}</p>
                <p className="text-xs text-[var(--arvo-fg-soft)] mt-1">{d.inPeriod}</p>
              </div>
            </div>

            {/* Top payers mini-ranking */}
            {byAssetSorted.length > 0 && (
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm">
                <p className="text-[var(--arvo-fg-soft)] text-xs uppercase tracking-wide mb-3">{d.topPayers}</p>
                <div className="space-y-3">
                  {byAssetSorted.slice(0, 3).map(a => {
                    const pct = byAssetSorted[0].total_brl > 0 ? (a.total_brl / byAssetSorted[0].total_brl) * 100 : 0
                    return (
                      <div key={a.asset_id}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[var(--arvo-fg)]">{a.code}</span>
                          <span className="text-sm font-semibold arvo-num" style={{ color: 'var(--arvo-fg)' }}>{fmt(a.total_brl)}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_SERIES.ocre }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Monthly chart */}
            {chartData.length > 0 && (
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm">
                <h2 className="text-xs font-medium text-[var(--arvo-fg-soft)] uppercase tracking-wide mb-4">{d.monthlyChart}</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barSize={28}>
                      <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="month" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                      <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false}
                        tickFormatter={v => new Intl.NumberFormat('pt-BR', { notation: 'compact', currency, style: 'currency', maximumFractionDigits: 0 }).format(v)} />
                      <Tooltip content={<ArvoTooltip formatter={(v) => [fmtFull(v), d.totalReceived]} />} />
                      <Bar dataKey="value" fill={CHART_SERIES.green} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* By-asset breakdown */}
            {byAssetSorted.length > 0 && (
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[var(--arvo-border-soft)]">
                  <h2 className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{d.topPayers}</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-soft)] text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Ativo</th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-[var(--arvo-fg-muted)] select-none" onClick={() => toggleSort('total_brl')}>
                        {d.totalReceived} {sortCol === 'total_brl' ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-[var(--arvo-fg-faint)]">↕</span>}
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-[var(--arvo-fg-muted)] select-none" onClick={() => toggleSort('count')}>
                        {d.count} {sortCol === 'count' ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-[var(--arvo-fg-faint)]">↕</span>}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                    {(showAllPayers ? byAssetSorted : byAssetSorted.slice(0, 5)).map(a => (
                      <tr key={a.asset_id} className="hover:bg-[var(--arvo-surface-2)] transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-[var(--arvo-fg)]">{a.code}</span>
                          {a.name && a.name !== a.code && <span className="text-[var(--arvo-fg-soft)] text-xs ml-1.5">{a.name}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>{fmt(a.total_brl)}</td>
                        <td className="px-4 py-3 text-right text-[var(--arvo-fg-muted)] arvo-num">{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {byAssetSorted.length > 5 && (
                  <button
                    onClick={() => setShowAllPayers(v => !v)}
                    className="w-full px-4 py-2.5 text-xs font-medium text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] hover:bg-[var(--arvo-surface-2)] transition-colors border-t border-[var(--arvo-border-soft)]"
                  >
                    {showAllPayers
                      ? d.showLessPayers
                      : (d.showMorePayers ?? 'Ver todos').replace('{n}', String(byAssetSorted.length))}
                  </button>
                )}
              </div>
            )}

            {/* Transaction log */}
            {rows.length > 0 ? (
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[var(--arvo-border-soft)]">
                  <h2 className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{d.history}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-soft)] text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Ativo</th>
                        <th className="px-4 py-3 text-left"><span title={d.colExDateTooltip} className="cursor-help">{d.colExDate} ⓘ</span></th>
                        <th className="px-4 py-3 text-left"><span title={d.colPayDateTooltip} className="cursor-help">{d.colPayDate} ⓘ</span></th>
                        <th className="px-4 py-3 text-right">{d.colPerShare}</th>
                        <th className="px-4 py-3 text-right">{d.colTotal}</th>
                        <th className="px-4 py-3 text-left">{d.colType}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                      {[...rows].sort((a, b) => b.ex_date.localeCompare(a.ex_date)).map(r => (
                        <tr key={r.id} className="hover:bg-[var(--arvo-surface-2)] transition-colors">
                          <td className="px-4 py-3 font-semibold text-[var(--arvo-fg)]">{r.code}</td>
                          <td className="px-4 py-3 text-[var(--arvo-fg-muted)]">{fmtDate(r.ex_date)}</td>
                          <td className="px-4 py-3 text-[var(--arvo-fg-soft)] text-xs">{fmtDate(r.pay_date)}</td>
                          <td className="px-4 py-3 text-right text-[var(--arvo-fg-muted)] text-xs arvo-num">{r.amount_per_share.toFixed(4)} {r.currency}</td>
                          <td className="px-4 py-3 text-right font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>{fmt(r.amount_brl)}</td>
                          <td className="px-4 py-3 text-xs text-[var(--arvo-fg-soft)]">{typeLabel(r.dividend_type)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-12 text-center shadow-sm">
                <p className="text-[var(--arvo-fg-muted)] font-medium">{d.noData}</p>
              </div>
            )}
          </>
        ) : (
          /* ── PROJECTION TAB ── */
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: d.passiveYTD.replace('{year}', String(currentYear)), value: fmt(ytdTotal),      color: 'var(--arvo-fg)' },
                { label: d.passive12m,          value: fmt(total12m),       color: 'var(--arvo-fg)' },
                { label: d.passiveAvgMonthly,   value: fmt(avgMonthly6m),   color: 'var(--arvo-fg)' },
                { label: d.passiveProjected12m, value: fmt(projected12m),   color: CHART_SERIES.green },
              ].map(card => (
                <div key={card.label} className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4">
                  <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium mb-1 leading-tight">{card.label}</p>
                  <p className="text-xl font-bold arvo-num" style={{ color: card.color, fontFamily: 'var(--arvo-font-body)' }}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-5">
              <div className="flex items-start justify-between mb-4 gap-3">
                <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{d.monthlyChart}</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={projChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={7}>
                  <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<ArvoTooltip formatter={(v) => [fmt(v), '']} />} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 8, color: 'var(--arvo-fg-muted)' }} />
                  <Bar dataKey="received"  name={d.passiveReceivedBar}  fill={CHART_SERIES.ibov} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="projected" name={d.passiveProjectedBar} fill={CHART_SERIES.ocre} radius={[2, 2, 0, 0]} opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
              {d.projDisclaimer && (
                <p className="text-xs text-[var(--arvo-fg-soft)] mt-3 leading-relaxed italic border-t border-[var(--arvo-border-soft)] pt-3">
                  ⚠ {d.projDisclaimer}
                </p>
              )}
            </div>

            {summary36m?.by_asset && summary36m.by_asset.length > 0 && (
              <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--arvo-border-soft)]">
                  <p className="text-xs text-[var(--arvo-fg-soft)] uppercase tracking-wide font-medium">{d.passiveTopAssets}</p>
                </div>
                <ul className="divide-y divide-[var(--arvo-border-soft)]">
                  {summary36m.by_asset.slice(0, 8).map(a => {
                    const pct = (summary36m?.total_brl ?? 0) > 0 ? (a.total_brl / summary36m.total_brl) * 100 : 0
                    return (
                      <li key={a.asset_id} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-[var(--arvo-fg)]">{a.code}</span>
                          <span className="text-sm font-semibold arvo-num text-[var(--arvo-fg)]">{fmt(a.total_brl)}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: CHART_SERIES.ibov }} />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-xs text-[var(--arvo-fg-soft)]">{a.name !== a.code ? a.name : ''}</span>
                          <span className="text-xs text-[var(--arvo-fg-soft)]">{pct.toFixed(1)}%</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
