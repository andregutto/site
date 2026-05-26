import { useI18n, type Locale } from '../contexts/I18nContext'

const LOCALES: { value: Locale; flag: string }[] = [
  { value: 'pt', flag: '🇧🇷' },
  { value: 'en', flag: '🇺🇸' },
  { value: 'fr', flag: '🇫🇷' },
]

export default function LanguageSelector() {
  const { locale, setLocale } = useI18n()
  return (
    <div className="flex items-center rounded-full p-0.5 gap-0" style={{ background: 'rgba(13,13,13,0.07)' }}>
      {LOCALES.map(l => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          title={l.value.toUpperCase()}
          className={`px-2 py-1 text-sm rounded-full transition-all ${
            locale === l.value ? 'shadow-sm opacity-100' : 'opacity-40 hover:opacity-70'
          }`}
          style={locale === l.value ? { background: 'var(--arvo-offwhite)' } : {}}
        >
          {l.flag}
        </button>
      ))}
    </div>
  )
}
