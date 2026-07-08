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
    <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 90 }}>
      {/* Cabeçalho: nome + X na mesma linha (em vez de X flutuando por cima
          via position:absolute e o badge de dia isolado acima do nome) —
          nome começa imediatamente à esquerda, X fixo à direita. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <p style={{
          fontWeight: 600, fontSize: 13.5, lineHeight: 1.25, flex: 1, minWidth: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{p.name}</p>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 0, lineHeight: 1, fontSize: 13, flexShrink: 0 }}
        >✕</button>
      </div>
      {/* Miolo: categoria, endereço, horário, nota e gasto num flex-column
          com gap — o espaçamento entre os blocos vem só do gap, não de
          margem por parágrafo. Mais simples e imune a buracos de espaço se
          um campo novo for adicionado aqui no futuro sem setar margem. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
        {p.category && (
          <p style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {categoryLabel ? categoryLabel(p.category) : p.category}
          </p>
        )}
        {p.address && <p style={{ fontSize: 12.5, color: '#555', lineHeight: 1.3 }}>{p.address}</p>}
        <OpeningHoursBlock hours={p.opening_hours} />
        {p.trip_note && <p style={{ fontSize: 11.5, fontStyle: 'italic', color: '#888' }}>{p.trip_note}</p>}
        {(p.expense_total ?? 0) > 0 && (
          <p style={{ fontSize: 11.5, color: '#444' }}>{spentLabel} <strong>{formatCurrency(p.expense_total!)}</strong></p>
        )}
      </div>
      {/* Rodapé: dia + Abrir no Maps juntos, em vez do dia sozinho ocupando
          uma linha inteira no topo. */}
      {(p.day_number != null || p.google_maps_url) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 5 }}>
          {p.day_number != null ? (
            <span style={{ display: 'inline-block', fontSize: 9.5, padding: '1px 6px', borderRadius: 999, background: dayColorWash(p.day_number, 16), color: dayColor(p.day_number) }}>
              {dayLabel(p.day_number)}
            </span>
          ) : <span />}
          {p.google_maps_url && (
            <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#555', textDecoration: 'none' }}>
              {openInMapsLabel}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
