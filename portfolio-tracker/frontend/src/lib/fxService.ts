// Todas as chamadas passam pelo backend Express em /api/fx
// que por sua vez chama a AwesomeAPI server-side (sem CORS).

export type Currency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'JPY'
export type CurrencyPair = `${Currency}-${Currency}`

export interface FxRate {
  from: string
  to: string
  rate: number
  timestamp: number
  date: string
}

export interface FxHistoryPoint {
  date: string   // YYYY-MM-DD
  rate: number
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/fx${path}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Cotações atuais para um ou mais pares. Ex: ['USD-BRL', 'EUR-BRL'] */
export async function getCurrentRates(pairs: CurrencyPair[]): Promise<FxRate[]> {
  return apiFetch<FxRate[]>(`/current?pairs=${pairs.join(',')}`)
}

/** Cotação atual de um único par. */
export async function getRate(pair: CurrencyPair): Promise<number> {
  const [result] = await getCurrentRates([pair])
  return result.rate
}

/** Histórico diário de um par (últimos N dias). */
export async function getHistoricalRates(
  pair: CurrencyPair,
  days: number
): Promise<FxHistoryPoint[]> {
  return apiFetch<FxHistoryPoint[]>(`/historical?pair=${pair}&days=${days}`)
}

/** Histórico em intervalo de datas (YYYYMMDD). */
export async function getRatesInRange(
  pair: CurrencyPair,
  startDate: string,
  endDate: string
): Promise<FxHistoryPoint[]> {
  return apiFetch<FxHistoryPoint[]>(`/range?pair=${pair}&start=${startDate}&end=${endDate}`)
}

/** Converte valor entre moedas usando cotação atual. */
export async function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency
): Promise<number> {
  if (from === to) return amount

  if (to === 'BRL') {
    const rate = await getRate(`${from}-BRL` as CurrencyPair)
    return amount * rate
  }
  if (from === 'BRL') {
    const rate = await getRate(`${to}-BRL` as CurrencyPair)
    return amount / rate
  }
  // Ex: USD → EUR via BRL como intermediário
  const [fromRate, toRate] = await Promise.all([
    getRate(`${from}-BRL` as CurrencyPair),
    getRate(`${to}-BRL` as CurrencyPair),
  ])
  return (amount * fromRate) / toRate
}
