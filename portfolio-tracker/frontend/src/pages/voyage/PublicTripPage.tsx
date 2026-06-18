import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

const RED = '#D63B2F'
const GOLD = '#C8B89A'

interface PublicPlace {
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

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function PlaceGroup({ day, places }: { day: number | null; places: PublicPlace[] }) {
  return (
    <div>
      {day !== null && (
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10, marginTop: 4 }}>
          Dia {day}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {places.map(p => (
          <div key={p.id} style={{
            background: 'var(--arvo-surface)', borderRadius: 10,
            border: `1px solid ${p.is_highlight ? RED : 'var(--arvo-border)'}`,
            padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{catIcon(p.category)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', fontWeight: 500 }}>
                  {p.name}
                </p>
                {p.is_highlight && (
                  <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED }}>destaque</span>
                )}
                {p.visited && (
                  <span style={{ fontSize: 10, color: '#1F8A5B' }}>✓ visitado</span>
                )}
              </div>
              {p.address && (
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>{p.address}</p>
              )}
              {p.trip_note && (
                <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 12, color: GOLD, marginTop: 4 }}>{p.trip_note}</p>
              )}
            </div>
            {p.google_maps_url && (
              <a
                href={p.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 6, background: RED, color: '#fff', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}
              >
                <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
                </svg>
                Maps
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PublicTripPage() {
  const { token } = useParams<{ token: string }>()
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--arvo-offwhite)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="rgba(200,184,154,0.35)" strokeWidth="1.2" style={{ animation: 'pulse 1.5s ease infinite' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 22l8-14 10 8 8-12 8 6"/>
        <path strokeLinecap="round" d="M2 28h28"/>
      </svg>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--arvo-offwhite)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
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
  const days = Array.from(new Set(places.map(p => p.day_number).filter(d => d != null) as number[])).sort((a, b) => a - b)
  const undated = places.filter(p => p.day_number == null)
  const withCoords = places.filter(p => p.lat && p.lng)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--arvo-offwhite)' }}>
      {/* Hero */}
      <div style={{ position: 'relative', height: 380, background: '#1a1a18', overflow: 'hidden' }}>
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
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,13,13,0.80) 0%, rgba(13,13,13,0.10) 60%, transparent 100%)' }} />

        {/* Arvo badge */}
        <div style={{ position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="16" height="17" alt="" />
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.22em', color: 'rgba(200,184,154,0.7)' }}>arvo voyage</span>
        </div>

        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 28px 28px' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
            Roteiro de <strong style={{ fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{owner_name}</strong>
          </p>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 32, letterSpacing: '0.06em', color: '#fff', lineHeight: 1.15, marginBottom: 8 }}>
            {trip.title}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {trip.destination && (
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
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

      {/* Content */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 60px' }}>
        {trip.summary && (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: GOLD, lineHeight: 1.7, marginBottom: 32 }}>
            {trip.summary}
          </p>
        )}

        {/* Cost */}
        {cost && (
          <div style={{ background: 'var(--arvo-surface)', borderRadius: 16, border: '1px solid var(--arvo-border)', boxShadow: 'var(--arvo-shadow-sm)', padding: '18px 22px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4 }}>Custo total</p>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 26, fontVariantNumeric: 'tabular-nums', color: 'var(--arvo-fg)', letterSpacing: '-0.02em' }}>
                {fmtCurrency(cost.total, cost.currency)}
              </p>
            </div>
            {cost.budget != null && (
              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4 }}>Budget</p>
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 16, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCurrency(cost.budget, cost.currency)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Download + import actions */}
        {withCoords.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
            <a
              href={`/api/voyage/public/${token}/kml`}
              download
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: RED, color: '#fff', textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.04em' }}
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
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'transparent', border: `1px solid ${RED}`, color: RED, textDecoration: 'none', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5 }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {days.map(d => (
              <PlaceGroup
                key={d}
                day={d}
                places={places.filter(p => p.day_number === d)}
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

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="14" height="15" alt="" style={{ opacity: 0.6 }} />
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
            Criado com <a href="/" style={{ color: GOLD, textDecoration: 'none' }}>Arvo Voyage</a>
          </p>
        </div>
      </div>
    </div>
  )
}
