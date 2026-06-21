import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '../../contexts/ThemeContext'
import { dayColor, dayColorWash } from './_shared/dayColors'
import OpeningHoursBlock from './_shared/OpeningHours'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const RED = '#D63B2F'
const GOLD = '#C8B89A'

type Kind = 'place' | 'note' | 'transport'

interface PublicPlace {
  id: number
  kind?: Kind
  name: string
  category: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  day_number: number | null
  is_highlight: boolean
  visited: boolean
  rating: number | null
  trip_note: string | null
  arrive_time: string | null
  depart_time: string | null
  transport_mode: string | null
  transport_note: string | null
  opening_hours: string[] | null
  checkin_day: number | null
  checkout_day: number | null
  expense_total?: number
}

interface PublicTrip {
  title: string
  destination: string | null
  country: string | null
  cover_image_url: string | null
  cover_image_position: string
  start_date: string | null
  end_date: string | null
  summary: string | null
  status: string
}

interface PublicCost {
  total: number
  budget: number | null
  currency: string
}

interface PageData {
  trip: PublicTrip
  owner_name: string
  places: PublicPlace[]
  cost: PublicCost | null
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
}

const TRANSPORT_ICONS: Record<string, string> = {
  flight: '✈️', train: '🚆', bus: '🚌', car: '🚗',
  boat: '⛴️', walk: '🚶', metro: '🚇', other: '🔀',
}

function catIcon(cat: string | null): string {
  if (!cat) return '📌'
  const key = cat.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '📌'
}

function itemIcon(p: PublicPlace): string {
  if (p.kind === 'note') return '📝'
  if (p.kind === 'transport') return p.transport_mode ? (TRANSPORT_ICONS[p.transport_mode] ?? '🔀') : '🔀'
  return catIcon(p.category)
}

function makeIcon(emoji: string, color: string, highlight: boolean) {
  const ring = highlight ? '#C8B89A' : 'rgba(255,255,255,0.9)'
  const ringWidth = highlight ? 3 : 2
  const glow = highlight ? '0 0 0 3px rgba(200,184,154,0.35), 0 2px 8px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.25)'
  return L.divIcon({
    html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${color};border:${ringWidth}px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:${glow};transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32],
  })
}

function FitBounds({ places }: { places: PublicPlace[] }) {
  const map = useMap()
  useEffect(() => {
    const pts = places.filter(p => p.lat && p.lng)
    if (!pts.length) return
    if (pts.length === 1) { map.setView([pts[0].lat!, pts[0].lng!], 13); return }
    map.fitBounds(L.latLngBounds(pts.map(p => [p.lat!, p.lng!])), { padding: [36, 36] })
  }, [places, map])
  return null
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtDateRange(start: string | null, end: string | null) {
  if (!start && !end) return null
  if (start && end && start === end) return fmtDate(start)
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
  if (start) return `a partir de ${fmtDate(start)}`
  return `até ${fmtDate(end!)}`
}

function tripDurationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function StarRow({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', gap: 1 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ fontSize: 11, color: RED, opacity: value >= n ? 1 : 0.25 }}>★</span>
      ))}
    </div>
  )
}

function PlaceCard({ p }: { p: PublicPlace }) {
  return (
    <div style={{
      background: 'var(--arvo-surface)', borderRadius: 10,
      border: `1px solid ${p.is_highlight ? RED : 'var(--arvo-border)'}`,
      boxShadow: p.is_highlight ? `0 0 0 1px ${RED}22` : 'none',
      padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{itemIcon(p)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', fontWeight: 500 }}>
            {p.name}
          </p>
          {p.is_highlight && (
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED }}>destaque</span>
          )}
          {p.visited && (
            <span style={{ fontSize: 10, color: '#1F8A5B' }}>✓ visitado</span>
          )}
          {p.checkin_day != null && p.checkout_day != null && (
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD }}>
              🛏 {p.checkout_day - p.checkin_day} noite{p.checkout_day - p.checkin_day === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {p.address && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>{p.address}</p>
        )}
        {(p.arrive_time || p.depart_time) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
            {p.arrive_time && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)' }}>{p.checkin_day != null ? 'check-in' : 'chegada'} {p.arrive_time}</span>}
            {p.depart_time && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)' }}>{p.checkin_day != null ? 'check-out' : 'saída'} {p.depart_time}</span>}
          </div>
        )}
        {p.rating != null && p.rating > 0 && <div style={{ marginTop: 3 }}><StarRow value={p.rating} /></div>}
        {p.trip_note && (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 12, color: GOLD, marginTop: 4 }}>{p.trip_note}</p>
        )}
        {(p.expense_total ?? 0) > 0 && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 4 }}>
            Gasto aqui: <strong style={{ color: 'var(--arvo-fg)' }}>{fmtCurrency(p.expense_total!, 'EUR')}</strong>
          </p>
        )}
      </div>
      {p.google_maps_url && (
        <a
          href={p.google_maps_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}
        >
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
          </svg>
          Maps
        </a>
      )}
    </div>
  )
}

