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

  function pctColor(val: number | null | undefined): string {
    if (val == null) return 'rgba(200,184,154,0.6)'
    return val >= 0 ? 'var(--arvo-green-on-dark)' : '#f08070'
  }

  const periodVal = period_pct !== undefined ? period_pct : ytd_pct
  const periodLbl = period_label ?? t.dashboard.yearLabel.replace('{year}', ytd_year ?? '')

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Tenor Sans', sans-serif",
    fontSize: 9,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(200,184,154,0.60)',
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #0D0D0D 0%, #1B1815 60%, #28221B 100%)', color: 'var(--arvo-fg-on-dark)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden' }}>

      {/* Gold glow */}
      <div style={{ position: 'absolute', top: -120, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      {/* Top row */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, zIndex: 2 }}>
        <div>
          <p style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--arvo-gold)', opacity: 0.75, margin: 0 }}>
            Total {currency}
          </p>
          <p style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 56, letterSpacing: '0.02em', lineHeight: 1.05, marginTop: 12, color: 'var(--arvo-fg-on-dark)', margin: '12px 0 0' }}>
            {fmt(total_brl, 0)}
          </p>
        </div>
        <p style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.50)', marginTop: 4, whiteSpace: 'nowrap' }}>
          {t.dashboard.updatedAt.replace('{time}', ts)}
        </p>
      </div>

      {/* KPI grid */}
      {showSecondary && (
        <div style={{ position: 'relative', zIndex: 2, marginTop: 24, paddingTop: 22, borderTop: '1px solid rgba(200,184,154,0.18)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.invested}</span>
            <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: 'var(--arvo-fg-on-dark)' }}>{fmt(invested_brl!, 0)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.result}</span>
            <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: pctColor(gain_brl) }}>
              {gain_brl! >= 0 ? '+' : ''}{fmt(gain_brl!, 0)}
              {gain_pct != null && <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 4 }}>({gain_brl! >= 0 ? '+' : ''}{gain_pct.toFixed(1)}%)</span>}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.currentMonth}</span>
            <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: pctColor(month_pct) }}>{pctText(month_pct)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{periodLbl}</span>
            <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 18, letterSpacing: '0.04em', color: pctColor(periodVal) }}>{pctText(periodVal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
