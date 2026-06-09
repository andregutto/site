import { useState, useMemo } from 'react'
import { useDividends, useDividendSummary, useDividendSync } from '../hooks/useDividends'
import { PageLoader } from '../components/ArvoLoader'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

type Period = 'ytd' | 'last12m' | 'all'
type Tab    = 'history' | 'projection'

const ARVO_GOLD = '#E8A020'
const ARVO_BLUE = '#1B4FD8'

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
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{d.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'history' && periodBtns.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                period === key ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
              }`}>{label}</button>
          ))}
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-[#0D0D0D] hover:text-[#0D0D0D] transition-colors disabled:opacity-40">
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? d.syncing : d.syncBtn}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([['history', d.history], ['projection', d.passiveTitle]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >{label}</button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : (
        tab === 'history' ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <p className="text-gray-400 text-xs uppercase tracking-wide">{d.totalReceived}</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{fmt(totalBrl)}</p>
                <p className="text-xs text-gray-400 mt-1">{d.inPeriod}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <p className="text-gray-400 text-xs uppercase tracking-wide">{d.count}</p>
                <p className="text-2xl font-bold mt-1 text-gray-900">{rows.length}</p>
                <p className="text-xs text-gray-400 mt-1">{d.inPeriod}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm sm:col-span-1 col-span-2">
                <p className="text-gray-400 text-xs uppercase tracking-wide">{d.topPayers}</p>
                <p className="text-sm font-semibold mt-1 text-gray-800 truncate">{byAssetSorted[0]?.code ?? '—'}</p>
                <p className="text-xs text-green-600 mt-0.5">{byAssetSorted[0] ? fmt(byAssetSorted[0].total_brl) : '—'}</p>
              </div>
            </div>

            {/* Monthly chart */}
            {chartData.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">{d.monthlyChart}</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                        tickFormatter={v => new Intl.NumberFormat('pt-BR', { notation: 'compact', currency, style: 'currency', maximumFractionDigits: 0 }).format(v)} />
                      <Tooltip
                        formatter={(v) => [fmtFull(Number(v)), d.totalReceived]}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 11 }}
                      />
                      <Bar dataKey="value" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* By-asset breakdown */}
            {byAssetSorted.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-50">
                  <h2 className="text-xs text-gray-400 uppercase tracking-wide font-medium">{d.topPayers}</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Ativo</th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-600 select-none" onClick={() => toggleSort('total_brl')}>
                        {d.totalReceived} {sortCol === 'total_brl' ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
                      </th>
                      <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-600 select-none" onClick={() => toggleSort('count')}>
                        {d.count} {sortCol === 'count' ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(showAllPayers ? byAssetSorted : byAssetSorted.slice(0, 5)).map(a => (
                      <tr key={a.asset_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-gray-900">{a.code}</span>
                          {a.name && a.name !== a.code && <span className="text-gray-400 text-xs ml-1.5">{a.name}</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(a.total_brl)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{a.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {byAssetSorted.length > 5 && (
                  <button
                    onClick={() => setShowAllPayers(v => !v)}
                    className="w-full px-4 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
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
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-50">
                  <h2 className="text-xs text-gray-400 uppercase tracking-wide font-medium">{d.history}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Ativo</th>
                        <th className="px-4 py-3 text-left"><span title={d.colExDateTooltip} className="cursor-help">{d.colExDate} ⓘ</span></th>
                        <th className="px-4 py-3 text-left"><span title={d.colPayDateTooltip} className="cursor-help">{d.colPayDate} ⓘ</span></th>
                        <th className="px-4 py-3 text-right">{d.colPerShare}</th>
                        <th className="px-4 py-3 text-right">{d.colTotal}</th>
                        <th className="px-4 py-3 text-left">{d.colType}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...rows].sort((a, b) => b.ex_date.localeCompare(a.ex_date)).map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900">{r.code}</td>
                          <td className="px-4 py-3 text-gray-600">{fmtDate(r.ex_date)}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(r.pay_date)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 text-xs">{r.amount_per_share.toFixed(4)} {r.currency}</td>
                          <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(r.amount_brl)}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{typeLabel(r.dividend_type)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
                <p className="text-gray-500 font-medium">{d.noData}</p>
              </div>
            )}
          </>
        ) : (
          /* ── PROJECTION TAB ── */
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: d.passiveYTD.replace('{year}', String(currentYear)), value: fmt(ytdTotal),      color: ARVO_BLUE  },
                { label: d.passive12m,          value: fmt(total12m),       color: ARVO_BLUE  },
                { label: d.passiveAvgMonthly,   value: fmt(avgMonthly6m),   color: ARVO_GOLD  },
                { label: d.passiveProjected12m, value: fmt(projected12m),   color: '#10b981'  },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1 leading-tight">{card.label}</p>
                  <p className="text-xl font-bold" style={{ color: card.color, fontFamily: 'var(--arvo-font-body)' }}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-4 gap-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{d.monthlyChart}</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={projChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={7}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(v: unknown) => [fmt(Number(v)), '']}
                  />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                  <Bar dataKey="received"  name={d.passiveReceivedBar}  fill={ARVO_BLUE} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="projected" name={d.passiveProjectedBar} fill={ARVO_GOLD} radius={[2, 2, 0, 0]} opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
              {d.projDisclaimer && (
                <p className="text-xs text-gray-400 mt-3 leading-relaxed italic border-t border-gray-50 pt-3">
                  ⚠ {d.projDisclaimer}
                </p>
              )}
            </div>

            {summary36m?.by_asset && summary36m.by_asset.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{d.passiveTopAssets}</p>
                </div>
                <ul className="divide-y divide-gray-50">
                  {summary36m.by_asset.slice(0, 8).map(a => {
                    const pct = (summary36m?.total_brl ?? 0) > 0 ? (a.total_brl / summary36m.total_brl) * 100 : 0
                    return (
                      <li key={a.asset_id} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800">{a.code}</span>
                          <span className="text-sm font-semibold text-gray-900">{fmt(a.total_brl)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: ARVO_BLUE }} />
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span className="text-xs text-gray-400">{a.name !== a.code ? a.name : ''}</span>
                          <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
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
