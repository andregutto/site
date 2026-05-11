import { useCurrency } from '../contexts/CurrencyContext'

interface Props {
  total_brl: number
  total_usd: number | null
  total_eur: number | null
  generated_at: string
}

function fmtStatic(value: number, cur: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(value)
}

export default function ValueCards({ total_brl, total_usd, total_eur, generated_at }: Props) {
  const { currency, fmt } = useCurrency()
  const ts = new Date(generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Card principal — moeda selecionada */}
      <div className="bg-[#001A70] text-white rounded-2xl p-6 sm:col-span-1">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">
          Total {currency}
        </p>
        <p className="text-3xl font-bold mt-2">{fmt(total_brl, 0)}</p>
        <p className="text-blue-300 text-xs mt-3">atualizado {ts}</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Total USD</p>
        <p className="text-2xl font-bold text-gray-900 mt-2">
          {total_usd != null ? fmtStatic(total_usd, 'USD') : '—'}
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">Total EUR</p>
        <p className="text-2xl font-bold text-gray-900 mt-2">
          {total_eur != null ? fmtStatic(total_eur, 'EUR') : '—'}
        </p>
      </div>
    </div>
  )
}
