import { useState } from 'react'
import { usePerformanceSummary, usePerformanceMonthly, useSyncHistory, usePerformanceBenchmarks } from '../hooks/usePortfolio'
import { apiFetch } from '../lib/api'
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
  const { data: summary, loading: sLoading, error: sError } = usePerformanceSummary(from, to)
  const { data: monthly, loading: mLoading } = usePerformanceMonthly(year)
  const { sync, loading: syncing, result: syncResult } = useSyncHistory()
  const { data: benchmarks } = usePerformanceBenchmarks(year)

  const [showCDI,   setShowCDI]   = useState(true)
  const [showIBOV,  setShowIBOV]  = useState(false)
  const [showSP500, setShowSP500] = useState(false)

  type ResetResult = { deleted: number; created: number; results: { code: string; price: number | null; status: string }[] }
  const [resetting,   setResetting]   = useState(false)
  const [resetResult, setResetResult] = useState<ResetResult | null>(null)
  const [resetError,  setResetError]  = useState<string | null>(null)

  async function handleReset() {
    if (!confirm('Isso vai apagar todas as contribuições de 2023-01-01 e recriar em 2025-01-01 com preços históricos do Yahoo. Continuar?')) return
    setResetting(true); setResetResult(null); setResetError(null)
    try {
      const data = await apiFetch<ResetResult>('/portfolio/reset-baseline', { method: 'POST' })
      setResetResult(data)
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Erro ao resetar')
    } finally {
      setResetting(false)
    }
  }

  const benchmarkMap = new Map(
    (benchmarks?.monthly ?? []).map(b => [b.month, b])
  )

  const chartData = monthly?.monthly
    .filter(m => m.total > 0)
    .map(m => {
      const b = benchmarkMap.get(m.month)
      return {
        month:    fmtMonth(m.month),
        total:    m.total,
        cdi:      b ? Math.round((b.cdi_cum - 1) * 10000) / 100   : null,
        ibov:     b?.ibov_cum  != null ? Math.round((b.ibov_cum  - 1) * 10000) / 100 : null,
        sp500:    b?.sp500_cum != null ? Math.round((b.sp500_cum - 1) * 10000) / 100 : null,
      }
    }) ?? []

  const isLoading = sLoading || mLoading

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
        <div className="text-center text-gray-400 text-sm py-12 animate-pulse">Carregando performance...</div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Início do ano" value={fmtBRL(summary.value_start)} />
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

          {(summary?.note || sError) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm flex items-center justify-between gap-4">
              <span>{summary?.note ?? 'Histórico de preços indisponível.'}</span>
              <button
                onClick={sync}
                disabled={syncing}
                className="shrink-0 px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {syncing ? 'Sincronizando...' : 'Inicializar histórico'}
              </button>
            </div>
          )}

          {syncResult && (
            <div className="space-y-2">
              <div className={`border rounded-xl p-3 text-sm ${
                syncResult.errors === 0
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}>
                Sincronizados: {syncResult.synced}/{syncResult.total} ativos
                {syncResult.errors > 0 && ` · ${syncResult.errors} erro(s)`}
                {syncResult.synced > 0 && ' · Recarregue a página para ver os dados.'}
              </div>
              {syncResult.details.some(d => d.status !== 'ok') && (
                <details className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
                  <summary className="cursor-pointer font-medium text-gray-700 mb-2">
                    Detalhes por ativo ({syncResult.details.filter(d => d.status === 'error').length} erros,{' '}
                    {syncResult.details.filter(d => d.status === 'empty').length} vazios)
                  </summary>
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto font-mono">
                    {syncResult.details.map(d => (
                      <div key={d.id} className={
                        d.status === 'ok' ? 'text-green-700' :
                        d.status === 'empty' ? 'text-gray-400' : 'text-red-600'
                      }>
                        {d.status === 'ok' ? '✓' : d.status === 'empty' ? '–' : '✗'}{' '}
                        {d.code}{d.status === 'ok' ? ` (${d.points} pts)` : ''}{d.error ? `: ${d.error}` : ''}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="font-semibold text-gray-800">Evolução Patrimonial {year}</h2>
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
                      yAxisId="brl"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                    />
                    {(showCDI || showIBOV || showSP500) && (
                      <YAxis
                        yAxisId="pct"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                      />
                    )}
                    <Tooltip
                      formatter={(v: number, name: string) => {
                        if (name === 'Patrimônio') return [fmtBRL(v), name]
                        return [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, name]
                      }}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    {(showCDI || showIBOV || showSP500) && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    <Line yAxisId="brl" type="monotone" dataKey="total"  name="Patrimônio" stroke="#001A70" strokeWidth={2} dot={{ r: 3, fill: '#001A70' }} activeDot={{ r: 5 }} />
                    {showCDI   && <Line yAxisId="pct" type="monotone" dataKey="cdi"   name="CDI"   stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showIBOV  && <Line yAxisId="pct" type="monotone" dataKey="ibov"  name="IBOV"  stroke="#dc2626" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                    {showSP500 && <Line yAxisId="pct" type="monotone" dataKey="sp500" name="S&P500" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {benchmarks && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'CDI no ano',   value: benchmarks.cdi_pct,   color: 'text-green-600' },
                { label: 'IBOV no ano',  value: benchmarks.ibov_pct,  color: 'text-red-600' },
                { label: 'S&P500 no ano', value: benchmarks.sp500_pct, color: 'text-amber-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
                  <p className="text-gray-400 text-xs">{label}</p>
                  <p className={`text-lg font-bold mt-1 ${value != null ? color : 'text-gray-300'}`}>
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
                      const change = m.prev_total > 0 ? m.total - m.prev_total : null
                      const changePct = m.prev_total > 0
                        ? ((m.total - m.prev_total) / m.prev_total) * 100
                        : null
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

      {/* Ferramentas */}
      <details className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden">
        <summary className="px-5 py-4 cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800">
          Ferramentas avançadas
        </summary>
        <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Resetar ponto zero</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Substitui as contribuições de 01/01/2023 por contribuições de 02/01/2025
                com preços históricos reais via Yahoo Finance.
              </p>
            </div>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="shrink-0 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {resetting ? 'Processando...' : 'Resetar 2023 → 2025'}
            </button>
          </div>
          {resetError && <p className="text-xs text-red-600">{resetError}</p>}
          {resetResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 space-y-1">
              <p>Removidos: {resetResult.deleted} · Criados: {resetResult.created}</p>
              <details className="text-xs">
                <summary className="cursor-pointer font-medium">Ver por ativo</summary>
                <div className="mt-2 space-y-0.5 font-mono max-h-40 overflow-y-auto">
                  {resetResult.results.map(r => (
                    <div key={r.code} className={r.status === 'ok' ? 'text-green-700' : 'text-amber-600'}>
                      {r.status === 'ok' ? '✓' : '–'} {r.code}{r.price != null ? ` @ ${r.price}` : ' (sem preço)'}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
