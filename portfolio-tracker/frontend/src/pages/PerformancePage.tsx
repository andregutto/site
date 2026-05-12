import { useState, useEffect } from 'react'
import { usePerformanceSummary, usePerformanceMonthly, useSyncHistory, usePerformanceBenchmarks } from '../hooks/usePortfolio'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

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
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const from = `${year}-01`
  const to   = `${year}-12`
  const { data: summary, loading: sLoading } = usePerformanceSummary(from, to)
  const { data: monthly, loading: mLoading } = usePerformanceMonthly(year)
  const { sync, loading: syncing } = useSyncHistory()
  const { data: benchmarks, loading: bLoading } = usePerformanceBenchmarks(year)

  const [showCDI,   setShowCDI]   = useState(true)
  const [showIBOV,  setShowIBOV]  = useState(false)
  const [showSP500, setShowSP500] = useState(false)

  // Auto-sync once when current year has no price history
  const [autoSynced, setAutoSynced] = useState(false)
  useEffect(() => {
    if (!mLoading && !autoSynced && monthly && year === currentYear) {
      const hasData = monthly.monthly.some(m => m.total > 0)
      if (!hasData) {
        setAutoSynced(true)
        sync()
      }
    }
  }, [mLoading, monthly, year, currentYear, autoSynced, sync])

  const benchmarkMap = new Map(
    (benchmarks?.monthly ?? []).map(b => [b.month, b])
  )

  const monthsWithData = monthly?.monthly.filter(m => m.total > 0) ?? []
  const firstTotal = monthsWithData[0]?.total ?? 0
  const firstMonth = monthsWithData[0]?.month ?? ''

  const baseBench  = benchmarkMap.get(firstMonth)
  const baseCDI    = baseBench?.cdi_cum   ?? 1
  const baseIBOV   = baseBench?.ibov_cum  ?? null
  const baseSP500  = baseBench?.sp500_cum ?? null

  const pct = (v: number, base: number) => Math.round((v / base - 1) * 10000) / 100

  const chartData = monthsWithData.map(m => {
    const b = benchmarkMap.get(m.month)
    return {
      month:     fmtMonth(m.month),
      portfolio: firstTotal > 0 ? pct(m.total, firstTotal) : 0,
      cdi:       b ? pct(b.cdi_cum, baseCDI) : null,
      ibov:      (b?.ibov_cum  != null && baseIBOV  != null) ? pct(b.ibov_cum,  baseIBOV)  : null,
      sp500:     (b?.sp500_cum != null && baseSP500 != null) ? pct(b.sp500_cum, baseSP500) : null,
    }
  })

  const lastPoint      = chartData[chartData.length - 1]
  const portfolioAccum = lastPoint?.portfolio ?? null
  const cdiAccum       = lastPoint?.cdi       ?? null
  const ibovAccum      = lastPoint?.ibov      ?? null
  const sp500Accum     = lastPoint?.sp500     ?? null

  const isLoading = sLoading || mLoading || bLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Performance</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => y - 1)}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors"
          >‹</button>
          <span className="font-semibold text-gray-700 w-12 text-center">{year}</span>
          <button
            onClick={() => setYear(y => Math.min(y + 1, currentYear))}
            disabled={year >= currentYear}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors disabled:opacity-40"
          >›</button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 text-sm py-12 animate-pulse">
          {syncing ? 'Atualizando dados de preços...' : 'Carregando performance...'}
        </div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Início do ano"
                value={summary.value_start > 0 ? fmtBRL(summary.value_start) : '—'}
              />
              <SummaryCard label="Fim do período" value={fmtBRL(summary.value_end)} />
              <SummaryCard
                label="Retorno absoluto"
                value={`${summary.return_abs >= 0 ? '+' : ''}${fmtBRL(summary.return_abs)}`}
                positive={summary.return_abs >= 0 ? true : false}
              />
              <SummaryCard
                label="Retorno %"
                value={summary.return_pct != null ? `${summary.return_pct >= 0 ? '+' : ''}${summary.return_pct.toFixed(2)}%` : '—'}
                sub="Simple Dietz"
                positive={summary.return_pct != null ? summary.return_pct >= 0 : null}
              />
            </div>
          )}

          {chartData.length > 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="font-semibold text-gray-800">Rentabilidade Acumulada {year}</h2>
                <div className="flex items-center gap-2">
                  {([['CDI', showCDI, setShowCDI, '#16a34a'], ['IBOV', showIBOV, setShowIBOV, '#dc2626'], ['S&P500', showSP500, setShowSP500, '#f59e0b']] as const).map(
                    ([label, active, setter, color]) => (
                      <button
                        key={label}
                        onClick={() => (setter as (v: boolean) => void)(!active)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                          active
                            ? 'text-white border-transparent'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                        }`}
                        style={active ? { backgroundColor: color as string, borderColor: color as string } : {}}
                      >
                        {label}
                      </button>
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
                    <Line type="monotone" dataKey="portfolio" name="Carteira"  stroke="#001A70" strokeWidth={2}   dot={{ r: 3, fill: '#001A70' }} activeDot={{ r: 5 }} />
                    {showCDI   && <Line type="monotone" dataKey="cdi"   name="CDI"    stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showIBOV  && <Line type="monotone" dataKey="ibov"  name="IBOV"   stroke="#dc2626" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showSP500 && <Line type="monotone" dataKey="sp500" name="S&P500" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
              <p className="text-base font-medium text-gray-500">Sem dados de preço para {year}</p>
              <p className="text-sm mt-1">
                {syncing ? 'Sincronizando histórico de preços...' : 'Acesse o Dashboard para carregar os preços dos ativos.'}
              </p>
            </div>
          )}

          {/* Benchmark comparison cards */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Carteira',  value: portfolioAccum, text: 'text-[#001A70]' },
                { label: 'CDI',       value: cdiAccum,       text: 'text-green-600' },
                { label: 'IBOV',      value: ibovAccum,      text: 'text-red-600'   },
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
                <h2 className="font-semibold text-gray-800">Evolução Mensal</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Mês</th>
                      <th className="px-4 py-3 text-right">Patrimônio</th>
                      <th className="px-4 py-3 text-right">Variação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {monthly.monthly.map((m) => {
                      const change    = m.prev_total > 0 ? m.total - m.prev_total : null
                      const changePct = m.prev_total > 0 ? ((m.total - m.prev_total) / m.prev_total) * 100 : null
                      return (
                        <tr key={m.month} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{fmtMonth(m.month)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">
                            {m.total > 0 ? fmtBRL(m.total) : '—'}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${
                            change == null ? 'text-gray-400' :
                            change >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {change != null && changePct != null ? (
                              <span>
                                {change >= 0 ? '+' : ''}{fmtBRL(change)}
                                <span className="text-xs ml-1 opacity-70">
                                  ({changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%)
                                </span>
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
