import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { apiFetch } from '../lib/api'

export type Currency = 'BRL' | 'USD' | 'EUR'

export interface FxRates {
  USD: number  // BRL por 1 USD
  EUR: number  // BRL por 1 EUR
}

interface CurrencyContextValue {
  currency: Currency
  setCurrency: (c: Currency) => void
  fxRates: FxRates
  /** Converte valor em BRL para a moeda selecionada */
  convert: (valueBrl: number) => number
  /** Formata valor em BRL na moeda selecionada */
  fmt: (valueBrl: number, decimals?: number) => string
  /** Símbolo da moeda selecionada */
  symbol: string
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

const SYMBOLS: Record<Currency, string> = { BRL: 'R$', USD: 'US$', EUR: '€' }

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(
    () => (localStorage.getItem('preferredCurrency') as Currency | null) ?? 'BRL'
  )
  const [fxRates, setFxRates] = useState<FxRates>({ USD: 5.70, EUR: 6.40 })

  useEffect(() => {
    apiFetch<Array<{ from: string; rate: number }>>('/fx/current?pairs=USD-BRL,EUR-BRL')
      .then(rates => {
        const usd = rates.find(r => r.from === 'USD')?.rate
        const eur = rates.find(r => r.from === 'EUR')?.rate
        setFxRates({ USD: usd ?? 5.70, EUR: eur ?? 6.40 })
      })
      .catch(() => {})
  }, [])

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c)
    localStorage.setItem('preferredCurrency', c)
  }, [])

  const convert = useCallback((valueBrl: number): number => {
    if (currency === 'BRL') return valueBrl
    if (currency === 'USD') return valueBrl / fxRates.USD
    return valueBrl / fxRates.EUR
  }, [currency, fxRates])

  const fmt = useCallback((valueBrl: number, decimals = 2): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(convert(valueBrl))
  }, [currency, convert])

  return (
    <CurrencyContext.Provider value={{
      currency, setCurrency, fxRates, convert, fmt,
      symbol: SYMBOLS[currency],
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
