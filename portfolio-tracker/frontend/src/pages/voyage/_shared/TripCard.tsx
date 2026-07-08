import Avatar from './Avatar'

// Card de viagem — extraído da página Viagens do Voyage pra ser reusado pela
// galeria de viagens da Comunidade e pela página de perfil (/u/:username) com
// o mesmo formato visual. A galeria esconde o custo (showCost=false) e mostra
// o dono no rodapé (owner) + um chip de duração (durationLabel).

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.12)'
const GOLD = '#C8B89A'

const STATUS_BADGE: Record<string, { label: string; color: string; dot?: boolean }> = {
  planning: { label: '', color: GOLD },
  ongoing:  { label: '', color: RED, dot: true },
  past:     { label: '', color: 'rgba(155,155,155,0.8)' },
}

function fmtCost(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
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

// Subconjunto de Trip suficiente pro card — a galeria da Comunidade recebe um
// payload próprio (sem custos nem campos de share) que também satisfaz isso.
export interface TripCardData {
  id: number
  title: string
  destination: string | null
  cover_image_url: string | null
  cover_image_position?: string
  start_date: string | null
  end_date: string | null
  status: string
  cost_total?: number
  cost_budget?: number | null
  destinations?: { city: string | null; country: string | null }[]
}

export interface TripCardOwner {
  name: string
  username?: string
  avatar_url?: string
}

interface TripCardProps {
  trip: TripCardData
  onClick: () => void
  t: any
  showCost?: boolean
  durationLabel?: string | null
  owner?: TripCardOwner
  onOwnerClick?: () => void
}

export default function TripCard({ trip, onClick, t, showCost = true, durationLabel, owner, onOwnerClick }: TripCardProps) {
  const badge = STATUS_BADGE[trip.status] ?? STATUS_BADGE.planning
  const dateStr = fmtDateRange(trip.start_date, trip.end_date)
  const hasCost = showCost && ((trip.cost_total ?? 0) > 0 || (trip.cost_budget ?? 0) > 0)

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
            style={{ objectPosition: trip.cover_image_position ?? '50% 50%', filter: 'sepia(0.20) saturate(1.10) brightness(0.85)' }}
          />
        ) : (
          // Preto sólido + logo/wordmark — nunca uma foto de marca aqui, pra
          // não parecer que é foto da própria viagem do usuário quando não é.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: '#0D0D0D' }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="26" height="27" alt="" />
            <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 13, letterSpacing: '0.30em', textIndent: '0.30em', color: 'rgba(246,243,236,0.55)' }}>arvo</span>
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
        {(() => {
          const dests = (trip.destinations ?? []).map(d => d.city ?? d.country).filter(Boolean) as string[]
          const label = dests.length > 0 ? dests.join(' · ') : trip.destination
          return label ? (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </p>
          ) : null
        })()}
        <div className="flex items-center gap-2 flex-wrap">
          {dateStr && (
            <span style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)',
              background: 'var(--arvo-hover-bg)', padding: '2px 8px', borderRadius: 999,
            }}>{dateStr}</span>
          )}
          {durationLabel && (
            <span style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)',
              background: 'var(--arvo-hover-bg)', padding: '2px 8px', borderRadius: 999,
            }}>{durationLabel}</span>
          )}
          {hasCost && (
            <span style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 12,
              color: RED, background: RED_SOFT, padding: '2px 8px', borderRadius: 999,
            }}>
              {fmtCost(trip.cost_total ?? 0)}
              {(trip.cost_budget ?? 0) > 0 && ` / ${fmtCost(trip.cost_budget!)}`}
            </span>
          )}
        </div>

        {/* Dono — rodapé usado só pela galeria da Comunidade */}
        {owner && (
          <div className="flex items-center gap-2" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)' }}>
            <span
              className="flex items-center gap-2 min-w-0"
              onClick={onOwnerClick ? e => { e.stopPropagation(); onOwnerClick() } : undefined}
              style={onOwnerClick ? { cursor: 'pointer' } : undefined}
            >
              <Avatar name={owner.name} avatarUrl={owner.avatar_url} size={22} />
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {owner.name}{owner.username ? ` · @${owner.username}` : ''}
              </span>
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
