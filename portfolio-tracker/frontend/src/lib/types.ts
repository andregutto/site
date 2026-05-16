export interface MergedOp {
  date: string
  ticker: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  value_brl: number
  institution: string
}

export interface PortfolioAsset {
  id: number
  code: string
  name: string
  value_brl: number
  value_orig: number
  currency: string
  class_id: number | null
  class_name: string
  class_color: string
  class_icon?: string | null
  holdings: number | null
  price: number | null
  source: string
  needs_manual: boolean
  invested_brl: number | null
  last_manual_date: string | null
  fi_type?: string | null
  fi_start_date?: string | null
  fi_rate?: number | null
  fi_spread?: number | null
  fi_maturity?: string | null
  exchange?: string | null
}

export interface ManualValue {
  id: number
  ref_date: string
  value: number
  currency: string
  notes: string | null
  created_at: string
}

export interface PortfolioClass {
  name: string
  color: string
  value_brl: number
  pct: number
}

export interface PortfolioValue {
  total_brl: number
  total_usd: number | null
  total_eur: number | null
  by_class: PortfolioClass[]
  by_asset: PortfolioAsset[]
  generated_at: string
}

export interface PerformanceSummary {
  from: string
  to: string
  value_start: number
  value_end: number
  contributions: number
  return_abs: number
  return_pct: number | null
  note?: string
}

export interface MonthlyDetailItem {
  asset_id: number
  code: string
  name: string
  value: number
  prev_value: number
  contributions: number
  gain: number
}

export interface MonthlyPerf {
  month: string
  total: number
  prev_total: number
  contributions: number
  detail?: MonthlyDetailItem[]
}

export interface PerformanceMonthly {
  year?: number
  monthly: MonthlyPerf[]
}

export interface BenchmarkMonthly {
  month:     string
  cdi_cum:   number
  ibov_cum:  number | null
  sp500_cum: number | null
}

export interface PerformanceBenchmarks {
  year?:     number
  cdi_pct:   number | null
  ibov_pct:  number | null
  sp500_pct: number | null
  monthly:   BenchmarkMonthly[]
}

export type AssetReturns = Record<number, number | null>

export interface Asset {
  id: number
  code: string
  name: string
  asset_type: 'ticker' | 'fixed_income' | 'manual'
  currency: string
  asset_class_id: number | null
  active: boolean
}

export interface AssetHistoryPoint {
  date: string
  price: number
  value_brl: number
}

export interface Contribution {
  id: number
  date: string
  type: 'buy' | 'sell' | 'income'
  quantity: number
  price_orig: number | null
  currency: string | null
  fx_rate_brl: number | null
  value_brl: number | null
  description: string | null
  profit_brl: number | null
}

export interface AssetDetail {
  id: number
  code: string
  name: string
  asset_type: 'ticker' | 'fixed_income' | 'manual'
  currency: string
  exchange: string | null
  class_name: string
  class_color: string
  fi_type: string | null
  fi_principal: number | null
  fi_rate: number | null
  fi_spread: number | null
  fi_start_date: string | null
  current_value_brl: number
  current_price: number | null
  price_currency: string
  price_source: string
  holdings: number | null
  avg_cost_brl: number | null
  invested_brl: number
  gain_loss_brl: number
  gain_loss_pct: number | null
  total_income_brl: number
  history: AssetHistoryPoint[]
  contributions: Contribution[]
}

export interface ContributionRow {
  id: number
  date: string
  type: 'buy' | 'sell' | 'income'
  quantity: number
  price_orig: number | null
  currency: string | null
  fx_rate_brl: number | null
  value_brl: number | null
  description: string | null
  assets: {
    id: number
    code: string
    name: string
    currency: string
    asset_classes: { name: string; color: string } | null
  }
}
