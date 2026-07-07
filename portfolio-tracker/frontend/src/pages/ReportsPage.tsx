import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ExcelJS from 'exceljs'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { InfoBox, DatePicker } from '../components/ui'

// ─── Brazil Tax Interfaces ────────────────────────────────────────────────────

interface BrBem {
  asset_id: number; code: string; name: string
  pgdi_grupo: string; pgdi_codigo: string; pgdi_descricao: string
  qty: number; cost_brl: number
  situacao_anterior: number; situacao_atual: number
  discriminacao: string
}

interface BrRendItem { id: string; date: string; asset_code: string; asset_name: string; valor: number; ir_retido: number }

interface BrRendGroup {
  codigo: string; descricao: string
  items: BrRendItem[]
  total: number; ir_retido_total: number
}

interface BrRVMes {
  mes: string; total_vendas: number; ganho_bruto: number; perda_bruta: number
  carryover_anterior: number; ganho_liquido: number; isento: boolean
  aliquota: number; ir_devido: number; ir_retido: number; darf_a_pagar: number
  operacoes: Array<{ date: string; code: string; qty: number; sale_value: number; cost_basis: number; gain: number }>
}

interface BrCLMes {
  mes: string; dividendos_brl: number; aliquota: number; deducao: number; ir_devido: number
  items: Array<{ date: string; asset_code: string; country: string; amount_brl: number }>
}

