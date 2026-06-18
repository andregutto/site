import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import TripFormModal from './TripFormModal'
import type { Trip } from './types'

function fmtCost(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.12)'
const GOLD = '#C8B89A'

const STATUS_BADGE: Record<string, { label: string; color: string; dot?: boolean }> = {
  planning: { label: '', color: GOLD },
  ongoing:  { label: '', color: RED, dot: true },
  past:     { label: '', color: 'rgba(155,155,155,0.8)' },
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

function TripCard({ trip, onClick, t }: { trip: Trip; onClick: () => void; t: any }) {
  const badge = STATUS_BADGE[trip.status] ?? STATUS_BADGE.planning
  const dateStr = fmtDateRange(trip.start_date, trip.end_date)
  const hasCost = (trip.cost_total ?? 0) > 0 || (trip.cost_budget ?? 0) > 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[14px] overflow-hidden transition-all duration-[280ms]"
      style={{ background: '#fff', border: '1px solid var(--arvo-border)', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--arvo-shadow-md)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Cover */}
      <div className="relative" style={{ paddingBottom: '56.25%', background: '#1a1a18', overflow: 'hidden' }}>
        {trip.cover_image_url ? (
          <img
            src={trip.cover_image_url}
            alt={trip.title}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: trip.cover_image_position, filter: 'sepia(0.20) saturate(1.10) brightness(0.85)' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1a18 0%, #2a2820 100%)' }}>
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 48, color: 'rgba(200,184,154,0.15)', letterSpacing: '0.1em' }}>◈</span>
          </div>
        )}
        {/* gradient protection */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(13,13,13,0.6) 0%, transparent 50%)' }} />
        {/* status badge */}
        <div className="absolute top-3 right-3" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(13,13,13,0.65)', backdropFilter: 'blur(8px)',
          padding: '3px 10px', borderRadius: 999, border: `1px solid ${badge.color}30`,
        }}>
          {badge.dot && <span style={{ width: 5, height: 5, borderRadius: 999, background: badge.color, display: 'inline-block' }} />}
          <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: badge.color }}>
            {trip.status === 'planning' ? t.voyage?.statusPlanning : trip.status === 'ongoing' ? t.voyage?.statusOngoing : t.voyage?.statusPast}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px 18px' }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg)', marginBottom: 4 }}>
          {trip.title}
        </p>
        {trip.destination && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
            {trip.destination}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {dateStr && (
            <span style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)',
              background: 'var(--arvo-hover-bg)', padding: '2px 8px', borderRadius: 999,
            }}>{dateStr}</span>
          )}
          {hasCost && (
            <span style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 11,
              color: '#FF8A84', background: RED_SOFT, padding: '2px 8px', borderRadius: 999,
            }}>
              {fmtCost(trip.cost_total ?? 0)}
              {(trip.cost_budget ?? 0) > 0 && ` / ${fmtCost(trip.cost_budget!)}`}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export default function VoyageTripsPage() {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const navigate = useNavigate()
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ trips: Trip[] }>('/api/voyage/trips')
      setTrips(data.trips)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-6xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 6 }}>
            ◈ ARVO VOYAGE
          </p>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--arvo-fg)' }}>
            {tv.title ?? 'Viagens'}
          </h1>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD, marginTop: 4 }}>
            {tv.subtitle ?? 'Suas viagens e experiências'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.08em',
            padding: '8px 18px', borderRadius: 8,
            background: RED, color: '#fff', border: 'none', cursor: 'pointer',
            transition: 'all 160ms ease', flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {tv.addTrip ?? 'Adicionar viagem'}
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-[14px] overflow-hidden" style={{ background: 'var(--arvo-hover-bg)', height: 260, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 320 }}>
          <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 64, color: 'rgba(200,184,154,0.15)', letterSpacing: '0.1em', marginBottom: 24 }}>◈</span>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
            {tv.emptyTitle ?? 'Nenhuma viagem ainda'}
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD }}>
            {tv.emptyBody ?? 'Que tal planejar a primeira?'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {trips.map(trip => (
            <TripCard
              key={trip.id}
              trip={trip}
              t={t}
              onClick={() => navigate(`/voyage/${trip.id}`)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <TripFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}
