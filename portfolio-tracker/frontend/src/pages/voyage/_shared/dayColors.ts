// Paleta de cores por dia — usada no mapa (pins) e no roteiro (badges),
// para que a cor de um lugar no mapa corresponda visualmente ao dia no roteiro.
export const DAY_COLORS = [
  '#D63B2F', // dia 1 — vermelho (marca)
  '#1B4FD8', // dia 2 — azul
  '#1F8A5B', // dia 3 — verde
  '#E8A020', // dia 4 — ocre
  '#A36A52', // dia 5 — terracota
  '#7B5EA7', // dia 6 — violeta
  '#0E7C86', // dia 7 — petróleo
  '#C2447A', // dia 8 — magenta
]

export function dayColor(day: number | null | undefined): string {
  if (day == null) return 'var(--arvo-fg-soft)'
  return DAY_COLORS[(day - 1) % DAY_COLORS.length]
}

// Fundo translúcido para badges/chips (requer suporte a color-mix — Safari 16.2+/Chrome 111+/Firefox 113+).
export function dayColorWash(day: number | null | undefined, pct = 12): string {
  const c = dayColor(day)
  if (c.startsWith('var(')) return 'var(--arvo-hover-bg)'
  return `color-mix(in srgb, ${c} ${pct}%, transparent)`
}
