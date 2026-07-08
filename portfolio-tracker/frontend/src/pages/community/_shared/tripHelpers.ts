import type { CommunityTripCard } from '../types'

// Helpers dos cards de viagem da Comunidade — compartilhados entre a galeria
// (CommunityTripsPage) e a página de perfil (/u/:username).

// Duração em dias (inclusive) a partir das datas da viagem. Sem as duas
// datas, sem chip.
export function tripDurationLabel(trip: { start_date: string | null; end_date: string | null }, tc: any): string | null {
  if (!trip.start_date || !trip.end_date) return null
  const start = new Date(trip.start_date + 'T00:00:00').getTime()
  const end = new Date(trip.end_date + 'T00:00:00').getTime()
  if (!(end >= start)) return null
  const days = Math.round((end - start) / 86400000) + 1
  const tpl: string = days === 1 ? (tc?.trips?.durationOne ?? '{n} dia') : (tc?.trips?.durationMany ?? '{n} dias')
  return tpl.replace('{n}', String(days))
}

// Países da viagem pros chips de filtro — dos destinos quando existem, senão
// o campo legado country (que reflete o primeiro destino).
export function tripCountries(trip: CommunityTripCard): string[] {
  const set = new Set<string>()
  for (const d of trip.destinations ?? []) if (d.country) set.add(d.country)
  if (set.size === 0 && trip.country) set.add(trip.country)
  return [...set]
}
