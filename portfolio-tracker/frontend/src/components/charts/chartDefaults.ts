/* Arvo chart kit — shared defaults (§3.5). Apply to every Recharts instance
   so axes, grids and tooltips read as one family across the app. */

export const CHART_GRID_STROKE = 'rgba(13,13,13,0.05)'

export const CHART_AXIS_TICK = {
  fontSize: 10,
  fontFamily: 'var(--arvo-font-body)',
  fill: 'var(--arvo-fg-faint)',
}

export const CHART_AXIS_LINE = { stroke: 'var(--arvo-border)' }

/* Fixed series palette — never roxo/teal/índigo/pastel. */
export const CHART_SERIES = {
  portfolio: 'var(--arvo-fg)',
  cdi: 'var(--arvo-gold)',
  ibov: 'var(--arvo-blue)',
  sp500: 'var(--arvo-terracotta)',
  crypto: '#5A5248',
  green: 'var(--arvo-green)',
  red: 'var(--arvo-red)',
  ocre: 'var(--arvo-ocre)',
} as const

/* Compact axis/value formatter — "R$ 1,2M", never "100.000.000 tri". */
export function formatCompactCurrency(value: number, currency: string, locale: string): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}
