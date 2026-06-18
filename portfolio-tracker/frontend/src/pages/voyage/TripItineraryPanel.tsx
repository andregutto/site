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
  arrive_time: string | null
  depart_time: string | null
  transport_mode: string | null
  transport_note: string | null
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

const TRANSPORT_ICONS: Record<string, string> = {
  flight: '✈️', train: '🚆', bus: '🚌', car: '🚗',
  boat: '⛴️', walk: '🚶', metro: '🚇', other: '🔀',
}
const TRANSPORT_LABELS: Record<string, string> = {
  flight: 'Voo', train: 'Trem', bus: 'Ônibus', car: 'Carro',
  boat: 'Barco', walk: 'A pé', metro: 'Metro', other: 'Outro',
}

function TimeField({ label, value, onChange }: {
  label: string; value: string | null; onChange: (v: string | null) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', flexShrink: 0 }}>{label}</span>
      <input
        type="time"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={{
          fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg)',
          background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
          borderRadius: 4, padding: '1px 4px', outline: 'none', width: 76,
        }}
      />
    </div>
  )
}

function PlaceRow({ place, canEdit, onChangeDay, onChangeTransport }: {
  place: ItineraryPlace
  canEdit: boolean
  onChangeDay: (day: number | null) => void
  onChangeTransport: (fields: Partial<Pick<ItineraryPlace, 'arrive_time' | 'depart_time' | 'transport_mode' | 'transport_note'>>) => void
}) {
  const [showTransport, setShowTransport] = useState(
    !!(place.arrive_time || place.depart_time || place.transport_mode || place.transport_note)
  )

  return (
    <div style={{
      borderRadius: 8,
      background: place.is_highlight ? 'rgba(214,59,47,0.04)' : 'var(--arvo-hover-bg)',
      border: `1px solid ${place.is_highlight ? 'rgba(214,59,47,0.12)' : 'var(--arvo-border-soft)'}`,
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{catIcon(place.category)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
              fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {place.name}
            </p>
            {place.visited && <span style={{ fontSize: 11, color: '#1F8A5B', flexShrink: 0 }}>✓</span>}
            {place.is_highlight && (
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED, flexShrink: 0 }}>destaque</span>
            )}
          </div>
          {/* Time badges (read-only summary when collapsed) */}
          {!showTransport && (place.arrive_time || place.depart_time || place.transport_mode) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              {place.transport_mode && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-soft)' }}>
                  {TRANSPORT_ICONS[place.transport_mode]} {TRANSPORT_LABELS[place.transport_mode] ?? place.transport_mode}
                </span>
              )}
              {place.arrive_time && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-soft)' }}>chegada {place.arrive_time}</span>
              )}
              {place.depart_time && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-soft)' }}>saída {place.depart_time}</span>
              )}
            </div>
          )}
          {place.trip_note && (
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 11, color: GOLD, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {place.trip_note}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowTransport(v => !v)}
              title="Horários e transporte"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, color: showTransport ? RED : 'var(--arvo-fg-muted)', fontSize: 13 }}
            >
              🕐
            </button>
          )}
          <DayBadge day={place.day_number} canEdit={canEdit} onChangeDay={onChangeDay} />
        </div>
      </div>

      {/* Transport/time editor */}
      {showTransport && canEdit && (
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Transport mode */}
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 5 }}>Transporte para chegar aqui</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(TRANSPORT_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onChangeTransport({ transport_mode: place.transport_mode === k ? null : k })}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${place.transport_mode === k ? RED : 'var(--arvo-border)'}`,
                    background: place.transport_mode === k ? 'rgba(214,59,47,0.08)' : 'transparent',
                    color: place.transport_mode === k ? RED : 'var(--arvo-fg-muted)',
                  }}
                >
                  {TRANSPORT_ICONS[k]} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <TimeField label="Chegada" value={place.arrive_time} onChange={v => onChangeTransport({ arrive_time: v })} />
            <TimeField label="Saída" value={place.depart_time} onChange={v => onChangeTransport({ depart_time: v })} />
          </div>

          {/* Transport note */}
          <input
            type="text"
            placeholder="Nota de transporte (voo, nº de reserva…)"
            value={place.transport_note ?? ''}
            onChange={e => onChangeTransport({ transport_note: e.target.value || null })}
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg)',
              background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
              borderRadius: 4, padding: '4px 8px', outline: 'none', width: '100%',
            }}
          />
        </div>
      )}
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

  async function patchPlace(placeId: number, fields: Record<string, unknown>) {
    setPlaces(ps => ps.map(p => p.id === placeId ? { ...p, ...fields } : p))
    try {
      await apiFetch(`/voyage/trips/${tripId}/places/${placeId}`, {
        method: 'PATCH', body: JSON.stringify(fields),
      })
    } catch {
      load()
    }
  }

  function changeDay(placeId: number, day: number | null) {
    patchPlace(placeId, { day_number: day })
  }

  function changeTransport(placeId: number, fields: Partial<Pick<ItineraryPlace, 'arrive_time' | 'depart_time' | 'transport_mode' | 'transport_note'>>) {
    patchPlace(placeId, fields as Record<string, unknown>)
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
              <PlaceRow key={p.id} place={p} canEdit={canEdit} onChangeDay={day => changeDay(p.id, day)} onChangeTransport={f => changeTransport(p.id, f)} />
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
              <PlaceRow key={p.id} place={p} canEdit={canEdit} onChangeDay={day => changeDay(p.id, day)} onChangeTransport={f => changeTransport(p.id, f)} />
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
