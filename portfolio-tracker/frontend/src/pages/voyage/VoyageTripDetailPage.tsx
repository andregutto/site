import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import TripFormModal from './TripFormModal'
import CostCard from './CostCard'
import MembersPanel from './MembersPanel'
import TripPlacesPanel from './TripPlacesPanel'
import ShareTripPanel from './ShareTripPanel'
import type { Trip, TripCost, TripMember } from './types'

const RED = '#D63B2F'
const GOLD = '#C8B89A'

const STATUS_COLOR: Record<string, string> = {
  planning: GOLD,
  ongoing: RED,
  past: 'rgba(155,155,155,0.8)',
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

interface TripDetail {
  trip: Trip
  cost: TripCost
  members: TripMember[]
}

export default function VoyageTripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}

  const [data, setData] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const result = await apiFetch<TripDetail>(`/api/voyage/trips/${id}`)
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div style={{ height: 360, borderRadius: 18, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite', marginBottom: 20 }} />
        <div style={{ height: 160, borderRadius: 14, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p style={{ fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg-soft)' }}>Viagem não encontrada.</p>
      </div>
    )
  }

  const { trip, cost } = data
  const statusColor = STATUS_COLOR[trip.status] ?? GOLD
  const dateStr = fmtDateRange(trip.start_date, trip.end_date)
  const statusLabel = trip.status === 'planning' ? tv.statusPlanning : trip.status === 'ongoing' ? tv.statusOngoing : tv.statusPast

  return (
    <div className="max-w-4xl mx-auto px-4 2xl:px-8 py-6">
      {/* Back */}
      <button
        onClick={() => navigate('/voyage')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', padding: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" d="M9 2L4 7l5 5" />
        </svg>
        {tv.title ?? 'Viagens'}
      </button>

      {/* Hero */}
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 24 }}>
        {/* Cover */}
        <div style={{ paddingBottom: '42%', background: '#1a1a18', position: 'relative', overflow: 'hidden' }}>
          {trip.cover_image_url ? (
            <img
              src={trip.cover_image_url}
              alt={trip.title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: trip.cover_image_position, filter: 'sepia(0.20) saturate(1.10) brightness(0.80)' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a18 0%, #2a2820 100%)' }}>
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 72, color: 'rgba(200,184,154,0.12)', letterSpacing: '0.1em' }}>◈</span>
            </div>
          )}
          {/* Gradient */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,13,13,0.75) 0%, rgba(13,13,13,0.10) 55%, transparent 100%)' }} />

          {/* Status badge */}
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(13,13,13,0.65)', backdropFilter: 'blur(8px)', padding: '4px 12px', borderRadius: 999, border: `1px solid ${statusColor}30` }}>
            {trip.status === 'ongoing' && <span style={{ width: 5, height: 5, borderRadius: 999, background: RED, display: 'inline-block' }} />}
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: statusColor }}>
              {statusLabel}
            </span>
          </div>

          {/* Edit button */}
          <button
            onClick={() => setShowEdit(true)}
            style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.04em' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
            </svg>
            Editar
          </button>

          {/* Title overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 22px' }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.7)', marginBottom: 6 }}>
              ◈ ARVO VOYAGE
            </p>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, letterSpacing: '0.06em', color: '#fff', marginBottom: 4, lineHeight: 1.2 }}>
              {trip.title}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
      </div>

      {/* Summary */}
      {trip.summary && (
        <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD, marginBottom: 24, lineHeight: 1.6 }}>
          {trip.summary}
        </p>
      )}

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left col: Cost + Share */}
        <div className="lg:col-span-1 flex flex-col gap-5">
          <CostCard
            tripId={Number(id)}
            cost={cost}
            onCostChanged={updated => setData(prev => prev ? { ...prev, cost: updated } : prev)}
          />
          {trip.user_id === user?.id && (
            <ShareTripPanel
              trip={trip}
              onUpdate={fields => setData(prev => prev ? { ...prev, trip: { ...prev.trip, ...fields } } : prev)}
            />
          )}
        </div>

        {/* Right col: Roteiro + Lugares */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Roteiro stub + link mapa */}
          <div style={{ background: '#fff', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
                Roteiro
              </p>
              <a
                href={`/voyage/map?trip=${id}`}
                onClick={e => { e.preventDefault(); navigate(`/voyage/map?trip=${id}`) }}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, textDecoration: 'none', letterSpacing: '0.04em' }}
              >
                Ver mapa →
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 10 }}>
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 40, color: 'rgba(200,184,154,0.25)' }}>◈</span>
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, textAlign: 'center' }}>
                Itinerário por dia — em breve
              </p>
            </div>
          </div>

          {/* Lugares */}
          <TripPlacesPanel
            tripId={Number(id)}
            tripCity={trip.destination}
            tripCountry={trip.country}
            canEdit={trip.user_id === user?.id}
          />

          {/* Members panel */}
          <MembersPanel
            tripId={Number(id)}
            isOwner={trip.user_id === user?.id}
          />
        </div>
      </div>

      {showEdit && (
        <TripFormModal
          trip={trip}
          onClose={() => setShowEdit(false)}
          onSaved={updatedTrip => {
            setShowEdit(false)
            setData(prev => prev ? { ...prev, trip: updatedTrip } : prev)
          }}
        />
      )}
    </div>
  )
}
