import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch } from '../../lib/api'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../contexts/I18nContext'
import { dayColor, dayColorWash } from './_shared/dayColors'
import OpeningHoursBlock from './_shared/OpeningHours'
import CurrentLocationMarker from './_shared/CurrentLocationMarker'
import { useCurrentLocation } from './_shared/useCurrentLocation'
import { openDirections } from './_shared/googleMapsRoute'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface TripPlace {
  id: number
  name: string
  category: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  is_highlight: boolean
  trip_note: string | null
  day_number: number | null
  opening_hours: string[] | null
  expense_total?: number
}

function fmtEur(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const CATEGORY_ICONS: Record<string, string> = {
  restaurantes: '🍽️', restaurante: '🍽️',
  padarias: '🥐', padaria: '🥐',
  cafés: '☕', café: '☕', cafes: '☕',
  museus: '🏛️', museu: '🏛️',
  hotéis: '🏨', hotel: '🏨', hoteis: '🏨',
  bares: '🍺', bar: '🍺',
  praias: '🏖️', praia: '🏖️',
  parques: '🌳', parque: '🌳',
  compras: '🛍️', mercados: '🛒',
  pontos: '📍', turísticos: '📍', favoritos: '⭐',
  aluguel: '🚗', carro: '🚗', carros: '🚗',
}

function catIcon(cat: string | null): string {
  if (!cat) return '📌'
  const k = cat.toLowerCase()
  for (const [key, val] of Object.entries(CATEGORY_ICONS)) {
    if (k.includes(key)) return val
  }
  return '📌'
}

function makeIcon(emoji: string, color: string, highlight: boolean) {
  const ring = highlight ? '#C8B89A' : 'rgba(255,255,255,0.9)'
  const ringWidth = highlight ? 3 : 2
  const glow = highlight ? '0 0 0 3px rgba(200,184,154,0.35), 0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.25)'
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};border:${ringWidth}px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:${glow};transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  })
}

// Mantém o Leaflet ciente de mudanças na altura do container (ex.: quando o
// card de custo ao lado expande e a linha do grid estica este mapa junto).
function ResizeInvalidate() {
  const map = useMap()
  useEffect(() => {
    const c = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(c)
    return () => ro.disconnect()
  }, [map])
  return null
}

