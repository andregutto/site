import { useState, useCallback } from 'react'
import { usePerformanceSummary, usePerformanceMonthly, usePerformanceBenchmarks, usePerformanceInception } from '../hooks/usePortfolio'
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

function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return localYM(d)
}

type PeriodMode = 'year' | 'current_month' | 'last_12' | 'custom' | 'since_inception'

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

  const [mode, setMode]       = useState<PeriodMode>('year')
  const [year, setYear]       = useState(currentYear)
  const [customFrom, setCustomFrom] = useState(addMonths(currentYM, -5))
  const [customTo,   setCustomTo]   = useState(currentYM)
  const inception = usePerformanceInception()

  function derivePeriod(): { from: string; to: string; label: string } {
    switch (mode) {
      case 'year':
        return { from: `${year}-01`, to: `${year}-12`, label: String(year) }
      case 'current_month':
        return { from: currentYM, to: currentYM, label: fmtMonth(currentYM) }
      case 'last_12': {
        const f = addMonths(currentYM, -11)
        return { from: f, to: currentYM, label: `${fmtMonth(f)} - ${fmtMonth(currentYM)}` }
      }
      case 'custom':
        return { from: customFrom, to: customTo, label: `${fmtMonth(customFrom)} - ${fmtMonth(customTo)}` }
      case 'since_inception': {
        const f = inception ?? '2025-01'
        return { from: f, to: currentYM, label: `${fmtMonth(f)} - ${fmtMonth(currentYM)}` }
      }
    }
  }

  const { from, to, label: periodLabel } = derivePeriod()

  const { data: summary,    loading: sLoading, refresh: refreshSummary    } = usePerformanceSummary(from, to)
  const { data: monthly,    loading: mLoading, refresh: refreshMonthly    } = usePerformanceMonthly(from, to)
  const { data: benchmarks, loading: bLoading, refresh: refreshBenchmarks } = usePerformanceBenchmarks(from, to)

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

  const benchmarkMap = new Map(
    (benchmarks?.monthly ?? []).map(b => [b.month, b])
  )

  const monthsWithData = monthly?.monthly.filter(m => m.total > 0) ?? []
  const firstMonth = monthsWithData[0]?.month ?? ''

  const baseBench  = benchmarkMap.get(firstMonth)
  const baseCDI    = baseBench?.cdi_cum   ?? 1
  const baseIBOV   = baseBench?.ibov_cum  ?? null
  const baseSP500  = baseBench?.sp500_cum ?? null

  const pct = (v: number, base: number) => Math.round((v / base - 1) * 10000) / 100

  // Contribution-adjusted cumulative return: chain monthly Simple Dietz returns
  let cumulative = 1
  const chartData = monthsWithData.map((m, i) => {
    if (i > 0) {
      const prevTotal = monthsWithData[i - 1].total
      const cf = m.contributions ?? 0
      const denom = prevTotal + 0.5 * cf
      if (denom > 0) {
        const r = (m.total - prevTotal - cf) / denom
        cumulative *= (1 + r)
      }
    }
    const portfolioPct = Math.round((cumulative - 1) * 10000) / 100
    const b = benchmarkMap.get(m.month)
    return {
      month:     fmtMonth(m.month),
      portfolio: portfolioPct,
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

  const modeButtons: Array<{ key: PeriodMode; label: string }> = [
    { key: 'current_month',   label: 'Mês atual'    },
    { key: 'last_12',         label: 'Últ. 12 meses' },
    { key: 'since_inception', label: 'Desde o início' },
    { key: 'custom',          label: 'Personalizado' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Performance</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Year navigation */}
          <div className={`flex items-center gap-1 ${mode !== 'year' ? 'opacity-40' : ''}`}>
            <button
              onClick={() => { setMode('year'); setYear(y => y - 1) }}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors"
            >‹</button>
            <button
              onClick={() => setMode('year')}
              className={`font-semibold w-12 text-center text-sm px-1 py-1.5 rounded-lg transition-colors ${
                mode === 'year' ? 'text-[#001A70] bg-blue-50 border border-[#001A70]/30' : 'text-gray-600 hover:text-[#001A70]'
              }`}
            >{year}</button>
            <button
              onClick={() => { setMode('year'); setYear(y => Math.min(y + 1, currentYear)) }}
              disabled={mode === 'year' && year >= currentYear}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors disabled:opacity-40"
            >›</button>
          </div>

          <span className="text-gray-200 text-sm">|</span>

          {/* Mode buttons */}
          {modeButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                mode === key
                  ? 'bg-[#001A70] text-white border-[#001A70]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#001A70] hover:text-[#001A70]'
              }`}
            >{label}</button>
          ))}

          <span className="text-gray-200 text-sm">|</span>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            title="Recalcular performance (limpa cache do dia)"
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors disabled:opacity-40"
          >
            {isLoading ? 'Calculando...' : 'Recalcular'}
          </button>

        </div>
      </div>

      {/* Custom period pickers */}
      {mode === 'custom' && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">De</label>
            <input
              type="month"
              value={customFrom}
              max={customTo}
              onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">até</label>
            <input
              type="month"
              value={customTo}
              min={customFrom}
              max={currentYM}
              onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 text-sm py-12 animate-pulse">
          Carregando performance...
        </div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Início do período"
                value={summary.value_start > 0 ? fmtBRL(summary.value_start) : '—'}
              />
              <SummaryCard label="Fim do período" value={fmtBRL(summary.value_end)} />
              <SummaryCard
                label="Retorno absoluto"
                value={`${summary.return_abs >= 0 ? '+' : ''}${fmtBRL(summary.return_abs)}`}
                positive={summary.return_abs >= 0}
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
                <h2 className="font-semibold text-gray-800">Rentabilidade Acumulada · {periodLabel}</h2>
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
                    <Line type="monotone" dataKey="portfolio" name="Carteira"  stroke="#001A70" strokeWidth={2}   dot={{ r: 3, fill: '#001A70' }} activeDot={{ r: 5 }} />
                    {showCDI   && <Line type="monotone" dataKey="cdi"   name="CDI"    stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showIBOV  && <Line type="monotone" dataKey="ibov"  name="IBOV"   stroke="#7c3aed" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showSP500 && <Line type="monotone" dataKey="sp500" name="S&P500" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
              <p className="text-base font-medium text-gray-500">Sem dados de preço para o período</p>
              <p className="text-sm mt-1">
                Acesse o Dashboard para carregar os preços dos ativos.
              </p>
            </div>
          )}

          {/* Benchmark comparison cards */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Carteira',  value: portfolioAccum, text: 'text-[#001A70]' },
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
                <h2 className="font-semibold text-gray-800">Evolução Mensal</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Mês</th>
                      <th className="px-4 py-3 text-right">Patrimônio</th>
                      <th className="px-4 py-3 text-right">Aportes</th>
                      <th className="px-4 py-3 text-right">Ganho/Perda</th>
                      <th className="px-4 py-3 text-right">Rentab.</th>
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
                              {m.total > 0 ? fmtBRL(m.total) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 text-xs">
                              {cf !== 0 ? `${cf > 0 ? '+' : ''}${fmtBRL(cf)}` : '—'}
                            </td>
                            <td className={`px-4 py-3 text-right font-medium ${
                              gain == null ? 'text-gray-400' :
                              gain >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {gain != null ? `${gain >= 0 ? '+' : ''}${fmtBRL(gain)}` : '—'}
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
                              <td colSpan={5} className="px-6 pb-3 pt-1">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400 border-b border-gray-200">
                                      <th className="py-1.5 text-left font-medium">Ativo</th>
                                      <th className="py-1.5 text-right font-medium">Valor final</th>
                                      <th className="py-1.5 text-right font-medium">Aportes</th>
                                      <th className="py-1.5 text-right font-medium">Ganho/Perda</th>
                                      <th className="py-1.5 text-right font-medium">%</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {m.detail
                                      .filter(d => d.value > 0)
                                      .map(d => {
                                        const hasGainData = d.prev_value > 0
                                        const denom = d.prev_value + 0.5 * d.contributions
                                        const gainPct = hasGainData && denom > 0 ? (d.gain / denom) * 100 : null
                                        return (
                                          <tr key={d.asset_id}>
                                            <td className="py-1.5 text-gray-700">
                                              <span className="font-semibold">{d.code}</span>
                                              {d.name && d.name !== d.code && (
                                                <span className="text-gray-400 ml-1 truncate max-w-[120px] inline-block align-bottom">{d.name}</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 text-right text-gray-800">
                                              {fmtBRL(d.value)}
                                            </td>
                                            <td className="py-1.5 text-right text-gray-500">
                                              {d.contributions !== 0 ? `${d.contributions > 0 ? '+' : ''}${fmtBRL(d.contributions)}` : '—'}
                                            </td>
                                            <td className={`py-1.5 text-right font-medium ${!hasGainData ? 'text-gray-300' : d.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                              {!hasGainData ? '—' : `${d.gain >= 0 ? '+' : ''}${fmtBRL(d.gain)}`}
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
            </div>
          )}
        </>
      )}
    </div>
  )
}
