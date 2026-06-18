import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch } from '../../lib/api'

// Fix default Leaflet marker icons broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const RED = '#D63B2F'
const GOLD = '#C8B89A'

interface TripPlace {
  id: number
  name: string
  category: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  day_number: number | null
  is_highlight: boolean
  visited: boolean
  trip_note: string | null
}

interface Trip {
  id: number
  title: string
  destination: string | null
}

const CATEGORY_ICONS: Record<string, string> = {
  restaurantes: '🍽️', restaurante: '🍽️',
  padarias: '🥐', padaria: '🥐',
  cafés: '☕', café: '☕', cafes: '☕',
  museus: '🏛️', museu: '🏛️',
  pontos: '📍', turísticos: '📍',
  hotéis: '🏨', hotel: '🏨', hoteis: '🏨',
  bares: '🍺', bar: '🍺',
  praias: '🏖️', praia: '🏖️',
  parques: '🌳', parque: '🌳',
  compras: '🛍️', favoritos: '⭐',
}

function catIcon(cat: string | null): string {
  if (!cat) return '📌'
  const key = cat.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '📌'
}

function makeIcon(emoji: string, highlight: boolean) {
  return L.divIcon({
    html: `<div style="
      width:32px;height:32px;border-radius:50% 50% 50% 0;
      background:${highlight ? RED : '#fff'};
      border:2px solid ${highlight ? RED : 'rgba(13,13,13,0.3)'};
      display:flex;align-items:center;justify-content:center;
      font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,0.25);
      transform:rotate(-45deg)
    "><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  })
}

// Fit map to all markers
function FitBounds({ places }: { places: TripPlace[] }) {
  const map = useMap()
  useEffect(() => {
    const withCoords = places.filter(p => p.lat && p.lng)
    if (withCoords.length === 0) return
    const bounds = L.latLngBounds(withCoords.map(p => [p.lat!, p.lng!]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [places, map])
  return null
}

// Day sidebar
function DayList({ places, selectedDay, onSelectDay }: {
  places: TripPlace[]
  selectedDay: number | null
  onSelectDay: (d: number | null) => void
}) {
  const days = Array.from(new Set(places.map(p => p.day_number).filter(d => d != null) as number[])).sort((a, b) => a - b)
  const undated = places.filter(p => p.day_number == null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={() => onSelectDay(null)}
        style={{
          textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${selectedDay === null ? RED : 'var(--arvo-border)'}`,
          background: selectedDay === null ? 'rgba(214,59,47,0.08)' : 'transparent',
          fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: selectedDay === null ? RED : 'var(--arvo-fg-muted)',
        }}
      >
        Todos ({places.length})
      </button>
      {days.map(d => {
        const dayPlaces = places.filter(p => p.day_number === d)
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelectDay(d)}
            style={{
              textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${selectedDay === d ? RED : 'var(--arvo-border)'}`,
              background: selectedDay === d ? 'rgba(214,59,47,0.08)' : 'transparent',
              fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: selectedDay === d ? RED : 'var(--arvo-fg)',
            }}
          >
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginRight: 6, color: 'var(--arvo-fg-muted)' }}>Dia</span>
            {d}
            <span style={{ float: 'right', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{dayPlaces.length}</span>
          </button>
        )
      })}
      {undated.length > 0 && (
        <button
          type="button"
          onClick={() => onSelectDay(-1)}
          style={{
            textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${selectedDay === -1 ? RED : 'var(--arvo-border)'}`,
            background: selectedDay === -1 ? 'rgba(214,59,47,0.08)' : 'transparent',
            fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: selectedDay === -1 ? RED : 'var(--arvo-fg-muted)',
          }}
        >
          Sem dia
          <span style={{ float: 'right', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{undated.length}</span>
        </button>
      )}
    </div>
  )
}

export default function VoyageMapPage() {
  const { id: routeId } = useParams<{ id?: string }>()
  const [searchParams] = useSearchParams()
  const id = routeId ?? searchParams.get('trip') ?? undefined
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [places, setPlaces] = useState<TripPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [tripData, placesData] = await Promise.all([
        apiFetch<{ trip: Trip }>(`/api/voyage/trips/${id}`),
        apiFetch<{ places: TripPlace[] }>(`/api/voyage/trips/${id}/places`),
      ])
      setTrip(tripData.trip)
      setPlaces(placesData.places)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const visiblePlaces = places.filter(p => {
    if (selectedDay === null) return true
    if (selectedDay === -1) return p.day_number == null
    return p.day_number === selectedDay
  }).filter(p => p.lat && p.lng)

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div style={{ height: 480, borderRadius: 18, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => id ? navigate(`/voyage/${id}`) : navigate('/voyage')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 0, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 12 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M9 2L4 7l5 5" />
          </svg>
          {trip?.title ?? 'Viagem'}
        </button>
        <span style={{ color: 'var(--arvo-border)', fontSize: 14 }}>›</span>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 11, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>Mapa</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 12 }}>
              Filtrar por dia
            </p>
            {places.length === 0 ? (
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD }}>
                Nenhum lugar com coordenadas ainda
              </p>
            ) : (
              <DayList places={places} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            )}
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--arvo-border)', height: 520 }}>
            {visiblePlaces.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)', gap: 12 }}>
                <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 48, color: 'rgba(200,184,154,0.25)' }}>◈</span>
                <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD }}>
                  {places.length === 0 ? 'Adicione lugares à viagem primeiro' : 'Nenhum lugar com coordenadas neste filtro'}
                </p>
              </div>
            ) : (
              <MapContainer
                center={[visiblePlaces[0].lat!, visiblePlaces[0].lng!]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds places={visiblePlaces} />
                {visiblePlaces.map(p => (
                  <Marker
                    key={p.id}
                    position={[p.lat!, p.lng!]}
                    icon={makeIcon(catIcon(p.category), p.is_highlight)}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 160 }}>
                        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.name}</p>
                        {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                        {p.trip_note && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#888', marginBottom: 4 }}>{p.trip_note}</p>}
                        {p.google_maps_url && (
                          <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: RED, textDecoration: 'none' }}>
                            Abrir no Google Maps →
                          </a>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
