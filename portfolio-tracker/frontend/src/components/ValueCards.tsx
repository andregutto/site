import type React from 'react'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'

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
  period_pct?: number | null
  period_label?: string
}

export default function ValueCards({ total_brl, generated_at, invested_brl, gain_brl, gain_pct, month_pct, ytd_pct, ytd_year, chartLoading, period_pct, period_label }: Props) {
  const { currency, fmt } = useCurrency()
  const { t, locale } = useI18n()
  const ts = new Date(generated_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const showSecondary = invested_brl != null && gain_brl != null

  function pctText(val: number | null | undefined) {
    if (val == null) return chartLoading ? '...' : '—'
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
  }

  function pctStyle(val: number | null | undefined): React.CSSProperties {
    if (val == null) return { color: 'rgba(200,184,154,0.6)' }
    return { color: val >= 0 ? 'var(--arvo-green-on-dark)' : '#f08070' }
  }

  const labelStyle: React.CSSProperties = { fontFamily: "'Tenor Sans', sans-serif", color: 'rgba(200,184,154,0.6)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }
  const valueStyle: React.CSSProperties = { color: '#fff', fontFamily: "'Tenor Sans', sans-serif" }

  return (
    <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #111 0%, #0D0D0D 100%)', color: '#fff' }}>
      <div className="flex items-start justify-between">
        <div>
          <p style={labelStyle}>Total {currency}</p>
          <p className="mt-2 leading-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontSize: 36, fontWeight: 700, color: '#fff' }}>{fmt(total_brl, 0)}</p>
        </div>
        <p className="text-[11px] mt-1" style={{ color: 'rgba(200,184,154,0.45)' }}>{t.dashboard.updatedAt.replace('{time}', ts)}</p>
      </div>

      {showSecondary && (
        <div className="mt-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ borderTop: '1px solid rgba(200,184,154,0.12)' }}>
          <div>
            <p style={labelStyle}>{t.dashboard.invested}</p>
            <p className="text-base mt-0.5" style={valueStyle}>{fmt(invested_brl!, 0)}</p>
          </div>
          <div>
            <p style={labelStyle}>{t.dashboard.result}</p>
            <p className="text-base mt-0.5" style={{ ...pctStyle(gain_brl), fontFamily: "'Tenor Sans', sans-serif" }}>
              {gain_brl! >= 0 ? '+' : ''}{fmt(gain_brl!, 0)}
              {gain_pct != null && (
                <span className="ml-1 text-[11px] opacity-75">({gain_brl! >= 0 ? '+' : ''}{gain_pct.toFixed(1)}%)</span>
              )}
            </p>
          </div>
          <div>
            <p style={labelStyle}>{t.dashboard.currentMonth}</p>
            <p className="text-base mt-0.5" style={{ ...pctStyle(month_pct), fontFamily: "'Tenor Sans', sans-serif" }}>{pctText(month_pct)}</p>
          </div>
          <div>
            <p style={labelStyle}>
              {period_label ?? t.dashboard.yearLabel.replace('{year}', ytd_year ?? '')}
            </p>
            <p className="text-base mt-0.5" style={{ ...pctStyle(period_pct !== undefined ? period_pct : ytd_pct), fontFamily: "'Tenor Sans', sans-serif" }}>
              {pctText(period_pct !== undefined ? period_pct : ytd_pct)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
