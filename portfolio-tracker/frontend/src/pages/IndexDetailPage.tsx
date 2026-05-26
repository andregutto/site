import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'
import { apiFetch } from '../lib/api'

interface MonthlyPoint {
  month: string
  value: number
  pct_month: number | null
}

interface AnnualPoint {
  year: number
  pct: number | null
}

interface IndexHistory {
  code: string
  name: string
  category: string
  unit: string
  description: string
  monthly: MonthlyPoint[]
  annual: AnnualPoint[]
}

type ViewMode = 'price' | 'pct_month'
type Period = '1y' | '3y' | '5y'

function fmtValue(v: number, unit: string) {
  if (unit === 'pts') return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  if (unit === '% a.a.' || unit === '% a.m.') return `${v.toFixed(2)}%`
  if (unit === 'R$') return `R$ ${v.toFixed(4)}`
  if (unit === 'USD/oz') return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  return v.toFixed(2)
}

function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function pctColor(v: number | null) {
  if (v == null) return '#9ca3af'
  return v >= 0 ? '#10b981' : '#ef4444'
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { value: number; payload: MonthlyPoint }[]
  unit: string
  viewMode: ViewMode
}

function CustomTooltip({ active, payload, unit, viewMode }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const val = viewMode === 'price' ? d.value : d.pct_month
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2 text-xs">
      <div className="font-semibold text-gray-500 mb-0.5">{monthLabel(d.month)}</div>
      <div className="font-bold text-gray-900">
        {viewMode === 'price' ? fmtValue(d.value, unit) : fmtPct(val)}
      </div>
    </div>
  )
}

const PERIOD_MONTHS: Record<Period, number> = { '1y': 12, '3y': 36, '5y': 60 }

export default function IndexDetailPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<IndexHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('5y')
  const [viewMode, setViewMode] = useState<ViewMode>('price')

  useEffect(() => {
    if (!code) return
    setLoading(true)
    setError(null)
    apiFetch<IndexHistory>(`/indices/${code.toUpperCase()}/history?years=5`)
      .then(d => {
        setData(d)
        // Rate-based indices default to pct_month view since price is not meaningful
        if (d.category === 'br_rate' || d.category === 'br_inflation') {
          setViewMode('pct_month')
        }
      })
      .catch(() => setError('Erro ao carregar histórico'))
      .finally(() => setLoading(false))
  }, [code])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-red-500 text-sm">{error ?? 'Índice não encontrado'}</div>
      </div>
    )
  }

  const cutoff = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - PERIOD_MONTHS[period])
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const monthlySlice = data.monthly.filter(m => m.month >= cutoff)
  const last = data.monthly[data.monthly.length - 1]
  const prev = data.monthly[data.monthly.length - 2]
  const dayPct = prev && last
    ? Math.round((last.value / prev.value - 1) * 10000) / 100
    : null

  const isPriceBased = data.category !== 'br_rate' && data.category !== 'br_inflation'
  const canToggle = isPriceBased && monthlySlice.some(m => m.pct_month != null)

  // For price-based bar chart: chart value
  const chartData = monthlySlice.map(m => ({
    ...m,
    chartVal: viewMode === 'price' ? m.value : m.pct_month,
  }))

  const ytdCutoff = `${new Date().getFullYear()}-01`
  const ytdBase = data.monthly.filter(m => m.month < ytdCutoff).pop()
  const ytd = ytdBase && last
    ? isPriceBased
      ? Math.round((last.value / ytdBase.value - 1) * 10000) / 100
      : null
    : null

  const m12Cutoff = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 12)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const m12Base = data.monthly.filter(m => m.month <= m12Cutoff).pop()
  const m12 = m12Base && last
    ? isPriceBased
      ? Math.round((last.value / m12Base.value - 1) * 10000) / 100
      : null
    : null

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/indices')}
          className="mt-0.5 text-gray-400 hover:text-gray-700 transition-colors text-sm"
        >
          ← Índices
        </button>
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{data.code}</div>
          <h1 className="text-xl font-semibold text-gray-900">{data.name}</h1>
          <p className="text-xs text-gray-400">{data.description}</p>
        </div>
      </div>

      {/* Hero stats */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-wrap gap-6">
        <div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums">
            {last ? fmtValue(last.value, data.unit) : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{data.unit}</div>
        </div>
        {dayPct != null && (
          <div>
            <div className={`text-lg font-bold tabular-nums ${dayPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmtPct(dayPct)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">mês atual</div>
          </div>
        )}
        {ytd != null && (
          <div>
            <div className={`text-lg font-bold tabular-nums ${ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmtPct(ytd)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">YTD</div>
          </div>
        )}
        {m12 != null && (
          <div>
            <div className={`text-lg font-bold tabular-nums ${m12 >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {fmtPct(m12)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">12 meses</div>
          </div>
        )}
      </div>

      {/* Chart controls */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['1y', '3y', '5y'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  period === p ? 'bg-white text-[#0D0D0D] shadow-sm' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {p === '1y' ? '1 ano' : p === '3y' ? '3 anos' : '5 anos'}
              </button>
            ))}
          </div>
          {canToggle && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('price')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === 'price' ? 'bg-white text-[#0D0D0D] shadow-sm' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                Valor
              </button>
              <button
                onClick={() => setViewMode('pct_month')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === 'pct_month' ? 'bg-white text-[#0D0D0D] shadow-sm' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                % mês
              </button>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
            <XAxis
              dataKey="month"
              tickFormatter={v => {
                const [y, m] = v.split('-')
                return m === '01' ? y : m === '07' ? `Jul/${y.slice(2)}` : ''
              }}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v =>
                viewMode === 'price'
                  ? data.unit === 'pts' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : v.toFixed(2)
                  : `${v}%`
              }
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={55}
            />
            <Tooltip content={<CustomTooltip unit={data.unit} viewMode={viewMode} />} />
            {viewMode === 'pct_month' && <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />}
            <Bar dataKey="chartVal" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    viewMode === 'pct_month'
                      ? pctColor(entry.pct_month)
                      : '#0D0D0D'
                  }
                  fillOpacity={viewMode === 'price' ? 0.75 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Annual table */}
      {data.annual.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Retorno anual</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-400 pb-2 pr-4">Ano</th>
                  <th className="text-right text-xs font-semibold text-gray-400 pb-2">Retorno</th>
                  <th className="text-right text-xs font-semibold text-gray-400 pb-2 pl-4 w-32">Barra</th>
                </tr>
              </thead>
              <tbody>
                {[...data.annual].reverse().map(row => (
                  <tr key={row.year} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 pr-4 font-medium text-gray-700">{row.year}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${row.pct != null && row.pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {fmtPct(row.pct)}
                    </td>
                    <td className="py-2 pl-4">
                      <div className="flex items-center justify-end gap-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
                          {row.pct != null && (
                            <div
                              className={`h-1.5 rounded-full ${row.pct >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(Math.abs(row.pct) * 1.5, 100)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-300 pb-2">
        Fonte: Yahoo Finance · BCB · Atualizado em tempo real com cache de 1h
      </p>
    </div>
  )
}
