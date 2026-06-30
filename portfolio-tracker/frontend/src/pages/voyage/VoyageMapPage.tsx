import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch } from '../../lib/api'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../contexts/I18nContext'
import { dayColor, dayColorWash } from './_shared/dayColors'
import OpeningHoursBlock from './_shared/OpeningHours'
import CurrentLocationMarker from './_shared/CurrentLocationMarker'

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
  trip_note: string | null
  opening_hours: string[] | null
  trip_id: number
  expense_total?: number
}

function fmtEur(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
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
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:${color};border:${ringWidth}px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:${glow};transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  })
}

function FitBounds({ places }: { places: TripPlace[] }) {
  const map = useMap()
  useEffect(() => {
    if (!places.length) return
    if (places.length === 1) { map.setView([places[0].lat!, places[0].lng!], 14); return }
    map.fitBounds(L.latLngBounds(places.map(p => [p.lat!, p.lng!])), { padding: [40, 40] })
  }, [places, map])
  return null
}

export default function VoyageMapPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedTripId = searchParams.get('trip') ? Number(searchParams.get('trip')) : null
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}

  const [trips, setTrips] = useState<Trip[]>([])
  const [places, setPlaces] = useState<TripPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = selectedTripId
        ? `/voyage/map/places?trip_id=${selectedTripId}`
        : '/voyage/map/places'
      const data = await apiFetch<{ places: TripPlace[]; trips: Trip[] }>(url)
      setPlaces(data.places)
      setTrips(data.trips)
    } finally {
      setLoading(false)
    }
  }, [selectedTripId])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSelectedDay(null) }, [selectedTripId])

  const selectedTrip = trips.find(t => t.id === selectedTripId) ?? null

  const visiblePlaces = places.filter(p => {
    if (!selectedTripId) return true
    if (selectedDay === null) return true
    if (selectedDay === -1) return p.day_number == null
    return p.day_number === selectedDay
  })

  // Days for current trip filter
  const days = selectedTripId
    ? Array.from(new Set(places.map(p => p.day_number).filter(d => d != null) as number[])).sort((a, b) => a - b)
    : []
  const undated = selectedTripId ? places.filter(p => p.day_number == null) : []

  // Count places per trip for the selector
  const tripCounts: Record<number, number> = {}
  for (const p of places) { tripCounts[p.trip_id] = (tripCounts[p.trip_id] ?? 0) + 1 }
  const totalWithCoords = places.length

  function selectTrip(id: number | null) {
    setSelectedDay(null)
    if (id === null) setSearchParams({})
    else setSearchParams({ trip: String(id) })
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div style={{ height: 540, borderRadius: 18, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => selectedTripId ? navigate(`/voyage/${selectedTripId}`) : navigate('/voyage')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 0, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 12 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M9 2L4 7l5 5" />
          </svg>
          {selectedTrip?.title ?? 'Viagens'}
        </button>
        <span style={{ color: 'var(--arvo-border)', fontSize: 14 }}>›</span>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 11, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>Mapa</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-4">

          {/* Trip selector */}
          <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '16px 18px' }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10 }}>
              Viagem
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* All trips */}
              <button
                type="button"
                onClick={() => selectTrip(null)}
                style={{
                  textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${selectedTripId === null ? RED : 'var(--arvo-border)'}`,
                  background: selectedTripId === null ? 'rgba(214,59,47,0.08)' : 'transparent',
                  fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: selectedTripId === null ? RED : 'var(--arvo-fg-muted)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span>Todas</span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: 0, textTransform: 'none', color: selectedTripId === null ? RED : 'var(--arvo-fg-soft)' }}>
                  {totalWithCoords}
                </span>
              </button>

              {trips.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTrip(t.id)}
                  style={{
                    textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${selectedTripId === t.id ? RED : 'var(--arvo-border)'}`,
                    background: selectedTripId === t.id ? 'rgba(214,59,47,0.08)' : 'transparent',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: selectedTripId === t.id ? RED : 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </span>
                  {tripCounts[t.id] != null && (
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>
                      {tripCounts[t.id]}
                    </span>
                  )}
                </button>
              ))}

              {trips.length === 0 && (
                <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD }}>
                  Nenhuma viagem ainda
                </p>
              )}
            </div>
          </div>

          {/* Day filter — only when a trip is selected and has days */}
          {selectedTripId && days.length > 0 && (
            <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '16px 18px' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10 }}>
                Dia
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
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
                {days.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    style={{
                      textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${selectedDay === d ? dayColor(d) : 'var(--arvo-border)'}`,
                      background: selectedDay === d ? dayColorWash(d, 10) : 'transparent',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(d), flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: selectedDay === d ? dayColor(d) : 'var(--arvo-fg)' }}>
                        <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginRight: 6, color: 'var(--arvo-fg-muted)' }}>Dia</span>
                        {d}
                      </span>
                    </span>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                      {places.filter(p => p.day_number === d).length}
                    </span>
                  </button>
                ))}
                {undated.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDay(-1)}
                    style={{
                      textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${selectedDay === -1 ? RED : 'var(--arvo-border)'}`,
                      background: selectedDay === -1 ? 'rgba(214,59,47,0.08)' : 'transparent',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: selectedDay === -1 ? RED : 'var(--arvo-fg-muted)' }}>Sem dia</span>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{undated.length}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--arvo-border)', boxShadow: 'var(--arvo-shadow-sm)', height: 560 }}>
            {visiblePlaces.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)', gap: 12 }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="rgba(200,184,154,0.30)" strokeWidth="1.3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 32l10-18 12 9 10-15 12 8"/>
                  <path strokeLinecap="round" d="M4 40h40"/>
                </svg>
                <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD }}>
                  {trips.length === 0
                    ? 'Nenhuma viagem criada ainda'
                    : selectedTripId
                    ? 'Nenhum lugar com coordenadas nesta viagem'
                    : 'Adicione lugares às suas viagens para ver o mapa'}
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
                  key={resolvedTheme}
                  attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url={resolvedTheme === 'dark'
                    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                  }
                />
                <FitBounds places={visiblePlaces} />
                <CurrentLocationMarker />
                {visiblePlaces.map(p => (
                  <Marker
                    key={p.id}
                    position={[p.lat!, p.lng!]}
                    icon={makeIcon(catIcon(p.category), dayColor(p.day_number), p.is_highlight)}
                  >
                    <Popup>
                      <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 160 }}>
                        {!selectedTripId && (
                          <p style={{ fontSize: 10, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {trips.find(t => t.id === p.trip_id)?.title}
                          </p>
                        )}
                        {p.day_number != null && (
                          <span style={{ display: 'inline-block', fontSize: 10, padding: '1px 7px', borderRadius: 999, background: dayColorWash(p.day_number, 16), color: dayColor(p.day_number), marginBottom: 4 }}>Dia {p.day_number}</span>
                        )}
                        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</p>
                        {p.category && <p style={{ fontSize: 10.5, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.category}</p>}
                        {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                        <OpeningHoursBlock hours={p.opening_hours} />
                        {p.trip_note && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#888', marginBottom: 4 }}>{p.trip_note}</p>}
                        {(p.expense_total ?? 0) > 0 && (
                          <p style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>Gasto aqui: <strong>{fmtEur(p.expense_total!)}</strong></p>
                        )}
                        {p.google_maps_url && (
                          <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: '#555', textDecoration: 'none' }}>
                            {tv.public?.openInMaps ?? 'Abrir no Google Maps →'}
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
