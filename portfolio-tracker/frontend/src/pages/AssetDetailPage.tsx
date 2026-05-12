import { useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAssetDetail } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { apiFetch } from '../lib/api'
import InstitutionSelect from '../components/InstitutionSelect'
import MigrateToFIModal from '../components/MigrateToFIModal'
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
  const { data, loading, error, refresh } = useAssetDetail(id ? Number(id) : null)
  const { fmt, convert, currency } = useCurrency()
  const [archiving,          setArchiving]          = useState(false)
  const [editingInstitution, setEditingInstitution] = useState(false)
  const [institutionValue,   setInstitutionValue]   = useState('')
  const [savingInstitution,  setSavingInstitution]  = useState(false)
  const [showMigrateModal,   setShowMigrateModal]   = useState(false)

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

  const isManual = data.asset_type === 'manual'
  const lastHistoryDate = data.history.length > 0 ? data.history[data.history.length - 1].date : null
  const daysSinceUpdate = lastHistoryDate
    ? Math.floor((Date.now() - new Date(lastHistoryDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : null
  const isStale = isManual && (daysSinceUpdate === null || daysSinceUpdate > 30)

  const manualEntries = isManual
    ? data.history.map((h, i) => {
        const prev = i > 0 ? data.history[i - 1] : null
        const changeAbs = prev != null ? h.value_brl - prev.value_brl : null
        const changePct = prev != null && prev.value_brl > 0
          ? ((h.value_brl - prev.value_brl) / prev.value_brl) * 100
          : null
        return { ...h, changeAbs, changePct }
      }).reverse()
    : []

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
          <Link
            to={`/contributions?assetId=${id}&new=1`}
            className="text-xs text-[#001A70] border border-[#001A70]/30 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors mt-1"
          >+ Aporte</Link>
          {data.asset_type === 'manual' && (
            <button
              onClick={() => setShowMigrateModal(true)}
              className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors"
            >
              Converter para RF
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

      {/* Alerta de valor desatualizado (manual >30 dias) */}
      {isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-base mt-0.5">!</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {daysSinceUpdate === null
                ? 'Nenhum valor registrado para este ativo.'
                : `Valor desatualizado ha ${daysSinceUpdate} dia${daysSinceUpdate !== 1 ? 's' : ''}.`}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Registre o valor atual para manter o portfolio preciso.</p>
          </div>
          <Link
            to={`/contributions?assetId=${id}&new=1`}
            className="text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 transition-colors shrink-0"
          >
            Atualizar
          </Link>
        </div>
      )}

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

      {showMigrateModal && (
        <MigrateToFIModal
          assetId={data.id}
          assetName={data.name}
          assetCode={data.code}
          investedBrl={data.invested_brl}
          hasContributions={data.contributions.length > 0}
          onClose={() => setShowMigrateModal(false)}
          onSaved={() => { setShowMigrateModal(false); refresh() }}
        />
      )}

      {/* Historico de valores manuais com rentabilidade entre entradas */}
      {isManual && manualEntries.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Historico de valores ({manualEntries.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Variacao</th>
                  <th className="px-4 py-3 text-right">Diferenca</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {manualEntries.map((e, i) => (
                  <tr key={e.date + i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(e.value_brl)}</td>
                    <td className="px-4 py-3 text-right">
                      {e.changePct != null ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          e.changePct > 0 ? 'bg-green-100 text-green-700' :
                          e.changePct < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {e.changePct >= 0 ? '+' : ''}{e.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {e.changeAbs != null
                        ? `${e.changeAbs >= 0 ? '+' : ''}${fmt(e.changeAbs)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
