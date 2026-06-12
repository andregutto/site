import { useI18n, type Locale } from '../contexts/I18nContext'

const LOCALES: Locale[] = ['pt', 'en', 'fr']

/* D8: typographic selector — PT · EN · FR. Active = full ink + gold
   underline; tokens only, so it flips with .dark in the app shell. */
export default function LanguageSelector() {
  const { locale, setLocale } = useI18n()
  return (
    <div className="flex items-center" role="group" aria-label="Language">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && (
            <span aria-hidden="true" style={{ color: 'var(--arvo-fg-faint)', fontSize: 11, padding: '0 7px' }}>·</span>
          )}
          <button
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 1px 2px',
              fontFamily: 'var(--arvo-font-body)',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: locale === l ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
              borderBottom: locale === l ? '1px solid var(--arvo-gold)' : '1px solid transparent',
              transition: 'color var(--arvo-dur-fast) var(--arvo-ease), border-color var(--arvo-dur-fast) var(--arvo-ease)',
            }}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  )
}
