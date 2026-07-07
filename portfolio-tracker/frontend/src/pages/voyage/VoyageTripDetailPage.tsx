import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import TripEditPanel from './TripEditPanel'
import CostCard from './CostCard'
import MembersPanel from './MembersPanel'
import { ShareModal } from './ShareTripPanel'
import TripItineraryPanel from './TripItineraryPanel'
import TripMapCard from './TripMapCard'
import Avatar from './_shared/Avatar'
import type { Trip, TripCost, TripMember, TripDestination } from './types'

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
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'rgba(255,255,255,0.80)', letterSpacing: '0.04em' }}>
        {shown.length === 0 ? (
          <>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="5" cy="4.5" r="2.5"/>
              <path strokeLinecap="round" d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4M9.5 4.8a2 2 0 110 4M13 12c0-1.7-1.2-3.1-2.8-3.6"/>
            </svg>
            Convidar
          </>
        ) : (
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
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

function fmtEur(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function HeroStat({ label, value, accent, chevron }: { label: string; value: string; accent?: boolean; chevron?: 'up' | 'down' }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 21, fontVariantNumeric: 'tabular-nums', color: accent ? RED : 'var(--arvo-fg)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
        {chevron && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ transform: chevron === 'up' ? 'rotate(180deg)' : 'none' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5l3.5 3.5 3.5-3.5" />
          </svg>
        )}
      </span>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginTop: 4 }}>
        {label}
      </span>
    </div>
  )
}

function StatDivider() {
  return <div style={{ width: 1, background: 'var(--arvo-border-soft)' }} />
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
  destinations: TripDestination[]
  places?: { id: number; day_number: number | null }[]
}

function destinationsLabel(destinations: TripDestination[]): string | null {
  const withCity = destinations.filter(d => d.city)
  if (withCity.length === 0) return null
  // Com 1 destino só, o intervalo de dias é redundante (é a viagem toda) —
  // só mostra "dia X–Y" quando há mais de um, pra ajudar a diferenciar.
  const label = (d: TripDestination) => {
    if (withCity.length === 1 || d.day_start == null) return d.city as string
    return `${d.city} (${d.day_start}${d.day_end != null && d.day_end !== d.day_start ? `–${d.day_end}` : ''})`
  }
  if (withCity.length <= 3) return withCity.map(label).join(' · ')
  return `${withCity.slice(0, 2).map(label).join(' · ')} +${withCity.length - 2}`
}

