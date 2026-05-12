import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import pt from '../i18n/pt.json'
import en from '../i18n/en.json'
import fr from '../i18n/fr.json'

export type Locale = 'pt' | 'en' | 'fr'

const TRANSLATIONS = { pt, en, fr } as const

type DeepString<T> = T extends string ? string : { [K in keyof T]: DeepString<T[K]> }
type Translations = DeepString<typeof pt>

interface I18nCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: Translations
}

const I18nContext = createContext<I18nCtx | null>(null)

const STORAGE_KEY = 'portfolio-locale'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'pt' || stored === 'en' || stored === 'fr') return stored
    const browser = navigator.language.slice(0, 2).toLowerCase()
    if (browser === 'fr') return 'fr'
    if (browser === 'en') return 'en'
    return 'pt'
  })

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = TRANSLATIONS[locale] as Translations

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}