interface BrazilTaxData {
  year: number
  bens_direitos: BrBem[]
  rendimentos_isentos: BrRendGroup[]
  tributacao_exclusiva: BrRendGroup[]
  ir_retido_total: number; total_isentos: number; total_exclusiva: number
  renda_variavel: BrRVMes[]
  total_ganho_rv: number; total_perda_rv: number; total_darf_rv: number; carryover_final: number
  carne_leao: BrCLMes[]
  total_carne_leao: number
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtBRL(n: number) {
  return `R$ ${fmt(n)}`
}

const DIV_SYNC_INTERVAL = 6 * 60 * 60 * 1000 // 6 h
const DIV_SYNC_KEY = 'div_last_sync'

function syncDividendsThen<T>(fn: () => Promise<T>): Promise<T> {
  const last = localStorage.getItem(DIV_SYNC_KEY)
  const stale = !last || Date.now() - new Date(last).getTime() >= DIV_SYNC_INTERVAL
  const step = stale
    ? apiFetch('/dividends/sync', { method: 'POST' })
        .then(() => localStorage.setItem(DIV_SYNC_KEY, new Date().toISOString()))
        .catch(() => {})
    : Promise.resolve()
  return step.then(fn)
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

function residenceTabType(country: string | null): 'fr' | 'coming_soon' {
  if (!country) return 'coming_soon'
  const c = country.toLowerCase().trim()
  if (c === 'fr' || c.startsWith('fran')) return 'fr'
  return 'coming_soon'
}

export default function ReportsPage() {
  const { t } = useI18n()
  const [year, setYear]               = useState(CURRENT_YEAR - 1)
  const [tab, setTab]                 = useState<'br' | 'fr'>('br')
  const [taxCountry, setTaxCountry]             = useState<string>('BR')
  const [residenceCountry, setResidenceCountry] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ country?: string; tax_country?: string; saida_fiscal_brasil?: boolean }>('/profile')
      .then(p => {
        const tc      = p.tax_country || (p.saida_fiscal_brasil ? 'FR' : 'BR')
        const country = p.country ?? null
        setTaxCountry(tc)
        setResidenceCountry(country)
        const resTab = residenceTabType(country)
        if (resTab === 'fr') setTab('fr')
        else if (tc === 'BR') setTab('br')
      })
      .catch(() => {})
  }, [])

  const resTab  = residenceTabType(residenceCountry)
  const showBr  = taxCountry === 'BR'
  const showRes = residenceCountry !== null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-[var(--arvo-fg)]">Relatórios IR</h1>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-[var(--arvo-border)] rounded-lg px-3 py-1.5 text-sm bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex rounded-lg border border-[var(--arvo-border)] overflow-hidden text-sm">
            {showBr && (
              <button
                onClick={() => setTab('br')}
                className={`px-4 py-1.5 font-medium transition-colors ${tab === 'br' ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)]' : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] hover:bg-[var(--arvo-surface-2)]'}`}
              >Brasil</button>
            )}
            {showRes && resTab === 'fr' && (
              <button
                onClick={() => setTab('fr')}
                className={`px-4 py-1.5 font-medium transition-colors ${showBr ? 'border-l border-[var(--arvo-border)]' : ''} ${tab === 'fr' ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)]' : 'bg-[var(--arvo-surface)] text-[var(--arvo-fg-muted)] hover:bg-[var(--arvo-surface-2)]'}`}
              >França</button>
            )}
            {showRes && resTab === 'coming_soon' && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 ${showBr ? 'border-l border-[var(--arvo-border)]' : ''} bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-soft)] cursor-not-allowed select-none`} title={t.common.comingSoon}>
                <span className="font-medium">{residenceCountry}</span>
                <span className="text-[10px] bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)] px-1.5 py-0.5 rounded-full leading-none">{t.common.comingSoon}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {tab === 'br' && showBr && <BrReport year={year} />}
      {tab === 'fr' && <FrReport year={year} />}
    </div>
  )
}

function BrReport({ year }: { year: number }) {
  const { t } = useI18n()
  const bt = t.brTax
  const [brData, setBrData] = useState<BrazilTaxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [step, setStep]       = useState<'overview' | 'rv' | 'bens'>('overview')

  useEffect(() => {
    setStep('overview'); setLoading(true); setError(null); setBrData(null)
    syncDividendsThen(() => apiFetch<BrazilTaxData>(`/reports/brazil/${year}`))
      .then(d => { setBrData(d); setLoading(false) })
      .catch(e => { setError(e instanceof Error ? e.message : 'Erro'); setLoading(false) })
  }, [year])

  if (loading) return <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-10 text-center text-[var(--arvo-fg-soft)] text-sm">{bt.loading}</div>
  if (error)   return <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-6 text-red-600 text-sm dark:text-red-300">{error}</div>
  if (!brData) return null

  const totalRend = brData.total_isentos + brData.total_exclusiva

  return (
    <div className="space-y-5">
      {/* Step nav */}
      <div className="flex items-center overflow-x-auto scrollbar-none">
        {(['overview', 'rv', 'bens'] as const).map((s, i) => {
          const labels = [bt.step1, bt.step2, bt.step3]
          const isActive = step === s
          return (
            <div key={s} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
              <button onClick={() => setStep(s)} className="flex items-center gap-2.5 shrink-0">
                <span className="text-2xl leading-none tabular-nums transition-colors" style={{ fontFamily: 'var(--arvo-font-display)', color: isActive ? 'var(--arvo-fg)' : 'var(--arvo-fg-faint)' }}>0{i + 1}</span>
                <span className={`text-xs uppercase tracking-wide transition-colors ${isActive ? 'text-[var(--arvo-fg)] font-semibold' : 'text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]'}`}>{labels[i].replace(/^\d+\.\s*/, '')}</span>
              </button>
              {i < 2 && <div className="flex-1 h-px mx-3" style={{ background: 'var(--arvo-border)' }} />}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Resumo ────────────────────────────────────────────────── */}
      {step === 'overview' && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card label={bt.kpiBens}     value={String(brData.bens_direitos.length)}  valueClass="text-[var(--arvo-fg)]" />
            <Card label={bt.kpiIsentos}  value={fmtBRL(brData.total_isentos)}         valueClass="text-green-600 dark:text-green-300" />
            <Card label={bt.kpiExclusiva} value={fmtBRL(brData.total_exclusiva)}      valueClass="text-[var(--arvo-gold-text)]" />
            <Card label={bt.kpiDARF}     value={fmtBRL(brData.total_darf_rv)}         valueClass={brData.total_darf_rv > 0 ? 'text-red-600 dark:text-red-300' : 'text-[var(--arvo-fg-soft)]'} />
            <Card label={bt.kpiCarneLeao} value={fmtBRL(brData.total_carne_leao)}     valueClass={brData.total_carne_leao > 0 ? 'text-orange-600 dark:text-orange-300' : 'text-[var(--arvo-fg-soft)]'} />
            <Card label={bt.kpiIRRetido} value={fmtBRL(brData.ir_retido_total)}       valueClass="text-blue-600 dark:text-blue-300" />
          </div>

          {/* Auto sources */}
          <Section title={bt.autoSources}>
            <div className="py-3 space-y-1 text-sm text-[var(--arvo-fg-muted)]">
              <p>• {brData.bens_direitos.length} {bt.kpiBens.toLowerCase()}</p>
              {brData.rendimentos_isentos.map(g => (
                <p key={g.codigo}>• {bt.sectionIsentos} · Código {g.codigo}: {g.descricao} ({fmtBRL(g.total)})</p>
              ))}
              {brData.tributacao_exclusiva.map(g => (
                <p key={g.codigo}>• {bt.sectionExclusiva} · Código {g.codigo}: {g.descricao} ({fmtBRL(g.total)})</p>
              ))}
              {brData.renda_variavel.length > 0 && (
                <p>• {brData.renda_variavel.reduce((s, m) => s + m.operacoes.length, 0)} {t.frTax.salesDetected.replace('→ caso 3VG', '→ Renda Variável')}</p>
              )}
              {brData.carne_leao.length > 0 && (
                <p>• {bt.sectionCL} · {brData.carne_leao.reduce((s, m) => s + m.items.length, 0)} {t.frTax.eventsSync}</p>
              )}
            </div>
          </Section>

          {/* Manual instructions */}
          <InfoBox variant="action" title={bt.instrTitle}>
            <p>{bt.instrText}</p>
          </InfoBox>

          {/* Summary totals */}
          {(brData.total_darf_rv > 0 || brData.total_carne_leao > 0 || totalRend > 0) && (
            <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl shadow-sm p-5 space-y-2 text-sm">
              {totalRend > 0 && <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">Total rendimentos declarados</span><span className="font-semibold">{fmtBRL(totalRend)}</span></div>}
              {brData.total_darf_rv > 0 && <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{bt.rvTotalDARF}</span><span className="font-semibold text-red-600 dark:text-red-300">{fmtBRL(brData.total_darf_rv)}</span></div>}
              {brData.total_carne_leao > 0 && <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{bt.clTotal}</span><span className="font-semibold text-orange-600 dark:text-orange-300">{fmtBRL(brData.total_carne_leao)}</span></div>}
              {brData.ir_retido_total > 0 && <div className="flex justify-between border-t border-[var(--arvo-border)] pt-2"><span className="text-[var(--arvo-fg-muted)]">{bt.kpiIRRetido}</span><span className="font-semibold text-blue-600 dark:text-blue-300">{fmtBRL(brData.ir_retido_total)}</span></div>}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => setStep('rv')} className="px-6 py-2.5 text-sm font-semibold bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl hover:bg-[var(--arvo-fg)]/90 transition-colors">{bt.btnContinue}</button>
          </div>
        </>
      )}

      {/* ── Step 2: Renda Variável + Carnê-Leão ──────────────────────────── */}
      {step === 'rv' && (
        <>
          {/* Renda Variável */}
          <Section title={bt.sectionRV}>
            <p className="text-xs text-[var(--arvo-fg-soft)] py-2">{bt.rvDesc}</p>
            {brData.renda_variavel.length === 0 ? (
              <p className="text-sm text-[var(--arvo-fg-soft)] py-4 text-center">{bt.noRV} {year}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                    <th className="text-left py-2 font-medium">{bt.rvColMes}</th>
                    <th className="text-right py-2 font-medium">{bt.rvColVendas}</th>
                    <th className="text-right py-2 font-medium">{bt.rvColGanho}</th>
                    <th className="text-right py-2 font-medium">{bt.rvColPerda}</th>
                    <th className="text-right py-2 font-medium">{bt.rvColCarryover}</th>
                    <th className="text-right py-2 font-medium">{bt.rvColLiquido}</th>
                    <th className="text-center py-2 font-medium">{bt.rvColIsento}</th>
                    <th className="text-right py-2 font-medium">{bt.rvColDARF}</th>
                  </tr></thead>
                  <tbody>
                    {brData.renda_variavel.map((m, i) => (
                      <tr key={m.mes} className={`border-b border-[var(--arvo-border-soft)] ${i % 2 === 0 ? '' : 'bg-[var(--arvo-surface-2)]/50'}`}>
                        <td className="py-1.5 font-medium">{m.mes}</td>
                        <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">{fmtBRL(m.total_vendas)}</td>
                        <td className="py-1.5 text-right text-green-700 dark:text-green-300">{m.ganho_bruto > 0 ? fmtBRL(m.ganho_bruto) : '-'}</td>
                        <td className="py-1.5 text-right text-red-500 dark:text-red-400">{m.perda_bruta < 0 ? fmtBRL(m.perda_bruta) : '-'}</td>
                        <td className="py-1.5 text-right text-[var(--arvo-fg-soft)] font-mono text-xs">{m.carryover_anterior !== 0 ? fmtBRL(m.carryover_anterior) : '-'}</td>
                        <td className="py-1.5 text-right font-semibold">{m.ganho_liquido > 0 ? fmtBRL(m.ganho_liquido) : '-'}</td>
                        <td className="py-1.5 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${m.isento ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                            {m.isento ? bt.rvIsento : bt.rvTributado}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-semibold text-red-600 dark:text-red-300">{m.darf_a_pagar > 0 ? fmtBRL(m.darf_a_pagar) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] font-semibold">
                      <td className="py-2 text-[var(--arvo-fg-muted)] text-xs">{bt.rvTotalDARF}</td>
                      <td />
                      <td className="py-2 text-right text-green-700 dark:text-green-300">{fmtBRL(brData.total_ganho_rv)}</td>
                      <td className="py-2 text-right text-red-500 dark:text-red-400">{brData.total_perda_rv !== 0 ? fmtBRL(brData.total_perda_rv) : '-'}</td>
                      <td />
                      <td />
                      <td />
                      <td className="py-2 text-right text-red-600 dark:text-red-300">{fmtBRL(brData.total_darf_rv)}</td>
                    </tr>
                    {brData.carryover_final !== 0 && (
                      <tr className="border-t border-[var(--arvo-border)] text-xs text-[var(--arvo-fg-soft)]">
                        <td colSpan={7} className="py-1.5 text-right">{bt.rvCarryover}</td>
                        <td className="py-1.5 text-right font-semibold text-[var(--arvo-fg-muted)]">{fmtBRL(brData.carryover_final)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Carnê-Leão */}
          <Section title={bt.sectionCL}>
            <p className="text-xs text-[var(--arvo-fg-soft)] py-2">{bt.clDesc}</p>
            {brData.carne_leao.length === 0 ? (
              <p className="text-sm text-[var(--arvo-fg-soft)] py-4 text-center">{bt.noCL} {year}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                    <th className="text-left py-2 font-medium">{bt.clColMes}</th>
                    <th className="text-right py-2 font-medium">{bt.clColDivs}</th>
                    <th className="text-right py-2 font-medium">{bt.clColAliq}</th>
                    <th className="text-right py-2 font-medium">{bt.clColDeducao}</th>
                    <th className="text-right py-2 font-medium">{bt.clColIR}</th>
                  </tr></thead>
                  <tbody>
                    {brData.carne_leao.map((m, i) => (
                      <tr key={m.mes} className={`border-b border-[var(--arvo-border-soft)] ${i % 2 === 0 ? '' : 'bg-[var(--arvo-surface-2)]/50'}`}>
                        <td className="py-1.5 font-medium">{m.mes}</td>
                        <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">{fmtBRL(m.dividendos_brl)}</td>
                        <td className="py-1.5 text-right">{(m.aliquota * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right text-[var(--arvo-fg-soft)]">{m.deducao > 0 ? fmtBRL(m.deducao) : '-'}</td>
                        <td className="py-1.5 text-right font-semibold text-orange-600 dark:text-orange-300">{m.ir_devido > 0 ? fmtBRL(m.ir_devido) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] font-semibold">
                      <td colSpan={4} className="py-2 text-right text-xs text-[var(--arvo-fg-muted)]">{bt.clTotal}</td>
                      <td className="py-2 text-right text-orange-600 dark:text-orange-300">{fmtBRL(brData.total_carne_leao)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="flex justify-between items-center gap-3">
            <button onClick={() => setStep('overview')} className="px-4 py-2 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">{bt.btnBack}</button>
            <button onClick={() => setStep('bens')} className="px-6 py-2.5 text-sm font-semibold bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl hover:bg-[var(--arvo-fg)]/90 transition-colors">{bt.btnContinue}</button>
          </div>
        </>
      )}

      {/* ── Step 3: Bens e Direitos + Rendimentos + Download ─────────────── */}
      {step === 'bens' && (
        <>
          {/* Bens e Direitos */}
          <Section title={`${bt.sectionBens} ${year}`}>
            <p className="text-xs text-[var(--arvo-fg-soft)] py-2">{bt.bensDesc}</p>
            {brData.bens_direitos.length === 0 ? (
              <p className="text-sm text-[var(--arvo-fg-soft)] py-4 text-center">{bt.noBens}{year}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                    <th className="text-left py-2 font-medium">{bt.bensColPGDI}</th>
                    <th className="text-left py-2 font-medium">{bt.bensColAtivo}</th>
                    <th className="text-left py-2 font-medium hidden md:table-cell">{bt.bensColDescr}</th>
                    <th className="text-right py-2 font-medium">{bt.bensColAnterior}</th>
                    <th className="text-right py-2 font-medium">{bt.bensColAtual}</th>
                  </tr></thead>
                  <tbody>
                    {brData.bens_direitos.map((b, i) => (
                      <tr key={b.asset_id} className={`border-b border-[var(--arvo-border-soft)] ${i % 2 === 0 ? '' : 'bg-[var(--arvo-surface-2)]/50'}`}>
                        <td className="py-1.5">
                          <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded dark:text-blue-300 dark:bg-blue-950/40">{b.pgdi_grupo}/{b.pgdi_codigo}</span>
                        </td>
                        <td className="py-1.5"><span className="font-semibold">{b.code}</span> <span className="text-xs text-[var(--arvo-fg-soft)]">{b.name}</span></td>
                        <td className="py-1.5 text-xs text-[var(--arvo-fg-muted)] hidden md:table-cell">{b.discriminacao}</td>
                        <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">{b.situacao_anterior > 0 ? fmtBRL(b.situacao_anterior) : '-'}</td>
                        <td className="py-1.5 text-right font-semibold">{fmtBRL(b.situacao_atual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Rendimentos Isentos */}
          {brData.rendimentos_isentos.length > 0 && (
            <Section title={bt.sectionIsentos}>
              {brData.rendimentos_isentos.map(g => (
                <div key={g.codigo} className="py-3 border-b border-[var(--arvo-border-soft)] last:border-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded dark:text-green-300 dark:bg-green-950/40">{g.codigo}</span>
                      <span className="text-sm font-medium text-[var(--arvo-fg)]">{g.descricao}</span>
                    </div>
                    <span className="font-semibold text-green-700 dark:text-green-300">{fmtBRL(g.total)}</span>
                  </div>
                  <div className="ml-8 space-y-0.5">
                    {g.items.map(item => (
                      <div key={item.id} className="flex justify-between text-xs text-[var(--arvo-fg-muted)]">
                        <span>{item.date} · {item.asset_code}</span>
                        <span>{fmtBRL(item.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Tributação Exclusiva */}
          {brData.tributacao_exclusiva.length > 0 && (
            <Section title={bt.sectionExclusiva}>
              {brData.tributacao_exclusiva.map(g => (
                <div key={g.codigo} className="py-3 border-b border-[var(--arvo-border-soft)] last:border-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--arvo-gold-text)] bg-[var(--arvo-gold-tint)] px-1.5 py-0.5 rounded">{g.codigo}</span>
                      <span className="text-sm font-medium text-[var(--arvo-fg)]">{g.descricao}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-[var(--arvo-gold-text)]">{fmtBRL(g.total)}</span>
                      {g.ir_retido_total > 0 && <span className="text-xs text-[var(--arvo-fg-soft)] ml-2">IR retido: {fmtBRL(g.ir_retido_total)}</span>}
                    </div>
                  </div>
                  <div className="ml-8 space-y-0.5">
                    {g.items.map(item => (
                      <div key={item.id} className="flex justify-between text-xs text-[var(--arvo-fg-muted)]">
                        <span>{item.date} · {item.asset_code}</span>
                        <span>{fmtBRL(item.valor)}{item.ir_retido > 0 ? ` (IR: ${fmtBRL(item.ir_retido)})` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

          <div className="flex justify-between items-center gap-3 flex-wrap">
            <button onClick={() => setStep('rv')} className="px-4 py-2 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">{bt.btnBack}</button>
            <button
              onClick={() => void generateBrExcel(brData)}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors"
            >{bt.btnDownload}</button>
          </div>

          {/* Disclaimers */}
          <div className="text-xs text-[var(--arvo-fg-soft)] bg-red-50 border border-red-100 rounded-xl p-4 space-y-1 dark:bg-red-950/40 dark:border-red-900">
            <p className="font-semibold text-red-600 mb-2 dark:text-red-300">{bt.warningTitle}</p>
            <p>• {bt.warning1}</p>
            <p>• {bt.warning2}</p>
            <p>• {bt.warning3}</p>
            <p>• {bt.warning4}</p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaxEvent {
  id: string; date: string; asset_code: string; asset_name: string; asset_type: string
  event_type: 'DIVIDEND' | 'JCP' | 'FII_INCOME' | 'INTEREST'
  form_type: '2DC' | '2TR'; country: string; broker: string; currency: string
  gross_amount: number; tax_withheld_src: number
  gross_eur_daily: number; tax_withheld_eur_daily: number
  gross_eur_year_end: number; tax_withheld_eur_year_end: number
  fx_rate_daily: number; fx_rate_year_end: number
}

interface Section2047 {
  key: string; country: string; broker: string
  event_type: 'DIVIDEND' | 'JCP' | 'FII_INCOME' | 'INTEREST'
  form_type: '2DC' | '2TR'; convention_rate: number
  gross_eur: number; theoretical_credit_eur: number
  actual_withholding_eur: number; effective_credit_eur: number; event_count: number
}

interface CapitalGain {
  id: number; date: string; asset_code: string; asset_name: string
  country: string; broker: string; qty: number
  sale_value_brl: number; cost_basis_brl: number; gain_loss_brl: number
  gain_loss_eur_daily: number; gain_loss_eur_year_end: number
  fx_rate_daily: number; fx_rate_year_end: number
}

interface FranceTotals { dividends_eur: number; interests_eur: number; credit_eur: number }

interface Account3916 {
  broker: string; institution: string; address: string; country: string; status: string
  account_number?: string; system_filled?: boolean
}

interface FranceTaxData {
  year: number
  events: TaxEvent[]
  sections_daily: Section2047[]
  sections_year_end: Section2047[]
  totals_daily: FranceTotals
  totals_year_end: FranceTotals
  comparison: {
    daily:    FranceTotals & { total_eur: number }
    year_end: FranceTotals & { total_eur: number }
    recommended: 'daily' | 'year_end'
    advantage_eur: number
  }
  accounts: Account3916[]
  capital_gains: CapitalGain[]
  total_gain_eur_daily: number
  total_gain_eur_year_end: number
  fx_rates: { year_end_brl_eur: number; year_end_usd_eur: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEUR(n: number) {
  return `€${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function eventTypeLabel(t: string) {
  const labels: Record<string, string> = {
    DIVIDEND:   'Dividendes',
    JCP:        'Intérêts (JCP)',
    FII_INCOME: 'Revenus FII',
    INTEREST:   'Intérêts (RF)',
  }
  return labels[t] ?? t
}

function countryLabel(c: string) {
  const labels: Record<string, string> = { BR: 'Brésil', US: 'États-Unis', TW: 'Taïwan', IE: 'Irlande' }
  return labels[c] ?? c
}

function formBadge(f: '2DC' | '2TR') {
  return f === '2DC'
    ? <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono dark:bg-blue-900/40 dark:text-blue-300">2DC</span>
    : <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-mono dark:bg-green-900/40 dark:text-green-300">2TR</span>
}

// ─── Excel generation ─────────────────────────────────────────────────────────

type FS = { fill?: string; bold?: boolean; color?: string; size?: number; align?: 'left' | 'center' | 'right' }

function applyFS(cell: ExcelJS.Cell, s: FS) {
  if (s.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.fill } } as ExcelJS.Fill
  const font: Partial<ExcelJS.Font> = {}
  if (s.bold  !== undefined) font.bold  = s.bold
  if (s.color !== undefined) font.color = { argb: s.color }
  if (s.size  !== undefined) font.size  = s.size
  if (Object.keys(font).length) cell.font = font as ExcelJS.Font
  if (s.align) cell.alignment = { horizontal: s.align, vertical: 'middle', wrapText: false }
}

