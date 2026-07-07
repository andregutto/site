import type { Locale } from '../contexts/I18nContext'

// Formato de exibição por idioma: en usa mm/dd/aaaa, pt/fr usam dd/mm/aaaa.
export function displayPattern(locale: Locale): string {
  return locale === 'en' ? 'mm/dd/aaaa' : 'dd/mm/aaaa'
}

function intlLocale(locale: Locale): string {
  return locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
}

export function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Meia-noite local, pra comparar datas sem hora atrapalhar.
export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function formatDisplay(iso: string | null | undefined, locale: Locale): string {
  const d = parseISO(iso)
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return locale === 'en' ? `${mm}/${dd}/${yyyy}` : `${dd}/${mm}/${yyyy}`
}

// Parser tolerante pra digitação manual — aceita separador /, - ou . e ano com 2 ou 4 dígitos.
export function parseDisplay(text: string, locale: Locale): string | null {
  const cleaned = text.trim()
  if (!cleaned) return null
  const parts = cleaned.split(/[/\-.]/).map(p => p.trim()).filter(Boolean)
  if (parts.length !== 3) return null
  const [a, b, y] = parts
  let day: number, month: number
  if (locale === 'en') { month = Number(a); day = Number(b) } else { day = Number(a); month = Number(b) }
  let year = Number(y)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  if (y.length <= 2) year += year < 50 ? 2000 : 1900
  if (month < 1 || month > 12 || day < 1) return null
  const d = new Date(year, month - 1, day)
  if (d.getMonth() !== month - 1) return null // dia inválido pro mês (ex: 31/02)
  return toISO(d)
}

export function monthLabel(d: Date, locale: Locale): string {
  const label = d.toLocaleDateString(intlLocale(locale), { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Segunda a domingo, iniciais curtas no idioma certo.
export function weekdayLabels(locale: Locale): string[] {
  const loc = intlLocale(locale)
  // 2024-01-01 é uma segunda-feira.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i)
    return d.toLocaleDateString(loc, { weekday: 'narrow' })
  })
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

// 0 = segunda ... 6 = domingo
export function firstWeekdayMon(y: number, m: number): number {
  const jsDay = new Date(y, m, 1).getDay() // 0=dom..6=sáb
  return (jsDay + 6) % 7
}
