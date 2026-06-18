import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'

interface ItineraryPlace {
  id: number
  name: string
  category: string | null
  trip_note: string | null
  visited: boolean
  day_number: number | null
  is_highlight: boolean
}

interface Props {
  tripId: number
  canEdit: boolean
}

const CATEGORY_ICONS: Record<string, string> = {
  restaurantes: '🍽️', restaurante: '🍽️',
  padarias: '🥐', padaria: '🥐',
  cafés: '☕', café: '☕', cafes: '☕', cafe: '☕',
  museus: '🏛️', museu: '🏛️',
  hotéis: '🏨', hotel: '🏨', hoteis: '🏨',
  bares: '🍺', bar: '🍺',
  praias: '🏖️', praia: '🏖️',
  parques: '🌳', parque: '🌳',
  compras: '🛍️', mercados: '🛒',
  favoritos: '⭐', favorito: '⭐',
}

function catIcon(cat: string | null): string {
  if (!cat) return '📌'
  const key = cat.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '📌'
}

function DayBadge({ day, canEdit, onChangeDay }: {
  day: number | null
  canEdit: boolean
  onChangeDay: (day: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(day?.toString() ?? '')

  function commit() {
    const n = parseInt(val)
    onChangeDay(isNaN(n) || n < 1 ? null : n)
    setEditing(false)
  }

  if (editing) return (
    <input
      type="number" min="1" max="60"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
      autoFocus
      style={{
        width: 44, padding: '2px 4px', borderRadius: 4,
        border: `1px solid ${RED}`, background: 'var(--arvo-surface)',
        fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg)',
        outline: 'none', textAlign: 'center',
      }}
    />
  )

  return (
    <button
      type="button"
      onClick={() => { if (canEdit) { setVal(day?.toString() ?? ''); setEditing(true) } }}
      title={canEdit ? 'Clique para editar o dia' : undefined}
      style={{
        fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em',
        padding: '2px 8px', borderRadius: 999, flexShrink: 0,
        background: day != null ? 'rgba(214,59,47,0.08)' : 'var(--arvo-hover-bg)',
        color: day != null ? RED : 'var(--arvo-fg-soft)',
        border: `1px solid ${day != null ? 'rgba(214,59,47,0.18)' : 'var(--arvo-border)'}`,
        cursor: canEdit ? 'pointer' : 'default',
      }}
    >
      {day != null ? `Dia ${day}` : 'Sem dia'}
    </button>
  )
}

function PlaceRow({ place, canEdit, onChangeDay }: {
  place: ItineraryPlace
  canEdit: boolean
  onChangeDay: (day: number | null) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: place.is_highlight ? 'rgba(214,59,47,0.04)' : 'var(--arvo-hover-bg)',
      border: `1px solid ${place.is_highlight ? 'rgba(214,59,47,0.12)' : 'var(--arvo-border-soft)'}`,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{catIcon(place.category)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
            fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {place.name}
          </p>
          {place.visited && (
            <span style={{ fontSize: 11, color: '#1F8A5B', flexShrink: 0 }}>✓</span>
          )}
          {place.is_highlight && (
            <span style={{
              fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: RED, flexShrink: 0,
            }}>destaque</span>
          )}
        </div>
        {place.trip_note && (
          <p style={{
            fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic',
            fontSize: 11, color: GOLD, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {place.trip_note}
          </p>
        )}
      </div>
      <DayBadge day={place.day_number} canEdit={canEdit} onChangeDay={onChangeDay} />
    </div>
  )
}

export default function TripItineraryPanel({ tripId, canEdit }: Props) {
  const [places, setPlaces] = useState<ItineraryPlace[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ places: ItineraryPlace[] }>(`/voyage/trips/${tripId}/places`)
      setPlaces(data.places)
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => { load() }, [load])

  async function changeDay(placeId: number, day: number | null) {
    setPlaces(ps => ps.map(p => p.id === placeId ? { ...p, day_number: day } : p))
    try {
      await apiFetch(`/voyage/trips/${tripId}/places/${placeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ day_number: day }),
      })
    } catch {
      load()
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 42, borderRadius: 8, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite', animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )

  if (places.length === 0) return (
    <p style={{
      fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic',
      fontSize: 13, color: GOLD, textAlign: 'center', padding: '16px 0',
    }}>
      Adicione lugares à viagem para montar o roteiro
    </p>
  )

  const days = Array.from(new Set(
    places.map(p => p.day_number).filter((d): d is number => d != null)
  )).sort((a, b) => a - b)
  const undated = places.filter(p => p.day_number == null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {days.map(d => (
        <div key={d}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8,
          }}>
            Dia {d}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {places.filter(p => p.day_number === d).map(p => (
              <PlaceRow key={p.id} place={p} canEdit={canEdit} onChangeDay={day => changeDay(p.id, day)} />
            ))}
          </div>
        </div>
      ))}
      {undated.length > 0 && (
        <div>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8,
          }}>
            Sem dia
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {undated.map(p => (
              <PlaceRow key={p.id} place={p} canEdit={canEdit} onChangeDay={day => changeDay(p.id, day)} />
            ))}
          </div>
        </div>
      )}
      {canEdit && (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textAlign: 'center' }}>
          Clique no dia de cada lugar para reorganizar o roteiro
        </p>
      )}
    </div>
  )
}
