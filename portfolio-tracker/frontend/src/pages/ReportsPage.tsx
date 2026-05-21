import { useState, useEffect } from 'react'
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
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button onClick={() => setTab('br')} className={`px-4 py-1.5 font-medium transition-colors ${tab === 'br' ? 'bg-[#001A70] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Brasil</button>
            <button onClick={() => setTab('fr')} className={`px-4 py-1.5 font-medium transition-colors ${tab === 'fr' ? 'bg-[#001A70] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>França</button>
          </div>
        </div>
      </div>

      {loading && <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-gray-400 text-sm">Carregando...</div>}
      {error   && <div className="bg-white border border-gray-100 rounded-2xl p-6 text-red-600 text-sm">{error}</div>}

      {data && tab === 'br' && <BrReport data={data} />}
      {data && tab === 'fr' && <FrReport data={data} />}
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
        )}
      </Section>

      {/* Rendimentos */}
      <Section title="Rendimentos Recebidos (dividendos, JCP, alugueis)">
        {data.income.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhum rendimento registrado em {data.year}</p>
        ) : (
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
        )}
      </Section>

      {/* Bens e Direitos */}
      <Section title={`Bens e Direitos em 31/12/${data.year}`}>
        {data.positions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhum ativo em posicao em 31/12/{data.year}</p>
        ) : (
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
        )}
      </Section>

      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="font-medium text-gray-500 mb-1">Aviso</p>
        <p>Os dados acima sao calculados a partir das operacoes registradas no sistema e servem como auxilio ao preenchimento da declaracao. Consulte um contador para situacoes especificas como isencao ate R$20.000/mes em acoes do mercado a vista, compensacao de perdas, FIIs isentos de IR, etc.</p>
      </div>
    </div>
  )
}

function FrReport({ data }: { data: ReportData }) {
  return (
    <div className="space-y-6">

      {/* Resume */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card label="Plus-values nettes" value={fmtBRL(data.totalGainLoss)} valueClass={pctColor(data.totalGainLoss)} />
        <Card label="Revenus mobiliers"  value={fmtBRL(data.totalIncome)}   valueClass="text-purple-600" />
        <Card label="Lignes biens"       value={String(data.positions.length)} valueClass="text-gray-800" />
      </div>

      {/* Plus-values */}
      <Section title="Plus-values mobilières (cessions)">
        {data.sells.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucune cession enregistrée en {data.year}</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2 font-medium">Date</th>
              <th className="text-left py-2 font-medium">Valeur</th>
              <th className="text-right py-2 font-medium">Prix cession</th>
              <th className="text-right py-2 font-medium">Prix revient</th>
              <th className="text-right py-2 font-medium">Plus-value</th>
            </tr></thead>
            <tbody>
              {data.sells.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-500">{r.date}</td>
                  <td className="py-2 font-medium">{r.code} <span className="text-gray-400 font-normal text-xs">{r.name}</span></td>
                  <td className="py-2 text-right text-gray-600">{fmtBRL(r.sale_value_brl)}</td>
                  <td className="py-2 text-right text-gray-600">{fmtBRL(r.cost_basis_brl)}</td>
                  <td className={`py-2 text-right font-semibold ${pctColor(r.gain_loss_brl)}`}>{fmtBRL(r.gain_loss_brl)}</td>
                </tr>
              ))}
              <tr className="font-semibold border-t border-gray-200 bg-gray-50">
                <td colSpan={4} className="py-2 text-right text-xs text-gray-500">Total plus-values nettes</td>
                <td className={`py-2 text-right ${pctColor(data.totalGainLoss)}`}>{fmtBRL(data.totalGainLoss)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* Revenus mobiliers */}
      <Section title="Revenus mobiliers (dividendes)">
        {data.income.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucun revenu enregistré en {data.year}</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2 font-medium">Date</th>
              <th className="text-left py-2 font-medium">Valeur</th>
              <th className="text-left py-2 font-medium">Description</th>
              <th className="text-right py-2 font-medium">Montant (R$)</th>
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
                <td colSpan={3} className="py-2 text-right text-xs text-gray-500">Total revenus</td>
                <td className="py-2 text-right text-purple-700">{fmtBRL(data.totalIncome)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* Etat du patrimoine */}
      <Section title={`État du patrimoine au 31/12/${data.year}`}>
        {data.positions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucun actif en portefeuille au 31/12/{data.year}</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2 font-medium">Code</th>
              <th className="text-left py-2 font-medium">Designation</th>
              <th className="text-right py-2 font-medium">Qte</th>
              <th className="text-right py-2 font-medium">Prix de revient (R$)</th>
            </tr></thead>
            <tbody>
              {data.positions.map(p => (
                <tr key={p.asset_id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 font-medium">{p.code}</td>
                  <td className="py-2 text-gray-600 text-xs">{p.name}</td>
                  <td className="py-2 text-right text-gray-600">{fmt(p.qty, 6)}</td>
                  <td className="py-2 text-right font-semibold">{fmtBRL(p.cost_brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-4">
        <p className="font-medium text-gray-500 mb-1">Avertissement</p>
        <p>Les montants sont exprimés en BRL (réal brésilien). Pour la déclaration française, les convertir en EUR au taux de change du jour de chaque opération. Le taux forfaitaire (PFU) de 30% s'applique généralement aux plus-values et revenus mobiliers. Consultez un expert-comptable pour les cas spécifiques.</p>
      </div>
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
