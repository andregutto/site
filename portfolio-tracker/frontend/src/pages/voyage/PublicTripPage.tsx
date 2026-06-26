import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../contexts/I18nContext'
import LanguageSelector from '../../components/LanguageSelector'
import ArvoLoader from '../../components/ArvoLoader'
import { dayColor, dayColorWash } from './_shared/dayColors'
import OpeningHoursBlock from './_shared/OpeningHours'

function intlLocaleFor(locale: string) {
  return locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
}

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
  photo_album_url: string | null
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
  destinations?: { id: number; city: string | null; country: string | null }[]
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

// As categorias vêm de texto livre (digitado pelo usuário ou nome de lista
// do Google Takeout, quase sempre em PT) — não dá pra traduzir texto livre
// automaticamente, mas as categorias mais comuns batem com essas palavras-
// chave, então pelo menos essas aparecem no idioma do visitante. O resto
// (nomes de lugares, categorias incomuns) continua como foi cadastrado.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  restaurantes: 'restaurants', restaurante: 'restaurants',
  padarias: 'bakeries', padaria: 'bakeries',
  cafés: 'cafes', café: 'cafes', cafes: 'cafes',
  museus: 'museums', museu: 'museums',
  hotéis: 'hotels', hotel: 'hotels', hoteis: 'hotels',
  bares: 'bars', bar: 'bars',
  praias: 'beaches', praia: 'beaches',
  parques: 'parks', parque: 'parks',
  compras: 'shopping', mercados: 'markets',
  pontos: 'touristSpots', turísticos: 'touristSpots', favoritos: 'favorites',
  aluguel: 'carRental', carro: 'carRental', carros: 'carRental',
}

function categoryLabel(cat: string | null, tv: any): string | null {
  if (!cat) return null
  const key = cat.toLowerCase()
  for (const [k, labelKey] of Object.entries(CATEGORY_LABEL_KEYS)) {
    if (key.includes(k)) return tv.public?.category?.[labelKey] ?? cat
  }
  return cat
}

function itemIcon(p: PublicPlace): string {
  if (p.kind === 'note') return '📝'
  if (p.kind === 'transport') return p.transport_mode ? (TRANSPORT_ICONS[p.transport_mode] ?? '🔀') : '🔀'
  return catIcon(p.category)
}

