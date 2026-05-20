import { useCurrency } from '../contexts/CurrencyContext'

interface Props {
  total_brl: number
  generated_at: string
  invested_brl?: number | null
  gain_brl?: number | null
  gain_pct?: number | null
  month_pct?: number | null
  ytd_pct?: number | null
  ytd_year?: string
  chartLoading?: boolean
}

export default function ValueCards({ total_brl, generated_at, invested_brl, gain_brl, gain_pct, month_pct, ytd_pct, ytd_year, chartLoading }: Props) {
  const { currency, fmt } = useCurrency()
  const ts = new Date(generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const showSecondary = invested_brl != null && gain_brl != null

  function pctText(val: number | null | undefined) {
    if (val == null) return chartLoading ? '...' : '—'
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
  }

  function pctColor(val: number | null | undefined) {
    if (val == null) return 'text-blue-300'
    return val >= 0 ? 'text-emerald-300' : 'text-red-300'
  }

  return (
    <div className="bg-gradient-to-br from-[#0A0F1E] to-[#001A70] text-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Total {currency}</p>
          <p className="text-4xl font-bold mt-2 leading-tight">{fmt(total_brl, 0)}</p>
        </div>
        <p className="text-blue-300 text-[11px] mt-1">atualizado {ts}</p>
      </div>

      {showSecondary && (
        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-medium">Investido</p>
            <p className="text-base font-semibold mt-0.5">{fmt(invested_brl!, 0)}</p>
          </div>
          <div>
            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-medium">Resultado</p>
            <p className={`text-base font-semibold mt-0.5 ${gain_brl! >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {gain_brl! >= 0 ? '+' : ''}{fmt(gain_brl!, 0)}
              {gain_pct != null && (
                <span className="ml-1 text-[11px] opacity-75">({gain_brl! >= 0 ? '+' : ''}{gain_pct.toFixed(1)}%)</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-medium">Mês atual</p>
            <p className={`text-base font-semibold mt-0.5 ${pctColor(month_pct)}`}>{pctText(month_pct)}</p>
          </div>
          <div>
            <p className="text-blue-300 text-[10px] uppercase tracking-wide font-medium">Ano {ytd_year}</p>
            <p className={`text-base font-semibold mt-0.5 ${pctColor(ytd_pct)}`}>{pctText(ytd_pct)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
