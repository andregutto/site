import { dayColor, dayColorWash } from './dayColors'
import OpeningHoursBlock from './OpeningHours'

// Conteúdo do balão de marker do Leaflet, compartilhado entre TripMapCard
// (dono) e PublicTripPage/TripShareView (pública) — antes cada um tinha sua
// própria implementação quase idêntica (badge de dia, título, categoria,
// endereço, horário, gasto, link Maps), com bastante espaço vazio entre os
// blocos. Aqui o conteúdo fica mais denso (menos respiro entre badge/título/
// ações) e o <Popup maxHeight> do Leaflet.MapContainer também é reduzido nos
// dois lugares que usam este componente.
export interface PlacePopupPlace {
  id: number
  name: string
  category: string | null
  address: string | null
  day_number: number | null
  opening_hours: string[] | null
  google_maps_url: string | null
  expense_total?: number
  // Nota da viagem — só existe na visão do dono (não sai no payload público),
  // então o mapa público simplesmente não passa esse campo.
  trip_note?: string | null
}

export default function PlacePopup({ place: p, dayLabel, categoryLabel, spentLabel, openInMapsLabel, formatCurrency, onClose }: {
  place: PlacePopupPlace
  dayLabel: (day: number) => string
  categoryLabel?: (category: string) => string
  spentLabel: string
  openInMapsLabel: string
  formatCurrency: (n: number) => string
  onClose: () => void
}) {
  return (
    <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 140, position: 'relative' }}>
      <button
        type="button"
        onClick={onClose}
        style={{ position: 'absolute', top: -3, right: -3, background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 3, lineHeight: 1, fontSize: 13 }}
      >✕</button>
      {p.day_number != null && (
        <span style={{ display: 'inline-block', fontSize: 9.5, padding: '1px 6px', borderRadius: 999, background: dayColorWash(p.day_number, 16), color: dayColor(p.day_number), marginBottom: 2 }}>
          {dayLabel(p.day_number)}
        </span>
      )}
      <p style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 1, lineHeight: 1.25 }}>{p.name}</p>
      {p.category && (
        <p style={{ fontSize: 10, color: '#999', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {categoryLabel ? categoryLabel(p.category) : p.category}
        </p>
      )}
      {p.address && <p style={{ fontSize: 11.5, color: '#666', marginBottom: 2, lineHeight: 1.3 }}>{p.address}</p>}
      <OpeningHoursBlock hours={p.opening_hours} />
      {p.trip_note && <p style={{ fontSize: 11.5, fontStyle: 'italic', color: '#888', marginTop: 2, marginBottom: 2 }}>{p.trip_note}</p>}
      {(p.expense_total ?? 0) > 0 && (
        <p style={{ fontSize: 11.5, color: '#444', marginTop: 2, marginBottom: 2 }}>{spentLabel} <strong>{formatCurrency(p.expense_total!)}</strong></p>
      )}
      {p.google_maps_url && (
        <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#555', textDecoration: 'none', display: 'inline-block', marginTop: 2 }}>
          {openInMapsLabel}
        </a>
      )}
    </div>
  )
}
