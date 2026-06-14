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

/* Multi-series palette for breakdown charts (envelopes, categories) — base
   brand hues plus lighter/darker tonalities so each series gets a distinct
   color even when there are more series than base hues. */
function mixHex(hex: string, target: string, amount: number): string {
  const a = hex.slice(1), b = target.slice(1)
  const ch = (i: number) => {
    const v1 = parseInt(a.slice(i, i + 2), 16)
    const v2 = parseInt(b.slice(i, i + 2), 16)
    return Math.round(v1 + (v2 - v1) * amount).toString(16).padStart(2, '0')
  }
  return `#${ch(0)}${ch(2)}${ch(4)}`
}

const BREAKDOWN_BASE_HUES = ['#1B4FD8', '#1F8A5B', '#E8A020', '#A36A52', '#D63B2F', '#8C6A28', '#5A5248']

export const BREAKDOWN_PALETTE: string[] = [
  ...BREAKDOWN_BASE_HUES,
  ...BREAKDOWN_BASE_HUES.map(c => mixHex(c, '#FFFFFF', 0.35)),
  ...BREAKDOWN_BASE_HUES.map(c => mixHex(c, '#0D0D0D', 0.30)),
]

export function breakdownColor(index: number): string {
  return BREAKDOWN_PALETTE[index % BREAKDOWN_PALETTE.length]
}

/* Compact axis/value formatter — "R$ 1,2M", never "100.000.000 tri". */
export function formatCompactCurrency(value: number, currency: string, locale: string): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
}
