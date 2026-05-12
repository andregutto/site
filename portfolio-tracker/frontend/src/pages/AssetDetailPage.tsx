import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAssetDetail } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { apiFetch } from '../lib/api'
import InstitutionSelect from '../components/InstitutionSelect'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtMonth(iso: string) {
  const [y, m] = iso.split('-')
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${names[parseInt(m) - 1]}/${y.slice(2)}`
}

function fmtNum(v: number, d = 4) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(v)
}

interface SummaryCardProps {
  label: string
  value: string
  sub?: string
  positive?: boolean | null
  neutral?: boolean
}

function SummaryCard({ label, value, sub, positive, neutral }: SummaryCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${
        neutral ? 'text-gray-900' :
        positive === true  ? 'text-green-600' :
        positive === false ? 'text-red-600'   : 'text-gray-900'
      }`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AssetDetailPage() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { data, loading, error } = useAssetDetail(id ? Number(id) : null)
  const { fmt, convert, currency } = useCurrency()
  const [archiving,        setArchiving]        = useState(false)
  const [editingInstitution, setEditingInstitution] = useState(false)
  const [institutionValue,   setInstitutionValue]   = useState('')
  const [savingInstitution,  setSavingInstitution]  = useState(false)

  async function handleArchive() {
    if (!id || !confirm('Arquivar este ativo? Ele vai sair do dashboard mas o histórico é mantido.')) return
    setArchiving(true)
    try {
      await apiFetch(`/assets/${id}/archive`, { method: 'POST' })
      navigate(-1)
    } catch { setArchiving(false) }
  }

  async function handleSaveInstitution() {
    if (!id) return
    setSavingInstitution(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ exchange: institutionValue.trim() || null }),
      })
      setEditingInstitution(false)
    } catch { /* keep editing open */ } finally {
      setSavingInstitution(false)
    }
  }

  // total_brl passado via navegação (do dashboard) para calcular % carteira
  const totalBrl: number = (location.state as { total_brl?: number } | null)?.total_brl ?? 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">Erro ao carregar ativo</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-sm underline">Voltar</button>
      </div>
    )
  }

  const gainPositive = data.gain_loss_brl > 0 ? true : data.gain_loss_brl < 0 ? false : null
  const weightPct = totalBrl > 0 ? (data.current_value_brl / totalBrl) * 100 : null

  // Preço formatado na moeda do ativo (não convertemos o preço unitário)
  const priceLabel = data.current_price != null
    ? `${data.price_currency} ${fmtNum(data.current_price, 2)}`
    : '—'

  const chartData = data.history.map(h => ({
    month: fmtMonth(h.date),
    value: convert(h.value_brl),
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-0.5 w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors shrink-0"
        >‹</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">{data.code}</h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: data.class_color }}
            >{data.class_name}</span>
            {data.fi_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {data.fi_type.replace('_', ' ').replace('plus', '+').toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{data.name}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {data.current_price != null && (
            <>
              <p className="font-bold text-gray-900">{priceLabel}</p>
              <p className="text-xs text-gray-400">{data.price_source}</p>
            </>
          )}
          {/* Instituição */}
          {editingInstitution ? (
            <div className="flex items-center gap-1 mt-1 w-52">
              <div className="flex-1">
                <InstitutionSelect
                  value={institutionValue}
                  onChange={setInstitutionValue}
                  placeholder="Instituição..."
                  autoFocus
                />
              </div>
              <button
                onClick={handleSaveInstitution}
                disabled={savingInstitution}
                className="text-xs text-[#001A70] font-semibold disabled:opacity-50 shrink-0"
              >OK</button>
              <button onClick={() => setEditingInstitution(false)} className="text-xs text-gray-400 shrink-0">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setInstitutionValue(data.exchange ?? ''); setEditingInstitution(true) }}
              className="text-xs text-gray-400 hover:text-[#001A70] border border-gray-200 hover:border-[#001A70] rounded-lg px-2.5 py-1 transition-colors mt-1"
            >
              {data.exchange || 'Sem instituição'}
            </button>
          )}
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            Arquivar
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Valor atual"
          value={fmt(data.current_value_brl)}
          neutral
        />
        <SummaryCard
          label="Investido"
          value={data.invested_brl > 0 ? fmt(data.invested_brl) : '—'}
          neutral
        />
        <SummaryCard
          label="Lucro / Prejuízo"
          value={data.gain_loss_pct != null
            ? `${data.gain_loss_brl >= 0 ? '+' : ''}${fmt(data.gain_loss_brl)}`
            : '—'}
          sub={data.gain_loss_pct != null
            ? `${data.gain_loss_pct >= 0 ? '+' : ''}${data.gain_loss_pct.toFixed(2)}%`
            : undefined}
          positive={gainPositive}
        />
        {data.holdings != null ? (
          <SummaryCard
            label="Quantidade"
            value={fmtNum(data.holdings, 6)}
            sub={data.avg_cost_brl != null ? `Custo médio ${fmt(data.avg_cost_brl)}` : undefined}
            neutral
          />
        ) : weightPct != null ? (
          <SummaryCard
            label="Peso na carteira"
            value={`${weightPct.toFixed(1)}%`}
            neutral
          />
        ) : (
          <SummaryCard label="Peso na carteira" value="—" neutral />
        )}
      </div>

      {/* Peso na carteira (se mostrou quantidade acima) */}
      {data.holdings != null && weightPct != null && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Peso na carteira</span>
            <span className="font-semibold text-gray-900">{weightPct.toFixed(2)}%</span>
          </div>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#001A70] rounded-full transition-all"
              style={{ width: `${Math.min(weightPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Gráfico de evolução */}
      {chartData.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Evolução do valor</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={v => {
                    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
                    return String(v)
                  }}
                  width={50}
                />
                <Tooltip
                  formatter={(v) => [
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(v)),
                    'Valor',
                  ]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
                {data.invested_brl > 0 && (
                  <ReferenceLine
                    y={convert(data.invested_brl)}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: 'Investido', fontSize: 10, fill: '#f59e0b' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#001A70"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Histórico de aportes */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Aportes{data.contributions.length > 0 ? ` (${data.contributions.length})` : ''}
          </h2>
        </div>
        {data.contributions.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">
            Nenhum aporte registrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Preço</th>
                  <th className="px-4 py-3 text-right">Total BRL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.contributions.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{fmtDate(c.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.type === 'buy'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {c.type === 'buy' ? 'Compra' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtNum(c.quantity, 6)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {c.price_orig != null && c.currency
                        ? `${c.currency} ${fmtNum(c.price_orig, 4)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {(() => {
                        const v = c.value_brl ?? (c.price_orig != null
                          ? c.price_orig * c.quantity * (c.fx_rate_brl ?? 1)
                          : null)
                        return v != null ? fmt(v) : '—'
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
