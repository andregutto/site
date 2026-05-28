import * as brapi       from './brapiService.js'
import * as yahoo       from './yahooService.js'
import * as coingecko   from './coingeckoService.js'
import { calculateCurrentValue } from './fixedIncomeService.js'
import type { FixedIncomeAsset, FITranche } from './fixedIncomeService.js'

export interface Asset {
  id:           number
  asset_type:   'ticker' | 'fixed_income' | 'manual'
  currency:     string
  ticker_brapi: string | null
  ticker_yahoo: string | null
  coingecko_id: string | null
  fi_principal:  number | null
  fi_start_date: string | null
  fi_type:       string | null
  fi_rate:       number | null
  fi_spread:     number | null
}

export interface PriceResult {
  price:    number
  currency: string
  source:   string
}

export interface PricePoint {
  date:     string
  price:    number
  currency: string
}

export type { FITranche }

export async function getCurrentPrice(asset: Asset, tranches?: FITranche[], refDate?: Date): Promise<PriceResult> {
  if (asset.asset_type === 'fixed_income') {
    if (!asset.fi_type || (asset.fi_type !== 'ipca_plus' && asset.fi_rate == null)) {
      throw new Error(`Dados de RF incompletos para asset ${asset.id}`)
    }
    if (!tranches?.length && (!asset.fi_principal || !asset.fi_start_date)) {
      throw new Error(`Dados de RF incompletos para asset ${asset.id}`)
    }
    const value = await calculateCurrentValue(asset as FixedIncomeAsset, tranches, refDate)
    return { price: value, currency: asset.currency, source: 'bcb' }
  }

  if (asset.asset_type === 'manual') {
    throw new Error('Ativos manuais não têm cotação automática')
  }

  if (asset.ticker_brapi) {
    try {
      const price = await brapi.getCurrentPrice(asset.ticker_brapi)
      return { price, currency: 'BRL', source: 'brapi' }
    } catch {
      // fallthrough
    }
  }

  if (asset.coingecko_id) {
    try {
      const currency = (asset.currency || 'USD').toLowerCase()
      const price = await coingecko.getCurrentPrice(asset.coingecko_id, currency)
      return { price, currency: asset.currency || 'USD', source: 'coingecko' }
    } catch {
      // fallthrough
    }
  }

  if (asset.ticker_yahoo) {
    try {
      const price = await yahoo.getCurrentPrice(asset.ticker_yahoo)
      return { price, currency: asset.currency || 'USD', source: 'yahoo' }
    } catch {
      // fallthrough
    }
  }

  throw new Error(`Asset ${asset.id}: nenhuma fonte de preço configurada`)
}

export async function getDailyHistory(asset: Asset, days = 365): Promise<PricePoint[]> {
  if (asset.asset_type !== 'ticker') {
    throw new Error('Histórico de preços só disponível para assets tipo ticker')
  }

  if (asset.ticker_yahoo) {
    try {
      const pts = await yahoo.getDailyHistory(asset.ticker_yahoo, days)
      if (pts.length > 0) return pts.map(p => ({ ...p, currency: asset.currency || 'USD' }))
    } catch { /* fallthrough */ }
  }

  if (asset.ticker_brapi) {
    try {
      const pts = await brapi.getDailyHistory(asset.ticker_brapi, days)
      return pts.map(p => ({ ...p, currency: 'BRL' }))
    } catch { /* fallthrough */ }
  }

  if (asset.coingecko_id) {
    const currency = (asset.currency || 'USD').toLowerCase()
    const pts = await coingecko.getDailyHistory(asset.coingecko_id, days, currency)
    return pts.map(p => ({ ...p, currency: asset.currency || 'USD' }))
  }

  throw new Error(`Asset ${asset.id}: nenhuma fonte de histórico diário configurada`)
}

export async function getMonthlyHistory(asset: Asset, months = 24): Promise<PricePoint[]> {
  if (asset.asset_type !== 'ticker') {
    throw new Error('Histórico de preços só disponível para assets tipo ticker')
  }

  if (asset.ticker_yahoo) {
    try {
      const pts = await yahoo.getMonthlyHistory(asset.ticker_yahoo, months)
      if (pts.length > 0) return pts.map((p) => ({ ...p, currency: asset.currency || 'USD' }))
    } catch {
      // fallthrough
    }
  }

  if (asset.ticker_brapi) {
    try {
      const pts = await brapi.getMonthlyHistory(asset.ticker_brapi, months)
      return pts.map((p) => ({ ...p, currency: 'BRL' }))
    } catch {
      // fallthrough
    }
  }

  if (asset.coingecko_id) {
    const currency = (asset.currency || 'USD').toLowerCase()
    const pts = await coingecko.getMonthlyHistory(asset.coingecko_id, months, currency)
    return pts.map((p) => ({ ...p, currency: asset.currency || 'USD' }))
  }

  throw new Error(`Asset ${asset.id}: nenhuma fonte de histórico configurada`)
}
