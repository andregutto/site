import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { InfoBox } from '../components/ui'
import type { MergedOp, MovOp } from '../lib/types'

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

interface AssetPosition {
  ticker: string
  net_qty: number
  active: boolean
}

interface ExecuteResult {
  created_assets: number
  cleaned_contributions: number
  imported_contributions: number
  tickers_total: number
  skipped_tickers: string[]
  asset_positions: AssetPosition[]
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

// ─── Movimentação types ───────────────────────────────────────────────────────

interface MovAssetStatus {
  ticker: string
  ticker_raw: string
  in_tracker: boolean
  asset_id?: number
}

interface MovParseResult {
  operations: MovOp[]
  asset_statuses: MovAssetStatus[]
  summary: {
    total_events: number
    bonificacoes: number
    desdobros: number
    subscricoes: number
    qty_added: number
    value_brl: number
    date_from: string
    date_to: string
  }
}

interface MovExecResult {
  imported: number
  replaced: number
  skipped_tickers: string[]
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

function PositionsReview({ positions }: { positions: AssetPosition[] }) {
  const [expanded, setExpanded] = useState(false)
  const active   = positions.filter(p => p.active)
  const inactive = positions.filter(p => !p.active)
  const visible  = expanded ? positions : positions.slice(0, 10)

  return (
    <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-[var(--arvo-surface-2)] transition-colors"
      >
        <span className="font-semibold text-[var(--arvo-fg)] text-sm">
          Posições finais ({active.length} em carteira · {inactive.length} zeradas)
        </span>
        <span className="text-[var(--arvo-fg-soft)] text-xs">{expanded ? '▲ Recolher' : '▼ Expandir'}</span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--arvo-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--arvo-surface-2)] text-xs text-[var(--arvo-fg-muted)] uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Ticker</th>
                <th className="px-4 py-2 text-right">Qtd final</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--arvo-border-soft)]">
              {visible.map(p => (
                <tr key={p.ticker} className={p.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-2 font-semibold text-[var(--arvo-fg)]">{p.ticker}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${p.net_qty < 0 ? 'arvo-delta-neg font-semibold' : 'text-[var(--arvo-fg)]'}`}>
                    {new Intl.NumberFormat('pt-BR').format(p.net_qty)}
                    {p.net_qty < 0 && <span className="ml-1 text-xs font-normal arvo-delta-neg" title="Qtd negativa pode indicar evento corporativo não registrado">⚠</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={p.active ? { background: 'var(--arvo-gold-tint)', color: 'var(--arvo-gold-text)' } : { background: 'var(--arvo-surface-2)', color: 'var(--arvo-fg-muted)' }}
                    >
                      {p.active ? 'Em carteira' : 'Zerado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {positions.length > 10 && (
            <div className="px-4 py-2 border-t border-[var(--arvo-border-soft)] text-center">
              <button onClick={() => setExpanded(v => !v)} className="text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]">
                Mostrando {visible.length} de {positions.length}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color = 'gray' }: { label: string; value: string | number; sub?: string; color?: 'gray' | 'blue' | 'amber' | 'green' | 'red' }) {
  const valueColor = {
    gray:  'var(--arvo-fg)',
    blue:  'var(--arvo-blue)',
    amber: 'var(--arvo-ocre)',
    green: 'var(--arvo-green)',
    red:   'var(--arvo-red)',
  }[color]
  return (
    <div className="border rounded-2xl p-4 shadow-sm bg-[var(--arvo-surface)] border-[var(--arvo-border)]">
      <p className="text-xs uppercase tracking-wide text-[var(--arvo-fg-soft)] mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: valueColor }}>{value}</p>
      {sub && <p className="text-xs text-[var(--arvo-fg-faint)] mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step    = 'upload' | 'preview' | 'executing' | 'done'
type MovStep = 'upload' | 'preview' | 'executing' | 'done'
type ExecPhase = 'importing' | 'syncing'

export default function ImportB3Page() {
  const navigate = useNavigate()

  // Tab
  const [activeTab, setActiveTab] = useState<'negociacao' | 'movimentacao'>('negociacao')

  // Negociação state
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

  // Movimentação state
  const [movStep,        setMovStep]        = useState<MovStep>('upload')
  const [movParseResult, setMovParseResult] = useState<MovParseResult | null>(null)
  const [movExecResult,  setMovExecResult]  = useState<MovExecResult | null>(null)
  const [movLoading,     setMovLoading]     = useState(false)
  const [movError,       setMovError]       = useState<string | null>(null)
  const [movDragOver,    setMovDragOver]    = useState(false)
  const [movShowAll,     setMovShowAll]     = useState(false)
  const [movFilter,      setMovFilter]      = useState('')

  const handleMovFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx')) { setMovError('Selecione um arquivo .xlsx'); return }
    setMovError(null)
    setMovLoading(true)
    try {
      const file_base64 = await readBase64(file)
      const result = await apiFetch<MovParseResult>('/import/movimentacao/parse', {
        method: 'POST',
        body: JSON.stringify({ file_base64 }),
      })
      setMovParseResult(result)
      setMovStep('preview')
    } catch (e) {
      setMovError(e instanceof Error ? e.message : 'Erro ao processar arquivo')
    } finally {
      setMovLoading(false)
    }
  }, [])

  async function handleMovExecute() {
    if (!movParseResult) return
    setMovStep('executing')
    setMovError(null)
    try {
      const result = await apiFetch<MovExecResult>('/import/movimentacao/execute', {
        method: 'POST',
        body: JSON.stringify({ operations: movParseResult.operations }),
      })
      setMovExecResult(result)
      setMovStep('done')
    } catch (e) {
      setMovError(e instanceof Error ? e.message : 'Erro ao executar importação')
      setMovStep('preview')
    }
  }

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

      // Bust performance cache so the Performance page recomputes with updated data
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('perf')) localStorage.removeItem(key)
      }

      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao executar importação')
      setStep('preview')
    }
  }

  // ── Tab switcher (shown only on upload steps) ────────────────────────────────
  const showTabs = (activeTab === 'negociacao' && step === 'upload') ||
                   (activeTab === 'movimentacao' && movStep === 'upload')

  const tabBar = showTabs ? (
    <div className="flex gap-1 p-1 bg-[var(--arvo-track-bg)] rounded-xl w-fit">
      {(['negociacao', 'movimentacao'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === tab ? 'bg-[var(--arvo-surface)] text-[var(--arvo-fg)] shadow-sm' : 'text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]'
          }`}
        >
          {tab === 'negociacao' ? 'Negociação' : 'Movimentação'}
        </button>
      ))}
    </div>
  ) : null

  // ── Movimentação: Upload ──────────────────────────────────────────────────
  if (activeTab === 'movimentacao' && movStep === 'upload') {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-7 h-7 rounded-lg border border-[var(--arvo-border)] flex items-center justify-center text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors shrink-0">‹</button>
          <div>
            <span className="arvo-eyebrow block mb-1">Aportes</span>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(22px, 2.2vw, 26px)', letterSpacing: 'var(--arvo-track-normal)', lineHeight: 'var(--arvo-leading-tight)', color: 'var(--arvo-fg)' }}>
              Importar eventos corporativos B3
            </h1>
            <p className="text-sm text-[var(--arvo-fg-soft)] mt-1">Extrato de Movimentação · Área do Investidor da B3</p>
          </div>
        </div>

        {tabBar}

        <div
          onDragOver={e => { e.preventDefault(); setMovDragOver(true) }}
          onDragLeave={() => setMovDragOver(false)}
          onDrop={e => { e.preventDefault(); setMovDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleMovFile(f) }}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
            movDragOver ? 'border-[var(--arvo-gold)] bg-[var(--arvo-gold-tint)]' : 'border-[var(--arvo-border)] bg-[var(--arvo-surface)] hover:border-[var(--arvo-border)]'
          }`}
        >
          <div className="text-4xl mb-4">📋</div>
          <p className="font-semibold text-[var(--arvo-fg)] mb-1">Arraste o arquivo .xlsx aqui</p>
          <p className="text-sm text-[var(--arvo-fg-soft)] mb-5">ou clique para selecionar</p>
          <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors">
            Selecionar arquivo
            <input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; if (f) handleMovFile(f) }} className="hidden" />
          </label>
          {movLoading && (
            <div className="absolute inset-0 bg-[var(--arvo-surface)]/80 rounded-2xl flex items-center justify-center">
              <div className="text-sm text-[var(--arvo-fg-muted)] animate-pulse">Processando arquivo...</div>
            </div>
          )}
        </div>

        {movError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--arvo-red-tint)', color: 'var(--arvo-red)' }}>{movError}</div>}

        <InfoBox variant="info" title="Como obter o arquivo">
          <ol className="list-decimal list-inside space-y-1">
            <li>Acesse a <strong>Área do Investidor</strong> em investidor.b3.com.br</li>
            <li>Vá em <strong>Extrato</strong> → <strong>Movimentação</strong></li>
            <li>Selecione o período desejado e exporte em <strong>.xlsx</strong></li>
          </ol>
          <p className="text-xs text-[var(--arvo-fg-soft)] mt-2">
            Importa: bonificações, desdobramentos e subscrições exercidas. Compras/vendas e dividendos são ignorados (já tratados em Negociação).
          </p>
        </InfoBox>
      </div>
    )
  }

  // ── Movimentação: Preview ─────────────────────────────────────────────────
  if (activeTab === 'movimentacao' && movStep === 'preview' && movParseResult) {
    const { summary, asset_statuses, operations } = movParseResult
    const notFound  = asset_statuses.filter(a => !a.in_tracker)
    const inTracker = asset_statuses.filter(a => a.in_tracker)
    const eventLabel = { bonificacao: 'Bonificação', desdobro: 'Desdobro', subscricao: 'Subscrição' } as const
    const eventColor = {
      bonificacao: 'var(--arvo-gold-text)',
      desdobro:    'var(--arvo-blue)',
      subscricao:  'var(--arvo-terracotta)',
    } as const
    const visible = (movShowAll ? operations : operations.slice(0, 30)).filter(o =>
      !movFilter || o.ticker.toLowerCase().includes(movFilter.toLowerCase())
    )

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setMovStep('upload')} className="w-7 h-7 rounded-lg border border-[var(--arvo-border)] flex items-center justify-center text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors shrink-0">‹</button>
          <div>
            <span className="arvo-eyebrow block mb-1">Aportes</span>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(22px, 2.2vw, 26px)', letterSpacing: 'var(--arvo-track-normal)', lineHeight: 'var(--arvo-leading-tight)', color: 'var(--arvo-fg)' }}>
              Prévia · Eventos corporativos
            </h1>
            <p className="text-sm text-[var(--arvo-fg-soft)] mt-1">{fmtDate(summary.date_from)} → {fmtDate(summary.date_to)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Eventos" value={summary.total_events} sub={`${summary.bonificacoes} bonif. · ${summary.desdobros} desdobros`} />
          <StatCard label="Subscrições" value={summary.subscricoes} color="blue" sub={`${fmtBrl(summary.value_brl)} investidos`} />
          <StatCard label="Cotas adicionadas" value={new Intl.NumberFormat('pt-BR').format(summary.qty_added)} color="green" />
          <StatCard label="Ativos encontrados" value={inTracker.length} color={notFound.length > 0 ? 'amber' : 'green'} sub={notFound.length > 0 ? `${notFound.length} não cadastrados` : 'todos cadastrados'} />
        </div>

        {notFound.length > 0 && (
          <InfoBox variant="warning" title={`Ativos não encontrados no sistema (${notFound.length})`}>
            <p className="text-xs">Esses eventos serão ignorados. Cadastre os ativos primeiro e reimporte.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {notFound.map(a => (
                <span key={a.ticker} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-ocre-tint)', color: 'var(--arvo-fg-muted)' }}>
                  {a.ticker} <span className="font-normal opacity-60">({a.ticker_raw})</span>
                </span>
              ))}
            </div>
          </InfoBox>
        )}

        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--arvo-border)] flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[var(--arvo-fg)]">Eventos ({operations.length})</h2>
            <input
              type="text" placeholder="Filtrar ticker..."
              value={movFilter} onChange={e => setMovFilter(e.target.value)}
              className="border border-[var(--arvo-border)] rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
            />
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Evento</th>
                  <th className="px-4 py-3 text-right">Cotas</th>
                  <th className="px-4 py-3 text-right">Preço/cota</th>
                  <th className="px-4 py-3 text-right">Total pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                {visible.map((op, i) => (
                  <tr key={i} className="hover:bg-[var(--arvo-surface-2)]">
                    <td className="px-4 py-2.5 text-[var(--arvo-fg-muted)] whitespace-nowrap">{fmtDate(op.date)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--arvo-fg)]">
                      {op.ticker}
                      {op.ticker !== op.ticker_raw && <span className="ml-1 text-xs text-[var(--arvo-fg-soft)] font-normal">({op.ticker_raw})</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--arvo-surface-2)', color: eventColor[op.event_type] }}>
                        {eventLabel[op.event_type]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--arvo-fg)]">
                      +{new Intl.NumberFormat('pt-BR').format(op.quantity)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--arvo-fg-muted)]">
                      {op.price > 0 ? fmtBrl(op.price) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[var(--arvo-fg)]">
                      {op.value_brl > 0 ? fmtBrl(op.value_brl) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)]">
            {visible.map((op, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--arvo-fg)]">{op.ticker}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--arvo-surface-2)', color: eventColor[op.event_type] }}>{eventLabel[op.event_type]}</span>
                  </div>
                  <span className="text-sm font-medium text-[var(--arvo-fg)]">+{new Intl.NumberFormat('pt-BR').format(op.quantity)}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--arvo-fg-soft)] flex gap-3">
                  <span>{fmtDate(op.date)}</span>
                  {op.value_brl > 0 && <span>{fmtBrl(op.value_brl)}</span>}
                </div>
              </div>
            ))}
          </div>
          {operations.length > 30 && !movShowAll && (
            <div className="px-4 py-3 border-t border-[var(--arvo-border-soft)] text-center">
              <button onClick={() => setMovShowAll(true)} className="text-sm text-[var(--arvo-fg)] hover:underline">
                Ver todos ({operations.length - 30} restantes)
              </button>
            </div>
          )}
        </div>

        {movError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--arvo-red-tint)', color: 'var(--arvo-red)' }}>{movError}</div>}

        <div className="flex items-center justify-between gap-4 pb-4">
          <p className="text-xs text-[var(--arvo-fg-soft)]">
            {inTracker.length} ativos serão atualizados · {notFound.length} ignorados · {operations.filter(o => asset_statuses.find(a => a.ticker === o.ticker)?.in_tracker).length} eventos a importar
          </p>
          <button
            onClick={handleMovExecute}
            className="px-6 py-2.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors shrink-0"
          >
            Confirmar importação
          </button>
        </div>
      </div>
    )
  }

  // ── Movimentação: Executing ───────────────────────────────────────────────
  if (activeTab === 'movimentacao' && movStep === 'executing') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4 max-w-xs">
          <div className="text-3xl animate-bounce">📋</div>
          <p className="text-[var(--arvo-fg)] text-sm font-medium animate-pulse">Importando eventos corporativos...</p>
        </div>
      </div>
    )
  }

  // ── Movimentação: Done ────────────────────────────────────────────────────
  if (activeTab === 'movimentacao' && movStep === 'done' && movExecResult) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">✅</div>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(24px, 3vw, 32px)', letterSpacing: 'var(--arvo-track-normal)', color: 'var(--arvo-fg)' }} className="mb-2">
            Eventos importados!
          </h1>
          <p className="text-[var(--arvo-fg-muted)] text-sm">Bonificações, desdobramentos e subscrições registrados.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Eventos importados" value={movExecResult.imported}  color="green" />
          <StatCard label="Entradas substituídas" value={movExecResult.replaced} color="amber" sub="reimportação idempotente" />
          <StatCard label="Ignorados" value={movExecResult.skipped_tickers.length} color={movExecResult.skipped_tickers.length > 0 ? 'red' : 'gray'} sub="ativo não cadastrado" />
        </div>

        {movExecResult.skipped_tickers.length > 0 && (
          <InfoBox variant="warning" title="Tickers não encontrados no sistema">
            <div className="flex flex-wrap gap-2 pt-1">
              {movExecResult.skipped_tickers.map(t => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-ocre-tint)', color: 'var(--arvo-fg-muted)' }}>{t}</span>
              ))}
            </div>
          </InfoBox>
        )}

        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/')} className="px-6 py-2.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors">
            Ver Dashboard
          </button>
          <button onClick={() => { setMovStep('upload'); setMovParseResult(null); setMovExecResult(null) }}
            className="px-6 py-2.5 border border-[var(--arvo-border)] text-[var(--arvo-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-surface-2)] transition-colors">
            Nova importação
          </button>
        </div>
      </div>
    )
  }

  // ── Upload step ─────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-7 h-7 rounded-lg border border-[var(--arvo-border)] flex items-center justify-center text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
          >‹</button>
          <div>
            <span className="arvo-eyebrow block mb-1">Aportes</span>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(22px, 2.2vw, 26px)', letterSpacing: 'var(--arvo-track-normal)', lineHeight: 'var(--arvo-leading-tight)', color: 'var(--arvo-fg)' }}>
              Importar negociações B3
            </h1>
            <p className="text-sm text-[var(--arvo-fg-soft)] mt-1">Extrato de Negociação · Área do Investidor da B3</p>
          </div>
        </div>

        {tabBar}

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-colors ${
            dragOver ? 'border-[var(--arvo-gold)] bg-[var(--arvo-gold-tint)]' : 'border-[var(--arvo-border)] bg-[var(--arvo-surface)] hover:border-[var(--arvo-border)]'
          }`}
        >
          <div className="text-4xl mb-4">📊</div>
          <p className="font-semibold text-[var(--arvo-fg)] mb-1">Arraste o arquivo .xlsx aqui</p>
          <p className="text-sm text-[var(--arvo-fg-soft)] mb-5">ou clique para selecionar</p>
          <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors">
            Selecionar arquivo
            <input type="file" accept=".xlsx" onChange={onInputChange} className="hidden" />
          </label>

          {loading && (
            <div className="absolute inset-0 bg-[var(--arvo-surface)]/80 rounded-2xl flex items-center justify-center">
              <div className="text-sm text-[var(--arvo-fg-muted)] animate-pulse">Processando arquivo...</div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--arvo-red-tint)', color: 'var(--arvo-red)' }}>{error}</div>
        )}

        <InfoBox variant="info" title="Como obter o arquivo">
          <ol className="list-decimal list-inside space-y-1">
            <li>Acesse a <strong>Área do Investidor</strong> em investidor.b3.com.br</li>
            <li>Vá em <strong>Extrato</strong> → <strong>Negociação</strong></li>
            <li>Selecione o período desejado e exporte em <strong>.xlsx</strong></li>
          </ol>
          <p className="text-xs text-[var(--arvo-fg-soft)] mt-3">
            O arquivo passará por uma <strong>prévia</strong> antes de qualquer alteração no banco de dados.
          </p>
        </InfoBox>
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
            className="w-7 h-7 rounded-lg border border-[var(--arvo-border)] flex items-center justify-center text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
          >‹</button>
          <div>
            <span className="arvo-eyebrow block mb-1">Aportes</span>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(22px, 2.2vw, 26px)', letterSpacing: 'var(--arvo-track-normal)', lineHeight: 'var(--arvo-leading-tight)', color: 'var(--arvo-fg)' }}>
              Prévia da importação
            </h1>
            <p className="text-sm text-[var(--arvo-fg-soft)] mt-1">{fmtDate(summary.date_from)} → {fmtDate(summary.date_to)}</p>
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
          <InfoBox variant="action" title={`Ativos a criar (${toCreate.length})`}>
            <p className="text-xs">Inativos se posição líquida = 0.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {toCreate.map(a => (
                <span
                  key={a.ticker}
                  className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={a.net_qty > 0 ? { background: 'var(--arvo-gold-tint)', color: 'var(--arvo-gold-text)' } : { background: 'var(--arvo-surface-2)', color: 'var(--arvo-fg-muted)' }}
                >
                  {a.ticker}
                  <span className="ml-1 font-normal opacity-60">
                    {a.net_qty > 0 ? `${a.net_qty} un.` : 'zerado'}
                  </span>
                </span>
              ))}
            </div>
          </InfoBox>
        )}

        {/* Assets to clean */}
        {toClean.length > 0 && (
          <InfoBox variant="warning" title={`Aportes existentes a substituir (${toClean.length})`}>
            <p className="text-xs">
              Os aportes manuais destes ativos serão <strong>deletados</strong> e substituídos pelos dados oficiais da B3.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {toClean.map(a => (
                <span key={a.ticker} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-ocre-tint)', color: 'var(--arvo-fg-muted)' }}>
                  {a.ticker}
                </span>
              ))}
            </div>
          </InfoBox>
        )}

        {/* Already in DB with no contributions */}
        {found.length > 0 && (
          <InfoBox variant="info" title={`Ativos já cadastrados sem aportes (${found.length})`}>
            <div className="flex flex-wrap gap-2 pt-1">
              {found.map(a => (
                <span key={a.ticker} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-gold-tint)', color: 'var(--arvo-gold-text)' }}>
                  {a.ticker}
                </span>
              ))}
            </div>
          </InfoBox>
        )}

        {/* Operations table */}
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--arvo-border)] flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[var(--arvo-fg)]">Operações ({operations.length})</h2>
            <input
              type="text"
              placeholder="Filtrar ticker..."
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value)}
              className="border border-[var(--arvo-border)] rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
            />
          </div>
          {/* desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
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
              <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                {displayOps.map((op, i) => (
                  <tr key={i} className="hover:bg-[var(--arvo-surface-2)]">
                    <td className="px-4 py-2.5 text-[var(--arvo-fg-muted)] whitespace-nowrap">{fmtDate(op.date)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--arvo-fg)]">{op.ticker}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--arvo-surface-2)', color: 'var(--arvo-fg-muted)' }}>
                        {op.type === 'buy' ? 'Compra' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--arvo-fg)]">
                      {new Intl.NumberFormat('pt-BR').format(op.quantity)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--arvo-fg-muted)]">
                      {fmtBrl(op.price)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-[var(--arvo-fg)]">
                      {fmtBrl(op.value_brl)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--arvo-fg-soft)] text-xs truncate max-w-[140px]">
                      {op.institution.split(' ')[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)]">
            {displayOps.map((op, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--arvo-fg)]">{op.ticker}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--arvo-surface-2)', color: 'var(--arvo-fg-muted)' }}>
                      {op.type === 'buy' ? 'Compra' : 'Venda'}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium text-sm text-[var(--arvo-fg)]">{fmtBrl(op.value_brl)}</div>
                  </div>
                </div>
                <div className="mt-1 text-xs text-[var(--arvo-fg-soft)] flex flex-wrap gap-x-3">
                  <span>{fmtDate(op.date)}</span>
                  <span>{new Intl.NumberFormat('pt-BR').format(op.quantity)} un. · {fmtBrl(op.price)}</span>
                </div>
              </div>
            ))}
          </div>
          {visibleOps.length > 30 && !showAllOps && (
            <div className="px-4 py-3 border-t border-[var(--arvo-border-soft)] text-center">
              <button
                onClick={() => setShowAllOps(true)}
                className="text-sm text-[var(--arvo-fg)] hover:underline"
              >
                Ver todas ({visibleOps.length - 30} restantes)
              </button>
            </div>
          )}
        </div>

        {/* Confirm */}
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--arvo-red-tint)', color: 'var(--arvo-red)' }}>{error}</div>
        )}

        <InfoBox variant="warning" title="Faça um backup antes de confirmar">
          <p>A importação é irreversível. Baixe o CSV com todos os seus aportes atuais antes de prosseguir.</p>
          <button
            onClick={downloadBackupCsv}
            className="mt-2 px-4 py-2 border border-[var(--arvo-border)] text-[var(--arvo-fg)] bg-[var(--arvo-surface)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-surface-2)] transition-colors"
          >
            ⬇ Baixar backup CSV
          </button>
        </InfoBox>

        <div className="flex items-center justify-between gap-4 pb-4">
          <p className="text-xs text-[var(--arvo-fg-soft)]">
            Esta ação irá criar <strong>{toCreate.length}</strong> ativos,
            deletar aportes de <strong>{toClean.length}</strong> ativos
            e importar <strong>{operations.length}</strong> operações.
          </p>
          <button
            onClick={handleExecute}
            className="px-6 py-2.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors shrink-0"
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
          <p className="text-[var(--arvo-fg)] text-sm font-medium animate-pulse">
            {execPhase === 'importing' ? 'Importando operações...' : 'Sincronizando histórico de preços...'}
          </p>
          <p className="text-xs text-[var(--arvo-fg-soft)]">
            {execPhase === 'syncing' && 'Isso pode levar até 1 minuto dependendo da quantidade de ativos.'}
          </p>
          <div className="flex items-center gap-2 justify-center">
            <div className={`w-2 h-2 rounded-full ${execPhase === 'importing' ? 'bg-[var(--arvo-fg)] animate-pulse' : 'bg-[var(--arvo-green)]'}`} />
            <span className={`text-xs ${execPhase === 'importing' ? 'text-[var(--arvo-fg)] font-medium' : 'text-[var(--arvo-fg-soft)]'}`}>Importação</span>
            <div className="w-6 h-px bg-[var(--arvo-track-bg)]" />
            <div className={`w-2 h-2 rounded-full ${execPhase === 'syncing' ? 'bg-[var(--arvo-fg)] animate-pulse' : 'bg-[var(--arvo-track-bg)]'}`} />
            <span className={`text-xs ${execPhase === 'syncing' ? 'text-[var(--arvo-fg)] font-medium' : 'text-[var(--arvo-fg-soft)]'}`}>Histórico</span>
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
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontWeight: 400, fontSize: 'clamp(24px, 3vw, 32px)', letterSpacing: 'var(--arvo-track-normal)', color: 'var(--arvo-fg)' }} className="mb-2">
            Importação concluída!
          </h1>
          <p className="text-[var(--arvo-fg-muted)] text-sm">Os dados foram salvos com sucesso.</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Ativos criados"    value={execResult.created_assets}         color="blue" />
          <StatCard label="Aportes limpos"    value={execResult.cleaned_contributions}  color="amber" />
          <StatCard label="Operações import." value={execResult.imported_contributions} color="green" />
        </div>

        {syncResult != null && (
          <InfoBox variant={syncResult.errors > 0 ? 'warning' : 'info'} title="Histórico de preços sincronizado">
            <p>{syncResult.synced} de {syncResult.total} ativos com histórico obtido com sucesso</p>

            {syncResult.errors > 0 && (() => {
              const failed = syncResult.details.filter(d => d.status === 'error' || d.status === 'empty')
              if (!failed.length) return null

              const netQtyMap = new Map(
                (parseResult?.asset_statuses ?? []).map(a => [a.ticker, a.net_qty])
              )
              const active   = failed.filter(d => (netQtyMap.get(d.code) ?? 0) > 0)
              const inactive = failed.filter(d => (netQtyMap.get(d.code) ?? 0) <= 0)

              return (
                <div className="border-t border-[var(--arvo-border)] pt-3 mt-2 space-y-3">
                  <p className="text-xs font-semibold text-[var(--arvo-fg)]">
                    {failed.length} ativo{failed.length > 1 ? 's' : ''} sem histórico de preços disponível
                  </p>

                  {active.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-[var(--arvo-fg)]">Em carteira · impacto na Performance:</p>
                      <div className="flex flex-wrap gap-2">
                        {active.map(d => (
                          <span key={d.code} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-ocre-tint)', color: 'var(--arvo-fg-muted)' }}>
                            {d.code}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--arvo-fg-soft)] leading-relaxed">
                        Esses ativos ainda estão em carteira mas sem cotação histórica (delistado, sem cobertura ou erro temporário).
                        Os meses passados aparecerão com <strong>R$ 0</strong> na Performance.
                        Você pode cadastrar o valor atual manualmente na página de cada ativo.
                      </p>
                    </div>
                  )}

                  {inactive.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-[var(--arvo-fg-muted)]">Já vendidos · sem impacto relevante:</p>
                      <div className="flex flex-wrap gap-2">
                        {inactive.map(d => (
                          <span key={d.code} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-surface-2)', color: 'var(--arvo-fg-muted)' }}>
                            {d.code}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--arvo-fg-soft)]">
                        Posição zerada: o histórico ausente afeta apenas períodos em que você os detinha, sem impacto no saldo atual.
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}
          </InfoBox>
        )}

        {/* Corporate events reminder */}
        <InfoBox variant="info" title="Lembrete: bonificações e desdobramentos não estão neste arquivo">
          <p>Use a aba <strong>Movimentação</strong> (arquivo de Extrato de Movimentação da B3) para importar eventos corporativos e manter as posições corretas.</p>
        </InfoBox>

        {execResult.asset_positions.length > 0 && (
          <PositionsReview positions={execResult.asset_positions} />
        )}

        {execResult.skipped_tickers.length > 0 && (
          <InfoBox variant="error" title="Tickers não importados">
            <div className="flex flex-wrap gap-2 pt-1">
              {execResult.skipped_tickers.map(t => (
                <span key={t} className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'var(--arvo-red-tint)', color: 'var(--arvo-red)' }}>{t}</span>
              ))}
            </div>
          </InfoBox>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors"
          >
            Ver Dashboard
          </button>
          <button
            onClick={() => navigate('/performance')}
            className="px-6 py-2.5 border border-[var(--arvo-border)] text-[var(--arvo-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-surface-2)] transition-colors"
          >
            Ver Performance
          </button>
        </div>
      </div>
    )
  }

  return null
}
