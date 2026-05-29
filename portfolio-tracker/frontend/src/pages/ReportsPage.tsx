import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'

interface SellRecord {
  id: number; date: string; code: string; name: string
  qty: number; sale_value_brl: number; cost_basis_brl: number
  gain_loss_brl: number; gain_loss_pct: number | null
}

interface IncomeRecord {
  id: number; date: string; code: string; name: string
  value_brl: number; description: string
}

interface PositionRecord {
  asset_id: number; code: string; name: string
  asset_type: string; currency: string; qty: number; cost_brl: number
}

interface ReportData {
  year: number
  sells: SellRecord[]
  income: IncomeRecord[]
  positions: PositionRecord[]
  totalGainLoss: number
  totalIncome: number
}

function fmt(n: number, digits = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtBRL(n: number) {
  return `R$ ${fmt(n)}`
}
function pctColor(n: number) {
  return n >= 0 ? 'text-green-600' : 'text-red-500'
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

export default function ReportsPage() {
  const [year, setYear]       = useState(CURRENT_YEAR - 1)
  const [tab, setTab]         = useState<'br' | 'fr'>('br')
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null); setData(null)
    apiFetch<ReportData>(`/reports/${year}`)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar relatorio'))
      .finally(() => setLoading(false))
  }, [year])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">Relatorios IR</h1>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button onClick={() => setTab('br')} className={`px-4 py-1.5 font-medium transition-colors ${tab === 'br' ? 'bg-[#0D0D0D] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Brasil</button>
            <button onClick={() => setTab('fr')} className={`px-4 py-1.5 font-medium transition-colors ${tab === 'fr' ? 'bg-[#0D0D0D] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>França</button>
          </div>
        </div>
      </div>

      {loading && <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-400 text-sm">Carregando...</div>}
      {error   && <div className="bg-white border border-gray-100 rounded-2xl p-6 text-red-600 text-sm">{error}</div>}

      {data && tab === 'br' && <BrReport data={data} />}
      {tab === 'fr' && <FrReport year={year} />}
    </div>
  )
}

function BrReport({ data }: { data: ReportData }) {
  const { t } = useI18n()
  return (
    <div className="space-y-6">

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card label="Ganho/Perda de capital" value={fmtBRL(data.totalGainLoss)} valueClass={pctColor(data.totalGainLoss)} />
        <Card label="Rendimentos recebidos"  value={fmtBRL(data.totalIncome)}   valueClass="text-purple-600" />
        <Card label="Ativos declarados"      value={String(data.positions.length)} valueClass="text-gray-800" />
      </div>

      {/* Ganho de Capital — Alienacoes */}
      <Section title="Ganho de Capital — Alienacoes">
        {data.sells.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhuma venda registrada em {data.year}</p>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">{t.reports.colDate}</th>
                  <th className="text-left py-2 font-medium">{t.reports.colAsset}</th>
                  <th className="text-right py-2 font-medium">Qtd</th>
                  <th className="text-right py-2 font-medium">Custo medio</th>
                  <th className="text-right py-2 font-medium">{t.reports.colSaleValue}</th>
                  <th className="text-right py-2 font-medium">{t.reports.colGainLoss}</th>
                  <th className="text-right py-2 font-medium">%</th>
                </tr></thead>
                <tbody>
                  {data.sells.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-500">{r.date}</td>
                      <td className="py-2 font-medium">{r.code} <span className="text-gray-400 font-normal text-xs">{r.name}</span></td>
                      <td className="py-2 text-right text-gray-600">{fmt(r.qty, 6)}</td>
                      <td className="py-2 text-right text-gray-600">{fmtBRL(r.cost_basis_brl)}</td>
                      <td className="py-2 text-right text-gray-600">{fmtBRL(r.sale_value_brl)}</td>
                      <td className={`py-2 text-right font-semibold ${pctColor(r.gain_loss_brl)}`}>{fmtBRL(r.gain_loss_brl)}</td>
                      <td className={`py-2 text-right ${pctColor(r.gain_loss_brl)}`}>{r.gain_loss_pct != null ? `${fmt(r.gain_loss_pct, 1)}%` : '-'}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold border-t border-gray-200 bg-gray-50">
                    <td colSpan={5} className="py-2 text-right text-xs text-gray-500">Total ganho/perda</td>
                    <td className={`py-2 text-right ${pctColor(data.totalGainLoss)}`}>{fmtBRL(data.totalGainLoss)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50">
              {data.sells.map(r => (
                <div key={r.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{r.code}</span>
                      <span className="text-xs text-gray-400 ml-1.5 truncate">{r.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-semibold text-sm ${pctColor(r.gain_loss_brl)}`}>{fmtBRL(r.gain_loss_brl)}</div>
                      <div className={`text-xs ${pctColor(r.gain_loss_brl)}`}>{r.gain_loss_pct != null ? `${fmt(r.gain_loss_pct, 1)}%` : '—'}</div>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-400 flex flex-wrap gap-x-3">
                    <span>{r.date}</span>
                    <span>Venda {fmtBRL(r.sale_value_brl)}</span>
                  </div>
                </div>
              ))}
              <div className="py-3 flex justify-between text-xs border-t border-gray-100">
                <span className="text-gray-500 font-medium">Total ganho/perda</span>
                <span className={`font-semibold ${pctColor(data.totalGainLoss)}`}>{fmtBRL(data.totalGainLoss)}</span>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* Rendimentos */}
      <Section title="Rendimentos Recebidos (dividendos, JCP, alugueis)">
        {data.income.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhum rendimento registrado em {data.year}</p>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">{t.reports.colDate}</th>
                  <th className="text-left py-2 font-medium">{t.reports.colAsset}</th>
                  <th className="text-left py-2 font-medium">{t.common.description}</th>
                  <th className="text-right py-2 font-medium">{t.reports.colValue}</th>
                </tr></thead>
                <tbody>
                  {data.income.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-500">{r.date}</td>
                      <td className="py-2 font-medium">{r.code}</td>
                      <td className="py-2 text-gray-500">{r.description || '-'}</td>
                      <td className="py-2 text-right text-purple-700 font-semibold">{fmtBRL(r.value_brl)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold border-t border-gray-200 bg-gray-50">
                    <td colSpan={3} className="py-2 text-right text-xs text-gray-500">Total rendimentos</td>
                    <td className="py-2 text-right text-purple-700">{fmtBRL(data.totalIncome)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50">
              {data.income.map(r => (
                <div key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{r.code}</div>
                    <div className="text-xs text-gray-400 truncate">{r.description || r.date}</div>
                  </div>
                  <div className="text-purple-700 font-semibold text-sm shrink-0">{fmtBRL(r.value_brl)}</div>
                </div>
              ))}
              <div className="py-3 flex justify-between text-xs border-t border-gray-100">
                <span className="text-gray-500 font-medium">Total rendimentos</span>
                <span className="font-semibold text-purple-700">{fmtBRL(data.totalIncome)}</span>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* Bens e Direitos */}
      <Section title={`Bens e Direitos em 31/12/${data.year}`}>
        {data.positions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhum ativo em posicao em 31/12/{data.year}</p>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Codigo</th>
                  <th className="text-left py-2 font-medium">Nome</th>
                  <th className="text-left py-2 font-medium">Tipo</th>
                  <th className="text-right py-2 font-medium">Qtd</th>
                  <th className="text-right py-2 font-medium">Custo total (R$)</th>
                </tr></thead>
                <tbody>
                  {data.positions.map(p => (
                    <tr key={p.asset_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 font-medium">{p.code}</td>
                      <td className="py-2 text-gray-600 text-xs">{p.name}</td>
                      <td className="py-2 text-gray-400 text-xs">{p.asset_type}</td>
                      <td className="py-2 text-right text-gray-600">{fmt(p.qty, 6)}</td>
                      <td className="py-2 text-right font-semibold">{fmtBRL(p.cost_brl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50">
              {data.positions.map(p => (
                <div key={p.asset_id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-gray-900">{p.code}</div>
                    <div className="text-xs text-gray-500 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400">{fmt(p.qty, 2)} un. · {p.asset_type}</div>
                  </div>
                  <div className="font-semibold text-sm text-gray-900 shrink-0">{fmtBRL(p.cost_brl)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="font-medium text-gray-500 mb-1">Aviso</p>
        <p>Os dados acima sao calculados a partir das operacoes registradas no sistema e servem como auxilio ao preenchimento da declaracao. Consulte um contador para situacoes especificas como isencao ate R$20.000/mes em acoes do mercado a vista, compensacao de perdas, FIIs isentos de IR, etc.</p>
      </div>
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
    ? <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono">2DC</span>
    : <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-mono">2TR</span>
}

// ─── Excel generation ─────────────────────────────────────────────────────────

// ── Arvo style presets for Excel ─────────────────────────────────────────────
type XlsxStyle = { fill?: { patternType: string; fgColor: { rgb: string } }; font?: { bold?: boolean; color?: { rgb: string }; sz?: number }; alignment?: { wrapText?: boolean } }
const XS = {
  titleBg:    { fill: { patternType: 'solid', fgColor: { rgb: '1B4FD8' } }, font: { bold: true,  color: { rgb: 'FFFFFF' }, sz: 13 } } as XlsxStyle,
  titleSub:   { fill: { patternType: 'solid', fgColor: { rgb: '1B4FD8' } }, font: { bold: false, color: { rgb: 'D9E4F7' }, sz: 10 } } as XlsxStyle,
  secHead:    { fill: { patternType: 'solid', fgColor: { rgb: '2D3748' } }, font: { bold: true,  color: { rgb: 'FFFFFF' }, sz: 10 } } as XlsxStyle,
  colHead:    { fill: { patternType: 'solid', fgColor: { rgb: '4A6BC4' } }, font: { bold: true,  color: { rgb: 'FFFFFF' } } } as XlsxStyle,
  case2DC:    { fill: { patternType: 'solid', fgColor: { rgb: 'D9E4F7' } }, font: { bold: true  } } as XlsxStyle,
  case2TR:    { fill: { patternType: 'solid', fgColor: { rgb: 'E8F5E9' } }, font: { bold: true  } } as XlsxStyle,
  case2AB:    { fill: { patternType: 'solid', fgColor: { rgb: 'FFF3CD' } }, font: { bold: true  } } as XlsxStyle,
  case8UU:    { fill: { patternType: 'solid', fgColor: { rgb: 'F5F5F5' } } } as XlsxStyle,
  valYellow:  { fill: { patternType: 'solid', fgColor: { rgb: 'FFFACD' } }, font: { bold: true  } } as XlsxStyle,
  warnBg:     { fill: { patternType: 'solid', fgColor: { rgb: 'FFF8E1' } }, font: { color: { rgb: '7B3F00' } } } as XlsxStyle,
  warnIcon:   { fill: { patternType: 'solid', fgColor: { rgb: 'FFF8E1' } }, font: { bold: true,  color: { rgb: 'FE5815' } } } as XlsxStyle,
  stepNum:    { fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } }, font: { bold: true,  color: { rgb: '1B4FD8' } } } as XlsxStyle,
  stepTxt:    { fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } } } as XlsxStyle,
  totalRow:   { fill: { patternType: 'solid', fgColor: { rgb: 'E8EFFF' } }, font: { bold: true  } } as XlsxStyle,
  totalVal:   { fill: { patternType: 'solid', fgColor: { rgb: 'FE5815' } }, font: { bold: true,  color: { rgb: 'FFFFFF' } } } as XlsxStyle,
  altRow:     { fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFF' } } } as XlsxStyle,
}
function xc(v: unknown, s?: XlsxStyle): XLSX.CellObject {
  if (v === null || v === undefined || v === '') return { v: '', t: 's', s: s as object | undefined }
  if (typeof v === 'number') return { v, t: 'n', s: s as object | undefined }
  return { v: String(v), t: 's', s: s as object | undefined }
}
function xcRow(cells: unknown[], s: XlsxStyle): unknown[] {
  return cells.map(v => xc(v, s))
}

function generateExcel(d: FranceTaxData, method: 'daily' | 'year_end') {
  const wb   = XLSX.utils.book_new()
  const secs = method === 'daily' ? d.sections_daily : d.sections_year_end
  const tots = method === 'daily' ? d.totals_daily   : d.totals_year_end
  const fxLabel = method === 'daily' ? 'Taux du jour' : 'Taux au 31/12'
  const e2 = (n: number) => Math.round(n * 100) / 100

  // ── Sheet 1: Resumo ──────────────────────────────────────────────────────
  const resumo: unknown[][] = [
    xcRow([`ARVO — Rapport Fiscal France ${d.year}`, '', '', ''], XS.titleBg),
    xcRow([`Méthode : ${fxLabel}  ·  Généré le ${new Date().toLocaleDateString('fr-FR')}`, '', '', ''], XS.titleSub),
    [],
    xcRow(['RÉCAPITULATIF — FORMULAIRE 2042', '', '', ''], XS.secHead),
    xcRow(['Case', 'Libellé', 'Montant (€)', 'Action'], XS.colHead),
    [xc('2DC', XS.case2DC), xc('Revenus de capitaux mobiliers — Dividendes', XS.case2DC), xc(e2(tots.dividends_eur), XS.valYellow), xc('← à copier dans la case 2DC', XS.case2DC)],
    [xc('2TR', XS.case2TR), xc('Produits de placement à revenu fixe — Intérêts', XS.case2TR), xc(e2(tots.interests_eur), XS.valYellow), xc('← à copier dans la case 2TR', XS.case2TR)],
    [xc('2AB', XS.case2AB), xc("Crédit d'impôt conventionnel total", XS.case2AB), xc(e2(tots.credit_eur), XS.valYellow), xc('← à copier dans la case 2AB', XS.case2AB)],
    ...(d.capital_gains.length > 0 ? [[
      xc(totalGainEur >= 0 ? '3VG' : '3VM', totalGainEur >= 0
        ? { fill: { patternType: 'solid', fgColor: { rgb: 'EDE9FE' } }, font: { bold: true } } as XlsxStyle
        : { fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } }, font: { bold: true } } as XlsxStyle),
      xc(totalGainEur >= 0 ? 'Plus-values nettes sur cessions (3VG)' : 'Moins-values nettes sur cessions (3VM)',
        totalGainEur >= 0
          ? { fill: { patternType: 'solid', fgColor: { rgb: 'EDE9FE' } } } as XlsxStyle
          : { fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } } } as XlsxStyle),
      xc(e2(Math.abs(totalGainEur)), XS.valYellow),
      xc(`← à copier dans la case ${totalGainEur >= 0 ? '3VG' : '3VM'}`,
        totalGainEur >= 0
          ? { fill: { patternType: 'solid', fgColor: { rgb: 'EDE9FE' } } } as XlsxStyle
          : { fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } } } as XlsxStyle),
    ]] : []),
    [xc('8UU', XS.case8UU), xc("Comptes à l'étranger déclarés (3916)", XS.case8UU), xc('Cocher', XS.case8UU), xc('← cocher si vous avez rempli le 3916', XS.case8UU)],
    [],
    xcRow(['ÉTAPES À SUIVRE', '', '', ''], XS.secHead),
    [xc('1', XS.stepNum), xc('Remplir le formulaire 3916 pour chaque compte (onglet "3916")', XS.stepTxt), xc('', XS.stepTxt), xc('', XS.stepTxt)],
    [xc('2', XS.stepNum), xc('Remplir le formulaire 2047 (onglet "2047 - Par pays")', XS.stepTxt), xc('', XS.stepTxt), xc('', XS.stepTxt)],
    [xc('3', XS.stepNum), xc('Reporter les cases 2DC, 2TR, 2AB dans le formulaire 2042 (et 3VG/3VM si ventes)', XS.stepTxt), xc('', XS.stepTxt), xc('', XS.stepTxt)],
    [xc('4', XS.stepNum), xc("Cocher la case 8UU si vous avez déclaré des comptes étrangers", XS.stepTxt), xc('', XS.stepTxt), xc('', XS.stepTxt)],
    [],
    xcRow(['AVERTISSEMENTS', '', '', ''], XS.secHead),
    [xc('!', XS.warnIcon), xc('Ce rapport est indicatif. Consultez un expert-comptable avant de soumettre.', XS.warnBg), xc('', XS.warnBg), xc('', XS.warnBg)],
    [xc('!', XS.warnIcon), xc('Le traitement JCP/FII dans la convention France-Brésil (1971) est juridiquement ambigu.', XS.warnBg), xc('', XS.warnBg), xc('', XS.warnBg)],
    [xc('!', XS.warnIcon), xc('Les retenues à la source sont calculées sur des taux théoriques. Vérifiez vos relevés.', XS.warnBg), xc('', XS.warnBg), xc('', XS.warnBg)],
    [xc('!', XS.warnIcon), xc(`Taux BRL/EUR au 31/12 : ${d.fx_rates.year_end_brl_eur.toFixed(6)} | USD/EUR au 31/12 : ${d.fx_rates.year_end_usd_eur.toFixed(6)}`, XS.warnBg), xc('', XS.warnBg), xc('', XS.warnBg)],
  ]
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
  wsResumo['!cols'] = [{ width: 8 }, { width: 58 }, { width: 18 }, { width: 40 }]
  XLSX.utils.book_append_sheet(wb, wsResumo, '📋 Resumo')

  // ── Sheet 2: 3916 ────────────────────────────────────────────────────────
  const acc3916: unknown[][] = [
    xcRow(["FORMULAIRE 3916 — COMPTES ET CONTRATS À L'ÉTRANGER", '', '', '', '', ''], XS.titleBg),
    xcRow(["À remplir pour chaque compte/contrat détenu à l'étranger au cours de l'année.", '', '', '', '', ''], XS.titleSub),
    [],
    xcRow(['#', 'Établissement', 'Adresse', 'Pays', 'Numéro de compte', 'État au 31/12'], XS.colHead),
    ...d.accounts.map((a, i) => xcRow([i + 1, a.institution, a.address, a.country, '(vérifier relevés)', a.status], i % 2 === 0 ? XS.altRow : {})),
    [],
    xcRow(["Rappel : N26 avec IBAN FR ne doit PAS être déclaré ici.", '', '', '', '', ''], XS.warnBg),
  ]
  const wsAcc = XLSX.utils.aoa_to_sheet(acc3916)
  wsAcc['!cols'] = [{ width: 4 }, { width: 40 }, { width: 55 }, { width: 12 }, { width: 22 }, { width: 14 }]
  XLSX.utils.book_append_sheet(wb, wsAcc, '3916 - Comptes')

  // ── Sheet 3: Détail par broker ─────────────────────────────────────────────
  const brokers = [...new Set(d.events.map(e => e.broker))]
  for (const broker of brokers) {
    const evs = d.events.filter(e => e.broker === broker)
    const gross = (e: TaxEvent) => method === 'daily' ? e.gross_eur_daily : e.gross_eur_year_end
    const wth   = (e: TaxEvent) => method === 'daily' ? e.tax_withheld_eur_daily : e.tax_withheld_eur_year_end
    const fxR   = (e: TaxEvent) => method === 'daily' ? e.fx_rate_daily : e.fx_rate_year_end
    const rows: unknown[][] = [
      xcRow([`${broker} — Détail des revenus ${d.year}`, '', '', '', '', '', '', ''], XS.titleBg),
      xcRow([`Méthode de change : ${fxLabel}`, '', '', '', '', '', '', ''], XS.titleSub),
      [],
      xcRow(['Date', 'Actif', 'Pays', 'Type', 'Case', 'Montant orig.', 'Taux EUR', 'Montant EUR', 'Retenue (théor.)'], XS.colHead),
      ...evs.map((e, i) => xcRow([
        e.date, `${e.asset_code} — ${e.asset_name}`, countryLabel(e.country),
        eventTypeLabel(e.event_type), e.form_type,
        e2(e.gross_amount), e2(fxR(e)), e2(gross(e)), e2(wth(e)),
      ], i % 2 === 0 ? {} : XS.altRow)),
      [],
      [xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc('TOTAL', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc(e2(evs.reduce((s, e) => s + gross(e), 0)), XS.totalVal), xc(e2(evs.reduce((s, e) => s + wth(e), 0)), XS.totalVal)],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ width: 12 }, { width: 35 }, { width: 14 }, { width: 18 }, { width: 6 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, `${broker} - Détail`)
  }

  // ── Sheet 4: 2047 ────────────────────────────────────────────────────────
  const rows2047: unknown[][] = [
    xcRow(["FORMULAIRE 2047 — REVENUS ENCAISSÉS À L'ÉTRANGER", '', '', '', '', '', '', ''], XS.titleBg),
    xcRow([`Année ${d.year} — Méthode : ${fxLabel}`, '', '', '', '', '', '', ''], XS.titleSub),
    [],
    xcRow(['Case 201', 'Case 202', 'Broker', 'Case 203', 'Case 204', 'Case 205', 'Case 206', 'Case 207'], XS.colHead),
    xcRow(['Pays', 'Nature', 'Courtier', 'Revenu brut (€)', 'Taux conv.', 'Crédit théor.', 'Retenue réelle', 'Crédit effectif'], XS.colHead),
  ]
  secs.forEach((s, i) => {
    rows2047.push(xcRow([
      countryLabel(s.country),
      `${eventTypeLabel(s.event_type)} — ${s.form_type}`,
      s.broker,
      e2(s.gross_eur),
      `${(s.convention_rate * 100).toFixed(0)}%`,
      e2(s.theoretical_credit_eur),
      e2(s.actual_withholding_eur),
      e2(s.effective_credit_eur),
    ], i % 2 === 0 ? {} : XS.altRow))
  })
  rows2047.push([])
  rows2047.push([xc('', XS.totalRow), xc('TOTAL DIVIDENDES (2DC)', XS.totalRow), xc('', XS.totalRow), xc(e2(tots.dividends_eur), XS.totalVal), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow)])
  rows2047.push([xc('', XS.totalRow), xc('TOTAL INTÉRÊTS (2TR)',   XS.totalRow), xc('', XS.totalRow), xc(e2(tots.interests_eur),  XS.totalVal), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow)])
  rows2047.push([xc('', XS.totalRow), xc("TOTAL CRÉDIT (2AB)",     XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow),                      xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc(e2(tots.credit_eur), XS.totalVal)])
  const ws2047 = XLSX.utils.aoa_to_sheet(rows2047)
  ws2047['!cols'] = [{ width: 14 }, { width: 30 }, { width: 22 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2047, '2047 - Par pays')

  // ── Sheet 5: 2042 ────────────────────────────────────────────────────────
  const totalGainEur = method === 'daily' ? d.total_gain_eur_daily : d.total_gain_eur_year_end
  const case3VG = totalGainEur >= 0
  const case3Style = case3VG
    ? { fill: { patternType: 'solid', fgColor: { rgb: 'EDE9FE' } }, font: { bold: true } } as XlsxStyle
    : { fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } }, font: { bold: true } } as XlsxStyle

  const rows2042: unknown[][] = [
    xcRow(['FORMULAIRE 2042 — CASES À REPORTER', '', ''], XS.titleBg),
    xcRow([`Année ${d.year}`, '', ''], XS.titleSub),
    [],
    xcRow(['Case', 'Libellé', 'Valeur à reporter (€)'], XS.colHead),
    [xc('2DC', XS.case2DC), xc('Revenus de valeurs mobilières étrangères (dividendes + FII)', XS.case2DC), xc(e2(tots.dividends_eur), XS.valYellow)],
    [xc('2TR', XS.case2TR), xc('Produits de placement à revenu fixe (intérêts + JCP + RF)', XS.case2TR), xc(e2(tots.interests_eur), XS.valYellow)],
    [xc('2AB', XS.case2AB), xc("Crédit d'impôt imputé sur l'IR (total des cases 207)", XS.case2AB), xc(e2(tots.credit_eur), XS.valYellow)],
    ...(d.capital_gains.length > 0 ? [
      [xc(case3VG ? '3VG' : '3VM', case3Style), xc(case3VG ? 'Plus-values nettes sur cessions de valeurs mobilières' : 'Moins-values nettes sur cessions de valeurs mobilières', case3Style), xc(e2(Math.abs(totalGainEur)), XS.valYellow)],
    ] : []),
    [xc('8UU', XS.case8UU), xc("Avez-vous des comptes à l'étranger ? (3916)", XS.case8UU), xc(d.accounts.length > 0 ? 'OUI — cocher' : 'NON', XS.case8UU)],
    [],
    [xc('Total revenus déclarés (2DC + 2TR)', XS.totalRow), xc('', XS.totalRow), xc(e2(tots.dividends_eur + tots.interests_eur), XS.totalVal)],
    ...(d.capital_gains.length > 0 ? [
      [xc(`Total ${case3VG ? 'plus-values' : 'moins-values'} (${case3VG ? '3VG' : '3VM'})`, XS.totalRow), xc('', XS.totalRow), xc(e2(Math.abs(totalGainEur)), XS.totalVal)],
    ] : []),
  ]
  const ws2042 = XLSX.utils.aoa_to_sheet(rows2042)
  ws2042['!cols'] = [{ width: 8 }, { width: 58 }, { width: 22 }]
  XLSX.utils.book_append_sheet(wb, ws2042, '2042 - Cases')

  // ── Sheet 6: Plus-values (if any) ────────────────────────────────────────
  if (d.capital_gains.length > 0) {
    const gainRows: unknown[][] = [
      xcRow(['PLUS-VALUES — VENTES DE VALEURS MOBILIÈRES', '', '', '', '', '', '', ''], XS.titleBg),
      xcRow([`Année ${d.year} — Méthode : ${fxLabel}`, '', '', '', '', '', '', ''], XS.titleSub),
      [],
      xcRow(['Date', 'Actif', 'Pays', 'Broker', 'Qtd', 'Prix vente (R$)', 'Coût moy. (R$)', 'G/P brut (R$)', 'Taux EUR', 'G/P net (€)'], XS.colHead),
      ...d.capital_gains.map((g, i) => {
        const gainEur = method === 'daily' ? g.gain_loss_eur_daily : g.gain_loss_eur_year_end
        const fxR     = method === 'daily' ? g.fx_rate_daily : g.fx_rate_year_end
        return xcRow([
          g.date, `${g.asset_code} — ${g.asset_name}`, countryLabel(g.country), g.broker,
          g.qty, e2(g.sale_value_brl), e2(g.cost_basis_brl), e2(g.gain_loss_brl),
          fxR, e2(gainEur),
        ], i % 2 === 0 ? {} : XS.altRow)
      }),
      [],
      [xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow), xc('', XS.totalRow),
       xc('', XS.totalRow), xc('', XS.totalRow),
       xc(e2(d.capital_gains.reduce((s, g) => s + g.gain_loss_brl, 0)), XS.totalVal),
       xc('', XS.totalRow),
       xc(e2(totalGainEur), XS.totalVal)],
    ]
    const wsGains = XLSX.utils.aoa_to_sheet(gainRows)
    wsGains['!cols'] = [{ width: 12 }, { width: 32 }, { width: 14 }, { width: 18 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 14 }]
    XLSX.utils.book_append_sheet(wb, wsGains, '3VG - Plus-values')
  }

  // Download
  const out  = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  const blob = new Blob([out], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `ARVO_RelatorioFiscal_${d.year}.xlsx`
  a.click()
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
    apiFetch<FranceTaxData>(`/reports/france/${year}`)
      .then(d => { setTaxData(d); setLoading(false) })
      .catch(e => { setError(e instanceof Error ? e.message : 'Erreur de chargement'); setLoading(false) })
  }

  useEffect(() => { setStep('overview'); fetchReport() }, [year]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) return <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-400 text-sm">{ft.loading}</div>
  if (error)   return <div className="bg-white border border-gray-100 rounded-2xl p-6 text-red-600 text-sm">{error}</div>
  if (!taxData) return null

  const noEvents = taxData.events.length === 0

  const sections = fxMethod === 'daily' ? taxData.sections_daily : taxData.sections_year_end
  const totals   = fxMethod === 'daily' ? taxData.totals_daily   : taxData.totals_year_end
  const comp     = taxData.comparison

  return (
    <div className="space-y-5">
      {/* Step nav */}
      <div className="flex gap-2 text-xs font-medium flex-wrap">
        {(['overview', 'fx_choice', 'preview'] as const).map((s, i) => {
          const labels = [ft.step1, ft.step2, ft.step3]
          return (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`px-3 py-1.5 rounded-full border transition-colors ${step === s ? 'bg-[#0D0D0D] text-white border-[#0D0D0D]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >{labels[i]}</button>
          )
        })}
      </div>

      {/* ── Step 1: Overview ─────────────────────────────────────────────── */}
      {step === 'overview' && (
        <>
          {/* KPI cards — always shown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label={ft.kpiRevenues} value={noEvents ? '—' : fmtEUR(comp.daily.total_eur)} valueClass="text-blue-700" />
            <Card label={ft.kpiDividends} value={noEvents ? '—' : fmtEUR(comp.daily.dividends_eur)} valueClass="text-blue-600" />
            <Card label={ft.kpiInterests} value={noEvents ? '—' : fmtEUR(comp.daily.interests_eur)} valueClass="text-green-700" />
            <Card label={ft.kpiCapGains} value={fmtEUR(taxData.total_gain_eur_daily)} valueClass={taxData.total_gain_eur_daily >= 0 ? 'text-violet-700' : 'text-red-600'} />
          </div>

          {/* ── Compléter votre déclaration ───────────────────────────────────── */}
          <Section title={ft.sectionComplete}>
            <div className="py-3 space-y-4">

              {/* Detected sources */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">{ft.autoSources}</p>
                {taxData.sections_daily.length > 0 ? (
                  <div className="space-y-1.5">
                    {[...new Map(taxData.events.map(e => [e.broker, e])).values()].map(e => (
                      <div key={e.broker} className="flex items-center gap-2 text-xs">
                        <span className="text-green-500 font-bold">✓</span>
                        <span className="text-gray-700 font-medium">{e.broker}</span>
                        <span className="text-gray-400">— {taxData.events.filter(ev => ev.broker === e.broker).length} {ft.eventsSync}</span>
                      </div>
                    ))}
                    {taxData.capital_gains.length > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-500 font-bold">✓</span>
                        <span className="text-gray-700 font-medium">Plus-values (ventes)</span>
                        <span className="text-gray-400">— {taxData.capital_gains.length} {ft.salesDetected}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{ft.noAutoSources}</p>
                )}
              </div>

              {/* Manual sources */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">{ft.manualSources}</p>

                {/* JCP */}
                <div className="flex gap-2 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="text-blue-400 shrink-0 mt-0.5">ℹ</span>
                  <div className="text-xs text-blue-800 space-y-0.5">
                    <p className="font-semibold">{ft.jcpTitle}</p>
                    <p>{ft.jcpDesc}</p>
                    <p className="text-blue-600">{ft.jcpNote}</p>
                  </div>
                </div>

                {/* Renda fixa */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
                  <div className="flex gap-2">
                    <span className="text-amber-500 shrink-0 mt-0.5 font-bold">!</span>
                    <div className="text-xs text-amber-900">
                      <p className="font-semibold mb-1">{ft.rfTitle}</p>
                      <p className="mb-2">{ft.rfDesc}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white rounded-lg p-2 border border-amber-100">
                        <div>
                          <p className="text-amber-700 font-medium">{ft.rfColInforme}</p>
                          <p className="text-gray-600">{ft.rfField1}</p>
                          <p className="text-gray-600">{ft.rfField2}</p>
                        </div>
                        <div>
                          <p className="text-amber-700 font-medium">{ft.rfColArvo}</p>
                          <p className="font-semibold text-gray-800">{ft.rfArrow1}</p>
                          <p className="font-semibold text-gray-800">{ft.rfArrow2}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick-add toggle */}
                  <button
                    onClick={() => setShowAddIncome(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition-colors"
                  >
                    <span>{ft.addIncomBtn}</span>
                    <span>{showAddIncome ? '▲' : '▼'}</span>
                  </button>

                  {showAddIncome && (
                    <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-gray-700">{ft.newIncomeTitle}</p>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">{ft.incAsset}</label>
                          <select
                            value={incAssetId}
                            onChange={e => setIncAssetId(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          >
                            <option value="">{ft.selectAsset}</option>
                            {userAssets.filter(a => a.asset_type === 'fixed_income').length > 0 && (
                              <optgroup label={ft.fixedIncomeGroup}>
                                {userAssets.filter(a => a.asset_type === 'fixed_income').map(a => (
                                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {userAssets.filter(a => a.asset_type !== 'fixed_income').length > 0 && (
                              <optgroup label={ft.othersGroup}>
                                {userAssets.filter(a => a.asset_type !== 'fixed_income').map(a => (
                                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          {userAssets.filter(a => a.asset_type === 'fixed_income').length === 0 && (
                            <p className="text-xs text-amber-600 mt-1">{ft.noFixedIncome}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{ft.incDate}</label>
                          <input type="date" value={incDate} onChange={e => setIncDate(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{ft.incDesc}</label>
                          <select value={incDesc} onChange={e => setIncDesc(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
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
                          <label className="block text-xs text-gray-500 mb-1">
                            {ft.incGross} <span className="text-amber-600 font-semibold">{ft.incGrossHint}</span>
                          </label>
                          <input type="text" inputMode="decimal" value={incGross} onChange={e => setIncGross(e.target.value)}
                            placeholder="ex: 1234,56"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            {ft.incIR} <span className="text-amber-600 font-semibold">{ft.incIRHint}</span>
                          </label>
                          <input type="text" inputMode="decimal" value={incIR} onChange={e => setIncIR(e.target.value)}
                            placeholder="ex: 185,18"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          <p className="text-xs text-gray-400 mt-0.5">{ft.incIRNote}</p>
                        </div>
                      </div>

                      {incErr && <p className="text-xs text-red-600">{incErr}</p>}

                      <div className="flex gap-2">
                        <button onClick={handleAddIncome} disabled={savingInc}
                          className="flex-1 py-2 text-sm font-semibold bg-[#0D0D0D] text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
                          {savingInc ? ft.incSaving : ft.incSave}
                        </button>
                        <button onClick={() => { setShowAddIncome(false); setIncErr(null) }}
                          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                          {ft.incCancel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* French broker note */}
                <div className="flex gap-2 mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-gray-400 shrink-0 mt-0.5">ℹ</span>
                  <div className="text-xs text-gray-600">
                    <p className="font-semibold mb-0.5">{ft.frenchBrokerTitle}</p>
                    <p>{ft.frenchBrokerDesc}</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Accounts 3916 */}
          <Section title={ft.section3916}>
            {taxData.accounts.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">{ft.no3916}</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {taxData.accounts.map(a => (
                  <div key={a.broker} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{a.institution}</p>
                      <p className="text-xs text-gray-400">{a.address}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs bg-gray-100 rounded px-2 py-0.5 text-gray-600">{a.country}</span>
                      <p className="text-xs text-green-600 mt-0.5">{a.status}</p>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 py-2">{ft.reminder3916}</p>
              </div>
            )}
          </Section>

          {/* Income breakdown by type */}
          {!noEvents && (
            <Section title={ft.incomeByType}>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 font-medium">{ft.colCountry}</th>
                  <th className="text-left py-2 font-medium">{ft.colBroker}</th>
                  <th className="text-left py-2 font-medium">{ft.colType}</th>
                  <th className="text-center py-2 font-medium">{ft.colCase}</th>
                  <th className="text-right py-2 font-medium">{ft.colGrossEUR}</th>
                  <th className="text-right py-2 font-medium">{ft.colEvents}</th>
                </tr></thead>
                <tbody>
                  {taxData.sections_daily.map(s => (
                    <tr key={s.key} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-700">{countryLabel(s.country)}</td>
                      <td className="py-2 text-gray-600 text-xs">{s.broker}</td>
                      <td className="py-2 text-gray-700">{eventTypeLabel(s.event_type)}</td>
                      <td className="py-2 text-center">{formBadge(s.form_type)}</td>
                      <td className="py-2 text-right font-semibold text-gray-800">{fmtEUR(s.gross_eur)}</td>
                      <td className="py-2 text-right text-gray-400 text-xs">{s.event_count}</td>
                    </tr>
                  ))}
                  {taxData.capital_gains.length > 0 && (
                    <tr className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 text-gray-700">—</td>
                      <td className="py-2 text-gray-600 text-xs">—</td>
                      <td className="py-2 text-gray-700">{ft.descCapGain}</td>
                      <td className="py-2 text-center"><span className="text-xs bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 font-mono">3VG</span></td>
                      <td className={`py-2 text-right font-semibold ${taxData.total_gain_eur_daily >= 0 ? 'text-violet-700' : 'text-red-600'}`}>{fmtEUR(taxData.total_gain_eur_daily)}</td>
                      <td className="py-2 text-right text-gray-400 text-xs">{taxData.capital_gains.length}</td>
                    </tr>
                  )}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-sm">
                    <td colSpan={4} className="py-2 text-right text-xs text-gray-500">{ft.totals}</td>
                    <td className="py-2 text-right">{fmtEUR(comp.daily.total_eur)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </Section>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setStep('fx_choice')}
              className="px-5 py-2 text-sm font-medium bg-[#0D0D0D] text-white rounded-xl hover:bg-gray-800 transition-colors"
            >{ft.btnContinue}</button>
          </div>
        </>
      )}

      {/* ── Step 2: FX Choice ────────────────────────────────────────────── */}
      {step === 'fx_choice' && (
        <>
          <Section title={ft.sectionFX}>
            <div className="py-3 space-y-4">
              <p className="text-xs text-gray-500">{ft.fxDesc}</p>

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Option A */}
                <button
                  onClick={() => setFxMethod('daily')}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${fxMethod === 'daily' ? 'border-[#0D0D0D] bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{ft.optionATitle}</span>
                    {comp.recommended === 'daily' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{ft.recommended}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{ft.optionADesc}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">{ft.lblDividends}</span><span className="font-medium">{fmtEUR(comp.daily.dividends_eur)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{ft.lblInterests}</span><span className="font-medium">{fmtEUR(comp.daily.interests_eur)}</span></div>
                    {taxData.capital_gains.length > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">{ft.lblCapGains}</span><span className={`font-medium ${taxData.total_gain_eur_daily >= 0 ? 'text-violet-700' : 'text-red-500'}`}>{fmtEUR(taxData.total_gain_eur_daily)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1"><span className="font-semibold">{ft.lblTotal}</span><span className="font-bold text-blue-700">{fmtEUR(comp.daily.total_eur)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{ft.lblCredit}</span><span className="font-medium text-orange-600">{fmtEUR(comp.daily.credit_eur)}</span></div>
                  </div>
                </button>

                {/* Option B */}
                <button
                  onClick={() => setFxMethod('year_end')}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${fxMethod === 'year_end' ? 'border-[#0D0D0D] bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{ft.optionBTitle}</span>
                    {comp.recommended === 'year_end' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{ft.recommended}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{ft.optionBDesc}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">{ft.lblBrlEur}</span><span className="font-mono">{taxData.fx_rates.year_end_brl_eur.toFixed(6)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">{ft.lblUsdEur}</span><span className="font-mono">{taxData.fx_rates.year_end_usd_eur.toFixed(6)}</span></div>
                    <div className="border-t border-gray-200 pt-1 mt-1 space-y-1">
                      <div className="flex justify-between"><span className="text-gray-500">{ft.lblDividends}</span><span className="font-medium">{fmtEUR(comp.year_end.dividends_eur)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{ft.lblInterests}</span><span className="font-medium">{fmtEUR(comp.year_end.interests_eur)}</span></div>
                      {taxData.capital_gains.length > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">{ft.lblCapGains}</span><span className={`font-medium ${taxData.total_gain_eur_year_end >= 0 ? 'text-violet-700' : 'text-red-500'}`}>{fmtEUR(taxData.total_gain_eur_year_end)}</span></div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-1 mt-1"><span className="font-semibold">{ft.lblTotal}</span><span className="font-bold text-blue-700">{fmtEUR(comp.year_end.total_eur)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{ft.lblCredit}</span><span className="font-medium text-orange-600">{fmtEUR(comp.year_end.credit_eur)}</span></div>
                    </div>
                  </div>
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
                <span className="font-medium">{ft.fxDiff} : {fmtEUR(comp.advantage_eur)}</span>
                {' '}— {comp.recommended === 'daily' ? ft.optionATitle : ft.optionBTitle} ({fmtEUR(comp.advantage_eur)} {ft.fxAdvantage}).
              </div>
            </div>
          </Section>

          <div className="flex justify-between">
            <button onClick={() => setStep('overview')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">{ft.btnBack}</button>
            <button onClick={() => setStep('preview')} className="px-5 py-2 text-sm font-medium bg-[#0D0D0D] text-white rounded-xl hover:bg-gray-800 transition-colors">{ft.btnPreview}</button>
          </div>
        </>
      )}

      {/* ── Step 3: Preview & Download ───────────────────────────────────── */}
      {step === 'preview' && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-gray-500">
              {ft.selectedMethod} : <span className="font-semibold text-gray-800">{fxMethod === 'daily' ? ft.methodA : ft.methodB}</span>
            </div>
            <button
              onClick={() => generateExcel(taxData, fxMethod)}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors"
            >
              {ft.btnDownload}
            </button>
          </div>

          {/* 2042 Cases */}
          <Section title={ft.section2042}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-mono mb-1">Case 2DC</p>
                <p className="text-xl font-bold text-blue-800">{fmtEUR(totals.dividends_eur)}</p>
                <p className="text-xs text-blue-500 mt-1">{ft.desc2DC}</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <p className="text-xs text-green-600 font-mono mb-1">Case 2TR</p>
                <p className="text-xl font-bold text-green-800">{fmtEUR(totals.interests_eur)}</p>
                <p className="text-xs text-green-500 mt-1">{ft.desc2TR}</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-xs text-orange-600 font-mono mb-1">Case 2AB</p>
                <p className="text-xl font-bold text-orange-800">{fmtEUR(totals.credit_eur)}</p>
                <p className="text-xs text-orange-500 mt-1">{ft.desc2AB}</p>
              </div>
              {(() => {
                const gainEur = fxMethod === 'daily' ? taxData.total_gain_eur_daily : taxData.total_gain_eur_year_end
                const isGain  = gainEur >= 0
                return (
                  <div className={`${isGain ? 'bg-violet-50 border-violet-100' : 'bg-red-50 border-red-100'} border rounded-xl p-4`}>
                    <p className={`text-xs font-mono mb-1 ${isGain ? 'text-violet-600' : 'text-red-500'}`}>{isGain ? 'Case 3VG' : 'Case 3VM'}</p>
                    <p className={`text-xl font-bold ${isGain ? 'text-violet-800' : 'text-red-700'}`}>{fmtEUR(Math.abs(gainEur))}</p>
                    <p className={`text-xs mt-1 ${isGain ? 'text-violet-500' : 'text-red-400'}`}>{isGain ? ft.descCapGain : ft.descCapLoss}</p>
                  </div>
                )
              })()}
            </div>
            <div className="py-2 border-t border-gray-100 flex justify-between text-sm font-semibold">
              <span className="text-gray-600">{ft.totalRevDecl}</span>
              <span className="text-gray-900">{fmtEUR(totals.dividends_eur + totals.interests_eur)}</span>
            </div>
          </Section>

          {/* Capital gains detail */}
          {taxData.capital_gains.length > 0 && (
            <Section title={ft.sectionCapGains}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead><tr className="text-gray-400 border-b border-gray-100">
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
                        <tr key={g.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-1.5 text-gray-500">{g.date}</td>
                          <td className="py-1.5 font-medium">{g.asset_code} <span className="text-gray-400 font-normal">{g.asset_name}</span></td>
                          <td className="py-1.5 text-gray-500">{countryLabel(g.country)} · {g.broker}</td>
                          <td className="py-1.5 text-right text-gray-600">{g.qty.toFixed(4)}</td>
                          <td className="py-1.5 text-right text-gray-600">{fmtBRL(g.sale_value_brl)}</td>
                          <td className="py-1.5 text-right text-gray-600">{fmtBRL(g.cost_basis_brl)}</td>
                          <td className={`py-1.5 text-right font-semibold ${g.gain_loss_brl >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtBRL(g.gain_loss_brl)}</td>
                          <td className={`py-1.5 text-right font-semibold ${gainEur >= 0 ? 'text-violet-700' : 'text-red-600'}`}>
                            {fmtEUR(gainEur)}
                            <span className="text-gray-300 font-normal ml-1">{fxR.toFixed(4)}</span>
                          </td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                      <td colSpan={7} className="py-2 text-right text-xs text-gray-500">{ft.totalNetGain}</td>
                      <td className={`py-2 text-right ${(fxMethod === 'daily' ? taxData.total_gain_eur_daily : taxData.total_gain_eur_year_end) >= 0 ? 'text-violet-700' : 'text-red-600'}`}>
                        {fmtEUR(fxMethod === 'daily' ? taxData.total_gain_eur_daily : taxData.total_gain_eur_year_end)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 py-3">{ft.capGainsNote}</p>
            </Section>
          )}

          {/* 2047 sections */}
          <Section title={ft.section2047}>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
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
                  <tr key={s.key} className={`border-b border-gray-50 hover:bg-gray-50 ${s.form_type === '2DC' ? '' : ''}`}>
                    <td className="py-2 text-gray-700">{countryLabel(s.country)}</td>
                    <td className="py-2">
                      <span className="text-gray-800">{eventTypeLabel(s.event_type)}</span>
                      <span className="text-gray-400 text-xs ml-1.5">{s.broker}</span>
                    </td>
                    <td className="py-2 text-center">{formBadge(s.form_type)}</td>
                    <td className="py-2 text-right font-semibold">{fmtEUR(s.gross_eur)}</td>
                    <td className="py-2 text-right text-gray-500">{(s.convention_rate * 100).toFixed(0)}%</td>
                    <td className="py-2 text-right text-gray-500">{fmtEUR(s.theoretical_credit_eur)}</td>
                    <td className="py-2 text-right text-gray-500">{fmtEUR(s.actual_withholding_eur)}</td>
                    <td className="py-2 text-right font-semibold text-orange-600">{fmtEUR(s.effective_credit_eur)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={3} className="py-2 text-right text-xs text-gray-500">{ft.totals}</td>
                  <td className="py-2 text-right">{fmtEUR(totals.dividends_eur + totals.interests_eur)}</td>
                  <td />
                  <td className="py-2 text-right text-gray-500">{fmtEUR(sections.reduce((s, r) => s + r.theoretical_credit_eur, 0))}</td>
                  <td className="py-2 text-right text-gray-500">{fmtEUR(sections.reduce((s, r) => s + r.actual_withholding_eur, 0))}</td>
                  <td className="py-2 text-right text-orange-600">{fmtEUR(totals.credit_eur)}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Detailed events */}
          <Section title={ft.sectionEvents}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead><tr className="text-gray-400 border-b border-gray-100">
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
                      <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 text-gray-500">{e.date}</td>
                        <td className="py-1.5 font-medium">{e.asset_code} <span className="text-gray-400 font-normal">{e.asset_name}</span></td>
                        <td className="py-1.5 text-gray-500">{countryLabel(e.country)} · {e.broker}</td>
                        <td className="py-1.5 text-center">{formBadge(e.form_type)}</td>
                        <td className="py-1.5 text-right font-mono text-gray-400">{fxR.toFixed(5)}</td>
                        <td className="py-1.5 text-right font-semibold">{fmtEUR(gross)}</td>
                        <td className="py-1.5 text-right text-orange-600">{wth > 0 ? fmtEUR(wth) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="flex justify-between items-center flex-wrap gap-3">
            <button onClick={() => setStep('fx_choice')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">{ft.btnBack}</button>
            <button
              onClick={() => generateExcel(taxData, fxMethod)}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors"
            >{ft.btnDownload}</button>
          </div>

          {/* Disclaimers */}
          <div className="text-xs text-gray-400 bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
            <p className="font-semibold text-red-600 mb-2">{ft.warningTitle}</p>
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
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="px-6 py-2 overflow-x-auto">{children}</div>
    </div>
  )
}

function Card({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueClass ?? 'text-gray-800'}`}>{value}</p>
    </div>
  )
}
