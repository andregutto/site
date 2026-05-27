import { useState, useMemo } from 'react'
import { useDividends, useDividendSummary, useDividendSync } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type Period = 'ytd' | 'last12m' | 'all'

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

export default function DividendsPage() {
  const { convert, currency } = useCurrency()
  const { t } = useI18n()
  const d = t.dividends
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const currentYear = now.getFullYear()

  const [period, setPeriod] = useState<Period>('ytd')
  const [sortCol, setSortCol] = useState<'total_brl' | 'count'>('total_brl')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { from, to } = useMemo(() => {
    if (period === 'ytd')    return { from: `${currentYear}-01-01`, to: todayStr }
    if (period === 'last12m') {
      const d12 = new Date(now); d12.setFullYear(d12.getFullYear() - 1)
      return { from: d12.toISOString().split('T')[0], to: todayStr }
    }
    return { from: '2000-01-01', to: todayStr }
  }, [period, todayStr, currentYear])

  const { data: summary, loading: sLoading, refresh: refreshSummary } = useDividendSummary(from, to)
  const { data: rows,    loading: rLoading, refresh: refreshRows    } = useDividends(from, to)
  const { sync, syncing } = useDividendSync()

  function fmt(brl: number) {
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
    month: fmtMonth(m.month),
    value: convert(m.total_brl),
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
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const totalBrl = summary?.total_brl ?? 0
  const isLoading = sLoading || rLoading

  const periodBtns: { key: Period; label: string }[] = [
    { key: 'ytd',     label: `YTD ${currentYear}` },
    { key: 'last12m', label: t.performance.last12m ?? 'Últimos 12m' },
    { key: 'all',     label: t.performance.inception ?? 'Todo período' },
  ]

  async function handleSync() {
    await sync(true)
    refreshSummary()
    refreshRows()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-black)' }}>{d.title}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.60)' }}>{d.history}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {periodBtns.map(({ key, label }) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                period === key ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#0D0D0D] hover:text-[#0D0D0D]'
              }`}>{label}</button>
          ))}
          <span className="text-gray-200 text-sm">|</span>
          <button onClick={handleSync} disabled={syncing}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-[#0D0D0D] hover:text-[#0D0D0D] transition-colors disabled:opacity-40">
            {syncing ? d.syncing : d.syncBtn}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 text-sm py-12 animate-pulse">{d.autoSyncing}</div>
      ) : (
        <>
          {/* Summary card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
              <p className="text-sm font-semibold mt-1 text-gray-800 truncate">
                {byAssetSorted[0]?.code ?? '—'}
              </p>
              <p className="text-xs text-green-600 mt-0.5">{byAssetSorted[0] ? fmt(byAssetSorted[0].total_brl) : '—'}</p>
            </div>
          </div>

          {/* Monthly chart */}
          {chartData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-4">{d.monthlyChart}</h2>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={v => new Intl.NumberFormat('pt-BR', { notation: 'compact', currency, style: 'currency', maximumFractionDigits: 0 }).format(v)} />
                    <Tooltip
                      formatter={(v: number) => [new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v), d.totalReceived]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
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
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{d.topPayers}</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Ativo</th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-600 select-none"
                      onClick={() => toggleSort('total_brl')}>
                      {d.totalReceived} {sortCol === 'total_brl' ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-600 select-none"
                      onClick={() => toggleSort('count')}>
                      {d.count} {sortCol === 'count' ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {byAssetSorted.map(a => (
                    <tr key={a.asset_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900">{a.code}</span>
                        {a.name && a.name !== a.code && (
                          <span className="text-gray-400 text-xs ml-1.5">{a.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">{fmt(a.total_brl)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Individual events */}
          {rows.length > 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">{d.history}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Ativo</th>
                      <th className="px-4 py-3 text-left">{d.colExDate}</th>
                      <th className="px-4 py-3 text-left">{d.colPayDate}</th>
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
                        <td className="px-4 py-3 text-right text-gray-600 text-xs">
                          {r.amount_per_share.toFixed(4)} {r.currency}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">
                          {fmt(r.amount_brl)}
                        </td>
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
              <p className="text-gray-400 text-sm mt-1">
                {t.profile.syncDividendsDesc ?? 'Use o botão de sincronizar para buscar dividendos.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
