import { useI18n, type Locale } from '../contexts/I18nContext'

const LOCALES: { value: Locale; flag: string }[] = [
  { value: 'pt', flag: '🇧🇷' },
  { value: 'en', flag: '🇺🇸' },
  { value: 'fr', flag: '🇫🇷' },
]

export default function LanguageSelector() {
  const { locale, setLocale } = useI18n()
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0">
      {LOCALES.map(l => (
        <button
          key={l.value}
          onClick={() => setLocale(l.value)}
          title={l.value.toUpperCase()}
          className={`px-2 py-1 text-sm rounded-md transition-colors ${
            locale === l.value ? 'bg-white shadow-sm opacity-100' : 'opacity-40 hover:opacity-70'
          }`}
        >
          {l.flag}
        </button>
      ))}
    </div>
  )
}