export default function VoyageTripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}

  const [data, setData] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  async function changeStatus(s: 'planning' | 'ongoing' | 'past') {
    setShowStatusMenu(false)
    setData(prev => prev ? { ...prev, trip: { ...prev.trip, status: s } } : prev)
    setSavingStatus(true)
    try {
      await apiFetch(`/voyage/trips/${id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) })
    } finally {
      setSavingStatus(false)
    }
  }
  // TripMapCard and TripItineraryPanel each fetch this trip's places
  // independently — bumping this tells the map to refetch whenever the
  // itinerary panel's list changes (add/delete/reload), since otherwise the
  // map kept showing a stale list until a full page reload.
  const [placesVersion, setPlacesVersion] = useState(0)
  const bumpPlacesVersion = useCallback(() => setPlacesVersion(v => v + 1), [])

  // Estado compartilhado entre mapa e roteiro (layout desktop lado a lado):
  // o filtro de dia escolhido no mapa também filtra a lista, e clicar num
  // lugar da lista destaca/centraliza o marker correspondente no mapa.
  const [sharedSelectedDay, setSharedSelectedDay] = useState<number | 'none' | null>(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null)
  const [showCostDetail, setShowCostDetail] = useState(false)

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
      <div className="py-6">
        <div style={{ height: 360, borderRadius: 18, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite', marginBottom: 20 }} />
        <div style={{ height: 160, borderRadius: 14, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-12 text-center">
        <p style={{ fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg-soft)' }}>Viagem não encontrada.</p>
      </div>
    )
  }

  const { trip, cost, members, destinations } = data
  const isOwner = trip.user_id === user?.id
  const myMembership = members.find(m => m.user_id === user?.id && m.status === 'active')
  const canEdit = isOwner || myMembership?.role === 'editor'
  const statusColor = STATUS_COLOR[trip.status] ?? GOLD
  const dateStr = fmtDateRange(trip.start_date, trip.end_date)
  const statusLabel = trip.status === 'planning' ? tv.statusPlanning : trip.status === 'ongoing' ? tv.statusOngoing : tv.statusPast

  return (
    <div className="py-6">
      {/* Back + Editar/Compartilhar — fora do hero (igual ao padrão de outras
          páginas de detalhe), pra a foto de capa ficar livre de botões por cima. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <button
          onClick={() => navigate('/voyage')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', padding: 0, flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M9 2L4 7l5 5" />
          </svg>
          {tv.title ?? 'Viagens'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {canEdit && (
            <button
              onClick={() => setShowEditPanel(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: showEditPanel ? 'var(--arvo-hover-bg)' : 'none', border: '1px solid var(--arvo-border)', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
              </svg>
              {tv.editTripBtn ?? 'Editar'}
            </button>
          )}
          {trip.user_id === user?.id && (
            <button
              onClick={() => setShowShare(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${trip.share_token ? 'rgba(31,138,91,0.45)' : 'var(--arvo-border)'}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="3" r="1.5"/>
                <circle cx="3" cy="7" r="1.5"/>
                <circle cx="11" cy="11" r="1.5"/>
                <path strokeLinecap="round" d="M4.5 6.2l5-2.5M4.5 7.8l5 2.5"/>
              </svg>
              {trip.share_token ? (
                <>{tv.sharedTripBtn ?? 'Compartilhado'}<span style={{ width: 5, height: 5, borderRadius: 999, background: '#1F8A5B', display: 'inline-block', marginLeft: 4 }} /></>
              ) : (tv.shareTripBtn ?? 'Compartilhar')}
            </button>
          )}
        </div>
      </div>

      {/* Hero */}
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 24 }}>
        {/* Cover */}
        <div className="h-52 sm:h-48 lg:h-44" style={{ background: '#1a1a18', position: 'relative', overflow: 'hidden' }}>
          {trip.cover_image_url ? (
            <img
              src={trip.cover_image_url}
              alt={trip.title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: trip.cover_image_position, filter: 'sepia(0.20) saturate(1.10) brightness(0.80)' }}
            />
          ) : (
            // Preto sólido — mesmo fallback de "sem foto" usado em Viagens
            // (VoyageTripsPage), Momentos (FinancesMomentsPage) e na Hoje
            // (CoverCard), pra não parecer foto real da viagem quando não é.
            // Aqui o logo/wordmark vai no canto superior esquerdo (espelhando
            // a pill de status no canto superior direito) em vez de
            // centralizado: centralizado colidia visualmente com o título
            // grande que fica ancorado embaixo (título + destino + data).
            <div style={{ position: 'absolute', inset: 0, background: '#0D0D0D' }} />
          )}
          {!trip.cover_image_url && (
            <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
              <img src="/brand/logo/arvo-symbol-gold.svg" width="17" height="18" alt="" />
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 12, letterSpacing: '0.26em', textIndent: '0.26em', color: 'rgba(246,243,236,0.45)' }}>arvo</span>
            </div>
          )}
          {/* Gradient */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,13,13,0.75) 0%, rgba(13,13,13,0.10) 55%, transparent 100%)' }} />

          {/* Status — pill clicável (não botão de ação): mostra o estado atual
              e, para quem pode editar, abre um popover para trocar direto aqui
              no hero, sem entrar na edição da viagem. */}
          <div style={{ position: 'absolute', top: 16, right: 16 }}>
            <button
              type="button"
              onClick={() => canEdit && setShowStatusMenu(v => !v)}
              disabled={!canEdit}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(13,13,13,0.45)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.10)', borderRadius: 999, padding: '4px 12px',
                cursor: canEdit ? 'pointer' : 'default', opacity: savingStatus ? 0.6 : 1,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.85)' }}>
                {statusLabel}
              </span>
              {canEdit && (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" style={{ marginLeft: 1 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4l2.5 2.5L7.5 4" />
                </svg>
              )}
            </button>
            {showStatusMenu && canEdit && (
              <>
                <div onClick={() => setShowStatusMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 10, boxShadow: 'var(--arvo-shadow-lg)', overflow: 'hidden', minWidth: 150 }}>
                  {(['planning', 'ongoing', 'past'] as const).map(s => {
                    const label = s === 'planning' ? tv.statusPlanning : s === 'ongoing' ? tv.statusOngoing : tv.statusPast
                    const active = trip.status === s
                    return (
                      <button
                        key={s} type="button" onClick={() => changeStatus(s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', background: active ? 'var(--arvo-hover-bg)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: STATUS_COLOR[s] ?? GOLD, display: 'inline-block' }} />
                        {label}
                        {active && <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ marginLeft: 'auto' }}><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6.5l2.5 2.5 4.5-5.5" /></svg>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Collaborators — avatar stack + invite trigger, canto inferior direito (livre, sem disputar espaço com o título) */}
          <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
            <CollaboratorsHero tripId={Number(id)} onOpen={() => setShowMembers(true)} />
          </div>

          {/* Title overlay — pointerEvents:none porque a div cobre a faixa
              inferior inteira (right:0) e, mesmo vazia visualmente do lado
              direito, estava interceptando o clique no botão de
              colaboradores que fica por cima dela no canto inferior direito. */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 22px', pointerEvents: 'none' }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(200,184,154,0.7)', marginBottom: 6 }}>
              ARVO VOYAGE
            </p>
            <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 28, letterSpacing: '0.06em', color: '#fff', marginBottom: 4, lineHeight: 1.2 }}>
              {trip.title}
            </h1>
            <div className="flex flex-col" style={{ gap: 6 }}>
              {(destinationsLabel(destinations) ?? (trip.destination ? `${trip.destination}${trip.country ? `, ${trip.country}` : ''}` : null)) && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                  {destinationsLabel(destinations) ?? `${trip.destination}${trip.country ? `, ${trip.country}` : ''}`}
                </span>
              )}
              {dateStr && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'rgba(255,255,255,0.50)', background: 'rgba(255,255,255,0.10)', padding: '2px 10px', borderRadius: 999, alignSelf: 'flex-start' }}>
                  {dateStr}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEditPanel && canEdit && (
        <TripEditPanel
          trip={trip}
          destinations={destinations}
          isOwner={isOwner}
          onSaved={updatedTrip => setData(prev => prev ? { ...prev, trip: updatedTrip } : prev)}
          onDestinationsChanged={updated => setData(prev => prev ? { ...prev, destinations: updated } : prev)}
          onDeleted={() => navigate('/voyage')}
          onClose={() => setShowEditPanel(false)}
        />
      )}

      {/* Summary */}
      {trip.summary && (
        <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD, marginBottom: 24, lineHeight: 1.6 }}>
          {trip.summary}
        </p>
      )}

      {/* Álbum de fotos — card dedicado (visível a todos que veem a viagem,
          colaboradores incluídos) e também replicado na página pública. */}
      {trip.photo_album_url && (
        <a
          href={trip.photo_album_url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 20, borderRadius: 12, border: '1px solid var(--arvo-border-soft)', background: 'var(--arvo-hover-bg)', textDecoration: 'none' }}
        >
          <span style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,184,154,0.14)', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={GOLD} strokeWidth="1.5">
              <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
              <circle cx="7" cy="8" r="1.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 14l4-3.5 3.5 3 3-2.5 3.5 3" />
            </svg>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)' }}>
              {tv.photoAlbumTitle ?? 'Álbum de fotos compartilhado'}
            </span>
            <span style={{ display: 'block', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}>
              {tv.photoAlbumSubtitle ?? 'Abrir em uma nova aba'}
            </span>
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h7v7M13 3L6.5 9.5M11 9.5V13H3V5h3.5" />
          </svg>
        </a>
      )}

      {/* Faixa de stats (Dias · Lugares · Custo) — mesma linguagem da página
          pública, logo abaixo do hero. Clicar expande o detalhamento de
          custo completo (categorias, lugares, por colaborador). */}
      {(() => {
        const placeCount = data.places?.length ?? 0
        const dayNums = (data.places ?? []).map(p => p.day_number).filter((d): d is number => d != null)
        const dayCount = dayNums.length > 0 ? Math.max(...dayNums) : (() => {
          if (!trip.start_date || !trip.end_date) return null
          const ms = new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()
          return ms >= 0 ? Math.round(ms / 86400000) + 1 : null
        })()
        const hasCost = (cost?.total ?? 0) > 0 || (cost?.budget ?? 0) > 0
        return (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => hasCost && setShowCostDetail(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
                background: 'var(--arvo-surface)', borderRadius: 14, border: '1px solid var(--arvo-border)',
                boxShadow: 'var(--arvo-shadow-sm)', padding: '14px 8px',
                cursor: hasCost ? 'pointer' : 'default',
              }}
            >
              {dayCount != null && <HeroStat label={tv.public?.statDays ?? 'Dias'} value={String(dayCount)} />}
              {dayCount != null && <StatDivider />}
              <HeroStat label={placeCount === 1 ? (tv.public?.statPlace ?? 'Lugar') : (tv.public?.statPlaces ?? 'Lugares')} value={String(placeCount)} />
              {hasCost && <StatDivider />}
              {hasCost && (
                <HeroStat
                  label={tv.public?.statCost ?? 'Custo total'}
                  value={fmtEur(cost.total)}
                  accent
                  chevron={showCostDetail ? 'up' : 'down'}
                />
              )}
            </button>
            {showCostDetail && hasCost && (
              <div style={{ marginTop: 12 }}>
                <CostCard
                  tripId={Number(id)}
                  cost={cost}
                  onCostChanged={updated => setData(prev => prev ? { ...prev, cost: updated } : prev)}
                />
              </div>
            )}
          </div>
        )
      })()}

      {/* Roteiro (esquerda 40%) + mapa (direita 60%) na mesma linha no desktop —
          mesma estrutura da página pública: lista em fluxo normal (rola com a
          página, sem scroll próprio) e mapa sticky com altura fixa. No mobile
          empilha, mapa primeiro. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 mb-5 lg:items-start">
        <div className="order-2 lg:order-1">
          <TripItineraryPanel
            tripId={Number(id)}
            tripCity={trip.destination}
            tripCountry={trip.country}
            tripStartDate={trip.start_date}
            destinations={destinations}
            canEdit={canEdit}
            onPlacesChanged={bumpPlacesVersion}
            selectedDay={sharedSelectedDay}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={setSelectedPlaceId}
          />
        </div>
        <div className="order-1 lg:order-2 h-[440px] lg:sticky lg:top-4 lg:h-[calc(100vh-150px)] lg:max-h-[760px]">
          <TripMapCard
            tripId={Number(id)}
            refreshKey={placesVersion}
            selectedDay={sharedSelectedDay}
            onSelectedDayChange={setSharedSelectedDay}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={setSelectedPlaceId}
          />
        </div>
      </div>

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
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.10em', color: 'var(--arvo-fg)' }}>
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
    </div>
  )
}
