/**
 * Parses a user-typed number string, tolerating:
 * - pt-BR format: "1.234,56" or "1234,56"
 * - en-US format: "1,234.56" or "1234.56"
 * - Currency prefixes: "R$", "US$", "$", "€", "£" (with or without trailing space)
 * - Percent suffix: "%" is stripped; the raw numeric value is returned
 * Returns null for empty or unparseable input.
 */
export function parseLocaleNum(raw: string): number | null {
  let s = raw.trim()
    .replace(/^R\$\s*/, '')
    .replace(/^US\$\s*/, '')
    .replace(/^[€£$]\s*/, '')
    .trim()

  s = s.replace(/%$/, '').trim()

  if (!s) return null

  const hasDot   = s.includes('.')
  const hasComma = s.includes(',')
  let normalized: string

  if (hasDot && hasComma) {
    const lastDot   = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastComma > lastDot) {
      // pt-BR: 1.234,56 — dots are thousands, comma is decimal
      normalized = s.replace(/\./g, '').replace(',', '.')
    } else {
      // en-US: 1,234.56 — commas are thousands, dot is decimal
      normalized = s.replace(/,/g, '')
    }
  } else if (hasComma && !hasDot) {
    const parts      = s.split(',')
    const afterComma = parts[parts.length - 1]
    // comma is thousands only when exactly 3 digits follow (1,234)
    if (parts.length === 2 && afterComma.length === 3 && /^\d+$/.test(afterComma)) {
      normalized = s.replace(/,/g, '')
    } else {
      normalized = s.replace(',', '.')
    }
  } else if (hasDot && !hasComma) {
    const parts    = s.split('.')
    const afterDot = parts[parts.length - 1]
    // dot is thousands when multiple dots or exactly 3 digits follow (1.234)
    if (parts.length > 2 || (parts.length === 2 && afterDot.length === 3 && /^\d+$/.test(afterDot))) {
      normalized = s.replace(/\./g, '')
    } else {
      normalized = s
    }
  } else {
    normalized = s
  }

  const v = parseFloat(normalized)
  return isNaN(v) ? null : v
}

/** Returns a CSS class string for an input that may have a validation error. */
export function inputCls(base: string, hasError: boolean): string {
  return hasError
    ? `${base} border-red-400 focus:ring-red-300/40`
    : `${base} border-gray-200 focus:ring-[#0D0D0D]/20`
}
