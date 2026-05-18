import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAssetDetail } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useFavorites } from '../hooks/useFavorites'
import { apiFetch } from '../lib/api'
import InstitutionSelect from '../components/InstitutionSelect'
import MigrateToFIModal from '../components/MigrateToFIModal'
import ManualValueModal from '../components/ManualValueModal'
import type { PortfolioAsset, ManualValue } from '../lib/types'
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

function fiIndexerLabel(fi_type: string | null, fi_rate: number | null, fi_spread: number | null): string | null {
  if (!fi_type) return null
  if (fi_type === 'pos_cdi' && fi_rate != null) return `${(fi_rate * 100).toFixed(1)}% do CDI`
  if (fi_type === 'selic'   && fi_rate != null) return `${(fi_rate * 100).toFixed(1)}% da Selic`
  if (fi_type === 'pre'     && fi_rate != null) return `${(fi_rate * 100).toFixed(2)}% a.a.`
  if (fi_type === 'ipca_plus' && fi_spread != null) return `IPCA+ ${(fi_spread * 100).toFixed(2)}% a.a.`
  return null
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
  const assetId    = id ? Number(id) : null
  const { favorites, toggleFavorite } = useFavorites()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { data, loading, error, refresh } = useAssetDetail(assetId)
  const { fmt, convert, currency } = useCurrency()
  const [archiving,          setArchiving]          = useState(false)
  const [editingInstitution, setEditingInstitution] = useState(false)
  const [institutionValue,   setInstitutionValue]   = useState('')
  const [savingInstitution,  setSavingInstitution]  = useState(false)
  const [editingSector,      setEditingSector]      = useState(false)
  const [sectorValue,        setSectorValue]        = useState('')
  const [savingSector,       setSavingSector]       = useState(false)
  const [editingName,        setEditingName]        = useState(false)
  const [nameValue,          setNameValue]          = useState('')
  const [savingName,         setSavingName]         = useState(false)
  const [editingFiRate,      setEditingFiRate]      = useState(false)
  const [fiTypeValue,        setFiTypeValue]        = useState('')
  const [fiRateValue,        setFiRateValue]        = useState('')
  const [fiSpreadValue,      setFiSpreadValue]      = useState('')
  const [savingFiRate,       setSavingFiRate]       = useState(false)
  const [showMigrateModal,   setShowMigrateModal]   = useState(false)
  const [showManualModal,    setShowManualModal]    = useState(false)
  const [manualValueHistory, setManualValueHistory] = useState<ManualValue[]>([])
  const [chartPeriod,        setChartPeriod]        = useState<number | null>(12)

  useEffect(() => {
    if (!id) return
    apiFetch<ManualValue[]>(`/assets/${id}/manual-values`)
      .then(setManualValueHistory)
      .catch(() => {})
  }, [id])

  async function handleArchive() {
    if (!id || !confirm('Arquivar este ativo? Ele vai sair do dashboard mas o histórico é mantido.')) return
    setArchiving(true)
    try {
      await apiFetch(`/assets/${id}/archive`, { method: 'POST' })
      navigate(-1)
    } catch { setArchiving(false) }
  }

  async function handleDeleteManualValue(valueId: number) {
    if (!id || !confirm('Remover esta atualização de valor?')) return
    try {
      await apiFetch(`/assets/${id}/manual-value/${valueId}`, { method: 'DELETE' })
      setManualValueHistory(h => h.filter(v => v.id !== valueId))
      refresh()
    } catch { /* ignore */ }
  }

  async function handleSaveSector() {
    if (!id) return
    setSavingSector(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sector: sectorValue.trim() || null }),
      })
      setEditingSector(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingSector(false)
    }
  }

  async function handleSaveName() {
    if (!id) return
    setSavingName(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nameValue.trim() || null }),
      })
      setEditingName(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingName(false)
    }
  }

  async function handleSaveFiRate() {
    if (!id) return
    setSavingFiRate(true)
    try {
      const body: Record<string, unknown> = { fi_type: fiTypeValue }
      if (fiTypeValue === 'ipca_plus') {
        body.fi_spread = parseFloat(fiSpreadValue) / 100
      } else {
        body.fi_rate = parseFloat(fiRateValue) / 100
      }
      await apiFetch(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setEditingFiRate(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingFiRate(false)
    }
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

  const allChartData = data.history.map(h => ({
    month: fmtMonth(h.date),
    value: convert(h.value_brl),
  }))

  const CHART_PERIODS = [
    { label: '1M',   months: 1 },
    { label: '3M',   months: 3 },
    { label: '6M',   months: 6 },
    { label: '1A',   months: 12 },
    { label: '2A',   months: 24 },
    { label: 'Tudo', months: null },
  ]
  const chartData = (() => {
    if (chartPeriod !== null) return allChartData.slice(-chartPeriod)
    // For "Tudo", skip leading zero-value entries to avoid a long flat line before first purchase
    const firstNonZero = allChartData.findIndex(d => d.value > 0)
    return firstNonZero > 0 ? allChartData.slice(firstNonZero) : allChartData
  })()

  const isManual = data.asset_type === 'manual'
  const canUpdateManualValue = isManual || data.price_source === 'cost_basis' || data.price_source === 'manual'
  const lastManualDate = manualValueHistory.length > 0
    ? manualValueHistory[manualValueHistory.length - 1].ref_date
    : null
  const daysSinceUpdate = lastManualDate
    ? Math.floor((Date.now() - new Date(lastManualDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : null
  const isStale = canUpdateManualValue && (daysSinceUpdate === null || daysSinceUpdate > 30)

  // First buy contribution as anchor for the first manual_value comparison
  const firstBuyValue = (() => {
    const buys = [...data.contributions]
      .filter(c => c.type === 'buy' && (c.value_brl ?? 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
    return buys.length > 0 ? (buys[0].value_brl ?? null) : null
  })()

  // manual_values sorted ascending → compare first entry against first buy anchor
  const mvEntriesWithChange = [...manualValueHistory]
    .sort((a, b) => a.ref_date.localeCompare(b.ref_date))
    .map((entry, i, arr) => {
      const prevValue = i > 0 ? arr[i - 1].value : firstBuyValue
      const changeAbs = prevValue != null ? entry.value - prevValue : null
      const changePct = prevValue != null && prevValue > 0
        ? ((entry.value - prevValue) / prevValue) * 100
        : null
      return { ...entry, changeAbs, changePct }
    })
    .reverse()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-0.5 w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors shrink-0"
        >‹</button>
        {assetId && (
          <button
            onClick={() => toggleFavorite(assetId)}
            className="mt-0.5 w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center transition-colors shrink-0 hover:border-amber-400"
            title={favorites.has(assetId) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          >
            <svg
              className={`w-4 h-4 transition-colors ${favorites.has(assetId) ? 'text-amber-400' : 'text-gray-300'}`}
              fill={favorites.has(assetId) ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={favorites.has(assetId) ? 0 : 1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </button>
        )}
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
            {data.asset_type === 'fixed_income' && fiIndexerLabel(data.fi_type, data.fi_rate, data.fi_spread) && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-semibold">
                Rendendo {fiIndexerLabel(data.fi_type, data.fi_rate, data.fi_spread)}
              </span>
            )}
            {data.asset_type === 'manual' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-500 font-medium">
                Manual
              </span>
            )}
            {data.asset_type === 'ticker' && data.avg_cost_brl != null && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 font-semibold">
                PM {data.price_currency !== 'BRL' ? 'BRL' : data.price_currency} {fmtNum(data.avg_cost_brl, 2)}
              </span>
            )}
            {/* Tipo de ativo (sector) — editável */}
            {editingSector ? (
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  value={sectorValue}
                  onChange={e => setSectorValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveSector(); if (e.key === 'Escape') setEditingSector(false) }}
                  placeholder="Ex: CDB, ETF, Ação..."
                  className="text-xs border border-gray-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#001A70]/30 w-36"
                  autoFocus
                />
                <button onClick={handleSaveSector} disabled={savingSector} className="text-xs text-[#001A70] font-semibold disabled:opacity-50">OK</button>
                <button onClick={() => setEditingSector(false)} className="text-xs text-gray-400">✕</button>
              </span>
            ) : (
              <button
                onClick={() => { setSectorValue(data.sector ?? ''); setEditingSector(true) }}
                title="Clique para definir o tipo de ativo"
                className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors hover:border-[#001A70]/50 ${
                  data.sector
                    ? 'bg-teal-50 border-teal-200 text-teal-700'
                    : 'border-dashed border-gray-300 text-gray-400 hover:text-gray-600'
                }`}
              >
                {data.sector ?? '+ tipo'}
              </button>
            )}
          </div>
          {editingName ? (
            <span className="flex items-center gap-1 mt-0.5">
              <input
                type="text"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="text-sm border border-gray-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#001A70]/30 flex-1 min-w-0"
                autoFocus
              />
              <button onClick={handleSaveName} disabled={savingName} className="text-xs text-[#001A70] font-semibold disabled:opacity-50">OK</button>
              <button onClick={() => setEditingName(false)} className="text-xs text-gray-400">✕</button>
            </span>
          ) : (
            <button
              onClick={() => { setNameValue(data.name); setEditingName(true) }}
              title="Clique para editar o nome"
              className="text-sm text-gray-500 mt-0.5 truncate text-left max-w-full hover:text-[#001A70] transition-colors"
            >
              {data.name}
            </button>
          )}
          {/* Action buttons — horizontal row below the name */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Link
              to={`/portfolio?assetId=${id}&new=1`}
              className="text-xs text-[#001A70] border border-[#001A70]/30 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors"
            >+ Aporte</Link>
            {canUpdateManualValue && (
              <button
                onClick={() => setShowManualModal(true)}
                className="text-xs text-[#001A70] border border-[#001A70]/30 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors font-medium"
              >
                Atualizar valor
              </button>
            )}
            {isManual && (
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
              className="text-xs text-red-400 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v.5H2v-.5ZM2 5.5h12v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-7Zm4.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" />
              </svg>
              Arquivar
            </button>
          </div>
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
            sub={data.avg_cost_brl != null ? `Custo medio ${fmt(data.avg_cost_brl)}` : undefined}
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
        {data.total_income_brl > 0 && (
          <SummaryCard
            label="Rendimentos recebidos"
            value={fmt(data.total_income_brl)}
            positive
          />
        )}
      </div>

      {/* Posição atual (apenas tickers) */}
      {data.asset_type === 'ticker' && data.holdings != null && data.holdings > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <h2 className="font-semibold text-indigo-900 text-sm mb-3">Posição atual</h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {data.avg_cost_brl != null && (
              <>
                <div>
                  <p className="text-xs text-indigo-500 uppercase tracking-wide mb-0.5">Preço médio pago</p>
                  <p className="font-bold text-indigo-900 text-sm">
                    BRL {fmtNum(data.avg_cost_brl, 2)}
                  </p>
                  {data.price_currency !== 'BRL' && data.current_price != null && data.current_value_brl > 0 && (
                    <p className="text-xs text-indigo-400">
                      {data.price_currency} {fmtNum(data.avg_cost_brl / (data.current_value_brl / (data.holdings * data.current_price)), 2)}
                    </p>
                  )}
                </div>
                <div className="w-px h-8 bg-indigo-200 hidden sm:block" />
              </>
            )}
            {data.current_price != null && (
              <>
                <div>
                  <p className="text-xs text-indigo-500 uppercase tracking-wide mb-0.5">Preço atual</p>
                  <p className="font-bold text-indigo-900 text-sm">
                    {data.price_currency} {fmtNum(data.current_price, 2)}
                  </p>
                  <p className="text-xs text-indigo-400">{data.price_source}</p>
                </div>
                <div className="w-px h-8 bg-indigo-200 hidden sm:block" />
              </>
            )}
            {data.gain_loss_pct != null && (
              <>
                <div>
                  <p className="text-xs text-indigo-500 uppercase tracking-wide mb-0.5">Retorno total</p>
                  <p className={`font-bold text-sm ${data.gain_loss_pct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {data.gain_loss_pct >= 0 ? '+' : ''}{data.gain_loss_pct.toFixed(2)}%
                  </p>
                  <p className={`text-xs ${data.gain_loss_brl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {data.gain_loss_brl >= 0 ? '+' : ''}{fmt(data.gain_loss_brl)}
                  </p>
                </div>
                <div className="w-px h-8 bg-indigo-200 hidden sm:block" />
              </>
            )}
            <div>
              <p className="text-xs text-indigo-500 uppercase tracking-wide mb-0.5">Quantidade</p>
              <p className="font-bold text-indigo-900 text-sm">{fmtNum(data.holdings, data.holdings < 10 ? 6 : 2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Rentabilidade do Indexador (apenas RF) */}
      {data.asset_type === 'fixed_income' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-blue-900 text-sm">Rentabilidade do Indexador</h2>
            {!editingFiRate ? (
              <button
                onClick={() => {
                  setFiTypeValue(data.fi_type ?? 'pos_cdi')
                  setFiRateValue(data.fi_rate != null ? (data.fi_rate * 100).toFixed(1) : '')
                  setFiSpreadValue(data.fi_spread != null ? (data.fi_spread * 100).toFixed(2) : '')
                  setEditingFiRate(true)
                }}
                className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-100 transition-colors"
              >Editar</button>
            ) : (
              <button onClick={() => setEditingFiRate(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            )}
          </div>
          {editingFiRate ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <p className="text-[10px] text-blue-500 uppercase mb-1">Tipo</p>
                <select
                  value={fiTypeValue}
                  onChange={e => setFiTypeValue(e.target.value)}
                  className="text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                >
                  <option value="pos_cdi">% do CDI</option>
                  <option value="selic">% da Selic</option>
                  <option value="pre">% a.a. (pré)</option>
                  <option value="ipca_plus">IPCA+</option>
                </select>
              </div>
              {fiTypeValue === 'ipca_plus' ? (
                <div>
                  <p className="text-[10px] text-blue-500 uppercase mb-1">Spread % a.a.</p>
                  <input
                    type="number" step="0.01"
                    value={fiSpreadValue}
                    onChange={e => setFiSpreadValue(e.target.value)}
                    className="w-24 text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="6.50"
                  />
                </div>
              ) : (
                <div>
                  <p className="text-[10px] text-blue-500 uppercase mb-1">
                    {fiTypeValue === 'pre' ? 'Taxa % a.a.' : 'Taxa % CDI/Selic'}
                  </p>
                  <input
                    type="number" step="0.1"
                    value={fiRateValue}
                    onChange={e => setFiRateValue(e.target.value)}
                    className="w-28 text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="102.5"
                  />
                </div>
              )}
              <button
                onClick={handleSaveFiRate}
                disabled={savingFiRate}
                className="text-xs text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingFiRate ? '…' : 'Salvar'}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">Indexador contratado</p>
                <p className="font-bold text-blue-900 text-sm">
                  {fiIndexerLabel(data.fi_type, data.fi_rate, data.fi_spread) ?? '—'}
                </p>
              </div>
              {(data.gain_loss_pct != null) && (
                <>
                  <div className="w-px h-8 bg-blue-200 hidden sm:block" />
                  <div>
                    <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">Rendimento acumulado</p>
                    <p className={`font-bold text-sm ${
                      data.gain_loss_pct >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {data.gain_loss_pct >= 0 ? '+' : ''}{data.gain_loss_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="w-px h-8 bg-blue-200 hidden sm:block" />
                  <div>
                    <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">Lucro total</p>
                    <p className={`font-bold text-sm ${
                      data.gain_loss_brl >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {data.gain_loss_brl >= 0 ? '+' : ''}{fmt(data.gain_loss_brl)}
                    </p>
                  </div>
                </>
              )}
              {data.fi_start_date && (
                <>
                  <div className="w-px h-8 bg-blue-200 hidden sm:block" />
                  <div>
                    <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">Desde</p>
                    <p className="font-bold text-blue-900 text-sm">{fmtDate(data.fi_start_date)}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

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
          <button
            onClick={() => setShowManualModal(true)}
            className="text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100 transition-colors shrink-0"
          >
            Atualizar
          </button>
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
      {allChartData.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Evolução do valor</h2>
            <div className="flex gap-1">
              {CHART_PERIODS.filter(p => p.months == null || allChartData.length >= p.months).map(p => (
                <button
                  key={p.label}
                  onClick={() => setChartPeriod(p.months)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    chartPeriod === p.months
                      ? 'bg-[#001A70] text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          </div>
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

      {showManualModal && canUpdateManualValue && (() => {
        const assetForModal: PortfolioAsset = {
          id:              data.id,
          code:            data.code,
          name:            data.name,
          currency:        data.currency,
          class_id:        null,
          class_name:      data.class_name,
          class_color:     data.class_color,
          value_brl:       data.current_value_brl,
          value_orig:      data.current_value_brl,
          holdings:        data.holdings,
          price:           data.current_price,
          source:          'manual',
          needs_manual:    false,
          invested_brl:    data.invested_brl,
          last_manual_date: null,
        }
        return (
          <ManualValueModal
            asset={assetForModal}
            initialMode="valorizacao"
            onClose={() => setShowManualModal(false)}
            onSaved={() => { setShowManualModal(false); refresh() }}
          />
        )
      })()}

      {/* Histórico de atualizações de valor com delete (disponível para qualquer ativo com canUpdateManualValue) */}
      {canUpdateManualValue && mvEntriesWithChange.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Atualizações de valor ({mvEntriesWithChange.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Variação</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                  <th className="px-4 py-3 text-left">Notas</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mvEntriesWithChange.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{fmtDate(e.ref_date)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: e.currency, maximumFractionDigits: 2 }).format(e.value)}
                    </td>
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
                        ? `${e.changeAbs >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: e.currency, maximumFractionDigits: 2 }).format(e.changeAbs)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 italic">{e.notes ?? ''}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteManualValue(e.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                        title="Remover esta atualização"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico de aportes — oculto para ativos manuais (valor rastreado em "Atualizações de valor") */}
      {!isManual && (() => {
        // Preço atual por unidade em BRL para calcular lucro por aporte em tickers
        const currentPriceBrl = data.asset_type === 'ticker' && data.holdings != null && data.holdings > 0 && data.current_value_brl > 0
          ? data.current_value_brl / data.holdings
          : null

        return (
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
                      <th className="px-4 py-3 text-right">Preço Unit.</th>
                      <th className="px-4 py-3 text-right">Total BRL</th>
                      <th className="px-4 py-3 text-right">Lucro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.contributions.map(c => {
                      const totalBrlVal = c.value_brl ?? (c.price_orig != null
                        ? c.price_orig * c.quantity * (c.fx_rate_brl ?? 1)
                        : null)

                      // Lucro: vem do backend para RF; calculado aqui para tickers
                      const profitBrl = c.profit_brl != null
                        ? c.profit_brl
                        : (data.asset_type === 'ticker' && c.type === 'buy' && currentPriceBrl != null && totalBrlVal != null
                          ? c.quantity * currentPriceBrl - totalBrlVal
                          : null)

                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{fmtDate(c.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              c.type === 'buy'    ? 'bg-green-100 text-green-700' :
                              c.type === 'income' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-red-100 text-red-700'
                            }`}>
                              {c.type === 'buy' ? 'Compra' : c.type === 'income' ? 'Rendimento' : 'Venda'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmtNum(c.quantity, 6)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {c.price_orig != null && c.currency
                              ? `${c.currency} ${fmtNum(c.price_orig, 4)}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {totalBrlVal != null ? fmt(totalBrlVal) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {profitBrl != null ? (
                              <span className={`text-xs font-semibold ${profitBrl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {profitBrl >= 0 ? '+' : ''}{fmt(profitBrl)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })() }
    </div>
  )
}
