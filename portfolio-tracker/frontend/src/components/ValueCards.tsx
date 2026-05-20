import { useCurrency } from '../contexts/CurrencyContext'

interface Props {
  total_brl: number
  generated_at: string
}

export default function ValueCards({ total_brl, generated_at }: Props) {
  const { currency, fmt } = useCurrency()
  const ts = new Date(generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-[#001A70] text-white rounded-2xl p-6">
      <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">
        Total {currency}
      </p>
      <p className="text-3xl font-bold mt-2">{fmt(total_brl, 0)}</p>
      <p className="text-blue-300 text-xs mt-3">atualizado {ts}</p>
    </div>
  )
}
