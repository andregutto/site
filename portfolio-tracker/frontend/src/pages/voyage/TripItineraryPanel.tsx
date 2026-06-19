import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { LibraryPicker } from './TripPlacesPanel'
import PlaceExpensesPanel from './PlaceExpensesPanel'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'
const GREEN = '#1F8A5B'

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

type Kind = 'place' | 'note' | 'transport'

interface PlanItem {
  id: number
  kind: Kind
  name: string
  category: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  trip_note: string | null
  visited: boolean
  day_number: number | null
  is_highlight: boolean
  rating: number | null
  arrive_time: string | null
  depart_time: string | null
  transport_mode: string | null
  transport_note: string | null
  expense_total?: number
  expense_count?: number
}

interface Props {
  tripId: number
  tripCity: string | null
  tripCountry: string | null
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

const TRANSPORT_ICONS: Record<string, string> = {
  flight: '✈️', train: '🚆', bus: '🚌', car: '🚗',
  boat: '⛴️', walk: '🚶', metro: '🚇', other: '🔀',
}
const TRANSPORT_LABELS: Record<string, string> = {
  flight: 'Voo', train: 'Trem', bus: 'Ônibus', car: 'Carro',
  boat: 'Barco', walk: 'A pé', metro: 'Metro', other: 'Outro',
}

function itemIcon(item: PlanItem): string {
  if (item.kind === 'note') return '📝'
  if (item.kind === 'transport') return item.transport_mode ? (TRANSPORT_ICONS[item.transport_mode] ?? '🔀') : '🔀'
  const cat = item.category
  if (!cat) return '📌'
  const key = cat.toLowerCase()
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '📌'
}

function DayBadge({ day, canEdit, onChangeDay }: {
  day: number | null; canEdit: boolean; onChangeDay: (day: number | null) => void
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
      type="number" min="1" max="60" inputMode="numeric"
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      autoFocus
      style={{ width: 48, padding: '3px 4px', borderRadius: 4, border: `1px solid ${RED}`, background: 'var(--arvo-surface)', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg)', outline: 'none', textAlign: 'center' }}
    />
  )

  return (
    <button
      type="button"
      onClick={() => { if (canEdit) { setVal(day?.toString() ?? ''); setEditing(true) } }}
      title={canEdit ? 'Editar o dia' : undefined}
      style={{
        fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em',
        padding: '3px 9px', borderRadius: 999, flexShrink: 0,
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

function TimeField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', flexShrink: 0 }}>{label}</span>
      <input
        type="time" value={value ?? ''} onChange={e => onChange(e.target.value || null)}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg)', background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 4, padding: '2px 4px', outline: 'none', width: 84 }}
      />
    </div>
  )
}

function StarRating({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n === value ? 0 : n)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default', fontSize: 13, opacity: (value ?? 0) >= n ? 1 : 0.25 }}>★</button>
      ))}
    </div>
  )
}

