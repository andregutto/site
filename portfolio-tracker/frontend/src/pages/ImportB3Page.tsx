import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { MergedOp } from '../lib/types'

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

interface SyncDetail {
  id: number
  code: string
  status: 'ok' | 'empty' | 'error'
  points?: number
  error?: string
}

interface SyncResult {
  synced: number
  errors: number
  total: number
  details: SyncDetail[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtBrl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v)
}

async function downloadBackupCsv() {
  const rows = await apiFetch<Record<string, unknown>[]>('/import/b3/backup')
  if (!rows.length) { alert('Nenhum aporte encontrado para backup.'); return }
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = String(r[h] ?? '')
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `backup_aportes_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
type ExecPhase = 'importing' | 'syncing'

export default function ImportB3Page() {
  const navigate = useNavigate()
  const [step,          setStep]          = useState<Step>('upload')
  const [execPhase,     setExecPhase]     = useState<ExecPhase>('importing')
  const [parseResult,   setParseResult]   = useState<ParseResult | null>(null)
  const [execResult,    setExecResult]    = useState<ExecuteResult | null>(null)
  const [syncResult,    setSyncResult]    = useState<SyncResult | null>(null)
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
    setExecPhase('importing')
    setError(null)
    try {
      const result = await apiFetch<ExecuteResult>('/import/b3/execute', {
        method: 'POST',
        body: JSON.stringify({ operations: parseResult.operations }),
      })
      setExecResult(result)

      // Sync price history so Performance page shows correct data
      setExecPhase('syncing')
      try {
        const sync = await apiFetch<SyncResult>('/portfolio/sync-history', { method: 'POST' })
        setSyncResult(sync)
      } catch {
        // non-fatal — user can re-sync manually
      }

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

        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Faça um backup antes de confirmar</p>
            <p className="text-xs text-amber-700 mt-0.5">
              A importação é irreversível. Baixe o CSV com todos os seus aportes atuais antes de prosseguir.
            </p>
          </div>
          <button
            onClick={downloadBackupCsv}
            className="px-4 py-2 border border-amber-400 text-amber-800 bg-white rounded-xl text-sm font-semibold hover:bg-amber-50 transition-colors shrink-0"
          >
            ⬇ Baixar backup CSV
          </button>
        </div>

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
        <div className="text-center space-y-4 max-w-xs">
          <div className="text-3xl animate-bounce">{execPhase === 'importing' ? '📥' : '📊'}</div>
          <p className="text-gray-700 text-sm font-medium animate-pulse">
            {execPhase === 'importing' ? 'Importando operações...' : 'Sincronizando histórico de preços...'}
          </p>
          <p className="text-xs text-gray-400">
            {execPhase === 'syncing' && 'Isso pode levar até 1 minuto dependendo da quantidade de ativos.'}
          </p>
          <div className="flex items-center gap-2 justify-center">
            <div className={`w-2 h-2 rounded-full ${execPhase === 'importing' ? 'bg-[#001A70] animate-pulse' : 'bg-green-500'}`} />
            <span className={`text-xs ${execPhase === 'importing' ? 'text-[#001A70] font-medium' : 'text-gray-400'}`}>Importação</span>
            <div className="w-6 h-px bg-gray-200" />
            <div className={`w-2 h-2 rounded-full ${execPhase === 'syncing' ? 'bg-[#001A70] animate-pulse' : 'bg-gray-200'}`} />
            <span className={`text-xs ${execPhase === 'syncing' ? 'text-[#001A70] font-medium' : 'text-gray-400'}`}>Histórico</span>
          </div>
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

        {syncResult != null && (
          <div className={`border rounded-2xl p-5 space-y-3 ${
            syncResult.errors > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-sm font-semibold ${syncResult.errors > 0 ? 'text-amber-900' : 'text-green-900'}`}>
                  Histórico de preços sincronizado
                </p>
                <p className={`text-xs mt-0.5 ${syncResult.errors > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {syncResult.synced} de {syncResult.total} ativos com histórico obtido com sucesso
                </p>
              </div>
              <span className="text-2xl shrink-0">{syncResult.errors > 0 ? '⚠️' : '📊'}</span>
            </div>

            {syncResult.errors > 0 && (() => {
              const failed = syncResult.details.filter(d => d.status === 'error' || d.status === 'empty')
              if (!failed.length) return null

              const netQtyMap = new Map(
                (parseResult?.asset_statuses ?? []).map(a => [a.ticker, a.net_qty])
              )
              const active   = failed.filter(d => (netQtyMap.get(d.code) ?? 0) > 0)
              const inactive = failed.filter(d => (netQtyMap.get(d.code) ?? 0) <= 0)

              return (
                <div className="border-t border-amber-200 pt-3 space-y-3">
                  <p className="text-xs font-semibold text-amber-900">
                    {failed.length} ativo{failed.length > 1 ? 's' : ''} sem histórico de preços disponível
                  </p>

                  {active.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-amber-800">Em carteira — impacto na Performance:</p>
                      <div className="flex flex-wrap gap-2">
                        {active.map(d => (
                          <span key={d.code} className="text-xs px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 font-semibold">
                            {d.code}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Esses ativos ainda estão em carteira mas sem cotação histórica (delistado, sem cobertura ou erro temporário).
                        Os meses passados aparecerão com <strong>R$ 0</strong> na Performance.
                        Você pode cadastrar o valor atual manualmente na página de cada ativo.
                      </p>
                    </div>
                  )}

                  {inactive.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-gray-500">Já vendidos — sem impacto relevante:</p>
                      <div className="flex flex-wrap gap-2">
                        {inactive.map(d => (
                          <span key={d.code} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500 font-semibold">
                            {d.code}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">
                        Posição zerada — o histórico ausente afeta apenas períodos em que você os detinha, sem impacto no saldo atual.
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

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