// A multi-day stay you're not physically present at every day (a rented car,
// as opposed to a hotel room) doesn't need a daily "still going" reminder —
// only the pickup (check-in day) and return (check-out day) matter.
function isLogisticalStay(category: string | null): boolean {
  if (!category) return false
  const key = category.toLowerCase()
  return key.includes('carro') || key.includes('aluguel')
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
  // `places` (visibleCoords) is recreated every render even when its content
  // is the same (it's a .filter() result) — without a stable key, selecting
  // a place re-triggered fitBounds and undid the flyTo zoom-in.
  const key = places.map(p => p.id).join(',')
  useEffect(() => {
    const pts = places.filter(p => p.lat && p.lng)
    if (!pts.length) return
    if (pts.length === 1) { map.setView([pts[0].lat!, pts[0].lng!], 13); return }
    map.fitBounds(L.latLngBounds(pts.map(p => [p.lat!, p.lng!])), { padding: [36, 36] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

// Voa até o marker do lugar selecionado na lista e abre o popup dele.
function FlyToSelected({ placeId, places, markerRefs }: {
  placeId: number | null
  places: PublicPlace[]
  markerRefs: React.MutableRefObject<Record<number, L.Marker>>
}) {
  const map = useMap()
  useEffect(() => {
    if (placeId == null) return
    const p = places.find(pl => pl.id === placeId)
    if (!p || p.lat == null || p.lng == null) return
    const marker = markerRefs.current[placeId]
    // Esperar o flyTo terminar de fato antes de abrir o popup — um timeout
    // mais curto que a animação fazia o autoPan calcular com base numa
    // posição de mapa em trânsito, cortando o balão.
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
    map.once('moveend', () => marker?.openPopup())
  }, [placeId, places, map, markerRefs])
  return null
}

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

function fmtDate(d: string, intlLocale: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(intlLocale, { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtDateRange(start: string | null, end: string | null, intlLocale: string, tv: any) {
  if (!start && !end) return null
  if (start && end && start === end) return fmtDate(start, intlLocale)
  if (start && end) return `${fmtDate(start, intlLocale)} – ${fmtDate(end, intlLocale)}`
  if (start) return (tv.public?.dateFrom ?? 'from {date}').replace('{date}', fmtDate(start, intlLocale))
  return (tv.public?.dateUntil ?? 'until {date}').replace('{date}', fmtDate(end!, intlLocale))
}

// Lista de destinos, condensando em "+N" só quando passa do limite — o
// hero tem espaço horizontal de sobra pra mostrar mais que 2 antes de
// condensar (limite maior no desktop, menor no mobile via maxMobile/maxDesktop).
function destinationsLabel(destinations: { city: string | null; country: string | null }[], max: number): string | null {
  const names = destinations.map(d => d.city ?? d.country).filter(Boolean) as string[]
  if (names.length === 0) return null
  if (names.length <= max) return names.join(' · ')
  return `${names.slice(0, max).join(' · ')} +${names.length - max}`
}

function tripDurationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

function fmtCurrency(n: number, currency: string, intlLocale: string) {
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
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

function PlaceCard({ p, selected, onSelect }: { p: PublicPlace; selected?: boolean; onSelect?: () => void }) {
  const { t, locale } = useI18n()
  const tv = (t as any).voyage ?? {}
  const intlLocale = intlLocaleFor(locale)
  const nights = p.checkin_day != null && p.checkout_day != null ? p.checkout_day - p.checkin_day + 1 : 0
  return (
    <div
      onClick={() => { if (onSelect && p.lat != null && p.lng != null) onSelect() }}
      style={{
        background: selected ? 'rgba(200,184,154,0.10)' : 'var(--arvo-surface)', borderRadius: 10,
        border: `1px solid ${selected ? GOLD : p.is_highlight ? RED : 'var(--arvo-border)'}`,
        boxShadow: p.is_highlight && !selected ? `0 0 0 1px ${RED}22` : 'none',
        padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10,
        cursor: onSelect && p.lat != null && p.lng != null ? 'pointer' : 'default',
        transition: 'border-color 120ms, background 120ms',
      }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{itemIcon(p)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)', fontWeight: 500 }}>
            {p.name}
          </p>
          {p.is_highlight && (
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED }}>{tv.public?.highlight ?? 'highlight'}</span>
          )}
          {p.visited && (
            <span style={{ fontSize: 10, color: '#1F8A5B' }}>✓ {tv.public?.visited ?? 'visited'}</span>
          )}
          {p.checkin_day != null && p.checkout_day != null && (
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD }}>
              {itemIcon(p)} {nights === 1 ? (tv.public?.stayDayOne ?? '1 day') : (tv.public?.stayDaysMany ?? '{n} days').replace('{n}', String(nights))}
            </span>
          )}
        </div>
        {p.address && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>{p.address}</p>
        )}
        {(p.arrive_time || p.depart_time) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
            {p.arrive_time && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{p.checkin_day != null ? (tv.public?.checkIn ?? 'check-in') : (tv.public?.arrival ?? 'arrival')} {p.arrive_time}</span>}
            {p.depart_time && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{p.checkin_day != null ? (tv.public?.checkOut ?? 'check-out') : (tv.public?.departure ?? 'departure')} {p.depart_time}</span>}
          </div>
        )}
        {p.rating != null && p.rating > 0 && <div style={{ marginTop: 3 }}><StarRow value={p.rating} /></div>}
        {p.trip_note && (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, marginTop: 4 }}>{p.trip_note}</p>
        )}
        {(p.expense_total ?? 0) > 0 && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 4 }}>
            {tv.public?.expenseHere ?? 'Spent here:'} <strong style={{ color: 'var(--arvo-fg)' }}>{fmtCurrency(p.expense_total!, 'EUR', intlLocale)}</strong>
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
        fontSize: 13, color: 'var(--arvo-fg-soft)', flex: 1,
      }}>
        {p.name}
        {isTransport && p.arrive_time && <span style={{ color: 'var(--arvo-fg-muted)' }}> · {p.arrive_time}{p.depart_time ? ` → ${p.depart_time}` : ''}</span>}
      </p>
    </div>
  )
}

