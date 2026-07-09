import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import pt from '../i18n/pt.json'
import en from '../i18n/en.json'
import fr from '../i18n/fr.json'
import { supabase } from '../lib/supabase'

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

function validLocale(v: unknown): v is Locale {
  return v === 'pt' || v === 'en' || v === 'fr'
}

/* Locale sem contexto — usado no initializer do provider e por código que
   roda fora/abaixo de um I18nProvider quebrado (ex.: ErrorBoundary). */
export function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (validLocale(stored)) return stored
  const browser = navigator.language.slice(0, 2).toLowerCase()
  if (browser === 'fr') return 'fr'
  if (browser === 'en') return 'en'
  return 'pt'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const hadStoredLocale = validLocale(localStorage.getItem(STORAGE_KEY))

  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  // Sync locale from user_metadata only when this device has no explicit local choice yet
  // (e.g. first login on a new device). Never let a stale/failed server value stomp an
  // explicit local pick — that previously caused the language to silently revert.
  useEffect(() => {
    if (hadStoredLocale) return
    supabase.auth.getUser().then(({ data }) => {
      const server = data.user?.user_metadata?.preferred_locale
      if (validLocale(server)) {
        setLocaleState(server)
        localStorage.setItem(STORAGE_KEY, server)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount — after this, locale changes come from user interaction

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem(STORAGE_KEY, l)
    // Persist to Supabase so every device/session gets the same preference.
    // localStorage is the source of truth for this device regardless of whether this succeeds.
    supabase.auth.updateUser({ data: { preferred_locale: l } }).catch(err => {
      console.warn('[i18n] failed to persist locale preference to server:', err)
    })
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
