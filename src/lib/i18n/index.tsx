'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { fr, type TranslationKey } from './fr'
import { pt } from './pt'

export type Locale = 'fr' | 'pt'
const translations = { fr, pt }

interface I18nContextType {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextType>({
  locale: 'fr',
  setLocale: () => {},
  t: (key) => fr[key],
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr')

  useEffect(() => {
    const saved = localStorage.getItem('sq-locale') as Locale | null
    if (saved === 'fr' || saved === 'pt') setLocaleState(saved)
  }, [])

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('sq-locale', l)
  }

  function t(key: TranslationKey): string {
    return translations[locale][key] ?? fr[key] ?? key
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  return useContext(I18nContext)
}