function PlaceGroup({ day, places, staysPassingThrough = [], selectedPlaceId, onSelectPlace }: { day: number | null; places: PublicPlace[]; staysPassingThrough?: PublicPlace[]; selectedPlaceId?: number | null; onSelectPlace?: (id: number | null) => void }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, marginTop: 4 }}>
        {day !== null && <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(day), flexShrink: 0 }} />}
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: day !== null ? dayColor(day) : 'var(--arvo-fg-muted)' }}>
          {day !== null ? (tv.public?.dayLabel ?? 'Day {n}').replace('{n}', String(day)) : (tv.public?.noDayLabel ?? 'No day')}
        </p>
      </div>
      {staysPassingThrough.map(s => (
        <p key={s.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>
          {itemIcon(s)} {s.checkout_day === day
            ? (tv.places?.stayCheckout ?? 'Check-out: {name}').replace('{name}', s.name) + (s.depart_time ? ` · ${s.depart_time}` : '')
            : (tv.places?.stayInProgress ?? 'em andamento: {name}').replace('{name}', s.name)}
        </p>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {places.map(p => (
          <div key={p.id}>
            {(p.kind === 'note' || p.kind === 'transport')
              ? <ConnectorRow p={p} />
              : <PlaceCard p={p} selected={selectedPlaceId === p.id} onSelect={onSelectPlace ? () => onSelectPlace(selectedPlaceId === p.id ? null : p.id) : undefined} />}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PublicTripPage() {
  const { token } = useParams<{ token: string }>()
  const { resolvedTheme } = useTheme()
  const { t, locale } = useI18n()
  const tv = (t as any).voyage ?? {}
  const intlLocale = intlLocaleFor(locale)
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDay, setSelectedDay] = useState<number | 'none' | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null)
  const [showKmlHelp, setShowKmlHelp] = useState(false)
  const [showMapsMenu, setShowMapsMenu] = useState(false)
  const markerRefs = useRef<Record<number, L.Marker>>({})
  // Zoom por scroll só ativa após um clique — sem isso, o mapa sticky e
  // grande "engasgava" o scroll da página sempre que o cursor passava por
  // cima (a roda zoomava o mapa em vez de rolar a página).
  const [mapActive, setMapActive] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/voyage/public/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError(tv.public?.loadError ?? 'Error loading page'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const themeClass = resolvedTheme === 'dark' ? 'dark' : ''

  if (loading) {
    return (
      <div className={themeClass} style={{ minHeight: '100vh', background: 'var(--arvo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ArvoLoader size={48} style={{ color: 'var(--arvo-gold)' }} />
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
          {error || tv.public?.notFound || 'Page not found'}
        </p>
        <a href="/" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: RED, textDecoration: 'none' }}>
          {tv.public?.discoverArvo ?? 'Discover Arvo →'}
        </a>
      </div>
    )
  }

  const { trip, owner_name, places, cost } = data
  const dateStr = fmtDateRange(trip.start_date, trip.end_date, intlLocale, tv)
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
  const undatedAll = places.filter(p => p.day_number == null)
  const withCoords = places.filter(p => p.lat && p.lng)
  const hasUndated = places.some(p => p.day_number == null)
  const placeCount = places.filter(p => (p.kind ?? 'place') === 'place').length
  const dayCount = days.length > 0 ? days.length : tripDurationDays(trip.start_date, trip.end_date)

  function staysOnDay(d: number) {
    return places.filter(p => p.checkin_day != null && p.checkout_day != null && p.checkin_day <= d && d <= p.checkout_day)
  }

  // Filtro de dia compartilhado entre mapa e lista (igual à página privada).
  const visibleDays = selectedDay == null ? days : selectedDay === 'none' ? [] : days.filter(d => d === selectedDay)
  const undated = selectedDay == null || selectedDay === 'none' ? undatedAll : []
  const visibleCoords = selectedDay == null ? withCoords
    : selectedDay === 'none' ? withCoords.filter(p => p.day_number == null)
    : withCoords.filter(p => p.day_number === selectedDay)

  return (
    <div className={themeClass} style={{ minHeight: '100vh', background: 'var(--arvo-bg)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: 300, background: '#1a1a18', overflow: 'hidden' }}>
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
        {/* Top scrim — sem isso o logo/seletor de idioma sumiam em fotos claras no topo */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to bottom, rgba(13,13,13,0.55) 0%, transparent 100%)' }} />

        {/* Arvo badge */}
        <div style={{ position: 'absolute', top: 18, left: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="16" height="17" alt="" />
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(200,184,154,0.85)' }}>arvo voyage</span>
        </div>

        {/* Language selector — overrides the theme CSS vars the shared
            component reads, since the hero is always a dark photo overlay
            regardless of light/dark theme (its own text is hardcoded white,
            not theme-driven). */}
        <div
          style={{
            position: 'absolute', top: 14, right: 24,
            ['--arvo-fg' as any]: '#fff',
            ['--arvo-fg-soft' as any]: 'rgba(255,255,255,0.55)',
            ['--arvo-fg-faint' as any]: 'rgba(255,255,255,0.3)',
            ['--arvo-gold' as any]: '#C8B89A',
          }}
        >
          <LanguageSelector />
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 28px 32px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
              {(() => {
                const [pre, post] = (tv.public?.ownerItinerary ?? "{name}'s itinerary").split('{name}')
                return <>{pre}<strong style={{ fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{owner_name}</strong>{post}</>
              })()}
            </p>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 38, letterSpacing: '0.05em', color: '#fff', lineHeight: 1.12, marginBottom: 10 }}>
              {trip.title}
            </h1>
            <div className="flex flex-col" style={{ gap: 6 }}>
              {(() => {
                const dests = data!.destinations ?? []
                const fallback = trip.destination ? `${trip.destination}${trip.country ? `, ${trip.country}` : ''}` : null
                const mobileLabel = dests.length > 0 ? destinationsLabel(dests, 2) : fallback
                const desktopLabel = dests.length > 0 ? destinationsLabel(dests, 4) : fallback
                if (!mobileLabel) return null
                return (
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'rgba(255,255,255,0.68)' }}>
                    <span className="sm:hidden">{mobileLabel}</span>
                    <span className="hidden sm:inline">{desktopLabel}</span>
                  </span>
                )
              })()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
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
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 20px 60px' }}>
        {/* Stats strip — overlaps hero bottom edge for a premium "report" feel */}
        <div style={{
          marginTop: -28, marginBottom: 28, position: 'relative', zIndex: 2, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto',
          background: 'var(--arvo-surface)', borderRadius: 16, border: '1px solid var(--arvo-border)',
          boxShadow: 'var(--arvo-shadow-lg)', padding: '18px 8px',
          display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        }}>
          {dayCount != null && (
            <Stat label={tv.public?.statDays ?? 'Days'} value={String(dayCount)} />
          )}
          <Divider />
          <Stat label={placeCount === 1 ? (tv.public?.statPlace ?? 'Place') : (tv.public?.statPlaces ?? 'Places')} value={String(placeCount)} />
          {cost && (
            <>
              <Divider />
              <Stat label={tv.public?.statCost ?? 'Total cost'} value={fmtCurrency(cost.total, cost.currency, intlLocale)} accent />
            </>
          )}
        </div>

        {trip.summary && (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: GOLD, lineHeight: 1.7, marginBottom: 28, textAlign: 'center', maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
            “{trip.summary}”
          </p>
        )}

        {/* Álbum de fotos — card dedicado, mesmo conteúdo da página interna */}
        {trip.photo_album_url && (
          <a
            href={trip.photo_album_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginTop: 16, marginBottom: 16, borderRadius: 12, border: '1px solid var(--arvo-border)', background: 'var(--arvo-hover-bg)', textDecoration: 'none', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}
          >
            <span style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,184,154,0.14)', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#C8B89A" strokeWidth="1.5">
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <circle cx="7" cy="8" r="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 14l4-3.5 3.5 3 3-2.5 3.5 3" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>
                {tv.public?.photoAlbumTitle ?? 'Álbum de fotos compartilhado'}
              </span>
              <span style={{ display: 'block', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>
                {tv.public?.photoAlbum ?? 'Ver mais fotos →'}
              </span>
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h7v7M13 3L6.5 9.5M11 9.5V13H3V5h3.5" />
            </svg>
          </a>
        )}

        {/* Download + import actions — uma linha limpa: KML (primário),
            Maps (dropdown quando há vários destinos) e um "?" de ajuda. */}
        {withCoords.length > 0 && (() => {
          const dests = (data!.destinations ?? []).filter(d => d.city || d.country)
          const mapsQuery = (s: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s)}`
          const destText = (d: { city: string | null; country: string | null }) => [d.city, d.country].filter(Boolean).join(', ')
          return (
          <div style={{ marginBottom: 32, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
              <a
                href={`/api/voyage/public/${token}/kml`}
                download
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.02em' }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M7 1v8m0 0l-3-3m3 3l3-3M2 11h10" />
                </svg>
                {tv.public?.downloadKml ?? 'Download KML for Google Maps'}
              </a>

              {/* Maps: 0/1 destino → link direto; vários → dropdown por destino */}
              {dests.length > 1 ? (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button" onClick={() => setShowMapsMenu(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, background: 'transparent', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
                    </svg>
                    {tv.public?.openDestinationMulti ?? 'Open in Maps'}
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4l2.5 2.5L7.5 4" /></svg>
                  </button>
                  {showMapsMenu && (
                    <>
                      <div onClick={() => setShowMapsMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 10, boxShadow: 'var(--arvo-shadow-lg)', overflow: 'hidden', minWidth: 180 }}>
                        {dests.map(d => (
                          <a key={d.id} href={mapsQuery(destText(d))} target="_blank" rel="noopener noreferrer"
                            onClick={() => setShowMapsMenu(false)}
                            style={{ display: 'block', padding: '8px 14px', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>
                            {destText(d)}
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <a
                  href={mapsQuery(dests[0] ? destText(dests[0]) : `${trip.destination ?? ''} ${trip.country ?? ''}`)}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, background: 'transparent', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5 }}
                >
                  <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
                  </svg>
                  {tv.public?.openDestination ?? 'Open destination in Maps'}
                </a>
              )}

              {/* Ajuda KML — botão "?" redondo e discreto */}
              <button
                type="button" onClick={() => setShowKmlHelp(v => !v)}
                title={tv.public?.kmlHelpShow ?? 'Como usar o KML no Google Maps?'}
                aria-label={tv.public?.kmlHelpShow ?? 'Como usar o KML no Google Maps?'}
                style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: showKmlHelp ? 'var(--arvo-hover-bg)' : 'transparent', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)', fontSize: 13 }}
              >
                ?
              </button>
            </div>

            {/* Passo a passo do KML — aparece ao clicar no "?" */}
            {withCoords.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                {showKmlHelp && (
                  <ol style={{
                    textAlign: 'left', maxWidth: 420, margin: '10px auto 0', padding: '14px 18px 14px 34px',
                    borderRadius: 12, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)',
                    fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)', lineHeight: 1.7,
                  }}>
                    <li>{tv.public?.kmlStep1 ?? 'Baixe o arquivo KML pelo botão acima.'}</li>
                    <li>{tv.public?.kmlStep2 ?? 'Abra google.com/maps no computador e entre na sua conta Google.'}</li>
                    <li>{tv.public?.kmlStep3 ?? 'Vá em Seus lugares → Mapas → Criar um mapa.'}</li>
                    <li>{tv.public?.kmlStep4 ?? 'Clique em Importar e selecione o arquivo KML baixado.'}</li>
                    <li>{tv.public?.kmlStep5 ?? 'Os lugares aparecem no seu mapa e ficam salvos para abrir no app do celular.'}</li>
                  </ol>
                )}
              </div>
            )}
          </div>
          )
        })()}

        {/* Roteiro (lista, esquerda 40%) + mapa (direita 60%, sticky) — mesma
            estrutura map-forward da página privada. Filtro de dia compartilhado
            e clique no item destaca o lugar no mapa. */}
        {places.length === 0 ? (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD, textAlign: 'center', padding: '40px 0' }}>
            {tv.public?.noPlaces ?? 'No places shared yet'}
          </p>
        ) : (
          <>
            {(days.length > 1 || hasUndated) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, justifyContent: 'center' }}>
                <button type="button" onClick={() => setSelectedDay(null)}
                  style={{ cursor: 'pointer', fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, border: `1px solid ${selectedDay === null ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: selectedDay === null ? 'var(--arvo-hover-bg)' : 'transparent', color: selectedDay === null ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)' }}>
                  {tv.public?.mapFilterAll ?? 'All'}
                </button>
                {days.map(d => (
                  <button key={d} type="button" onClick={() => setSelectedDay(d)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 9px', borderRadius: 999, border: `1px solid ${selectedDay === d ? dayColor(d) : 'var(--arvo-border)'}`, background: selectedDay === d ? dayColorWash(d, 10) : 'transparent', color: selectedDay === d ? dayColor(d) : 'var(--arvo-fg-soft)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(d) }} />
                    {(tv.public?.dayLabel ?? 'Day {n}').replace('{n}', String(d))}
                  </button>
                ))}
                {hasUndated && (
                  <button type="button" onClick={() => setSelectedDay('none')}
                    style={{ cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 9px', borderRadius: 999, border: `1px solid ${selectedDay === 'none' ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: selectedDay === 'none' ? 'var(--arvo-hover-bg)' : 'transparent', color: selectedDay === 'none' ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)' }}>
                    {tv.public?.noDayLabel ?? 'No day'}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 lg:items-start">
              <div className="order-2 lg:order-1" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                {visibleDays.map(d => (
                  <PlaceGroup
                    key={d}
                    day={d}
                    places={places.filter(p => p.day_number === d)}
                    staysPassingThrough={staysOnDay(d).filter(s => s.checkin_day !== d && (s.checkout_day === d || !isLogisticalStay(s.category)))}
                    selectedPlaceId={selectedPlaceId}
                    onSelectPlace={setSelectedPlaceId}
                  />
                ))}
                {undated.length > 0 && (
                  <PlaceGroup day={null} places={undated} selectedPlaceId={selectedPlaceId} onSelectPlace={setSelectedPlaceId} />
                )}
              </div>

              {withCoords.length > 0 && (
                <div className="order-1 lg:order-2 h-[440px] lg:sticky lg:top-4 lg:h-[calc(100vh-150px)] lg:max-h-[760px]">
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--arvo-border)', boxShadow: 'var(--arvo-shadow-sm)', height: '100%', isolation: 'isolate' }}>
                    {visibleCoords.length === 0 ? (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)' }} />
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
                      <MapContainer center={[visibleCoords[0].lat!, visibleCoords[0].lng!]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={mapActive}>
                        <ResizeInvalidate />
                        <FlyToSelected placeId={selectedPlaceId} places={visibleCoords} markerRefs={markerRefs} />
                        <TileLayer
                          key={resolvedTheme}
                          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                          url={resolvedTheme === 'dark'
                            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'}
                        />
                        <FitBounds places={visibleCoords} />
                        {visibleCoords.map(p => (
                          <Marker
                            key={p.id} position={[p.lat!, p.lng!]}
                            icon={makeIcon(itemIcon(p), dayColor(p.day_number), p.is_highlight || p.id === selectedPlaceId)}
                            ref={m => { if (m) markerRefs.current[p.id] = m }}
                            eventHandlers={{ click: () => setSelectedPlaceId(p.id) }}
                          >
                            <Popup closeButton={false} maxHeight={220} autoPanPadding={[16, 16]}>
                              <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 150, position: 'relative' }}>
                                <button
                                  type="button"
                                  onClick={() => { setSelectedPlaceId(null); markerRefs.current[p.id]?.closePopup() }}
                                  style={{ position: 'absolute', top: -2, right: -2, background: 'none', border: 'none', cursor: 'pointer', color: '#999', padding: 4, lineHeight: 1, fontSize: 13 }}
                                >✕</button>
                                {p.day_number != null && (
                                  <span style={{ display: 'inline-block', fontSize: 10, padding: '1px 7px', borderRadius: 999, background: dayColorWash(p.day_number, 16), color: dayColor(p.day_number), marginBottom: 4 }}>
                                    {(tv.public?.dayLabel ?? 'Day {n}').replace('{n}', String(p.day_number))}
                                  </span>
                                )}
                                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</p>
                                {p.category && <p style={{ fontSize: 10.5, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{categoryLabel(p.category, tv)}</p>}
                                {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                                <OpeningHoursBlock hours={p.opening_hours} />
                                {(p.expense_total ?? 0) > 0 && (
                                  <p style={{ fontSize: 11, color: '#444', marginBottom: 4 }}>{tv.public?.expenseHere ?? 'Spent here:'} <strong>{fmtCurrency(p.expense_total!, 'EUR', intlLocale)}</strong></p>
                                )}
                                {p.google_maps_url && (
                                  <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#555', textDecoration: 'none' }}>
                                    {tv.public?.openInMaps ?? 'Open in Maps →'}
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
              )}
            </div>
          </>
        )}

        {/* CTA — convite para criar o próprio roteiro */}
        <div style={{
          marginTop: 48, padding: '24px 28px', borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(200,184,154,0.10), rgba(214,59,47,0.05))',
          border: '1px solid var(--arvo-border)', textAlign: 'center',
        }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
            {tv.public?.ctaTitle ?? 'Inspired your next trip?'}
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-fg-soft)', marginBottom: 14, lineHeight: 1.6 }}>
            {tv.public?.ctaBody ?? "Build your own itinerary, organize places on the map and track your trip's cost — all in one place."}
          </p>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.04em' }}>
            {tv.public?.ctaButton ?? 'Create my itinerary on Arvo Voyage →'}
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="14" height="15" alt="" style={{ opacity: 0.6 }} />
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
              {tv.public?.createdWith ?? 'Created with'} <a href="/" style={{ color: GOLD, textDecoration: 'none' }}>Arvo Voyage</a>
            </p>
          </div>
          <LanguageSelector />
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
