import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { MergedOp } from '../../api/_routes/import'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetStatus {
  ticker: string
  status: 'exists_with_contribs' | 'exists_no_contribs' | 'to_create'
  asset_id?: number
  net_qty: number
}

interface ParseResult {
  operations: MergedOp[]
  asset_statuses: AssetStatus[]
  summary: {
    raw_rows: number
    tickers: number
    to_create: number
    to_clean: number
    date_from: string
    date_to: string
    buys: number
    sells: number
  }
}

interface ExecuteResult {
  created_assets: number
  cleaned_contributions: number
  imported_contributions: number
  tickers_total: number
  skipped_tickers: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtBrl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v)
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'gray' }: { label: string; value: string | number; sub?: string; color?: 'gray' | 'blue' | 'amber' | 'green' | 'red' }) {
  const colors = {
    gray:  'bg-white border-gray-100 text-gray-900',
    blue:  'bg-blue-50 border-blue-100 text-blue-900',
    amber: 'bg-amber-50 border-amber-100 text-amber-900',
    green: 'bg-green-50 border-green-100 text-green-900',
    red:   'bg-red-50 border-red-100 text-red-900',
  }
  return (
    <div className={`border rounded-2xl p-4 shadow-sm ${colors[color]}`}>
      <p className="text-xs uppercase tracking-wide opacity-60 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-50 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'executing' | 'done'

export default function ImportB3Page() {
  const navigate = useNavigate()
  const [step,          setStep]          = useState<Step>('upload')
  const [parseResult,   setParseResult]   = useState<ParseResult | null>(null)
  const [execResult,    setExecResult]    = useState<ExecuteResult | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [dragOver,      setDragOver]      = useState(false)
  const [showAllOps,    setShowAllOps]    = useState(false)
  const [filterTicker,  setFilterTicker]  = useState('')

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx')) { setError('Selecione um arquivo .xlsx'); return }
    setError(null)
    setLoading(true)
    try {
      const file_base64 = await readBase64(file)
      const result = await apiFetch<ParseResult>('/import/b3/parse', {
        method: 'POST',
        body: JSON.stringify({ file_base64 }),
      })
      setParseResult(result)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar arquivo')
    } finally {
      setLoading(false)
    }
  }, [])

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleExecute() {
    if (!parseResult) return
    setStep('executing')
    setError(null)
    try {
      const result = await apiFetch<ExecuteResult>('/import/b3/execute', {
        method: 'POST',
        body: JSON.stringify({ operations: parseResult.operations }),
      })
      setExecResult(result)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao executar importação')
      setStep('preview')
    }
  }

  // ── Upload step ─────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors"
          >‹</button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Importar negociações B3</h1>
            <p className="text-sm text-gray-500">Extrato de Negociação — Área do Investidor da B3</p>
          </div>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
            dragOver ? 'border-[#001A70] bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="text-4xl mb-4">📊</div>
          <p className="font-semibold text-gray-700 mb-1">Arraste o arquivo .xlsx aqui</p>
          <p className="text-sm text-gray-400 mb-5">ou clique para selecionar</p>
          <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-[#001A70] text-white rounded-xl text-sm font-semibold hover:bg-[#001A70]/90 transition-colors">
            Selecionar arquivo
            <input type="file" accept=".xlsx" onChange={onInputChange} className="hidden" />
          </label>

          {loading && (
            <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center">
              <div className="text-sm text-gray-500 animate-pulse">Processando arquivo...</div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-sm text-gray-600 space-y-2">
          <p className="font-semibold text-gray-800">Como obter o arquivo:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Acesse a <strong>Área do Investidor</strong> em investidor.b3.com.br</li>
            <li>Vá em <strong>Extrato</strong> → <strong>Negociação</strong></li>
            <li>Selecione o período desejado e exporte em <strong>.xlsx</strong></li>
          </ol>
          <p className="text-xs text-gray-400 mt-3">
            O arquivo passará por uma <strong>prévia</strong> antes de qualquer alteração no banco de dados.
          </p>
        </div>
      </div>
    )
  }

  // ── Preview step ─────────────────────────────────────────────────────────────
  if (step === 'preview' && parseResult) {
    const { summary, asset_statuses, operations } = parseResult
    const toCreate = asset_statuses.filter(a => a.status === 'to_create')
    const toClean  = asset_statuses.filter(a => a.status === 'exists_with_contribs')
    const found    = asset_statuses.filter(a => a.status === 'exists_no_contribs')

    const visibleOps = operations.filter(o =>
      !filterTicker || o.ticker.toLowerCase().includes(filterTicker.toLowerCase())
    )
    const displayOps = showAllOps ? visibleOps : visibleOps.slice(0, 30)

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('upload')}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:border-[#001A70] hover:text-[#001A70] transition-colors"
          >‹</button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Prévia da importação</h1>
            <p className="text-sm text-gray-500">{fmtDate(summary.date_from)} → {fmtDate(summary.date_to)}</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Operações"   value={summary.raw_rows}  sub={`${summary.buys} compras · ${summary.sells} vendas`} />
          <StatCard label="Tickers"     value={summary.tickers}   sub="após normalização" />
          <StatCard label="Criar ativos" value={toCreate.length} color={toCreate.length > 0 ? 'blue' : 'gray'}  sub="novos no sistema" />
          <StatCard label="Substituir"   value={toClean.length}  color={toClean.length > 0 ? 'amber' : 'gray'}  sub="aportes existentes" />
        </div>

        {/* Assets to create */}
        {toCreate.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <h2 className="font-semibold text-blue-900 text-sm mb-3">
              Ativos a criar ({toCreate.length}) <span className="font-normal text-blue-600">— inativos se posição líquida = 0</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {toCreate.map(a => (
                <span key={a.ticker} className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                  a.net_qty > 0
                    ? 'bg-blue-100 border-blue-200 text-blue-800'
                    : 'bg-gray-100 border-gray-200 text-gray-600'
                }`}>
                  {a.ticker}
                  <span className="ml-1 font-normal opacity-60">
                    {a.net_qty > 0 ? `${a.net_qty} un.` : 'zerado'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Assets to clean */}
        {toClean.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <h2 className="font-semibold text-amber-900 text-sm mb-2">
              Aportes existentes a substituir ({toClean.length})
            </h2>
            <p className="text-xs text-amber-700 mb-3">
              Os aportes manuais destes ativos serão <strong>deletados</strong> e substituídos pelos dados oficiais da B3.
            </p>
            <div className="flex flex-wrap gap-2">
              {toClean.map(a => (
                <span key={a.ticker} className="text-xs px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 font-semibold">
                  {a.ticker}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Already in DB with no contributions */}
        {found.length > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
            <h2 className="font-semibold text-green-900 text-sm mb-2">
              Ativos já cadastrados sem aportes ({found.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {found.map(a => (
                <span key={a.ticker} className="text-xs px-2.5 py-1 rounded-full bg-green-100 border border-green-200 text-green-800 font-semibold">
                  {a.ticker}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Operations table */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-800">Operações ({operations.length})</h2>
            <input
              type="text"
              placeholder="Filtrar ticker..."
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Preço Méd.</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-left text-xs normal-case">Instituição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayOps.map((op, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(op.date)}</td>
                    <td className="px-4 py-2.5 font-semibold text-gray-900">{op.ticker}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        op.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {op.type === 'buy' ? 'Compra' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {new Intl.NumberFormat('pt-BR').format(op.quantity)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {fmtBrl(op.price)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                      {fmtBrl(op.value_brl)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs truncate max-w-[140px]">
                      {op.institution.split(' ')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleOps.length > 30 && !showAllOps && (
            <div className="px-4 py-3 border-t border-gray-50 text-center">
              <button
                onClick={() => setShowAllOps(true)}
                className="text-sm text-[#001A70] hover:underline"
              >
                Ver todas ({visibleOps.length - 30} restantes)
              </button>
            </div>
          )}
        </div>

        {/* Confirm */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>
        )}

        <div className="flex items-center justify-between gap-4 pb-4">
          <p className="text-xs text-gray-400">
            Esta ação irá criar <strong>{toCreate.length}</strong> ativos,
            deletar aportes de <strong>{toClean.length}</strong> ativos
            e importar <strong>{operations.length}</strong> operações.
          </p>
          <button
            onClick={handleExecute}
            className="px-6 py-2.5 bg-[#001A70] text-white rounded-xl text-sm font-semibold hover:bg-[#001A70]/90 transition-colors shrink-0"
          >
            Confirmar importação
          </button>
        </div>
      </div>
    )
  }

  // ── Executing ────────────────────────────────────────────────────────────────
  if (step === 'executing') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <div className="text-3xl animate-bounce">📥</div>
          <p className="text-gray-500 text-sm animate-pulse">Importando operações...</p>
        </div>
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (step === 'done' && execResult) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Importação concluída!</h1>
          <p className="text-gray-500 text-sm">Os dados foram salvos com sucesso.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Ativos criados"    value={execResult.created_assets}         color="blue" />
          <StatCard label="Aportes limpos"    value={execResult.cleaned_contributions}  color="amber" />
          <StatCard label="Operações import." value={execResult.imported_contributions} color="green" />
        </div>

        {execResult.skipped_tickers.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <h2 className="font-semibold text-red-900 text-sm mb-2">Tickers não importados</h2>
            <div className="flex flex-wrap gap-2">
              {execResult.skipped_tickers.map(t => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-red-100 border border-red-200 text-red-700 font-semibold">{t}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-[#001A70] text-white rounded-xl text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
          >
            Ver Dashboard
          </button>
          <button
            onClick={() => navigate('/performance')}
            className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Ver Performance
          </button>
        </div>
      </div>
    )
  }

  return null
}
