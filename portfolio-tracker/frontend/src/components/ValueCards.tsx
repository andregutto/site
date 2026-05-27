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
    if (val == null) return 'rgba(13,13,13,0.45)'
    return val >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)'
  }

  const periodVal = period_pct !== undefined ? period_pct : ytd_pct
  const periodLbl = period_label ?? t.dashboard.yearLabel.replace('{year}', ytd_year ?? '')

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--arvo-font-body)",
    fontSize: 11,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    color: 'rgba(13,13,13,0.62)',
  }

  return (
    <div style={{ background: '#FFFFFF', color: 'var(--arvo-fg)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden', border: '1px solid rgba(200,184,154,0.35)', boxShadow: '0 4px 24px rgba(200,184,154,0.18), 0 1px 0 rgba(200,184,154,0.22)' }}>

      {/* Gold glow — top-right */}
      <div style={{ position: 'absolute', top: -120, right: -60, width: 360, height: 360, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      {/* Gold glow — bottom-left */}
      <div style={{ position: 'absolute', bottom: -80, left: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(200,184,154,0.07)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      {/* Gold shimmer line at top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.65), transparent)', pointerEvents: 'none' }} />

      {/* Top row */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, zIndex: 2 }}>
        <div>
          <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--arvo-gold-text)', margin: 0 }}>
            Total {currency}
          </p>
          <p className="text-[36px] sm:text-[56px]" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.02em', lineHeight: 1.05, color: 'var(--arvo-black)', margin: '12px 0 0' }}>
            {fmt(total_brl, 0)}
          </p>
        </div>
        <p className="hidden sm:block" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.58)', marginTop: 4, whiteSpace: 'nowrap' }}>
          {t.dashboard.updatedAt.replace('{time}', ts)}
        </p>
      </div>

      {/* KPI grid */}
      {showSecondary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6" style={{ position: 'relative', zIndex: 2, marginTop: 24, paddingTop: 22, borderTop: '1px solid rgba(13,13,13,0.08)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.invested}</span>
            <span className="text-base sm:text-lg" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>{fmt(invested_brl!, 0)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.result}</span>
            <span className="text-base sm:text-lg" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', color: pctColor(gain_brl) }}>
              {gain_brl! >= 0 ? '+' : ''}{fmt(gain_brl!, 0)}
              {gain_pct != null && <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 4 }}>({gain_brl! >= 0 ? '+' : ''}{gain_pct.toFixed(1)}%)</span>}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.currentMonth}</span>
            <span className="text-base sm:text-lg" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', color: pctColor(month_pct) }}>{pctText(month_pct)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{periodLbl}</span>
            <span className="text-base sm:text-lg" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', color: pctColor(periodVal) }}>{pctText(periodVal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