// Arvo brand palette · #0D0D0D black · #1B4FD8 Azul Arara · #E8A020 Ocre Tucano · #D63B2F Vermelho Guará · #1F8A5B Arvo Green
const S: Record<string, FS> = {
  // Column headers · neutral off-white, dark text
  colHead:  { fill: 'FFEDEDE9', bold: true,  color: 'FF0D0D0D', size: 9 },
  // Section labels · white bg, Arvo blue bold
  secHead:  { bold: true, color: 'FF1B4FD8', size: 10 },
  // Data rows
  dataA:    {},
  dataB:    { fill: 'FFF8F8F4' },
  // Form cases France
  case2DC:  { fill: 'FFEFF4FF',              color: 'FF1B4FD8' },
  caseValB: { fill: 'FFE4EDFF', bold: true,  color: 'FF1B4FD8' },
  case2TR:  { fill: 'FFEBF7F0',              color: 'FF1F8A5B' },
  caseValG: { fill: 'FFD9F0E4', bold: true,  color: 'FF1F8A5B' },
  case2AB:  { fill: 'FFFFF8E6',              color: 'FF8A6500' },
  caseValY: { fill: 'FFFEF0C0', bold: true,  color: 'FF7A5200' },
  // Capital gains / losses
  gain3VG:  { fill: 'FFEBF7F0', bold: true,  color: 'FF1F8A5B' },
  gainVal:  { fill: 'FFD0EDD9', bold: true,  color: 'FF1F8A5B' },
  loss3VM:  { fill: 'FFFEF0EF', bold: true,  color: 'FFD63B2F' },
  lossVal:  { fill: 'FFFEE0DC', bold: true,  color: 'FFD63B2F' },
  // Step list
  stepNum:  { fill: 'FFEFF4FF', bold: true,  color: 'FF1B4FD8' },
  stepTxt:  { fill: 'FFEFF4FF',              color: 'FF555555' },
  // Totals · Ocre Tucano gold accent
  totalRow: { fill: 'FFFDF4DC', bold: true,  color: 'FF0D0D0D' },
  totalVal: { fill: 'FFFFE896', bold: true,  color: 'FF6B4400' },
  // Warnings · soft Vermelho Guará
  warnBg:   { fill: 'FFFEF3F2',              color: 'FFD63B2F' },
  warnIcon: { fill: 'FFFEF3F2', bold: true,  color: 'FFD63B2F' },
  empty:    {},
}

function sRow(
  ws: ExcelJS.Worksheet,
  data: (string | number | null | undefined)[],
  rowStyle?: FS,
  perCell?: (FS | undefined)[],
) {
  const row = ws.addRow(data)
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    const s = perCell?.[col - 1] ?? rowStyle
    if (s) applyFS(cell, s)
  })
  return row
}

function blank(ws: ExcelJS.Worksheet) { ws.addRow([]) }

// Professional header: black band + gold rule
function coverHeader(ws: ExcelJS.Worksheet, title: string, meta: string, cols: number) {
  const filler = Array(cols - 1).fill('')
  // Row 1 · black band, "arvo" in Ocre gold + title in off-white (rich text)
  const r1 = ws.addRow(['', ...filler])
  r1.height = 34
  r1.getCell(1).value = {
    richText: [
      { text: 'arvo', font: { bold: true, color: { argb: 'FFE8A020' }, size: 14, name: 'Calibri' } },
      { text: '   ·   ' + title, font: { bold: true, color: { argb: 'FFFAFAF8' }, size: 12, name: 'Calibri' } },
    ],
  }
  r1.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D0D0D' } } as ExcelJS.Fill
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
  })
  // Row 2 · black band, metadata in muted gray
  const r2 = ws.addRow([meta, ...filler])
  r2.height = 18
  r2.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D0D0D' } } as ExcelJS.Fill
    cell.font = { color: { argb: 'FF888880' }, size: 9, name: 'Calibri' } as ExcelJS.Font
    cell.alignment = { horizontal: 'left', vertical: 'middle' }
  })
  // Row 3 · thin Ocre gold accent rule
  const r3 = ws.addRow(Array(cols).fill(''))
  r3.height = 4
  r3.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8A020' } } as ExcelJS.Fill
  })
  // Row 4 · white spacer
  const r4 = ws.addRow(Array(cols).fill(''))
  r4.height = 10
}