function FitBounds({ places }: { places: TripPlace[] }) {
  const map = useMap()
  // `places` (visibleCoords) is a brand-new array every render even when its
  // contents didn't change (it's a .filter() result), which kept re-running
  // fitBounds and undoing the flyTo zoom from selecting a place in the list.
  // Depending on a stable ids-key instead of the array reference fixes that.
  const key = places.map(p => p.id).join(',')
  useEffect(() => {
    const pts = places.filter(p => p.lat && p.lng)
    if (!pts.length) return
    if (pts.length === 1) { map.setView([pts[0].lat!, pts[0].lng!], 14); return }
    map.fitBounds(L.latLngBounds(pts.map(p => [p.lat!, p.lng!])), { padding: [32, 32] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

// Quando o usuário clica num lugar na lista do roteiro (fora do mapa), voa
// até o marker e abre o popup dele — sem isso a seleção na lista não tinha
// nenhum efeito visível no mapa.
function FlyToSelected({ placeId, places, markerRefs }: {
  placeId: number | null
  places: TripPlace[]
  markerRefs: React.MutableRefObject<Record<number, L.Marker>>
}) {
  const map = useMap()
  useEffect(() => {
    if (placeId == null) return
    const p = places.find(pl => pl.id === placeId)
    if (!p || p.lat == null || p.lng == null) return
    const marker = markerRefs.current[placeId]
    // Abrir o popup só depois que o flyTo termina de fato — abri-lo num
    // timeout fixo mais curto que a animação fazia o autoPan do Leaflet
    // calcular o ajuste com base numa posição de mapa ainda em trânsito,
    // cortando o balão (nenhum zoom resolvia porque a causa nunca foi o
    // zoom, era esse cálculo feito no momento errado).
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
    map.once('moveend', () => marker?.openPopup())
  }, [placeId, places, map, markerRefs])
  return null
}

interface Props {
  tripId: number
  // Bumped by the parent page whenever a place is added/removed elsewhere
  // (itinerary panel) — this card fetches its own places independently, so
  // without this it kept showing a stale list until the page was reloaded.
  refreshKey?: number
  // Filtro de dia e seleção de lugar compartilhados com o roteiro (quando o
  // pai controla esse estado, ex.: VoyageTripDetailPage no layout split
  // mapa+roteiro). Sem esses props, o componente usa estado próprio
  // (comportamento standalone, como antes).
  selectedDay?: number | 'none' | null
  onSelectedDayChange?: (d: number | 'none' | null) => void
  selectedPlaceId?: number | null
  onSelectPlace?: (id: number | null) => void
}

export default function TripMapCard({ tripId, refreshKey, selectedDay: selectedDayProp, onSelectedDayChange, selectedPlaceId: selectedPlaceIdProp, onSelectPlace }: Props) {
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [places, setPlaces] = useState<TripPlace[]>([])
  const [loading, setLoading] = useState(true)
  // null = Todos; 'none' = Sem dia (places sem day_number); number = dia específico
  const [selectedDayLocal, setSelectedDayLocal] = useState<number | 'none' | null>(null)
  const selectedDay = selectedDayProp !== undefined ? selectedDayProp : selectedDayLocal
  const setSelectedDay = onSelectedDayChange ?? setSelectedDayLocal
  const [selectedPlaceIdLocal, setSelectedPlaceIdLocal] = useState<number | null>(null)
  const selectedPlaceId = selectedPlaceIdProp !== undefined ? selectedPlaceIdProp : selectedPlaceIdLocal
  const setSelectedPlaceId = onSelectPlace ?? setSelectedPlaceIdLocal
  const markerRefs = useRef<Record<number, L.Marker>>({})
  // Zoom por roda do mouse só ativa depois de um clique no mapa — com o mapa
  // sticky e grande na tela, deixar sempre ativo fazia o scroll da página
  // "engasgar" sempre que o cursor passava por cima (a roda zoomava o mapa
  // em vez de rolar a página, de forma inconsistente).
  const [mapActive, setMapActive] = useState(false)
  const currentLocation = useCurrentLocation()

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ places: TripPlace[] }>(`/voyage/trips/${tripId}/places`)
      setPlaces(data.places ?? [])
    } finally {
      setLoading(false)
    }
  }, [tripId, refreshKey])

  useEffect(() => { load() }, [load])

  const withCoords = places.filter(p => p.lat && p.lng)
  const days = Array.from(new Set(withCoords.map(p => p.day_number).filter((d): d is number => d != null))).sort((a, b) => a - b)
  const hasUndated = withCoords.some(p => p.day_number == null)
  const visibleCoords = selectedDay == null ? withCoords
    : selectedDay === 'none' ? withCoords.filter(p => p.day_number == null)
    : withCoords.filter(p => p.day_number === selectedDay)

  if (loading) {
    return (
      <div style={{ height: 300, borderRadius: 16, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
    )
  }

  return (
    // Sem card/fundo próprio — mesmo visual limpo da página pública: o mapa
    // só tem a própria borda, sem header com título dentro de uma caixa.
    // `isolation: isolate` contém o z-index alto dos panes do Leaflet (que
    // sem isso vazava por cima do header fixo do app no mobile).
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', isolation: 'isolate' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          {tv.mapCardTitle ?? 'Mapa da viagem'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {withCoords.length > 0 && (
            <a
              href={`/api/voyage/trips/${tripId}/kml`}
              download
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.03em' }}
              title={tv.downloadKmlTitle ?? 'Baixar KML para Google Maps'}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M7 1v8m0 0l-3-3m3 3l3-3M2 11h10" />
              </svg>
              KML
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate(`/voyage/map?trip=${tripId}`)}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', padding: 0 }}
          >
            {tv.viewFullMap ?? 'Ver mapa completo →'}
          </button>
        </div>
      </div>

      {/* Filtro por dia + roteiro no Google Maps */}
      {(days.length > 1 || hasUndated) && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', overflowX: 'auto' }}>
          {selectedDay !== null && selectedDay !== 'none' && visibleCoords.length > 1 && (
            <button
              type="button"
              onClick={() => openDirections(visibleCoords.map(p => ({ lat: p.lat!, lng: p.lng! })), currentLocation)}
              title={tv.openDayRoute ?? 'Abrir roteiro deste dia no Google Maps'}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
                fontFamily: 'var(--arvo-font-body)', fontSize: 10.5,
                padding: '3px 9px', borderRadius: 999, marginRight: 2,
                border: `1px solid ${dayColor(selectedDay)}`,
                background: dayColorWash(selectedDay, 10), color: dayColor(selectedDay),
              }}
            >
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
              </svg>
              {tv.openDayRouteShort ?? 'Roteiro no Maps'}
            </button>
          )}
          <button
            type="button" onClick={() => setSelectedDay(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
              fontFamily: 'var(--arvo-font-display)', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: 999,
              border: `1px solid ${selectedDay === null ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
              background: selectedDay === null ? 'var(--arvo-hover-bg)' : 'transparent',
              color: selectedDay === null ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
            }}
          >
            {tv.dayFilterAll ?? 'Todos'}
          </button>
          {days.map(d => (
            <button
              key={d} type="button" onClick={() => setSelectedDay(d)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
                fontFamily: 'var(--arvo-font-body)', fontSize: 10.5,
                padding: '3px 9px', borderRadius: 999,
                border: `1px solid ${selectedDay === d ? dayColor(d) : 'var(--arvo-border)'}`,
                background: selectedDay === d ? dayColorWash(d, 10) : 'transparent',
                color: selectedDay === d ? dayColor(d) : 'var(--arvo-fg-soft)',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(d), flexShrink: 0 }} />
              {(tv.day ?? 'Dia {n}').replace('{n}', String(d))}
            </button>
          ))}
          {hasUndated && (
            <button
              type="button" onClick={() => setSelectedDay('none')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
                fontFamily: 'var(--arvo-font-body)', fontSize: 10.5,
                padding: '3px 9px', borderRadius: 999,
                border: `1px solid ${selectedDay === 'none' ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
                background: selectedDay === 'none' ? 'var(--arvo-hover-bg)' : 'transparent',
                color: selectedDay === 'none' ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
              }}
            >
              {tv.noDay ?? 'Sem dia'}
            </button>
          )}
        </div>
      )}

      {/* Map — borda própria (igual à pública), flex:1 ocupa o resto da altura. */}
      <div style={{ flex: 1, minHeight: 300, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--arvo-border)', boxShadow: 'var(--arvo-shadow-sm)' }}>
        {withCoords.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)', gap: 10 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={`rgba(200,184,154,0.25)`} strokeWidth="1.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 28l8-14 10 8 9-14 10 8"/>
              <path strokeLinecap="round" d="M3 34h34"/>
            </svg>
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: '#C8B89A' }}>
              {tv.mapEmpty ?? 'Adicione lugares à viagem para ver o mapa'}
            </p>
          </div>
        ) : visibleCoords.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)' }}>
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: '#C8B89A' }}>
              {selectedDay === 'none'
                ? (tv.mapEmptyNoDay ?? 'Nenhum lugar sem dia com coordenadas')
                : (tv.mapEmptyDay ?? 'Nenhum lugar com coordenadas no Dia {n}').replace('{n}', String(selectedDay))}
            </p>
          </div>
        ) : (
          <div
            style={{ position: 'relative', height: '100%', width: '100%' }}
            onMouseEnter={() => setMapActive(true)}
            onMouseLeave={() => setMapActive(false)}
            onClick={() => setMapActive(true)}
          >
            {!mapActive && (
              <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 10, background: 'rgba(13,13,13,0.65)', color: '#fff', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '3px 9px', borderRadius: 999, pointerEvents: 'none' }}>
                {tv.mapScrollHint ?? 'Clique para usar o zoom com scroll'}
              </div>
            )}
          <MapContainer
            center={[visibleCoords[0].lat!, visibleCoords[0].lng!]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={mapActive}
          >
            <ResizeInvalidate />
            <FlyToSelected placeId={selectedPlaceId} places={visibleCoords} markerRefs={markerRefs} />
            <TileLayer
              key={resolvedTheme}
              attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
              url={resolvedTheme === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
              }
            />
            <FitBounds places={visibleCoords} />
            <CurrentLocationMarker />
            {visibleCoords.map(p => (
              <Marker
                key={p.id} position={[p.lat!, p.lng!]}
                icon={makeIcon(catIcon(p.category), dayColor(p.day_number), p.is_highlight || p.id === selectedPlaceId)}
                ref={m => { if (m) markerRefs.current[p.id] = m }}
                eventHandlers={{ click: () => setSelectedPlaceId(p.id) }}
              >
                {/* maxHeight + autoPanPadding: sem isso, num mapa baixo (mobile)
                    o balão podia ser mais alto que o próprio mapa — nenhum
                    zoom resolve isso, é espaço vertical disponível. Agora o
                    conteúdo rola por dentro em vez de ficar cortado. */}
                <Popup closeButton={false} maxHeight={220} autoPanPadding={[16, 16]}>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 150, position: 'relative' }}>
                    {/* Botão de fechar próprio — em vez do × nativo do Leaflet,
                        que só fechava o popup sem desmarcar a seleção na
                        lista (o destaque do lugar ficava "preso"). */}
                    <button
                      type="button"
                      onClick={() => { setSelectedPlaceId(null); markerRefs.current[p.id]?.closePopup() }}
                      style={{ position: 'absolute', top: -2, right: -2, background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4, lineHeight: 1, fontSize: 13 }}
                    >✕</button>
                    {p.day_number != null && (
                      <span style={{ display: 'inline-block', fontSize: 10, padding: '1px 7px', borderRadius: 999, background: dayColorWash(p.day_number, 16), color: dayColor(p.day_number), marginBottom: 4 }}>{(tv.day ?? 'Dia {n}').replace('{n}', String(p.day_number))}</span>
                    )}
                    <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</p>
                    {p.category && <p style={{ fontSize: 10.5, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.category}</p>}
                    {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                    <OpeningHoursBlock hours={p.opening_hours} />
                    {p.trip_note && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#888', marginBottom: 4 }}>{p.trip_note}</p>}
                    {(p.expense_total ?? 0) > 0 && (
                      <p style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>{tv.spentHere ?? 'Gasto aqui:'} <strong>{fmtEur(p.expense_total!)}</strong></p>
                    )}
                    {p.google_maps_url && (
                      <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
                        {tv.public?.openInMaps ?? 'Abrir no Google Maps →'}
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          </div>
        )}
      </div>
    </div>
  )
}