function ItemRow({ item, tripId, canEdit, onPatch, onDelete, onReload }: {
  item: PlanItem
  tripId: number
  canEdit: boolean
  onPatch: (fields: Record<string, unknown>) => void
  onDelete: () => void
  onReload: () => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [expanded, setExpanded] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [note, setNote] = useState(item.trip_note ?? '')
  const [showExpenses, setShowExpenses] = useState(false)
  const isPlace = item.kind === 'place'
  const hasExpenses = (item.expense_total ?? 0) > 0

  async function del() {
    if (!confirm((tv.confirm?.removePlaceFromTrip ?? 'Remover "{name}" da viagem?').replace('{name}', item.name))) return
    await apiFetch(`/voyage/trips/${tripId}/places/${item.id}`, { method: 'DELETE' })
    onDelete()
  }

  return (
    <div style={{
      borderRadius: 8,
      background: item.is_highlight ? 'rgba(214,59,47,0.04)' : 'var(--arvo-hover-bg)',
      border: `1px solid ${item.is_highlight ? 'rgba(214,59,47,0.12)' : 'var(--arvo-border-soft)'}`,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px' }}>
        {/* Visited toggle (places only) */}
        {canEdit && isPlace && (
          <button
            type="button"
            onClick={() => onPatch({ visited: !item.visited })}
            title="Visitado"
            style={{ marginTop: 2, flexShrink: 0, width: 18, height: 18, borderRadius: 999, border: `1.5px solid ${item.visited ? GREEN : 'var(--arvo-border)'}`, background: item.visited ? GREEN : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {item.visited && <span style={{ fontSize: 10, color: '#fff' }}>✓</span>}
          </button>
        )}
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{itemIcon(item)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: item.visited ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg)', fontWeight: 500, textDecoration: item.visited ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </p>
            {item.is_highlight && (
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED, flexShrink: 0 }}>destaque</span>
            )}
          </div>
          {item.address && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address}</p>
          )}
          {/* Transport/time summary */}
          {(item.transport_mode || item.arrive_time || item.depart_time) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              {item.transport_mode && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-soft)' }}>{TRANSPORT_ICONS[item.transport_mode]} {TRANSPORT_LABELS[item.transport_mode] ?? item.transport_mode}</span>}
              {item.arrive_time && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-soft)' }}>chegada {item.arrive_time}</span>}
              {item.depart_time && <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-soft)' }}>saída {item.depart_time}</span>}
            </div>
          )}
          {item.rating != null && isPlace && <StarRating value={item.rating} />}
          {item.trip_note && !editingNote && (
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 11, color: GOLD, marginTop: 2 }}>{item.trip_note}</p>
          )}
          {hasExpenses && (
            <button type="button" onClick={() => canEdit && setShowExpenses(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: 0, background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="6" r="5" /><path strokeLinecap="round" d="M6 3.5v5M4.7 7.2c0 .7.6 1 1.3 1s1.3-.3 1.3-1-.6-.9-1.3-.9-1.3-.3-1.3-.9.6-1 1.3-1 1.3.3 1.3 1" />
              </svg>
              {fmtCurrency(item.expense_total ?? 0)}
              <span style={{ color: 'var(--arvo-fg-muted)' }}>· {item.expense_count} {item.expense_count === 1 ? (tv.expenses?.expenseOne ?? 'despesa') : (tv.expenses?.expenseMany ?? 'despesas')}</span>
            </button>
          )}
          {editingNote && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder={tv.places?.noteePlaceholder ?? 'Nota…'}
                style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }} />
              <button type="button" onClick={() => { onPatch({ trip_note: note.trim() || null }); setEditingNote(false) }}
                style={{ padding: '5px 10px', borderRadius: 4, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: 'pointer', fontSize: 11 }}>{tv.actions?.save ?? 'Salvar'}</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <DayBadge day={item.day_number} canEdit={canEdit} onChangeDay={d => onPatch({ day_number: d })} />
          {canEdit && (
            <button type="button" onClick={() => setExpanded(v => !v)} title="Horários e transporte"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 4, color: expanded ? RED : 'var(--arvo-fg-muted)', fontSize: 13 }}>🕐</button>
          )}
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && canEdit && (
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 5 }}>
              {item.kind === 'transport' ? 'Meio de transporte' : 'Transporte para chegar aqui'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(TRANSPORT_LABELS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => onPatch({ transport_mode: item.transport_mode === k ? null : k })}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 8px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${item.transport_mode === k ? RED : 'var(--arvo-border)'}`, background: item.transport_mode === k ? 'rgba(214,59,47,0.08)' : 'transparent', color: item.transport_mode === k ? RED : 'var(--arvo-fg-muted)' }}>
                  {TRANSPORT_ICONS[k]} {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <TimeField label="Chegada" value={item.arrive_time} onChange={v => onPatch({ arrive_time: v })} />
            <TimeField label="Saída" value={item.depart_time} onChange={v => onPatch({ depart_time: v })} />
          </div>
          <input type="text" placeholder="Nota de transporte (voo, nº de reserva…)" value={item.transport_note ?? ''} onChange={e => onPatch({ transport_note: e.target.value || null })}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg)', background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 4, padding: '4px 8px', outline: 'none', width: '100%' }} />

          {/* Row actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4, flexWrap: 'wrap' }}>
            {isPlace && (
              <button type="button" onClick={() => setShowExpenses(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>{tv.expenses?.title ?? 'Despesas'}</button>
            )}
            <button type="button" onClick={() => { setNote(item.trip_note ?? ''); setEditingNote(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>Nota</button>
            {isPlace && (
              <button type="button" onClick={() => onPatch({ is_highlight: !item.is_highlight })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: item.is_highlight ? RED : 'var(--arvo-fg-soft)' }}>Destaque</button>
            )}
            {item.google_maps_url && (
              <a href={item.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>Google Maps →</a>
            )}
            <button type="button" onClick={del} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>Remover</button>
          </div>
        </div>
      )}

      {showExpenses && (
        <PlaceExpensesPanel tripId={tripId} placeId={item.id} placeName={item.name} onClose={() => setShowExpenses(false)} onChanged={onReload} />
      )}
    </div>
  )
}

// ── Free-item adder ───────────────────────────────────────────────────────────
function FreeItemAdder({ tripId, onAdded }: { tripId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'note' | 'transport'>('note')
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/voyage/trips/${tripId}/places`, {
        method: 'POST',
        body: JSON.stringify({
          name: title.trim(), kind,
          day_number: day ? Number(day) : null,
        }),
      })
      setTitle(''); setDay(''); setOpen(false)
      onAdded()
    } finally { setSaving(false) }
  }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.04em', padding: '6px 14px', borderRadius: 6, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
      + Item livre
    </button>
  )

  return (
    <div style={{ marginTop: 4, padding: 12, borderRadius: 10, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['note', 'transport'] as const).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, padding: '4px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${kind === k ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: kind === k ? 'var(--arvo-hover-bg)' : 'transparent', color: kind === k ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)' }}>
            {k === 'note' ? '📝 Anotação' : '🚆 Transporte'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          placeholder={kind === 'note' ? 'Ex: Levar passaporte' : 'Ex: Trem Lisboa → Porto'}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 4, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, outline: 'none' }} />
        <input value={day} onChange={e => setDay(e.target.value)} type="number" min="1" inputMode="numeric" placeholder="Dia"
          style={{ width: 56, padding: '7px 8px', borderRadius: 4, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, outline: 'none', textAlign: 'center' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" onClick={() => { setOpen(false); setTitle('') }}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 12px', borderRadius: 5, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={save} disabled={saving || !title.trim()}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 14px', borderRadius: 5, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: saving || !title.trim() ? 'default' : 'pointer', opacity: saving || !title.trim() ? 0.5 : 1 }}>Adicionar</button>
      </div>
    </div>
  )
}