async function generateExcel(d: FranceTaxData, method: 'daily' | 'year_end') {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Arvo'; wb.created = new Date()
  const secs = method === 'daily' ? d.sections_daily : d.sections_year_end
  const tots = method === 'daily' ? d.totals_daily   : d.totals_year_end
  const fxLabel = method === 'daily' ? 'Taux du jour' : 'Taux au 31/12'
  const e2 = (n: number) => Math.round(n * 100) / 100
  const totalGainEur = method === 'daily' ? d.total_gain_eur_daily : d.total_gain_eur_year_end
  const dateStr = new Date().toLocaleDateString('fr-FR')

  // ── Sheet 1: Récapitulatif ───────────────────────────────────────────────
  const wsR = wb.addWorksheet('Récapitulatif')
  wsR.columns = [{ width: 8 }, { width: 60 }, { width: 20 }, { width: 44 }]
  coverHeader(wsR, `Rapport Fiscal France ${d.year}`, `Méthode de change : ${fxLabel}   ·   Généré le ${dateStr}`, 4)
  sRow(wsR, ['RÉCAPITULATIF · FORMULAIRE 2042', '', '', ''], S.secHead)
  blank(wsR)
  sRow(wsR, ['Case', 'Libellé', 'Montant (€)', 'Action'], S.colHead)
  sRow(wsR, ['2DC', 'Revenus de capitaux mobiliers · Dividendes', e2(tots.dividends_eur), '← reporter dans la case 2DC'], S.case2DC, [S.case2DC, S.case2DC, S.caseValB, S.case2DC])
  sRow(wsR, ['2TR', 'Produits de placement à revenu fixe · Intérêts', e2(tots.interests_eur), '← reporter dans la case 2TR'], S.case2TR, [S.case2TR, S.case2TR, S.caseValG, S.case2TR])
  sRow(wsR, ['2AB', "Crédit d'impôt conventionnel total", e2(tots.credit_eur), '← reporter dans la case 2AB'], S.case2AB, [S.case2AB, S.case2AB, S.caseValY, S.case2AB])
  if (d.capital_gains.length > 0) {
    const cs = totalGainEur >= 0 ? S.gain3VG : S.loss3VM
    const cv = totalGainEur >= 0 ? S.gainVal : S.lossVal
    sRow(wsR, [
      totalGainEur >= 0 ? '3VG' : '3VM',
      totalGainEur >= 0 ? 'Plus-values nettes sur cessions (3VG)' : 'Moins-values nettes sur cessions (3VM)',
      e2(Math.abs(totalGainEur)),
      `← reporter dans la case ${totalGainEur >= 0 ? '3VG' : '3VM'}`,
    ], cs, [cs, cs, cv, cs])
  }
  sRow(wsR, ['8UU', "Comptes à l'étranger déclarés via formulaire 3916", 'Cocher', '← cocher si vous avez des comptes étrangers'], S.dataB)
  blank(wsR)
  sRow(wsR, ['ÉTAPES À SUIVRE', '', '', ''], S.secHead)
  blank(wsR)
  sRow(wsR, ['1', "Compléter le formulaire 3916 pour chaque compte (onglet « 3916 »)", '', ''], undefined, [S.stepNum, S.stepTxt, S.stepTxt, S.stepTxt])
  sRow(wsR, ['2', "Compléter le formulaire 2047 (onglet « 2047 »)", '', ''], undefined, [S.stepNum, S.stepTxt, S.stepTxt, S.stepTxt])
  sRow(wsR, ['3', "Reporter les cases 2DC, 2TR, 2AB dans le formulaire 2042 (et 3VG/3VM si cessions)", '', ''], undefined, [S.stepNum, S.stepTxt, S.stepTxt, S.stepTxt])
  sRow(wsR, ['4', "Cocher la case 8UU si vous avez déclaré des comptes étrangers", '', ''], undefined, [S.stepNum, S.stepTxt, S.stepTxt, S.stepTxt])
  blank(wsR)
  sRow(wsR, ['AVERTISSEMENTS', '', '', ''], S.secHead)
  blank(wsR)
  sRow(wsR, ['!', 'Ce rapport est indicatif. Consultez un expert-comptable avant de soumettre votre déclaration.', '', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg, S.warnBg])
  sRow(wsR, ['!', 'Le traitement fiscal du JCP et des revenus FII sous la convention France-Brésil (1971) est ambigu.', '', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg, S.warnBg])
  sRow(wsR, ['!', 'Les retenues à la source sont calculées sur des taux théoriques, vérifiez vos relevés de compte.', '', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg, S.warnBg])
  sRow(wsR, ['!', `Taux BRL/EUR au 31/12 : ${d.fx_rates.year_end_brl_eur.toFixed(6)}   ·   USD/EUR au 31/12 : ${d.fx_rates.year_end_usd_eur.toFixed(6)}`, '', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg, S.warnBg])

  // ── Sheet 2: 3916 ────────────────────────────────────────────────────────
  const ws3916 = wb.addWorksheet('3916')
  ws3916.columns = [{ width: 4 }, { width: 42 }, { width: 55 }, { width: 14 }, { width: 26 }, { width: 14 }]
  coverHeader(ws3916, `Formulaire 3916 · Comptes et Contrats à l'Étranger`, `Exercice ${d.year}   ·   Généré le ${dateStr}`, 6)
  sRow(ws3916, ['#', 'Établissement', 'Adresse', 'Pays', 'Numéro de compte', 'État au 31/12'], S.colHead)
  d.accounts.forEach((a, i) => sRow(ws3916,
    [i + 1, a.institution, a.address, a.country, a.account_number || '(à vérifier)', a.status],
    i % 2 === 0 ? S.empty : S.dataB))
  blank(ws3916)
  sRow(ws3916, ['!', "N26 avec IBAN FR ne doit PAS être déclaré ici (établissement français).", '', '', '', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg, S.warnBg, S.warnBg, S.warnBg])

  // ── Sheet 3: Détail par courtier ─────────────────────────────────────────
  const brokers = [...new Set(d.events.map(e => e.broker))]
  for (const broker of brokers) {
    const evs   = d.events.filter(e => e.broker === broker)
    const gross = (e: TaxEvent) => method === 'daily' ? e.gross_eur_daily        : e.gross_eur_year_end
    const wth   = (e: TaxEvent) => method === 'daily' ? e.tax_withheld_eur_daily : e.tax_withheld_eur_year_end
    const fxR   = (e: TaxEvent) => method === 'daily' ? e.fx_rate_daily          : e.fx_rate_year_end
    const safe  = broker.slice(0, 28).replace(/[[\]*/\\?:]/g, '-')
    const wsBr  = wb.addWorksheet(safe)
    wsBr.columns = [{ width: 12 }, { width: 36 }, { width: 14 }, { width: 18 }, { width: 6 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 16 }]
    coverHeader(wsBr, `${broker} · Revenus ${d.year}`, `Méthode de change : ${fxLabel}   ·   Généré le ${dateStr}`, 9)
    sRow(wsBr, ['Date', 'Actif', 'Pays', 'Nature', 'Case', 'Montant orig.', 'Taux EUR', 'Montant EUR', 'Retenue (théor.)'], S.colHead)
    evs.forEach((e, i) => sRow(wsBr, [
      e.date, `${e.asset_code} · ${e.asset_name}`, countryLabel(e.country),
      eventTypeLabel(e.event_type), e.form_type,
      e2(e.gross_amount), e2(fxR(e)), e2(gross(e)), e2(wth(e)),
    ], i % 2 === 0 ? S.empty : S.dataB))
    blank(wsBr)
    sRow(wsBr, ['', '', '', '', 'TOTAL', '', '', e2(evs.reduce((s, e) => s + gross(e), 0)), e2(evs.reduce((s, e) => s + wth(e), 0))],
      S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalVal, S.totalVal])
  }

  // ── Sheet 4: 2047 ────────────────────────────────────────────────────────
  const ws2047 = wb.addWorksheet('2047')
  ws2047.columns = [{ width: 16 }, { width: 30 }, { width: 22 }, { width: 18 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }]
  coverHeader(ws2047, `Formulaire 2047 · Revenus Encaissés à l'Étranger`, `Exercice ${d.year}   ·   Méthode : ${fxLabel}   ·   Généré le ${dateStr}`, 8)
  sRow(ws2047, ['Pays (201)', 'Nature (202)', 'Courtier', 'Revenu brut € (203)', 'Taux conv. (204)', 'Crédit théor. (205)', 'Retenue réelle (206)', 'Crédit effectif (207)'], S.colHead)
  secs.forEach((s, i) => sRow(ws2047, [
    countryLabel(s.country), `${eventTypeLabel(s.event_type)} · ${s.form_type}`, s.broker,
    e2(s.gross_eur), `${(s.convention_rate * 100).toFixed(0)}%`,
    e2(s.theoretical_credit_eur), e2(s.actual_withholding_eur), e2(s.effective_credit_eur),
  ], i % 2 === 0 ? S.empty : S.dataB))
  blank(ws2047)
  sRow(ws2047, ['TOTAL DIVIDENDES (2DC)', '', '', e2(tots.dividends_eur), '', '', '', ''], S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalVal, S.totalRow, S.totalRow, S.totalRow, S.totalRow])
  sRow(ws2047, ['TOTAL INTÉRÊTS (2TR)',   '', '', e2(tots.interests_eur), '', '', '', ''], S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalVal, S.totalRow, S.totalRow, S.totalRow, S.totalRow])
  sRow(ws2047, ["TOTAL CRÉDIT D'IMPÔT (2AB)", '', '', '', '', '', '', e2(tots.credit_eur)], S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalVal])

  // ── Sheet 5: 2042 ────────────────────────────────────────────────────────
  const ws2042 = wb.addWorksheet('2042')
  ws2042.columns = [{ width: 8 }, { width: 64 }, { width: 24 }]
  const case3VG = totalGainEur >= 0
  coverHeader(ws2042, `Formulaire 2042 · Cases à Reporter`, `Exercice ${d.year}   ·   Généré le ${dateStr}`, 3)
  sRow(ws2042, ['Case', 'Libellé', 'Valeur à reporter (€)'], S.colHead)
  sRow(ws2042, ['2DC', 'Revenus de valeurs mobilières étrangères (dividendes + FII)', e2(tots.dividends_eur)], S.case2DC, [S.case2DC, S.case2DC, S.caseValB])
  sRow(ws2042, ['2TR', 'Produits de placement à revenu fixe (intérêts + JCP + renda fixa)', e2(tots.interests_eur)], S.case2TR, [S.case2TR, S.case2TR, S.caseValG])
  sRow(ws2042, ['2AB', "Crédit d'impôt imputé sur l'IR (total des cases 207)", e2(tots.credit_eur)], S.case2AB, [S.case2AB, S.case2AB, S.caseValY])
  if (d.capital_gains.length > 0) {
    const cs = case3VG ? S.gain3VG : S.loss3VM
    const cv = case3VG ? S.gainVal : S.lossVal
    sRow(ws2042, [
      case3VG ? '3VG' : '3VM',
      case3VG ? 'Plus-values nettes sur cessions de valeurs mobilières' : 'Moins-values nettes sur cessions de valeurs mobilières',
      e2(Math.abs(totalGainEur)),
    ], cs, [cs, cs, cv])
  }
  sRow(ws2042, ['8UU', "Comptes à l'étranger déclarés (formulaire 3916)", d.accounts.length > 0 ? 'OUI · à cocher' : 'NON'], S.dataB)
  blank(ws2042)
  sRow(ws2042, ['TOTAL revenus déclarés (2DC + 2TR)', '', e2(tots.dividends_eur + tots.interests_eur)], S.totalRow, [S.totalRow, S.totalRow, S.totalVal])
  if (d.capital_gains.length > 0) {
    sRow(ws2042, [`TOTAL ${case3VG ? 'plus-values (3VG)' : 'moins-values (3VM)'}`, '', e2(Math.abs(totalGainEur))], S.totalRow, [S.totalRow, S.totalRow, case3VG ? S.gainVal : S.lossVal])
  }

  // ── Sheet 6: Plus-values ─────────────────────────────────────────────────
  if (d.capital_gains.length > 0) {
    const wsG = wb.addWorksheet('Plus-values')
    wsG.columns = [{ width: 12 }, { width: 34 }, { width: 14 }, { width: 18 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 14 }]
    coverHeader(wsG, `Plus-values · Cessions de Valeurs Mobilières`, `Exercice ${d.year}   ·   Méthode : ${fxLabel}   ·   Généré le ${dateStr}`, 10)
    sRow(wsG, ['Date', 'Actif', 'Pays', 'Courtier', 'Qtd', 'Prix vente (R$)', 'Coût moy. (R$)', 'G/P brut (R$)', 'Taux EUR', 'G/P net (€)'], S.colHead)
    d.capital_gains.forEach((g, i) => {
      const gainEur = method === 'daily' ? g.gain_loss_eur_daily : g.gain_loss_eur_year_end
      const fxR2    = method === 'daily' ? g.fx_rate_daily : g.fx_rate_year_end
      sRow(wsG, [g.date, `${g.asset_code} · ${g.asset_name}`, countryLabel(g.country), g.broker, g.qty, e2(g.sale_value_brl), e2(g.cost_basis_brl), e2(g.gain_loss_brl), fxR2, e2(gainEur)],
        i % 2 === 0 ? S.empty : S.dataB)
    })
    blank(wsG)
    sRow(wsG, ['', '', '', '', '', '', '', e2(d.capital_gains.reduce((s, g) => s + g.gain_loss_brl, 0)), '', e2(totalGainEur)],
      S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalVal, S.totalRow, totalGainEur >= 0 ? S.gainVal : S.lossVal])
  }

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `ARVO_FiscalFrance_${d.year}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

async function generateBrExcel(d: BrazilTaxData) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Arvo'; wb.created = new Date()
  const r2 = (n: number) => Math.round(n * 100) / 100
  const dateStr = new Date().toLocaleDateString('pt-BR')

  // ── Sheet 1: Resumo ──────────────────────────────────────────────────────
  const wsR = wb.addWorksheet('Resumo')
  wsR.columns = [{ width: 44 }, { width: 20 }, { width: 42 }]
  coverHeader(wsR, `DIRPF ${d.year} · Declaração de Imposto de Renda`, `Gerado em ${dateStr}`, 3)
  sRow(wsR, ['RESUMO GERAL', '', ''], S.secHead)
  blank(wsR)
  sRow(wsR, ['Ficha / Item', 'Valor (R$)', 'Observação'], S.colHead)
  sRow(wsR, ['Rendimentos Isentos · total', r2(d.total_isentos), 'Ficha: Rendimentos Isentos e Não Tributáveis'], S.empty)
  sRow(wsR, ['Tributação Exclusiva · total', r2(d.total_exclusiva), 'Ficha: Tributação Exclusiva/Definitiva'], S.dataB)
  sRow(wsR, ['IR Retido na Fonte · total', r2(d.ir_retido_total), 'Ficha: Imposto Pago/Retido · compensação'], S.empty)
  sRow(wsR, ['DARF Renda Variável · total', r2(d.total_darf_rv), 'Código DARF 6015 · já recolhido?'], d.total_darf_rv > 0 ? S.warnBg : S.dataB)
  sRow(wsR, ['Carnê-Leão · total', r2(d.total_carne_leao), 'Código DARF 0190 · já recolhido?'], d.total_carne_leao > 0 ? S.warnBg : S.empty)
  sRow(wsR, ['Carryover para próximo ano', r2(d.carryover_final), d.carryover_final < 0 ? 'Perdas a compensar em ganhos futuros' : ''], d.carryover_final < 0 ? S.case2TR : S.dataB)
  blank(wsR)
  sRow(wsR, ['BENS E DIREITOS', '', ''], S.secHead)
  blank(wsR)
  sRow(wsR, [`${d.bens_direitos.length} ativo(s) em carteira em 31/12/${d.year}`, '', ''], S.stepTxt)
  blank(wsR)
  sRow(wsR, ['AVISOS IMPORTANTES', '', ''], S.secHead)
  blank(wsR)
  sRow(wsR, ['!', 'Este relatório é indicativo. Consulte um contador antes de enviar a declaração.', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg])
  sRow(wsR, ['!', 'Isenção de R$ 20.000/mês aplica-se apenas a ações em swing trade (Day trade excluído).', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg])
  sRow(wsR, ['!', 'Dividendos de FIIs são isentos para PF, verifique os requisitos legais vigentes.', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg])
  sRow(wsR, ['!', 'JCP está sujeito a 15% retido na fonte, confira os informes de cada instituição.', ''], undefined, [S.warnIcon, S.warnBg, S.warnBg])

  // ── Sheet 2: Bens e Direitos ─────────────────────────────────────────────
  const wsBens = wb.addWorksheet('Bens e Direitos')
  wsBens.columns = [{ width: 12 }, { width: 12 }, { width: 52 }, { width: 28 }, { width: 22 }, { width: 22 }]
  coverHeader(wsBens, `Bens e Direitos · PGDI`, `Exercício ${d.year}   ·   Gerado em ${dateStr}`, 6)
  sRow(wsBens, ['PGDI Grupo', 'PGDI Código', 'Discriminação', 'Ativo', 'Situação Anterior (R$)', 'Situação Atual (R$)'], S.colHead)
  d.bens_direitos.forEach((b, i) => sRow(wsBens,
    [b.pgdi_grupo, b.pgdi_codigo, b.discriminacao, `${b.code} · ${b.name}`, r2(b.situacao_anterior), r2(b.situacao_atual)],
    i % 2 === 0 ? S.empty : S.dataB))
  blank(wsBens)
  sRow(wsBens, ['', '', 'TOTAL', '', r2(d.bens_direitos.reduce((s, b) => s + b.situacao_anterior, 0)), r2(d.bens_direitos.reduce((s, b) => s + b.situacao_atual, 0))],
    S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalVal, S.totalVal])

  // ── Sheet 3: Rendimentos ─────────────────────────────────────────────────
  const wsRend = wb.addWorksheet('Rendimentos')
  wsRend.columns = [{ width: 8 }, { width: 50 }, { width: 12 }, { width: 16 }, { width: 16 }]
  coverHeader(wsRend, `Rendimentos · DIRPF ${d.year}`, `Exercício ${d.year}   ·   Gerado em ${dateStr}`, 5)
  sRow(wsRend, ['RENDIMENTOS ISENTOS E NÃO TRIBUTÁVEIS', '', '', '', ''], S.secHead)
  blank(wsRend)
  sRow(wsRend, ['Código', 'Descrição', 'Data', 'Ativo', 'Valor (R$)'], S.colHead)
  d.rendimentos_isentos.forEach(g => {
    g.items.forEach((item, i) => sRow(wsRend,
      [i === 0 ? g.codigo : '', i === 0 ? g.descricao : '', item.date, item.asset_code, r2(item.valor)],
      i % 2 === 0 ? S.empty : S.dataB))
    sRow(wsRend, ['', `Total código ${g.codigo}`, '', '', r2(g.total)], S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalVal])
    blank(wsRend)
  })
  blank(wsRend)
  sRow(wsRend, ['TRIBUTAÇÃO EXCLUSIVA/DEFINITIVA', '', '', '', ''], S.secHead)
  blank(wsRend)
  sRow(wsRend, ['Código', 'Descrição', 'Data', 'Ativo', 'Valor (R$)'], S.colHead)
  d.tributacao_exclusiva.forEach(g => {
    g.items.forEach((item, i) => sRow(wsRend,
      [i === 0 ? g.codigo : '', i === 0 ? g.descricao : '', item.date, item.asset_code, r2(item.valor)],
      i % 2 === 0 ? S.empty : S.dataB))
    sRow(wsRend, ['', `Total código ${g.codigo}`, '', '', r2(g.total)], S.totalRow, [S.totalRow, S.totalRow, S.totalRow, S.totalRow, S.totalVal])
    blank(wsRend)
  })

  // ── Sheet 4: Renda Variável ──────────────────────────────────────────────
  const wsRV = wb.addWorksheet('Renda Variável')
  wsRV.columns = [{ width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }]
  coverHeader(wsRV, `Renda Variável · Operações em Bolsa`, `Exercício ${d.year}   ·   DARF código 6015 · vencimento último dia útil do mês seguinte   ·   Gerado em ${dateStr}`, 8)
  sRow(wsRV, ['Mês', 'Total Vendas', 'Ganho Bruto', 'Perda Bruta', 'Carryover Ant.', 'Ganho Líquido', 'Situação', 'DARF a Pagar'], S.colHead)
  d.renda_variavel.forEach((m, i) => sRow(wsRV,
    [m.mes, r2(m.total_vendas), r2(m.ganho_bruto), r2(m.perda_bruta), r2(m.carryover_anterior), r2(m.ganho_liquido), m.isento ? 'Isento' : 'Tributado', r2(m.darf_a_pagar)],
    i % 2 === 0 ? S.empty : S.dataB))
  blank(wsRV)
  sRow(wsRV, ['TOTAIS', '', r2(d.total_ganho_rv), r2(d.total_perda_rv), '', '', '', r2(d.total_darf_rv)],
    S.totalRow, [S.totalRow, S.totalRow, S.gainVal, S.lossVal, S.totalRow, S.totalRow, S.totalRow, d.total_darf_rv > 0 ? S.warnIcon : S.totalVal])
  if (d.carryover_final !== 0) {
    blank(wsRV)
    sRow(wsRV, [`Perdas a compensar em ${d.year + 1}`, r2(d.carryover_final), '', '', '', '', '', ''], S.case2TR)
  }
  if (d.renda_variavel.some(m => m.operacoes.length > 0)) {
    blank(wsRV)
    sRow(wsRV, ['DETALHE DAS OPERAÇÕES', '', '', '', '', '', '', ''], S.secHead)
    blank(wsRV)
    sRow(wsRV, ['Mês', 'Data', 'Ativo', 'Qtd', 'Venda (R$)', 'Custo (R$)', 'G/P (R$)', ''], S.colHead)
    d.renda_variavel.forEach(m => m.operacoes.forEach((op, i) => sRow(wsRV,
      [m.mes, op.date, op.code, op.qty, r2(op.sale_value), r2(op.cost_basis), r2(op.gain), ''],
      i % 2 === 0 ? S.empty : S.dataB)))
  }

  // ── Sheet 5: Carnê-Leão ──────────────────────────────────────────────────
  if (d.carne_leao.length > 0) {
    const wsCL = wb.addWorksheet('Carnê-Leão')
    wsCL.columns = [{ width: 10 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 18 }]
    coverHeader(wsCL, `Carnê-Leão · Dividendos do Exterior`, `Exercício ${d.year}   ·   DARF código 0190 · vencimento último dia útil do mês seguinte   ·   Gerado em ${dateStr}`, 5)
    sRow(wsCL, ['Mês', 'Dividendos (R$)', 'Alíquota', 'Dedução (R$)', 'IR Devido (R$)'], S.colHead)
    d.carne_leao.forEach((m, i) => sRow(wsCL,
      [m.mes, r2(m.dividendos_brl), `${(m.aliquota * 100).toFixed(1)}%`, r2(m.deducao), r2(m.ir_devido)],
      i % 2 === 0 ? S.empty : S.dataB))
    blank(wsCL)
    sRow(wsCL, ['TOTAL', r2(d.carne_leao.reduce((s, m) => s + m.dividendos_brl, 0)), '', '', r2(d.total_carne_leao)],
      S.totalRow, [S.totalRow, S.totalVal, S.totalRow, S.totalRow, S.warnIcon])
    blank(wsCL)
    sRow(wsCL, ['DETALHE POR EVENTO', '', '', '', ''], S.secHead)
    blank(wsCL)
    sRow(wsCL, ['Mês', 'Data', 'Ativo', 'País', 'Valor (R$)'], S.colHead)
    d.carne_leao.forEach(m => m.items.forEach((it, i) => sRow(wsCL,
      [m.mes, it.date, it.asset_code, it.country, r2(it.amount_brl)],
      i % 2 === 0 ? S.empty : S.dataB)))
  }

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `ARVO_DIRPF_${d.year}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Main component ───────────────────────────────────────────────────────────