function ConnectorRow({ p }: { p: PublicPlace }) {
  const isTransport = p.kind === 'transport'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px' }}>
      <span style={{ fontSize: 14, flexShrink: 0, opacity: 0.8 }}>{itemIcon(p)}</span>
      <p style={{
        fontFamily: isTransport ? 'var(--arvo-font-body)' : 'var(--arvo-font-serif)',
        fontStyle: isTransport ? 'normal' : 'italic',
        fontSize: 12, color: 'var(--arvo-fg-soft)', flex: 1,
      }}>
        {p.name}
        {isTransport && p.arrive_time && <span style={{ color: 'var(--arvo-fg-muted)' }}> · {p.arrive_time}{p.depart_time ? ` → ${p.depart_time}` : ''}</span>}
      </p>
    </div>
  )
}

function PlaceGroup({ day, places, staysPassingThrough = [] }: { day: number | null; places: PublicPlace[]; staysPassingThrough?: PublicPlace[] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 4 }}>
        {day !== null && <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(day), flexShrink: 0 }} />}
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: day !== null ? dayColor(day) : 'var(--arvo-fg-muted)' }}>
          {day !== null ? `Dia ${day}` : 'Sem dia'}
        </p>
      </div>
      {staysPassingThrough.map(s => (
        <p key={s.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginBottom: 6, opacity: 0.75 }}>
          🛏 {s.checkout_day === day
            ? `Check-out: ${s.name}${s.depart_time ? ` · ${s.depart_time}` : ''}`
            : `ainda em ${s.name}`}
        </p>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {places.map(p => (
          <div key={p.id}>
            {(p.kind === 'note' || p.kind === 'transport') ? <ConnectorRow p={p} /> : <PlaceCard p={p} />}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PublicTripPage() {
  const { token } = useParams<{ token: string }>()
  const { resolvedTheme } = useTheme()
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`/api/voyage/public/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Erro ao carregar página'))
      .finally(() => setLoading(false))
  }, [token])

  const themeClass = resolvedTheme === 'dark' ? 'dark' : ''

  if (loading) {
    return (
      <div className={themeClass} style={{ minHeight: '100vh', background: 'var(--arvo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="rgba(200,184,154,0.35)" strokeWidth="1.2" style={{ animation: 'pulse 1.5s ease infinite' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 22l8-14 10 8 8-12 8 6"/>
        <path strokeLinecap="round" d="M2 28h28"/>
      </svg>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className={themeClass} style={{ minHeight: '100vh', background: 'var(--arvo-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="rgba(200,184,154,0.25)" strokeWidth="1.3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 34l12-20 14 10 10-16 12 8"/>
          <path strokeLinecap="round" d="M4 42h40"/>
        </svg>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)' }}>
          {error || 'Página não encontrada'}
        </p>
        <a href="/" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: RED, textDecoration: 'none' }}>
          Conhecer o Arvo →
        </a>
      </div>
    )
  }

  const { trip, owner_name, places, cost } = data
  const dateStr = fmtDateRange(trip.start_date, trip.end_date)
  // Stays (checkin/checkout day) need their own section on every day they
  // cover, even days with no other item scheduled — mirrors TripItineraryPanel.
  const stayDays = places.flatMap(p =>
    p.checkin_day != null && p.checkout_day != null
      ? Array.from({ length: p.checkout_day - p.checkin_day + 1 }, (_, i) => p.checkin_day! + i)
      : []
  )
  const days = Array.from(new Set([
    ...places.map(p => p.day_number).filter((d): d is number => d != null),
    ...stayDays,
  ])).sort((a, b) => a - b)
  const undated = places.filter(p => p.day_number == null)
  const withCoords = places.filter(p => p.lat && p.lng)
  const placeCount = places.filter(p => (p.kind ?? 'place') === 'place').length
  const dayCount = days.length > 0 ? days.length : tripDurationDays(trip.start_date, trip.end_date)

  function staysOnDay(d: number) {
    return places.filter(p => p.checkin_day != null && p.checkout_day != null && p.checkin_day <= d && d <= p.checkout_day)
  }

  return (
    <div className={themeClass} style={{ minHeight: '100vh', background: 'var(--arvo-bg)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: 420, background: '#1a1a18', overflow: 'hidden' }}>
        {trip.cover_image_url ? (
          <img
            src={trip.cover_image_url}
            alt={trip.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: trip.cover_image_position, filter: 'sepia(0.20) saturate(1.10) brightness(0.75)' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a1a18 0%, #2a2820 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="80" height="80" viewBox="0 0 56 56" fill="none" stroke="rgba(200,184,154,0.12)" strokeWidth="1.3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 38l12-24 16 12 12-20 12 10"/>
              <path strokeLinecap="round" d="M4 50h48"/>
            </svg>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,13,13,0.85) 0%, rgba(13,13,13,0.15) 60%, transparent 100%)' }} />

        {/* Arvo badge */}
        <div style={{ position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="16" height="17" alt="" />
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(200,184,154,0.7)' }}>arvo voyage</span>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 28px 32px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
              Roteiro de <strong style={{ fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{owner_name}</strong>
            </p>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 38, letterSpacing: '0.05em', color: '#fff', lineHeight: 1.12, marginBottom: 10 }}>
              {trip.title}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {trip.destination && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'rgba(255,255,255,0.68)' }}>
                  {trip.destination}{trip.country ? `, ${trip.country}` : ''}
                </span>
              )}
              {dateStr && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'rgba(255,255,255,0.50)', background: 'rgba(255,255,255,0.10)', padding: '2px 10px', borderRadius: 999 }}>
                  {dateStr}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px 60px' }}>
        {/* Stats strip — overlaps hero bottom edge for a premium "report" feel */}
        <div style={{
          marginTop: -28, marginBottom: 28, position: 'relative', zIndex: 2,
          background: 'var(--arvo-surface)', borderRadius: 16, border: '1px solid var(--arvo-border)',
          boxShadow: 'var(--arvo-shadow-lg)', padding: '18px 8px',
          display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        }}>
          {dayCount != null && (
            <Stat label="Dias" value={String(dayCount)} />
          )}
          <Divider />
          <Stat label={placeCount === 1 ? 'Lugar' : 'Lugares'} value={String(placeCount)} />
          {cost && (
            <>
              <Divider />
              <Stat label="Custo total" value={fmtCurrency(cost.total, cost.currency)} accent />
            </>
          )}
        </div>

        {trip.summary && (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: GOLD, lineHeight: 1.7, marginBottom: 28, textAlign: 'center' }}>
            “{trip.summary}”
          </p>
        )}

        {/* Map */}
        {withCoords.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--arvo-border)', boxShadow: 'var(--arvo-shadow-sm)', height: 380 }}>
              <MapContainer
                center={[withCoords[0].lat!, withCoords[0].lng!]}
                zoom={12}
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
                  <Marker key={p.id} position={[p.lat!, p.lng!]} icon={makeIcon(itemIcon(p), dayColor(p.day_number), p.is_highlight)}>
                    <Popup>
                      <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 150 }}>
                        {p.day_number != null && (
                          <span style={{ display: 'inline-block', fontSize: 10, padding: '1px 7px', borderRadius: 999, background: dayColorWash(p.day_number, 16), color: dayColor(p.day_number), marginBottom: 4 }}>Dia {p.day_number}</span>
                        )}
                        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</p>
                        {p.category && <p style={{ fontSize: 10.5, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.category}</p>}
                        {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                        <OpeningHoursBlock hours={p.opening_hours} />
                        {(p.expense_total ?? 0) > 0 && (
                          <p style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>Gasto aqui: <strong>{fmtCurrency(p.expense_total!, 'EUR')}</strong></p>
                        )}
                        {p.google_maps_url && (
                          <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: '#555', textDecoration: 'none' }}>
                            Abrir no Maps →
                          </a>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            {days.length > 1 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, justifyContent: 'center' }}>
                {days.map(d => (
                  <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(d) }} />
                    Dia {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Download + import actions */}
        {withCoords.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 32, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href={`/api/voyage/public/${token}/kml`}
              download
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.04em' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M7 1v8m0 0l-3-3m3 3l3-3M2 11h10" />
              </svg>
              Baixar KML para Google Maps
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((trip.destination ?? '') + ' ' + (trip.country ?? ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: 'transparent', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5 }}
            >
              <svg width="14" height="14" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
              </svg>
              Abrir destino no Maps
            </a>
          </div>
        )}

        {/* Places by day */}
        {places.length === 0 ? (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD, textAlign: 'center', padding: '40px 0' }}>
            Nenhum lugar compartilhado ainda
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {days.map(d => (
              <PlaceGroup
                key={d}
                day={d}
                places={places.filter(p => p.day_number === d)}
                staysPassingThrough={staysOnDay(d).filter(s => s.checkin_day !== d)}
              />
            ))}
            {undated.length > 0 && (
              <PlaceGroup
                day={null}
                places={undated}
              />
            )}
          </div>
        )}

        {/* CTA — convite para criar o próprio roteiro */}
        <div style={{
          marginTop: 48, padding: '24px 28px', borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(200,184,154,0.10), rgba(214,59,47,0.05))',
          border: '1px solid var(--arvo-border)', textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
            Inspirou sua próxima viagem?
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-fg-soft)', marginBottom: 14, lineHeight: 1.6 }}>
            Monte seu próprio roteiro, organize lugares no mapa e acompanhe o custo da viagem — tudo num só lugar.
          </p>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.04em' }}>
            Criar meu roteiro no Arvo Voyage →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="14" height="15" alt="" style={{ opacity: 0.6 }} />
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
            Criado com <a href="/" style={{ color: GOLD, textDecoration: 'none' }}>Arvo Voyage</a>
          </p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 14px' }}>
      <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 22, fontVariantNumeric: 'tabular-nums', color: accent ? RED : 'var(--arvo-fg)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
      </p>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginTop: 4 }}>
        {label}
      </p>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--arvo-border-soft)' }} />
}
