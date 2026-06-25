import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import TripFormModal from './TripFormModal'
import CostCard from './CostCard'
import MembersPanel from './MembersPanel'
import { ShareModal } from './ShareTripPanel'
import TripItineraryPanel from './TripItineraryPanel'
import TripMapCard from './TripMapCard'
import Avatar from './_shared/Avatar'
import type { Trip, TripCost, TripMember } from './types'

interface HeroMember {
  id: number
  status: 'pending' | 'active' | 'left'
  display: { name: string; email: string; avatar_url?: string }
}

function CollaboratorsHero({ tripId, onOpen }: { tripId: number; onOpen: () => void }) {
  const [members, setMembers] = useState<HeroMember[]>([])

  useEffect(() => {
    apiFetch<{ members: HeroMember[] }>(`/voyage/trips/${tripId}/members`)
      .then(d => setMembers(d.members.filter(m => m.status === 'active')))
      .catch(() => {})
  }, [tripId])

  const shown = members.slice(0, 4)

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 999, padding: shown.length > 0 ? '4px 10px 4px 4px' : '5px 12px', cursor: 'pointer',
      }}
      title="Colaboradores"
    >
      {shown.length > 0 && (
        <div className="flex -space-x-2">
          {shown.map(m => (
            <div key={m.id} style={{ border: '2px solid rgba(13,13,13,0.55)', borderRadius: '50%' }}>
              <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} size={22} />
            </div>
          ))}
        </div>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.04em' }}>
        {shown.length === 0 ? (
          <>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="5" cy="4.5" r="2.5"/>
              <path strokeLinecap="round" d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4M9.5 4.8a2 2 0 110 4M13 12c0-1.7-1.2-3.1-2.8-3.6"/>
            </svg>
            Convidar
          </>
        ) : (
          <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>
        )}
      </span>
    </button>
  )
}

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
  const [showShare, setShowShare] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  // TripMapCard and TripItineraryPanel each fetch this trip's places
  // independently — bumping this tells the map to refetch whenever the
  // itinerary panel's list changes (add/delete/reload), since otherwise the
  // map kept showing a stale list until a full page reload.
  const [placesVersion, setPlacesVersion] = useState(0)
  const bumpPlacesVersion = useCallback(() => setPlacesVersion(v => v + 1), [])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const result = await apiFetch<TripDetail>(`/voyage/trips/${id}`)
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

  const { trip, cost, members } = data
  const isOwner = trip.user_id === user?.id
  const myMembership = members.find(m => m.user_id === user?.id && m.status === 'active')
  const canEdit = isOwner || myMembership?.role === 'editor'
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
        <div className="h-44 sm:h-52 lg:h-56" style={{ background: '#1a1a18', position: 'relative', overflow: 'hidden' }}>
          {trip.cover_image_url ? (
            <img
              src={trip.cover_image_url}
              alt={trip.title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: trip.cover_image_position, filter: 'sepia(0.20) saturate(1.10) brightness(0.80)' }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1a1a18 0%, #2a2820 100%)' }}>
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="rgba(200,184,154,0.12)" strokeWidth="1.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 44L18 18l16 12 14-22 16 12"/>
                <path strokeLinecap="round" d="M4 52h52"/>
              </svg>
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

          {/* Collaborators — avatar stack + invite trigger, canto inferior direito (livre, sem disputar espaço com o título) */}
          <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
            <CollaboratorsHero tripId={Number(id)} onOpen={() => setShowMembers(true)} />
          </div>

          {/* Top-left buttons: Edit + Share */}
          <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setShowEdit(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.04em' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
              </svg>
              Editar
            </button>
            {trip.user_id === user?.id && (
              <button
                onClick={() => setShowShare(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(13,13,13,0.55)', backdropFilter: 'blur(8px)', border: `1px solid ${trip.share_token ? 'rgba(31,138,91,0.50)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.04em' }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="11" cy="3" r="1.5"/>
                  <circle cx="3" cy="7" r="1.5"/>
                  <circle cx="11" cy="11" r="1.5"/>
                  <path strokeLinecap="round" d="M4.5 6.2l5-2.5M4.5 7.8l5 2.5"/>
                </svg>
                {trip.share_token ? (
                  <>Compartilhado<span style={{ width: 5, height: 5, borderRadius: 999, background: '#1F8A5B', display: 'inline-block', marginLeft: 4 }} /></>
                ) : 'Compartilhar'}
              </button>
            )}
          </div>

          {/* Title overlay */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 22px' }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.7)', marginBottom: 6 }}>
              ARVO VOYAGE
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

      {/* Linha superior: Mapa dividindo coluna com Custo (no mobile empilha) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <div className="lg:col-span-2">
          <TripMapCard tripId={Number(id)} refreshKey={placesVersion} />
        </div>
        <div className="lg:col-span-1">
          <CostCard
            tripId={Number(id)}
            cost={cost}
            onCostChanged={updated => setData(prev => prev ? { ...prev, cost: updated } : prev)}
          />
        </div>
      </div>

      {/* Roteiro unificado — largura total, fica longo então não divide coluna */}
      <TripItineraryPanel
        tripId={Number(id)}
        tripCity={trip.destination}
        tripCountry={trip.country}
        canEdit={canEdit}
        onPlacesChanged={bumpPlacesVersion}
      />

      {showMembers && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowMembers(false) }}
        >
          <div
            className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]"
            style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', boxShadow: 'var(--arvo-shadow-lg)' }}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 13, letterSpacing: '0.10em', color: 'var(--arvo-fg)' }}>
                Colaboradores
              </p>
              <button
                type="button" onClick={() => setShowMembers(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4 }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <MembersPanel tripId={Number(id)} isOwner={trip.user_id === user?.id} />
            </div>
          </div>
        </div>
      )}

      {showShare && trip.user_id === user?.id && (
        <ShareModal
          trip={trip}
          onUpdate={fields => setData(prev => prev ? { ...prev, trip: { ...prev.trip, ...fields } } : prev)}
          onClose={() => setShowShare(false)}
        />
      )}

      {showEdit && (
        <TripFormModal
          trip={trip}
          onClose={() => setShowEdit(false)}
          onSaved={updatedTrip => {
            setShowEdit(false)
            setData(prev => prev ? { ...prev, trip: updatedTrip } : prev)
          }}
          onDeleted={() => navigate('/voyage')}
        />
      )}
    </div>
  )
}