function FrReport({ year }: { year: number }) {
  const { t } = useI18n()
  const ft = t.frTax
  const [taxData, setTaxData] = useState<FranceTaxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [fxMethod, setFxMethod] = useState<'daily' | 'year_end'>('daily')
  const [step, setStep] = useState<'overview' | 'fx_choice' | 'preview'>('overview')

  // Saída fiscal confirmation
  const [saidaFiscal, setSaidaFiscal] = useState(false)
  const [showSaidaConfirm, setShowSaidaConfirm] = useState(false)
  const [saidaConfirmed, setSaidaConfirmed] = useState(false)

  // Quick-add income state
  const [userAssets, setUserAssets] = useState<Array<{id: number; code: string; name: string; asset_type: string}>>([])
  const [showAddIncome, setShowAddIncome] = useState(false)
  const [incAssetId, setIncAssetId]   = useState('')
  const [incDate, setIncDate]         = useState(`${year}-12-31`)
  const [incGross, setIncGross]       = useState('')
  const [incIR, setIncIR]             = useState('')
  const [incDesc, setIncDesc]         = useState('cdb')
  const [savingInc, setSavingInc]     = useState(false)
  const [incErr, setIncErr]           = useState<string | null>(null)

  const fetchReport = () => {
    setLoading(true); setError(null); setTaxData(null)
    syncDividendsThen(() => apiFetch<FranceTaxData>(`/reports/france/${year}`))
      .then(d => { setTaxData(d); setLoading(false) })
      .catch(e => { setError(e instanceof Error ? e.message : 'Erreur de chargement'); setLoading(false) })
  }

  useEffect(() => { setStep('overview'); fetchReport() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiFetch<{ tax_country?: string; saida_fiscal_brasil?: boolean }>('/profile')
      .then(p => {
        const tc = p.tax_country || (p.saida_fiscal_brasil ? 'FR' : 'BR')
        setSaidaFiscal(tc !== 'BR')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch<Array<{id: number; code: string; name: string; asset_type: string}>>('/assets')
      .then(a => setUserAssets(a))
      .catch(() => {})
  }, [])

  async function handleAddIncome() {
    const gross = parseFloat(incGross.replace(',', '.'))
    const ir    = parseFloat(incIR.replace(',', '.')) || 0
    if (!incAssetId || !incDate || !gross || gross <= 0) {
      setIncErr('Actif, date et montant brut sont obligatoires'); return
    }
    setSavingInc(true); setIncErr(null)
    try {
      await apiFetch('/contributions', {
        method: 'POST',
        body: JSON.stringify({
          asset_id: Number(incAssetId), date: incDate, type: 'income',
          quantity: 0, value_brl: gross, currency: 'BRL',
          tax_withheld: ir > 0 ? ir : undefined,
          description: incDesc || 'renda_fixa',
        }),
      })
      setShowAddIncome(false)
      setIncAssetId(''); setIncGross(''); setIncIR(''); setIncDesc('cdb')
      fetchReport()
    } catch (e) {
      setIncErr(e instanceof Error ? e.message : 'Erreur lors de l\'ajout')
    } finally { setSavingInc(false) }
  }

  if (loading) return <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-10 text-center text-[var(--arvo-fg-soft)] text-sm">{ft.loading}</div>
  if (error)   return <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-6 text-red-600 text-sm dark:text-red-300">{error}</div>
  if (!taxData) return null

  const noEvents = taxData.events.length === 0

  const sections = fxMethod === 'daily' ? taxData.sections_daily : taxData.sections_year_end
  const totals   = fxMethod === 'daily' ? taxData.totals_daily   : taxData.totals_year_end
  const comp     = taxData.comparison

  return (
    <div className="space-y-5">
      {/* Step nav */}
      <div className="flex items-center overflow-x-auto scrollbar-none">
        {(['overview', 'fx_choice', 'preview'] as const).map((s, i) => {
          const labels = [ft.step1, ft.step2, ft.step3]
          const isActive = step === s
          return (
            <div key={s} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
              <button onClick={() => setStep(s)} className="flex items-center gap-2.5 shrink-0">
                <span className="text-2xl leading-none tabular-nums transition-colors" style={{ fontFamily: 'var(--arvo-font-display)', color: isActive ? 'var(--arvo-fg)' : 'var(--arvo-fg-faint)' }}>0{i + 1}</span>
                <span className={`text-xs uppercase tracking-wide transition-colors ${isActive ? 'text-[var(--arvo-fg)] font-semibold' : 'text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]'}`}>{labels[i].replace(/^\d+\.\s*/, '')}</span>
              </button>
              {i < 2 && <div className="flex-1 h-px mx-3" style={{ background: 'var(--arvo-border)' }} />}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Overview ─────────────────────────────────────────────── */}
      {step === 'overview' && (
        <>
          {/* KPI cards · always shown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label={ft.kpiRevenues} value={noEvents ? '-' : fmtEUR(comp.daily.total_eur)} valueClass="text-blue-700 dark:text-blue-300" />
            <Card label={ft.kpiDividends} value={noEvents ? '-' : fmtEUR(comp.daily.dividends_eur)} valueClass="text-blue-600 dark:text-blue-300" />
            <Card label={ft.kpiInterests} value={noEvents ? '-' : fmtEUR(comp.daily.interests_eur)} valueClass="text-green-700 dark:text-green-300" />
            <Card label={ft.kpiCapGains} value={fmtEUR(taxData.total_gain_eur_daily)} valueClass={taxData.total_gain_eur_daily >= 0 ? 'text-[var(--arvo-gold-text)]' : 'text-red-600 dark:text-red-300'} />
          </div>

          {/* ── Compléter votre déclaration ───────────────────────────────────── */}
          <Section title={ft.sectionComplete}>
            <div className="py-3 space-y-4">

              {/* Detected sources */}
              <div>
                <p className="text-xs font-semibold text-[var(--arvo-fg-muted)] mb-2 uppercase tracking-wide">{ft.autoSources}</p>
                {taxData.sections_daily.length > 0 ? (
                  <div className="space-y-1.5">
                    {[...new Map(taxData.events.map(e => [e.broker, e])).values()].map(e => (
                      <div key={e.broker} className="flex items-center gap-2 text-xs">
                        <span className="text-green-500 font-bold dark:text-green-400">✓</span>
                        <span className="text-[var(--arvo-fg)] font-medium">{e.broker}</span>
                        <span className="text-[var(--arvo-fg-soft)]">· {taxData.events.filter(ev => ev.broker === e.broker).length} {ft.eventsSync}</span>
                      </div>
                    ))}
                    {taxData.capital_gains.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-500 font-bold dark:text-green-400">✓</span>
                        <span className="text-[var(--arvo-fg)] font-medium">Plus-values (ventes)</span>
                        <span className="text-[var(--arvo-fg-soft)]">· {taxData.capital_gains.length} {ft.salesDetected}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--arvo-fg-soft)]">{ft.noAutoSources}</p>
                )}
              </div>

              {/* Manual sources */}
              <div className="border-t border-[var(--arvo-border)] pt-4">
                <p className="text-xs font-semibold text-[var(--arvo-fg-muted)] mb-3 uppercase tracking-wide">{ft.manualSources}</p>

                {/* JCP */}
                <InfoBox variant="info" title={ft.jcpTitle} className="mb-4">
                  <p>{ft.jcpDesc}</p>
                  <p className="text-[var(--arvo-fg-soft)]">{ft.jcpNote}</p>
                </InfoBox>

                {/* Renda fixa */}
                <InfoBox variant="action" title={ft.rfTitle} className="space-y-3">
                  <p>{ft.rfDesc}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-[var(--arvo-surface)] rounded-lg p-2 border border-[var(--arvo-border)]">
                    <div>
                      <p className="font-medium text-[var(--arvo-fg)]">{ft.rfColInforme}</p>
                      <p className="text-[var(--arvo-fg-muted)]">{ft.rfField1}</p>
                      <p className="text-[var(--arvo-fg-muted)]">{ft.rfField2}</p>
                    </div>
                    <div>
                      <p className="font-medium text-[var(--arvo-fg)]">{ft.rfColArvo}</p>
                      <p className="font-semibold text-[var(--arvo-fg)]">{ft.rfArrow1}</p>
                      <p className="font-semibold text-[var(--arvo-fg)]">{ft.rfArrow2}</p>
                    </div>
                  </div>

                  {/* Quick-add toggle */}
                  <button
                    onClick={() => setShowAddIncome(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-[var(--arvo-gold-tint)] hover:bg-[var(--arvo-gold)]/20 text-[var(--arvo-gold-text)] rounded-lg transition-colors"
                  >
                    <span>{ft.addIncomBtn}</span>
                    <span>{showAddIncome ? '▲' : '▼'}</span>
                  </button>

                  {showAddIncome && (
                    <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-[var(--arvo-fg)]">{ft.newIncomeTitle}</p>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{ft.incAsset}</label>
                          <select
                            value={incAssetId}
                            onChange={e => setIncAssetId(e.target.value)}
                            className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-gold)]/40 bg-[var(--arvo-surface)]"
                          >
                            <option value="">{ft.selectAsset}</option>
                            {userAssets.filter(a => a.asset_type === 'fixed_income').length > 0 && (
                              <optgroup label={ft.fixedIncomeGroup}>
                                {userAssets.filter(a => a.asset_type === 'fixed_income').map(a => (
                                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {userAssets.filter(a => a.asset_type !== 'fixed_income').length > 0 && (
                              <optgroup label={ft.othersGroup}>
                                {userAssets.filter(a => a.asset_type !== 'fixed_income').map(a => (
                                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          {userAssets.filter(a => a.asset_type === 'fixed_income').length === 0 && (
                            <p className="text-xs text-[var(--arvo-gold-text)] mt-1">{ft.noFixedIncome}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{ft.incDate}</label>
                          <DatePicker value={incDate} onChange={setIncDate} style={{ borderRadius: 8, padding: '8px 12px', fontSize: 14 }} />
                        </div>

                        <div>
                          <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{ft.incDesc}</label>
                          <select value={incDesc} onChange={e => setIncDesc(e.target.value)}
                            className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-gold)]/40 bg-[var(--arvo-surface)]">
                            <option value="cdb">CDB</option>
                            <option value="lci">LCI</option>
                            <option value="lca">LCA</option>
                            <option value="ntn-b">NTN-B</option>
                            <option value="poupanca">Poupança</option>
                            <option value="rf">Renda fixa</option>
                            <option value="juros">Juros / Outros</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">
                            {ft.incGross} <span className="text-[var(--arvo-gold-text)] font-semibold">{ft.incGrossHint}</span>
                          </label>
                          <input type="text" inputMode="decimal" value={incGross} onChange={e => setIncGross(e.target.value)}
                            placeholder="ex: 1234,56"
                            className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-gold)]/40" />
                        </div>

                        <div>
                          <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">
                            {ft.incIR} <span className="text-[var(--arvo-gold-text)] font-semibold">{ft.incIRHint}</span>
                          </label>
                          <input type="text" inputMode="decimal" value={incIR} onChange={e => setIncIR(e.target.value)}
                            placeholder="ex: 185,18"
                            className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-gold)]/40" />
                          <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{ft.incIRNote}</p>
                        </div>
                      </div>

                      {incErr && <p className="text-xs text-red-600 dark:text-red-300">{incErr}</p>}

                      <div className="flex gap-2">
                        <button onClick={handleAddIncome} disabled={savingInc}
                          className="flex-1 py-2 text-sm font-semibold bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-lg hover:bg-[var(--arvo-fg)]/90 disabled:opacity-50 transition-colors">
                          {savingInc ? ft.incSaving : ft.incSave}
                        </button>
                        <button onClick={() => { setShowAddIncome(false); setIncErr(null) }}
                          className="px-4 py-2 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">
                          {ft.incCancel}
                        </button>
                      </div>
                    </div>
                  )}
                </InfoBox>

                {/* French broker note */}
                <InfoBox variant="info" title={ft.frenchBrokerTitle} className="mt-3">
                  <p>{ft.frenchBrokerDesc}</p>
                </InfoBox>
              </div>
            </div>
          </Section>

          {/* Accounts 3916 */}
          <Section title={ft.section3916}>
            {taxData.accounts.length === 0 ? (
              <p className="text-xs text-[var(--arvo-fg-soft)] py-3 text-center">{ft.no3916}</p>
            ) : (
              <div className="space-y-0">
                {taxData.accounts.some(a => a.system_filled) && (
                  <InfoBox variant="action" title={ft.warn3916SystemFilled} className="mb-3">
                    <p>{ft.warn3916Institutions}</p>
                  </InfoBox>
                )}
                <div className="divide-y divide-[var(--arvo-border-soft)]">
                  {taxData.accounts.map(a => (
                    <div key={a.broker} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-[var(--arvo-fg)]">{a.institution}</p>
                          {a.system_filled && (
                            <span className="text-[10px] bg-[var(--arvo-blue-tint)] text-[var(--arvo-blue)] rounded px-1.5 py-0.5 font-medium shrink-0">verificar</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--arvo-fg-soft)]">{a.address}</p>
                        {a.account_number && (
                          <p className="text-xs text-[var(--arvo-fg-muted)] mt-0.5">Conta: {a.account_number}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs bg-[var(--arvo-track-bg)] rounded px-2 py-0.5 text-[var(--arvo-fg-muted)]">{a.country}</span>
                        <p className="text-xs text-green-600 mt-0.5 dark:text-green-300">{a.status}</p>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-[var(--arvo-fg-soft)] py-2">{ft.reminder3916}</p>
                </div>
              </div>
            )}
          </Section>

          {/* Income breakdown by type */}
          {!noEvents && (
            <Section title={ft.incomeByType}>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                  <th className="text-left py-2 font-medium">{ft.colCountry}</th>
                  <th className="text-left py-2 font-medium">{ft.colBroker}</th>
                  <th className="text-left py-2 font-medium">{ft.colType}</th>
                  <th className="text-center py-2 font-medium">{ft.colCase}</th>
                  <th className="text-right py-2 font-medium">{ft.colGrossEUR}</th>
                  <th className="text-right py-2 font-medium">{ft.colEvents}</th>
                </tr></thead>
                <tbody>
                  {taxData.sections_daily.map(s => (
                    <tr key={s.key} className="border-b border-[var(--arvo-border-soft)] hover:bg-[var(--arvo-surface-2)]">
                      <td className="py-2 text-[var(--arvo-fg)]">{countryLabel(s.country)}</td>
                      <td className="py-2 text-[var(--arvo-fg-muted)] text-xs">{s.broker}</td>
                      <td className="py-2 text-[var(--arvo-fg)]">{eventTypeLabel(s.event_type)}</td>
                      <td className="py-2 text-center">{formBadge(s.form_type)}</td>
                      <td className="py-2 text-right font-semibold text-[var(--arvo-fg)]">{fmtEUR(s.gross_eur)}</td>
                      <td className="py-2 text-right text-[var(--arvo-fg-soft)] text-xs">{s.event_count}</td>
                    </tr>
                  ))}
                  {taxData.capital_gains.length > 0 && (
                    <tr className="border-b border-[var(--arvo-border-soft)] hover:bg-[var(--arvo-surface-2)]">
                      <td className="py-2 text-[var(--arvo-fg)]">-</td>
                      <td className="py-2 text-[var(--arvo-fg-muted)] text-xs">-</td>
                      <td className="py-2 text-[var(--arvo-fg)]">{ft.descCapGain}</td>
                      <td className="py-2 text-center"><span className="text-xs bg-[var(--arvo-gold-tint)] text-[var(--arvo-gold-text)] rounded px-1.5 py-0.5 font-mono">3VG</span></td>
                      <td className={`py-2 text-right font-semibold ${taxData.total_gain_eur_daily >= 0 ? 'text-[var(--arvo-gold-text)]' : 'text-red-600 dark:text-red-300'}`}>{fmtEUR(taxData.total_gain_eur_daily)}</td>
                      <td className="py-2 text-right text-[var(--arvo-fg-soft)] text-xs">{taxData.capital_gains.length}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] font-semibold text-sm">
                    <td colSpan={4} className="py-2 text-right text-xs text-[var(--arvo-fg-muted)]">{ft.totals}</td>
                    <td className="py-2 text-right">{fmtEUR(comp.daily.total_eur)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </Section>
          )}

          {saidaFiscal && (
            <InfoBox variant="action" title={ft.saidaFiscalBannerTitle}>
              <p>{ft.saidaFiscalBannerDesc}</p>
            </InfoBox>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => {
                if (saidaFiscal && !saidaConfirmed) {
                  setShowSaidaConfirm(true)
                } else {
                  setStep('fx_choice')
                }
              }}
              className="px-5 py-2 text-sm font-medium bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl hover:bg-[var(--arvo-fg)]/90 transition-colors"
            >{ft.btnContinue}</button>
          </div>

          {showSaidaConfirm && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setShowSaidaConfirm(false)}>
              <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto p-6 space-y-4" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 dark:bg-amber-900/40">
                    <span className="text-amber-600 font-bold text-lg dark:text-amber-300">!</span>
                  </div>
                  <h3 className="font-semibold text-[var(--arvo-fg)]">{ft.saidaFiscalBannerTitle}</h3>
                </div>
                <p className="text-sm text-[var(--arvo-fg-muted)]">{ft.saidaFiscalBannerDesc}</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => { setSaidaConfirmed(true); setShowSaidaConfirm(false); setStep('fx_choice') }}
                    className="w-full py-2.5 text-sm font-semibold bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl hover:bg-[var(--arvo-fg)]/90 transition-colors"
                  >{ft.saidaFiscalConfirmBtn}</button>
                  <Link to="/profile"
                    className="w-full py-2.5 text-sm text-center text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] block"
                  >{ft.saidaFiscalEditBtn}</Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Step 2: FX Choice ────────────────────────────────────────────── */}
      {step === 'fx_choice' && (
        <>
          <Section title={ft.sectionFX}>
            <div className="py-3 space-y-4">
              <p className="text-xs text-[var(--arvo-fg-muted)]">{ft.fxDesc}</p>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Option A */}
                <button
                  onClick={() => setFxMethod('daily')}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${fxMethod === 'daily' ? 'border-[var(--arvo-fg)] bg-[var(--arvo-surface-2)]' : 'border-[var(--arvo-border)] hover:border-[var(--arvo-border)]'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{ft.optionATitle}</span>
                    {comp.recommended === 'daily' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium dark:bg-green-900/40 dark:text-green-300">{ft.recommended}</span>}
                  </div>
                  <p className="text-xs text-[var(--arvo-fg-muted)] mb-3">{ft.optionADesc}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblDividends}</span><span className="font-medium">{fmtEUR(comp.daily.dividends_eur)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblInterests}</span><span className="font-medium">{fmtEUR(comp.daily.interests_eur)}</span></div>
                    {taxData.capital_gains.length > 0 && (
                      <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblCapGains}</span><span className={`font-medium ${taxData.total_gain_eur_daily >= 0 ? 'text-[var(--arvo-gold-text)]' : 'text-red-500 dark:text-red-400'}`}>{fmtEUR(taxData.total_gain_eur_daily)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-[var(--arvo-border)] pt-1 mt-1"><span className="font-semibold">{ft.lblTotal}</span><span className="font-bold text-blue-700 dark:text-blue-300">{fmtEUR(comp.daily.total_eur)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblCredit}</span><span className="font-medium text-orange-600 dark:text-orange-300">{fmtEUR(comp.daily.credit_eur)}</span></div>
                  </div>
                </button>

                {/* Option B */}
                <button
                  onClick={() => setFxMethod('year_end')}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${fxMethod === 'year_end' ? 'border-[var(--arvo-fg)] bg-[var(--arvo-surface-2)]' : 'border-[var(--arvo-border)] hover:border-[var(--arvo-border)]'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{ft.optionBTitle}</span>
                    {comp.recommended === 'year_end' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium dark:bg-green-900/40 dark:text-green-300">{ft.recommended}</span>}
                  </div>
                  <p className="text-xs text-[var(--arvo-fg-muted)] mb-3">{ft.optionBDesc}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblBrlEur}</span><span className="font-mono">{taxData.fx_rates.year_end_brl_eur.toFixed(6)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblUsdEur}</span><span className="font-mono">{taxData.fx_rates.year_end_usd_eur.toFixed(6)}</span></div>
                    <div className="border-t border-[var(--arvo-border)] pt-1 mt-1 space-y-1">
                      <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblDividends}</span><span className="font-medium">{fmtEUR(comp.year_end.dividends_eur)}</span></div>
                      <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblInterests}</span><span className="font-medium">{fmtEUR(comp.year_end.interests_eur)}</span></div>
                      {taxData.capital_gains.length > 0 && (
                        <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblCapGains}</span><span className={`font-medium ${taxData.total_gain_eur_year_end >= 0 ? 'text-[var(--arvo-gold-text)]' : 'text-red-500 dark:text-red-400'}`}>{fmtEUR(taxData.total_gain_eur_year_end)}</span></div>
                      )}
                      <div className="flex justify-between border-t border-[var(--arvo-border)] pt-1 mt-1"><span className="font-semibold">{ft.lblTotal}</span><span className="font-bold text-blue-700 dark:text-blue-300">{fmtEUR(comp.year_end.total_eur)}</span></div>
                      <div className="flex justify-between"><span className="text-[var(--arvo-fg-muted)]">{ft.lblCredit}</span><span className="font-medium text-orange-600 dark:text-orange-300">{fmtEUR(comp.year_end.credit_eur)}</span></div>
                    </div>
                  </div>
                </button>
              </div>

              <InfoBox variant="info" title={ft.fxDiff}>
                <p>{fmtEUR(comp.advantage_eur)} · {comp.recommended === 'daily' ? ft.optionATitle : ft.optionBTitle} ({fmtEUR(comp.advantage_eur)} {ft.fxAdvantage}).</p>
              </InfoBox>
            </div>
          </Section>

          <div className="flex justify-between">
            <button onClick={() => setStep('overview')} className="px-4 py-2 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">{ft.btnBack}</button>
            <button onClick={() => setStep('preview')} className="px-5 py-2 text-sm font-medium bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl hover:bg-[var(--arvo-fg)]/90 transition-colors">{ft.btnPreview}</button>
          </div>
        </>
      )}

      {/* ── Step 3: Preview & Download ───────────────────────────────────── */}
      {step === 'preview' && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-[var(--arvo-fg-muted)]">
              {ft.selectedMethod} : <span className="font-semibold text-[var(--arvo-fg)]">{fxMethod === 'daily' ? ft.methodA : ft.methodB}</span>
            </div>
            <button
              onClick={() => void generateExcel(taxData, fxMethod)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors"
            >
              {ft.btnDownload}
            </button>
          </div>

          {/* 2042 Cases */}
          <Section title={ft.section2042}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 dark:bg-blue-950/40 dark:border-blue-900">
                <p className="text-xs text-blue-600 font-mono mb-1 dark:text-blue-300">Case 2DC</p>
                <p className="text-xl font-bold text-blue-800 dark:text-blue-200">{fmtEUR(totals.dividends_eur)}</p>
                <p className="text-xs text-blue-500 mt-1 dark:text-blue-400">{ft.desc2DC}</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 dark:bg-green-950/40 dark:border-green-900">
                <p className="text-xs text-green-600 font-mono mb-1 dark:text-green-300">Case 2TR</p>
                <p className="text-xl font-bold text-green-800 dark:text-green-200">{fmtEUR(totals.interests_eur)}</p>
                <p className="text-xs text-green-500 mt-1 dark:text-green-400">{ft.desc2TR}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 dark:bg-orange-950/40 dark:border-orange-900">
                <p className="text-xs text-orange-600 font-mono mb-1 dark:text-orange-300">Case 2AB</p>
                <p className="text-xl font-bold text-orange-800 dark:text-orange-200">{fmtEUR(totals.credit_eur)}</p>
                <p className="text-xs text-orange-500 mt-1 dark:text-orange-400">{ft.desc2AB}</p>
              </div>
              {(() => {
                const gainEur = fxMethod === 'daily' ? taxData.total_gain_eur_daily : taxData.total_gain_eur_year_end
                const isGain  = gainEur >= 0
                return (
                  <div className={`${isGain ? 'bg-[var(--arvo-gold-tint)] border-[var(--arvo-gold)]/20' : 'bg-red-50 border-red-100 dark:bg-red-950/40 dark:border-red-900'} border rounded-xl p-4`}>
                    <p className={`text-xs font-mono mb-1 ${isGain ? 'text-[var(--arvo-gold-text)]' : 'text-red-500 dark:text-red-400'}`}>{isGain ? 'Case 3VG' : 'Case 3VM'}</p>
                    <p className={`text-xl font-bold ${isGain ? 'text-[var(--arvo-gold-text)]' : 'text-red-700 dark:text-red-300'}`}>{fmtEUR(Math.abs(gainEur))}</p>
                    <p className={`text-xs mt-1 ${isGain ? 'text-[var(--arvo-gold-text)]/70' : 'text-red-400 dark:text-red-500'}`}>{isGain ? ft.descCapGain : ft.descCapLoss}</p>
                  </div>
                )
              })()}
            </div>
            <div className="py-2 border-t border-[var(--arvo-border)] flex justify-between text-sm font-semibold">
              <span className="text-[var(--arvo-fg-muted)]">{ft.totalRevDecl}</span>
              <span className="text-[var(--arvo-fg)]">{fmtEUR(totals.dividends_eur + totals.interests_eur)}</span>
            </div>
          </Section>

          {/* Capital gains detail */}
          {taxData.capital_gains.length > 0 && (
            <Section title={ft.sectionCapGains}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead><tr className="text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                    <th className="text-left py-2 font-medium">{t.reports.colDate}</th>
                    <th className="text-left py-2 font-medium">{t.reports.colAsset}</th>
                    <th className="text-left py-2 font-medium">{ft.colTypeBroker}</th>
                    <th className="text-right py-2 font-medium">{ft.colQty}</th>
                    <th className="text-right py-2 font-medium">{ft.colSaleValue}</th>
                    <th className="text-right py-2 font-medium">{ft.colCostBasis}</th>
                    <th className="text-right py-2 font-medium">{ft.colGainBRL}</th>
                    <th className="text-right py-2 font-medium">{ft.colGainEUR}</th>
                  </tr></thead>
                  <tbody>
                    {taxData.capital_gains.map(g => {
                      const gainEur = fxMethod === 'daily' ? g.gain_loss_eur_daily : g.gain_loss_eur_year_end
                      const fxR     = fxMethod === 'daily' ? g.fx_rate_daily : g.fx_rate_year_end
                      return (
                        <tr key={g.id} className="border-b border-[var(--arvo-border-soft)] hover:bg-[var(--arvo-surface-2)]">
                          <td className="py-1.5 text-[var(--arvo-fg-muted)]">{g.date}</td>
                          <td className="py-1.5 font-medium">{g.asset_code} <span className="text-[var(--arvo-fg-soft)] font-normal">{g.asset_name}</span></td>
                          <td className="py-1.5 text-[var(--arvo-fg-muted)]">{countryLabel(g.country)} · {g.broker}</td>
                          <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">{g.qty.toFixed(4)}</td>
                          <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">{fmtBRL(g.sale_value_brl)}</td>
                          <td className="py-1.5 text-right text-[var(--arvo-fg-muted)]">{fmtBRL(g.cost_basis_brl)}</td>
                          <td className={`py-1.5 text-right font-semibold ${g.gain_loss_brl >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>{fmtBRL(g.gain_loss_brl)}</td>
                          <td className={`py-1.5 text-right font-semibold ${gainEur >= 0 ? 'text-[var(--arvo-gold-text)]' : 'text-red-600 dark:text-red-300'}`}>
                            {fmtEUR(gainEur)}
                            <span className="text-[var(--arvo-fg-faint)] font-normal ml-1">{fxR.toFixed(4)}</span>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] font-semibold text-sm">
                      <td colSpan={7} className="py-2 text-right text-xs text-[var(--arvo-fg-muted)]">{ft.totalNetGain}</td>
                      <td className={`py-2 text-right ${(fxMethod === 'daily' ? taxData.total_gain_eur_daily : taxData.total_gain_eur_year_end) >= 0 ? 'text-[var(--arvo-gold-text)]' : 'text-red-600 dark:text-red-300'}`}>
                        {fmtEUR(fxMethod === 'daily' ? taxData.total_gain_eur_daily : taxData.total_gain_eur_year_end)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[var(--arvo-fg-soft)] py-3">{ft.capGainsNote}</p>
            </Section>
          )}

          {/* 2047 sections */}
          <Section title={ft.section2047}>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                <th className="text-left py-2 font-medium">{ft.colCountry}</th>
                <th className="text-left py-2 font-medium">{ft.colTypeBroker}</th>
                <th className="text-center py-2 font-medium">{ft.colCase}</th>
                <th className="text-right py-2 font-medium">{ft.colGross}</th>
                <th className="text-right py-2 font-medium">{ft.colConvPct}</th>
                <th className="text-right py-2 font-medium">{ft.colTheorCredit}</th>
                <th className="text-right py-2 font-medium">{ft.colActualWth}</th>
                <th className="text-right py-2 font-medium">{ft.colEffCredit}</th>
              </tr></thead>
              <tbody>
                {sections.map(s => (
                  <tr key={s.key} className={`border-b border-[var(--arvo-border-soft)] hover:bg-[var(--arvo-surface-2)] ${s.form_type === '2DC' ? '' : ''}`}>
                    <td className="py-2 text-[var(--arvo-fg)]">{countryLabel(s.country)}</td>
                    <td className="py-2">
                      <span className="text-[var(--arvo-fg)]">{eventTypeLabel(s.event_type)}</span>
                      <span className="text-[var(--arvo-fg-soft)] text-xs ml-1.5">{s.broker}</span>
                    </td>
                    <td className="py-2 text-center">{formBadge(s.form_type)}</td>
                    <td className="py-2 text-right font-semibold">{fmtEUR(s.gross_eur)}</td>
                    <td className="py-2 text-right text-[var(--arvo-fg-muted)]">{(s.convention_rate * 100).toFixed(0)}%</td>
                    <td className="py-2 text-right text-[var(--arvo-fg-muted)]">{fmtEUR(s.theoretical_credit_eur)}</td>
                    <td className="py-2 text-right text-[var(--arvo-fg-muted)]">{fmtEUR(s.actual_withholding_eur)}</td>
                    <td className="py-2 text-right font-semibold text-orange-600 dark:text-orange-300">{fmtEUR(s.effective_credit_eur)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-[var(--arvo-border)] bg-[var(--arvo-surface-2)] font-semibold">
                  <td colSpan={3} className="py-2 text-right text-xs text-[var(--arvo-fg-muted)]">{ft.totals}</td>
                  <td className="py-2 text-right">{fmtEUR(totals.dividends_eur + totals.interests_eur)}</td>
                  <td />
                  <td className="py-2 text-right text-[var(--arvo-fg-muted)]">{fmtEUR(sections.reduce((s, r) => s + r.theoretical_credit_eur, 0))}</td>
                  <td className="py-2 text-right text-[var(--arvo-fg-muted)]">{fmtEUR(sections.reduce((s, r) => s + r.actual_withholding_eur, 0))}</td>
                  <td className="py-2 text-right text-orange-600 dark:text-orange-300">{fmtEUR(totals.credit_eur)}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Detailed events */}
          <Section title={ft.sectionEvents}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead><tr className="text-[var(--arvo-fg-soft)] border-b border-[var(--arvo-border)]">
                  <th className="text-left py-2 font-medium">{t.reports.colDate}</th>
                  <th className="text-left py-2 font-medium">{t.reports.colAsset}</th>
                  <th className="text-left py-2 font-medium">{ft.colTypeBroker}</th>
                  <th className="text-center py-2 font-medium">{ft.colCase}</th>
                  <th className="text-right py-2 font-medium">{ft.colFX}</th>
                  <th className="text-right py-2 font-medium">{ft.colAmount}</th>
                  <th className="text-right py-2 font-medium">{ft.colWithheld}</th>
                </tr></thead>
                <tbody>
                  {taxData.events.map(e => {
                    const gross = fxMethod === 'daily' ? e.gross_eur_daily : e.gross_eur_year_end
                    const wth   = fxMethod === 'daily' ? e.tax_withheld_eur_daily : e.tax_withheld_eur_year_end
                    const fxR   = fxMethod === 'daily' ? e.fx_rate_daily : e.fx_rate_year_end
                    return (
                      <tr key={e.id} className="border-b border-[var(--arvo-border-soft)] hover:bg-[var(--arvo-surface-2)]">
                        <td className="py-1.5 text-[var(--arvo-fg-muted)]">{e.date}</td>
                        <td className="py-1.5 font-medium">{e.asset_code} <span className="text-[var(--arvo-fg-soft)] font-normal">{e.asset_name}</span></td>
                        <td className="py-1.5 text-[var(--arvo-fg-muted)]">{countryLabel(e.country)} · {e.broker}</td>
                        <td className="py-1.5 text-center">{formBadge(e.form_type)}</td>
                        <td className="py-1.5 text-right font-mono text-[var(--arvo-fg-soft)]">{fxR.toFixed(5)}</td>
                        <td className="py-1.5 text-right font-semibold">{fmtEUR(gross)}</td>
                        <td className="py-1.5 text-right text-orange-600 dark:text-orange-300">{wth > 0 ? fmtEUR(wth) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="flex justify-between items-center flex-wrap gap-3">
            <button onClick={() => setStep('fx_choice')} className="px-4 py-2 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">{ft.btnBack}</button>
            <button
              onClick={() => void generateExcel(taxData, fxMethod)}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors"
            >{ft.btnDownload}</button>
          </div>

          {/* Disclaimers */}
          <div className="text-xs text-[var(--arvo-fg-soft)] bg-red-50 border border-red-100 rounded-xl p-4 space-y-1 dark:bg-red-950/40 dark:border-red-900">
            <p className="font-semibold text-red-600 mb-2 dark:text-red-300">{ft.warningTitle}</p>
            <p>• {ft.warning1}</p>
            <p>• {ft.warning2}</p>
            <p>• {ft.warning3}</p>
            <p>• {ft.warning4}</p>
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--arvo-border)]">
        <h2 className="font-semibold text-[var(--arvo-fg)] text-sm">{title}</h2>
      </div>
      <div className="px-6 py-2 overflow-x-auto">{children}</div>
    </div>
  )
}

function Card({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-[var(--arvo-fg-soft)] mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueClass ?? 'text-[var(--arvo-fg)]'}`}>{value}</p>
    </div>
  )
}
