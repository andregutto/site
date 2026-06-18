import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import TripFormModal from './TripFormModal'
import MomentPickerModal from './MomentPickerModal'
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
      className="w-full text-left rounded-[14px] overflow-hidden"
      style={{
        background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', cursor: 'pointer',
        transition: 'transform 280ms cubic-bezier(0.22,0.61,0.36,1), box-shadow 280ms cubic-bezier(0.22,0.61,0.36,1)',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--arvo-shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
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
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="rgba(200,184,154,0.18)" strokeWidth="1.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 26l8-16 10 8 8-13 8 7"/>
              <path strokeLinecap="round" d="M2 32h32"/>
            </svg>
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
              color: RED, background: RED_SOFT, padding: '2px 8px', borderRadius: 999,
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
  const [showForm, setShowForm]               = useState(false)
  const [showMomentPicker, setShowMomentPicker] = useState(false)
  const [filter, setFilter] = useState<'all' | 'planning' | 'ongoing' | 'past'>('all')

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
            ARVO VOYAGE
          </p>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--arvo-fg)' }}>
            {tv.title ?? 'Viagens'}
          </h1>
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

      {/* Filter pills */}
      {!loading && trips.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-5">
          {([
            { key: 'all',      label: 'Todas' },
            { key: 'planning', label: tv.statusPlanning ?? 'Planejando' },
            { key: 'ongoing',  label: tv.statusOngoing  ?? 'Em viagem' },
            { key: 'past',     label: tv.statusPast     ?? 'Concluídas' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                fontFamily: 'var(--arvo-font-display)', fontSize: 9.5, letterSpacing: '0.18em',
                textTransform: 'uppercase', padding: '4px 14px', borderRadius: 999,
                background: filter === key ? 'var(--arvo-fg)' : 'transparent',
                color: filter === key ? 'var(--arvo-surface)' : 'var(--arvo-fg-muted)',
                border: `1px solid ${filter === key ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
                cursor: 'pointer', transition: 'all 160ms ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-[14px] overflow-hidden" style={{ background: 'var(--arvo-hover-bg)', height: 260, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 320, gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="rgba(200,184,154,0.30)" strokeWidth="1.5" style={{ marginBottom: 8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 38l12-24 16 12 12-20 12 10"/>
            <path strokeLinecap="round" d="M4 50h48"/>
            <circle cx="28" cy="16" r="4" strokeWidth="1.2"/>
          </svg>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)', textAlign: 'center' }}>
            {tv.emptyTitle ?? 'Nenhuma viagem ainda'}
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 16, color: GOLD, textAlign: 'center' }}>
            {tv.emptyBody ?? 'Que tal planejar a primeira?'}
          </p>
        </div>
      ) : (() => {
        const visible = filter === 'all' ? trips : trips.filter(t => t.status === filter)
        if (visible.length === 0) return (
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: GOLD, textAlign: 'center', padding: '48px 0' }}>
            Nenhuma viagem neste filtro
          </p>
        )
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visible.map((trip, i) => (
              <div key={trip.id} style={{ animation: 'fadeUp 320ms cubic-bezier(0.22,0.61,0.36,1) both', animationDelay: `${i * 40}ms` }}>
                <TripCard trip={trip} t={t} onClick={() => navigate(`/voyage/${trip.id}`)} />
              </div>
            ))}
          </div>
        )
      })()}

      {showForm && (
        <TripFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
          onFromMoment={() => { setShowForm(false); setShowMomentPicker(true) }}
        />
      )}

      {showMomentPicker && (
        <MomentPickerModal onClose={() => setShowMomentPicker(false)} />
      )}
    </div>
  )
}
