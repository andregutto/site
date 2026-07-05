import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../lib/api'

export type Currency = 'BRL' | 'USD' | 'EUR'

export interface FxRates {
  USD: number  // BRL por 1 USD
  EUR: number  // BRL por 1 EUR
  [key: string]: number
}

export interface FxRateDates {
  USD?: string  // data de referência (YYYY-MM-DD) da cotação usada
  EUR?: string
  [key: string]: string | undefined
}

interface CurrencyContextValue {
  currency: Currency
  setCurrency: (c: Currency) => void
  fxRates: FxRates
  fxRateDates: FxRateDates
  /** Converte valor em BRL para a moeda selecionada */
  convert: (valueBrl: number) => number
  /** Formata valor em BRL na moeda selecionada. Retorna "•••" quando hideValues=true */
  fmt: (valueBrl: number, decimals?: number) => string
  /** Símbolo da moeda selecionada */
  symbol: string
  /** Se true, valores monetários são ocultados */
  hideValues: boolean
  toggleHideValues: () => void
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

const SYMBOLS: Record<Currency, string> = { BRL: 'R$', USD: 'US$', EUR: '€' }

const FX_LS_KEY = 'arvo_fx_rates_v1'

interface StoredFx { rates: FxRates; dates: FxRateDates; fetchedAt: number }

function loadStoredFx(): StoredFx | null {
  try {
    const raw = localStorage.getItem(FX_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredFx
    if (typeof parsed?.rates?.USD !== 'number' || typeof parsed?.rates?.EUR !== 'number') return null
    return parsed
  } catch { return null }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(
    () => (localStorage.getItem('preferredCurrency') as Currency | null) ?? 'BRL'
  )
  // Boot from the last good rates instead of the hardcoded approximation —
  // a single failed fetch used to leave the whole session converting at
  // EUR 6.40 (≈ €20k off on the dashboard total).
  const [fxRates, setFxRates] = useState<FxRates>(() => loadStoredFx()?.rates ?? { USD: 5.70, EUR: 6.40 })
  const [fxRateDates, setFxRateDates] = useState<FxRateDates>(() => loadStoredFx()?.dates ?? {})
  const [hideValues, setHideValues] = useState<boolean>(
    () => localStorage.getItem('arvo_hide_values') === '1'
  )

  useEffect(() => {
    let disposed = false
    let lastSuccess = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    async function fetchRates(attempt = 0) {
      try {
        const rates = await apiFetch<Array<{ from: string; rate: number | string; date?: string }>>(
          '/fx/current?pairs=USD-BRL,EUR-BRL'
        )
        if (disposed) return
        const usd = rates.find(r => r.from === 'USD')
        const eur = rates.find(r => r.from === 'EUR')
        const usdRate = Number(usd?.rate)
        const eurRate = Number(eur?.rate)
        if (!(usdRate > 0) || !(eurRate > 0)) throw new Error('invalid fx payload')
        const next: FxRates = { USD: usdRate, EUR: eurRate }
        const nextDates: FxRateDates = {
          USD: usd?.date ? String(usd.date).split('T')[0] : undefined,
          EUR: eur?.date ? String(eur.date).split('T')[0] : undefined,
        }
        lastSuccess = Date.now()
        setFxRates(next)
        setFxRateDates(nextDates)
        try { localStorage.setItem(FX_LS_KEY, JSON.stringify({ rates: next, dates: nextDates, fetchedAt: lastSuccess })) } catch { /* quota */ }
      } catch {
        if (disposed || attempt >= 4) return
        retryTimer = setTimeout(() => fetchRates(attempt + 1), 2000 * 2 ** attempt)
      }
    }

    fetchRates()

    // PWA resumes from background with stale state — refresh when the app
    // regains focus if the current rates are older than 10 minutes.
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastSuccess > 10 * 60_000) {
        fetchRates()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c)
    localStorage.setItem('preferredCurrency', c)
  }, [])

  const toggleHideValues = useCallback(() => {
    setHideValues(prev => {
      const next = !prev
      localStorage.setItem('arvo_hide_values', next ? '1' : '0')
      return next
    })
  }, [])

  const convert = useCallback((valueBrl: number): number => {
    if (currency === 'BRL') return valueBrl
    if (currency === 'USD') return valueBrl / fxRates.USD
    return valueBrl / fxRates.EUR
  }, [currency, fxRates])

  const fmt = useCallback((valueBrl: number, decimals = 2): string => {
    if (hideValues) return '•••'
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(convert(valueBrl))
  }, [currency, convert, hideValues])

  return (
    <CurrencyContext.Provider value={{
      currency, setCurrency, fxRates, fxRateDates, convert, fmt,
      symbol: SYMBOLS[currency],
      hideValues, toggleHideValues,
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be inside CurrencyProvider')
  return ctx
}
