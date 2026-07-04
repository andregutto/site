import type React from 'react'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'

interface Props {
  total_brl: number
  generated_at: string
  invested_brl?: number | null
  gain_brl?: number | null
  gain_pct?: number | null
  period_abs?: number | null
  chartLoading?: boolean
  period_pct?: number | null
  period_label?: string
}

export default function ValueCards({ total_brl, generated_at, invested_brl, gain_brl, gain_pct, period_abs, chartLoading, period_pct, period_label }: Props) {
  const { currency, fmt, fxRates, fxRateDates, hideValues } = useCurrency()
  const { t, locale } = useI18n()
  const ts = new Date(generated_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const fxDate = fxRateDates[currency]
  const fxIsStale = !!fxDate && fxDate !== new Date().toISOString().split('T')[0]
  const showSecondary = invested_brl != null && gain_brl != null

  function pctText(val: number | null | undefined) {
    if (hideValues) return '•••'
    if (val == null) return chartLoading ? '...' : '—'
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
  }

  function pctClass(val: number | null | undefined): string {
    if (val == null) return ''
    return val >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'
  }

  function pctStyle(val: number | null | undefined): React.CSSProperties {
    return val == null ? { color: 'var(--arvo-fg-faint)' } : {}
  }

  const periodVal = period_pct !== undefined ? period_pct : null
  const periodLbl = period_label ?? 'YTD'

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--arvo-font-body)",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    color: 'var(--arvo-fg-soft)',
    whiteSpace: 'nowrap',
  }

  return (
    <div className="h-full" style={{ background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden', border: '1px solid rgba(200,184,154,0.35)', boxShadow: '0 4px 24px rgba(200,184,154,0.18), 0 1px 0 rgba(200,184,154,0.22)' }}>

      {/* Gold glow — top-right (only glow on this screen, §3.4) */}
      <div style={{ position: 'absolute', top: -120, right: -60, width: 360, height: 360, borderRadius: '50%', background: 'rgba(200,184,154,0.10)', filter: 'blur(70px)', pointerEvents: 'none' }} />
      {/* Gold shimmer line at top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.65), transparent)', pointerEvents: 'none' }} />

      {/* Top row */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, zIndex: 2 }}>
        <div>
          <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-gold-text)', margin: 0 }}>
            Total {currency}
          </p>
          <p className="arvo-num text-[28px] sm:text-[44px]" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.02em', lineHeight: 1.05, color: 'var(--arvo-fg)', margin: '6px 0 0' }}>
            {fmt(total_brl, 0)}
          </p>
        </div>
        <div className="hidden sm:flex" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 3, marginTop: 4 }}>
          <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', whiteSpace: 'nowrap', margin: 0 }}>
            {t.dashboard.updatedAt.replace('{time}', ts)}
          </p>
          {currency !== 'BRL' && (
            <p
              title={fxIsStale ? `Cotação de ${new Date(fxDate + 'T00:00:00').toLocaleDateString(locale)} — a fonte atual pode estar indisponível` : undefined}
              style={{ fontFamily: "var(--arvo-font-body)", fontSize: 9.5, color: fxIsStale ? 'var(--arvo-ocre, #E8A020)' : 'var(--arvo-fg-faint)', whiteSpace: 'nowrap', margin: 0 }}
            >
              1 {currency} = R$ {(fxRates[currency] ?? 0).toFixed(2)}
              {fxIsStale && ` (${new Date(fxDate + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })})`}
            </p>
          )}
        </div>
      </div>

      {/* KPI grid */}
      {showSecondary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 2xl:gap-0" style={{ position: 'relative', zIndex: 2, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--arvo-border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>{t.dashboard.invested}</span>
            <span className="arvo-num text-base sm:text-lg" style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>{fmt(invested_brl!, 0)}</span>
          </div>
          <div className="2xl:border-l 2xl:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
            <span style={labelStyle}>{t.dashboard.result}</span>
            <span className={`arvo-num text-base sm:text-lg ${pctClass(gain_brl)}`} style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', ...pctStyle(gain_brl) }}>
              {gain_brl! >= 0 ? '+' : ''}{fmt(gain_brl!, 0)}
              {gain_pct != null && !hideValues && <span style={{ fontSize: 12, opacity: 0.75, marginLeft: 4 }}>({gain_brl! >= 0 ? '+' : ''}{gain_pct.toFixed(1)}%)</span>}
            </span>
          </div>
          <div className="2xl:border-l 2xl:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
            <span style={labelStyle}>{t.dashboard.periodGainBrl} · {periodLbl}</span>
            <span className={`arvo-num text-base sm:text-lg ${pctClass(period_abs)}`} style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', ...pctStyle(period_abs) }}>
              {period_abs != null
                ? `${period_abs >= 0 ? '+' : ''}${fmt(period_abs, 0)}`
                : chartLoading ? '...' : '—'}
            </span>
          </div>
          <div className="2xl:border-l 2xl:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
            <span style={labelStyle}>{periodLbl} %</span>
            <span className={`arvo-num text-base sm:text-lg ${pctClass(periodVal)}`} style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.04em', ...pctStyle(periodVal) }}>{pctText(periodVal)}</span>
          </div>
        </div>
      )}

    </div>
  )
}
