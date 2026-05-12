import { cache, TTL } from '../_lib/cache.js'

const BASE = 'https://api.bcb.gov.br/dados/serie'

export const SERIES = { CDI: 12, IPCA: 433, SELIC: 1178 } as const

export interface BCBRate {
  date: Date
  value: number
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function parseDate(str: string): Date {
  const parts = str.split('/')
  if (parts.length === 2) {
    return new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1)
  }
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
}

export async function getRates(
  series: number,
  startDate: Date,
  endDate: Date
): Promise<BCBRate[]> {
  const key = `bcb:${series}:${fmtDate(startDate)}:${fmtDate(endDate)}`
  return cache.getOrFetch(key, TTL.BCB_RATES, async () => {
    const url = `${BASE}/bcdata.sgs.${series}/dados?formato=json` +
                `&dataInicial=${fmtDate(startDate)}&dataFinal=${fmtDate(endDate)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`BCB API ${res.status} para série ${series}`)

    const data = await res.json() as Array<{ data: string; valor: string }>
    return data.map((row) => ({
      date:  parseDate(row.data),
      value: parseFloat(row.valor.replace(',', '.')),
    }))
  })
}

export async function getCDIRates(start: Date, end: Date): Promise<BCBRate[]> {
  return getRates(SERIES.CDI, start, end)
}

export async function getIPCARates(start: Date, end: Date): Promise<BCBRate[]> {
  try {
    return await getRates(SERIES.IPCA, start, end)
  } catch {
    const annualPct = await cache.getOrFetch('brasilapi:ipca_current', 6 * 60 * 60 * 1000, async () => {
      const res = await fetch('https://brasilapi.com.br/api/taxas/v1/ipca')
      if (!res.ok) throw new Error(`BrasilAPI taxas ${res.status}`)
      const json = await res.json() as { nome: string; valor: number }
      return json.valor
    })
    const monthlyPct = Math.pow(1 + annualPct / 100, 1 / 12) - 1
    const months: BCBRate[] = []
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d <= end) {
      months.push({ date: new Date(d), value: monthlyPct * 100 })
      d.setMonth(d.getMonth() + 1)
    }
    return months
  }
}

export async function getSelicRates(start: Date, end: Date): Promise<BCBRate[]> {
  return getRates(SERIES.SELIC, start, end)
}
