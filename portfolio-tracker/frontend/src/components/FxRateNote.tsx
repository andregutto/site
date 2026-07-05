import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'

/* Small "1 EUR = R$ 5,95" note shown wherever converted values appear.
   Turns into a gold pill with the reference date when the rate is stale
   (source APIs down and we're using a saved rate from a previous day). */
export default function FxRateNote({ style }: { style?: React.CSSProperties }) {
  const { currency, fxRates, fxRateDates } = useCurrency()
  const { locale } = useI18n()
  if (currency === 'BRL') return null

  const fxDate = fxRateDates[currency]
  const fxIsStale = !!fxDate && fxDate !== new Date().toISOString().split('T')[0]

  return (
    <p
      title={fxIsStale ? `Cotação de ${new Date(fxDate + 'T00:00:00').toLocaleDateString(locale)} — a fonte atual pode estar indisponível` : undefined}
      style={fxIsStale
        ? { fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, fontWeight: 600, color: 'var(--arvo-gold-text)', background: 'var(--arvo-ocre-tint)', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', margin: 0, ...style }
        : { fontFamily: 'var(--arvo-font-body)', fontSize: 9.5, color: 'var(--arvo-fg-soft)', whiteSpace: 'nowrap', margin: 0, ...style }
      }
    >
      1 {currency} = R$ {(fxRates[currency] ?? 0).toFixed(2)}
      {fxIsStale && ` (${new Date(fxDate + 'T00:00:00').toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })})`}
    </p>
  )
}
