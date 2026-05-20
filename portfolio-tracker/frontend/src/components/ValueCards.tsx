import { useCurrency } from '../contexts/CurrencyContext'

interface Props {
  total_brl: number
  generated_at: string
  invested_brl?: number | null
  gain_brl?: number | null
  gain_pct?: number | null
}

export default function ValueCards({ total_brl, generated_at, invested_brl, gain_brl, gain_pct }: Props) {
  const { currency, fmt } = useCurrency()
  const ts = new Date(generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const showSecondary = invested_brl != null && gain_brl != null

  return (
    <div className="bg-[#001A70] text-white rounded-2xl p-5 flex flex-col h-full">
      <div>
        <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Total {currency}</p>
        <p className="text-4xl font-bold mt-2 leading-tight">{fmt(total_brl, 0)}</p>
        <p className="text-blue-300 text-[11px] mt-1">atualizado {ts}</p>
      </div>

      {showSecondary && (
        <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-5">
          <div>
            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-medium">Investido</p>
            <p className="text-sm font-semibold mt-0.5">{fmt(invested_brl!, 0)}</p>
          </div>
          <div className="w-px h-8 bg-white/10 shrink-0" />
          <div>
            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-medium">Resultado</p>
            <p className={`text-sm font-semibold mt-0.5 ${gain_brl! >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {gain_brl! >= 0 ? '+' : ''}{fmt(gain_brl!, 0)}
              {gain_pct != null && (
                <span className="ml-1.5 text-[10px] opacity-75">({gain_brl! >= 0 ? '+' : ''}{gain_pct.toFixed(1)}%)</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
