import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch } from '../../lib/api'
import { useTheme } from '../../contexts/ThemeContext'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const RED = '#D63B2F'

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
  compras: '🛍️', favoritos: '⭐',
}

function catIcon(cat: string | null): string {
  if (!cat) return '📌'
  const k = cat.toLowerCase()
  for (const [key, val] of Object.entries(CATEGORY_ICONS)) {
    if (k.includes(key)) return val
  }
  return '📌'
}

function makeIcon(emoji: string, highlight: boolean) {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${highlight ? RED : '#fff'};border:2px solid ${highlight ? RED : 'rgba(13,13,13,0.3)'};display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.25);transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  })
}

function FitBounds({ places }: { places: TripPlace[] }) {
  const map = useMap()
  useEffect(() => {
    const pts = places.filter(p => p.lat && p.lng)
    if (!pts.length) return
    if (pts.length === 1) { map.setView([pts[0].lat!, pts[0].lng!], 14); return }
    map.fitBounds(L.latLngBounds(pts.map(p => [p.lat!, p.lng!])), { padding: [32, 32] })
  }, [places, map])
  return null
}

interface Props {
  tripId: number
}

export default function TripMapCard({ tripId }: Props) {
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const [places, setPlaces] = useState<TripPlace[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ places: TripPlace[] }>(`/voyage/trips/${tripId}/places`)
      setPlaces(data.places ?? [])
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => { load() }, [load])

  const withCoords = places.filter(p => p.lat && p.lng)

  if (loading) {
    return (
      <div style={{ height: 300, borderRadius: 16, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
    )
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 12px' }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          Mapa da viagem
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {withCoords.length > 0 && (
            <a
              href={`/api/voyage/trips/${tripId}/kml`}
              download
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.03em' }}
              title="Baixar KML para Google Maps"
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
            Ver mapa completo →
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ height: 300, borderTop: '1px solid var(--arvo-border-soft)' }}>
        {withCoords.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)', gap: 10 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={`rgba(200,184,154,0.25)`} strokeWidth="1.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 28l8-14 10 8 9-14 10 8"/>
              <path strokeLinecap="round" d="M3 34h34"/>
            </svg>
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: '#C8B89A' }}>
              Adicione lugares à viagem para ver o mapa
            </p>
          </div>
        ) : (
          <MapContainer
            center={[withCoords[0].lat!, withCoords[0].lng!]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              key={resolvedTheme}
              attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
              url={resolvedTheme === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
              }
            />
            <FitBounds places={withCoords} />
            {withCoords.map(p => (
              <Marker key={p.id} position={[p.lat!, p.lng!]} icon={makeIcon(catIcon(p.category), p.is_highlight)}>
                <Popup>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 150 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.name}</p>
                    {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                    {p.trip_note && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#888', marginBottom: 4 }}>{p.trip_note}</p>}
                    {(p.expense_total ?? 0) > 0 && (
                      <p style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>Gasto aqui: <strong>{fmtEur(p.expense_total!)}</strong></p>
                    )}
                    {p.google_maps_url && (
                      <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
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
  )
}