export default function TripItineraryPanel({ tripId, tripCity, tripCountry, canEdit }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [items, setItems] = useState<PlanItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ places: PlanItem[] }>(`/voyage/trips/${tripId}/places`)
      setItems(data.places)
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => { load() }, [load])

  async function patchItem(id: number, fields: Record<string, unknown>) {
    setItems(ps => ps.map(p => p.id === id ? { ...p, ...fields } : p))
    try {
      await apiFetch(`/voyage/trips/${tripId}/places/${id}`, { method: 'PATCH', body: JSON.stringify(fields) })
    } catch { load() }
  }

  const days = Array.from(new Set(items.map(p => p.day_number).filter((d): d is number => d != null))).sort((a, b) => a - b)
  const undated = items.filter(p => p.day_number == null)

  function renderRows(list: PlanItem[]) {
    return list.map(it => (
      <ItemRow key={it.id} item={it} tripId={tripId} canEdit={canEdit}
        onPatch={f => patchItem(it.id, f)}
        onDelete={() => setItems(ps => ps.filter(x => x.id !== it.id))}
        onReload={load} />
    ))
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          Roteiro
        </p>
        <a href="/voyage/places" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          {tv.actions?.library ?? 'Biblioteca →'}
        </a>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 42, borderRadius: 8, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite', animationDelay: `${i * 80}ms` }} />)}
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, textAlign: 'center', padding: '16px 0' }}>
          {tv.places?.empty ?? 'Adicione lugares à viagem para montar o roteiro'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {days.map(d => (
            <div key={d}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>Dia {d}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{renderRows(items.filter(p => p.day_number === d))}</div>
            </div>
          ))}
          {undated.length > 0 && (
            <div>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>Sem dia</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{renderRows(undated)}</div>
            </div>
          )}
        </div>
      )}

      {/* Adders */}
      {canEdit && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <LibraryPicker tripId={tripId} tripCity={tripCity} tripCountry={tripCountry} onAdded={() => load()} />
          </div>
          <FreeItemAdder tripId={tripId} onAdded={load} />
        </div>
      )}
    </div>
  )
}
