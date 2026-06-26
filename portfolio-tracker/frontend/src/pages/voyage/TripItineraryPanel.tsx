import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { LibraryPicker } from './TripPlacesPanel'
import PlaceExpensesPanel from './PlaceExpensesPanel'
import { dayColor, dayColorWash } from './_shared/dayColors'
import type { TripDestination } from './types'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'
const GREEN = '#1F8A5B'

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

// This app never sets overflow on <html>/<body> elsewhere, so it's safe to
// just set/clear 'hidden' directly without saving a previous value.
let pageScrollLockCount = 0
function lockPageScroll() {
  pageScrollLockCount++
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
}
function unlockPageScroll() {
  pageScrollLockCount = Math.max(0, pageScrollLockCount - 1)
  if (pageScrollLockCount === 0) {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }
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
  sort_order: number
  is_highlight: boolean
  rating: number | null
  arrive_time: string | null
  depart_time: string | null
  transport_mode: string | null
  transport_note: string | null
  checkin_day: number | null
  checkout_day: number | null
  destination_id: number | null
  expense_total?: number
  expense_count?: number
}

interface Props {
  tripId: number
  tripCity: string | null
  tripCountry: string | null
  destinations: TripDestination[]
  canEdit: boolean
  // Notifies the parent page whenever this panel's place list changes (add,
  // delete, reload) so sibling components fetching the same trip's places
  // independently (the map card) can refresh instead of going stale.
  onPlacesChanged?: () => void
}

// Destino "padrão" de um dia: o(s) cujo intervalo day_start–day_end cobre
// esse número de dia. Pode haver mais de um num dia de transição.
function destinationsForDay(day: number | null, destinations: TripDestination[]): TripDestination[] {
  if (day == null) return []
  return destinations.filter(d => d.day_start != null && d.day_end != null && d.day_start <= day && day <= d.day_end)
}

// Destino efetivo de um item: explícito (escolhido manualmente) ou, se não
// definido, o único destino que cobre o dia do item (se houver mais de um
// candidato, fica ambíguo de propósito — quem decide é o usuário).
function effectiveDestination(item: { destination_id: number | null; day_number: number | null }, destinations: TripDestination[]): TripDestination | null {
  if (item.destination_id != null) return destinations.find(d => d.id === item.destination_id) ?? null
  const candidates = destinationsForDay(item.day_number, destinations)
  return candidates.length === 1 ? candidates[0] : null
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
  aluguel: '🚗', carro: '🚗', carros: '🚗',
}

const TRANSPORT_ICONS: Record<string, string> = {
  flight: '✈️', train: '🚆', bus: '🚌', car: '🚗',
  boat: '⛴️', walk: '🚶', metro: '🚇', other: '🔀',
}
const TRANSPORT_LABELS: Record<string, string> = {
  flight: 'Voo', train: 'Trem', bus: 'Ônibus', car: 'Carro',
  boat: 'Barco', walk: 'A pé', metro: 'Metro', other: 'Outro',
}

function itemIcon(item: { kind: Kind; category: string | null; transport_mode: string | null }): string {
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

// A multi-day stay you're not physically present at every day (a rented car,
// as opposed to a hotel room) doesn't need a daily "still going" reminder —
// only the pickup (check-in day) and return (check-out day) matter.
function isLogisticalStay(category: string | null): boolean {
  if (!category) return false
  const key = category.toLowerCase()
  return key.includes('carro') || key.includes('aluguel')
}

function DayBadge({ day, canEdit, onChangeDay }: {
  day: number | null; canEdit: boolean; onChangeDay: (day: number | null) => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
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
      style={{ width: 48, padding: '3px 4px', borderRadius: 4, border: '1px solid var(--arvo-fg)', background: 'var(--arvo-surface)', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg)', outline: 'none', textAlign: 'center' }}
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
        background: day != null ? dayColorWash(day, 8) : 'var(--arvo-hover-bg)',
        color: day != null ? dayColor(day) : 'var(--arvo-fg-soft)',
        border: `1px solid ${day != null ? dayColorWash(day, 22) : 'var(--arvo-border)'}`,
        cursor: canEdit ? 'pointer' : 'default',
      }}
    >
      {day != null ? (tv.day ?? 'Dia {n}').replace('{n}', String(day)) : (tv.noDay ?? 'Sem dia')}
    </button>
  )
}

function DayNumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [val, setVal] = useState(value?.toString() ?? '')
  useEffect(() => { setVal(value?.toString() ?? '') }, [value])

  function commit() {
    const n = parseInt(val)
    onChange(isNaN(n) || n < 1 ? null : n)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', flexShrink: 0 }}>{label}</span>
      <input
        type="number" min="1" max="60" inputMode="numeric" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit() }}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg)', background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 4, padding: '2px 4px', outline: 'none', width: 48, textAlign: 'center' }}
      />
    </div>
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

// Single free-text note field with an explicit Save button + a brief "✓ Salvo"
// confirmation — avoids the old auto-save-on-every-keystroke pattern, which gave
// no feedback and could race if requests resolved out of order.
function NoteEditor({ value, onSave, placeholder }: { value: string | null; onSave: (v: string | null) => void; placeholder?: string }) {
  const [text, setText] = useState(value ?? '')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    onSave(text.trim() || null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        placeholder={placeholder ?? 'Nota…'}
        onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }}
      />
      <button type="button" onClick={handleSave}
        style={{ padding: '6px 12px', borderRadius: 4, background: saved ? GREEN : 'var(--arvo-fg)', color: saved ? '#fff' : 'var(--arvo-bg)', border: 'none', cursor: 'pointer', fontSize: 11, minWidth: 58, flexShrink: 0, transition: 'background 160ms' }}>
        {saved ? '✓ Salvo' : 'Salvar'}
      </button>
    </div>
  )
}

// Long-press (anywhere on the row) starts a reorder, same gesture used by
// Things/Notion/Trello — easier to hit than a small grip icon and works
// identically with mouse or touch. A quick tap is left alone so the row's own
// buttons (visited, despesas, Mais…) keep working normally.
const LONG_PRESS_MS = 380
const MOVE_CANCEL_PX = 8

function ItemRow({ item, tripId, canEdit, dragging, dropTarget, destinations, autoOpenStay, onStartDrag, onPatch, onDelete, onReload }: {
  item: PlanItem
  tripId: number
  canEdit: boolean
  dragging: boolean
  dropTarget: boolean
  destinations: TripDestination[]
  autoOpenStay?: boolean
  onStartDrag: () => void
  onPatch: (fields: Record<string, unknown>) => void
  onDelete: () => void
  onReload: () => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [expanded, setExpanded] = useState(!!autoOpenStay)
  const [editingNote, setEditingNote] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [showExpenses, setShowExpenses] = useState(false)
  const [showStayFields, setShowStayFields] = useState(!!autoOpenStay)
  const isPlace = item.kind === 'place'
  const isTransport = item.kind === 'transport'
  const isNote = item.kind === 'note'
  const isStay = isPlace && item.checkin_day != null && item.checkout_day != null
  const hasExpenses = (item.expense_total ?? 0) > 0

  // Long-press anywhere on the row to start a reorder. A quick tap clears the
  // timer before it fires, so the row's own buttons keep working normally.
  //
  // touch-action is 'none' on the row (below) so the browser never claims the
  // touch as a native scroll mid-gesture — that's the only reliable way to
  // hand long-press movement to JS instead of the page (touch-action set
  // dynamically once dragging starts is too late: browsers decide gesture
  // ownership from the first touch contact, not on a later re-render). The
  // cost is that native scroll no longer happens for a touch that starts on a
  // row, so if the move turns out to be a scroll (not a long-press), we drive
  // the scroll ourselves via scrollBy for the rest of that touch.
  const pressTimerRef = useRef<number | null>(null)
  const pressStartRef = useRef<{ x: number; y: number } | null>(null)
  const manualScrollRef = useRef(false)
  const lastYRef = useRef(0)

  function clearPress() {
    if (pressTimerRef.current != null) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null }
    pressStartRef.current = null
  }
  function endTouch() {
    clearPress()
    manualScrollRef.current = false
  }
  function handlePointerDown(e: React.PointerEvent) {
    if (!canEdit) return
    pressStartRef.current = { x: e.clientX, y: e.clientY }
    lastYRef.current = e.clientY
    manualScrollRef.current = false
    // Mouse has no scroll-vs-drag ambiguity (that's a touch-only problem —
    // a finger moving could mean "scroll the page" or "drag the row").
    // Requiring a long-press before allowing movement made sense for touch,
    // but for mouse it meant any normal click-and-drag got cancelled by
    // handlePointerMove below before the 380ms timer ever fired, so drag
    // never started on desktop. Mouse instead starts on first move past
    // the threshold, like any native drag.
    if (e.pointerType === 'mouse') return
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null
      navigator.vibrate?.(10)
      onStartDrag()
    }, LONG_PRESS_MS)
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (manualScrollRef.current) {
      window.scrollBy(0, lastYRef.current - e.clientY)
      lastYRef.current = e.clientY
      return
    }
    if (!pressStartRef.current) return
    const dx = e.clientX - pressStartRef.current.x
    const dy = e.clientY - pressStartRef.current.y
    if (Math.hypot(dx, dy) <= MOVE_CANCEL_PX) return
    if (e.pointerType === 'mouse') {
      pressStartRef.current = null
      onStartDrag()
      return
    }
    if (pressTimerRef.current == null) return
    clearPress()
    manualScrollRef.current = true
    lastYRef.current = e.clientY
  }

  async function del() {
    if (!confirm((tv.confirm?.removePlaceFromTrip ?? 'Remover "{name}" da viagem?').replace('{name}', item.name))) return
    await apiFetch(`/voyage/trips/${tripId}/places/${item.id}`, { method: 'DELETE' })
    onDelete()
  }

  return (
    <div
      data-row-id={item.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endTouch}
      onPointerCancel={endTouch}
      style={{
        borderRadius: 8,
        background: item.is_highlight ? 'rgba(214,59,47,0.04)' : 'var(--arvo-hover-bg)',
        border: dropTarget ? `1px dashed ${RED}` : `1px solid ${item.is_highlight ? 'rgba(214,59,47,0.12)' : 'var(--arvo-border-soft)'}`,
        overflow: 'hidden',
        opacity: dragging ? 0.88 : 1,
        // 'none' (not 'scale(1)') when idle — any transform other than none
        // creates a new containing block, which trapped the PlaceExpensesPanel
        // modal's position:fixed overlay inside this row instead of the viewport.
        transform: dragging ? 'scale(1.02) rotate(0.6deg)' : 'none',
        boxShadow: dragging ? 'var(--arvo-shadow-lg)' : 'none',
        cursor: canEdit ? 'grab' : 'default',
        transition: 'opacity 120ms, border-color 120ms, transform 120ms, box-shadow 120ms',
        // Holding still over text is also the OS gesture for text selection
        // (iOS callout / Android select-text bubble) — without this, that
        // native gesture wins the race against the long-press timer below.
        ...(canEdit && {
          userSelect: 'none' as const,
          WebkitUserSelect: 'none' as const,
          WebkitTouchCallout: 'none' as const,
        }),
        // Must be 'none' from the start of the touch, not toggled on once
        // dragging begins — browsers decide gesture ownership (scroll vs JS)
        // at the first touch contact, so setting this reactively was always
        // too late. The manual scrollBy in handlePointerMove compensates for
        // native scroll being unavailable on these rows.
        touchAction: canEdit ? 'none' as const : 'auto' as const,
      }}
    >
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
          {editingName ? (
            <div style={{ marginBottom: 4 }} onPointerDown={e => e.stopPropagation()}>
              <NoteEditor value={item.name} placeholder="Nome do lugar…"
                onSave={v => { if (v?.trim()) onPatch({ name: v.trim() }); setEditingName(false) }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: item.visited ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg)', fontWeight: 500, textDecoration: item.visited ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </p>
              {item.is_highlight && (
                <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED, flexShrink: 0 }}>destaque</span>
              )}
              {isStay && (
                <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: GOLD, flexShrink: 0 }}>
                  {itemIcon(item)} {item.checkout_day! - item.checkin_day! + 1} dias
                </span>
              )}
            </div>
          )}
          {item.address && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.address}</p>
          )}
          {/* Time summary — for transport items the icon+title already say the
              mode, so only the times are shown here to avoid repeating it */}
          {(item.arrive_time || item.depart_time || (!isTransport && item.transport_mode)) && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>
              {[
                !isTransport && item.transport_mode && `${TRANSPORT_ICONS[item.transport_mode]} ${TRANSPORT_LABELS[item.transport_mode] ?? item.transport_mode}`,
                item.arrive_time && `${(tv.arrival ?? 'chegada').toLowerCase()} ${item.arrive_time}`,
                item.depart_time && `${(tv.departure ?? 'saída').toLowerCase()} ${item.depart_time}`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {item.rating != null && isPlace && <StarRating value={item.rating} />}
          {item.trip_note && !editingNote && (
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 12.5, color: GOLD, marginTop: 2 }}>{item.trip_note}</p>
          )}
          {hasExpenses && (
            <button type="button" onClick={() => canEdit && setShowExpenses(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(31,138,91,0.10)', border: '1px solid rgba(31,138,91,0.25)', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: '#1F8A5B', fontWeight: 500 }}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="6" r="5" /><path strokeLinecap="round" d="M6 3.5v5M4.7 7.2c0 .7.6 1 1.3 1s1.3-.3 1.3-1-.6-.9-1.3-.9-1.3-.3-1.3-.9.6-1 1.3-1 1.3.3 1.3 1" />
              </svg>
              {fmtCurrency(item.expense_total ?? 0)}
              <span style={{ color: '#1F8A5B', opacity: 0.75 }}>· {item.expense_count} {item.expense_count === 1 ? (tv.expenses?.expenseOne ?? 'despesa') : (tv.expenses?.expenseMany ?? 'despesas')}</span>
            </button>
          )}
          {/* Place kind: note is optional, toggled via the "Nota" action below */}
          {isPlace && editingNote && (
            <div style={{ marginTop: 6 }}>
              <NoteEditor value={item.trip_note} placeholder={tv.places?.noteePlaceholder ?? 'Nota…'}
                onSave={v => { onPatch({ trip_note: v }); setEditingNote(false) }} />
            </div>
          )}
        </div>
      </div>

      {/* Action row — separate from the title row so the name has room to
          breathe on narrow screens instead of competing with 4-5 icons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 10px 8px 10px' }}>
        {isStay ? (
          <span style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em',
            padding: '3px 9px', borderRadius: 999, flexShrink: 0,
            background: dayColorWash(item.checkin_day!, 8), color: dayColor(item.checkin_day!),
            border: `1px solid ${dayColorWash(item.checkin_day!, 22)}`,
          }}>
            {(tv.dayRange ?? 'Dia {from} – {to}').replace('{from}', String(item.checkin_day)).replace('{to}', String(item.checkout_day))}
          </span>
        ) : (
          <DayBadge day={item.day_number} canEdit={canEdit} onChangeDay={d => onPatch({ day_number: d })} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {/* Quando já há despesa vinculada, o link com o valor (abaixo do
              nome) já cobre essa ação — aqui fica só o ícone, consistente
              com os outros botões da linha. Sem despesa ainda, é a única
              entrada para essa ação, então ganha um rótulo de texto pra
              não ficar um ícone solto e ambíguo. */}
          {canEdit && !hasExpenses && (
            <button type="button" onClick={() => setShowExpenses(true)} title={tv.linkExpenseShort ?? 'Vincular gasto'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--arvo-border)', cursor: 'pointer', width: 24, height: 24, borderRadius: 999, color: 'var(--arvo-fg-soft)', fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, lineHeight: 1 }}>
              $
            </button>
          )}
          {canEdit && hasExpenses && (
            <button type="button" onClick={() => setShowExpenses(true)} title={tv.expensesTitle ?? 'Despesas'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', width: 24, height: 24, borderRadius: 999, color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, lineHeight: 1 }}>
              $
            </button>
          )}
          {canEdit && isPlace && (
            <button type="button" onClick={() => onPatch({ is_highlight: !item.is_highlight })} title={tv.highlightTitle ?? 'Destaque'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, borderRadius: 4, fontSize: 13, lineHeight: 1, color: item.is_highlight ? RED : 'var(--arvo-fg-soft)' }}>★</button>
          )}
          {item.google_maps_url && (
            <a href={item.google_maps_url} target="_blank" rel="noopener noreferrer" title={tv.openInMapsTitle ?? 'Abrir no Google Maps'}
              style={{ padding: 5, color: 'var(--arvo-fg-soft)', display: 'flex', alignItems: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
              </svg>
            </a>
          )}
          {canEdit && (isPlace || isTransport || isNote) && (
            <button type="button" onClick={() => setExpanded(v => !v)} title={tv.moreOptions ?? 'Mais opções'}
              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px', borderRadius: 4, color: 'var(--arvo-fg-muted)', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5 }}>
              {tv.more ?? 'Mais'}
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
                <path strokeLinecap="round" d="M2 3.5l3 3 3-3"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel — content depends on kind. For a place, hospedagem
          fields only appear once explicitly turned on (or already a stay) —
          showing check-in/check-out for every museum/restaurant was the main
          source of confusion. Transport-to-get-here stays grouped with its
          own note and times; it's hidden once a place becomes a stay, since
          check-in/check-out already cover the day/time question. */}
      {expanded && canEdit && (
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {destinations.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>Destino</span>
              {destinations.map(d => (
                <button key={d.id} type="button" onClick={() => onPatch({ destination_id: item.destination_id === d.id ? null : d.id })}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '2px 8px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${item.destination_id === d.id ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: item.destination_id === d.id ? 'var(--arvo-hover-bg)' : 'transparent', color: item.destination_id === d.id ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)' }}>
                  {d.city ?? d.country ?? '—'}
                </button>
              ))}
            </div>
          )}
          {isPlace && (isStay || showStayFields) && (
            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.18)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: GOLD }}>
                  {itemIcon(item)} {tv.stay ?? 'Estadia'}
                </p>
                <button type="button" onClick={() => { onPatch({ checkin_day: null, checkout_day: null }); setShowStayFields(false) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)' }}>
                  {tv.remove ?? 'Remover'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <DayNumberField label={tv.checkinDay ?? 'Check-in dia'} value={item.checkin_day} onChange={d => onPatch({ checkin_day: d, day_number: d ?? item.day_number })} />
                <DayNumberField label={tv.checkoutDay ?? 'Check-out dia'} value={item.checkout_day} onChange={d => onPatch({ checkout_day: d })} />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <TimeField label={tv.checkinTime ?? 'Check-in hora'} value={item.arrive_time} onChange={v => onPatch({ arrive_time: v })} />
                <TimeField label={tv.checkoutTime ?? 'Check-out hora'} value={item.depart_time} onChange={v => onPatch({ depart_time: v })} />
              </div>
            </div>
          )}

          {isPlace && !isStay && !showStayFields && (
            <button type="button" onClick={() => setShowStayFields(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}>
              {itemIcon(item)} {tv.markAsStay ?? 'Marcar como estadia de vários dias (hospedagem, carro alugado…)'}
            </button>
          )}

          {(isTransport || (isPlace && !isStay)) && (
            <>
              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 5, marginTop: isPlace ? 2 : 0 }}>
                  {isTransport ? (tv.transportMode ?? 'Meio de transporte') : (tv.transportToArrive ?? 'Transporte para chegar aqui')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(TRANSPORT_LABELS).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => onPatch({ transport_mode: item.transport_mode === k ? null : k })}
                      style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 8px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${item.transport_mode === k ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: item.transport_mode === k ? 'var(--arvo-hover-bg)' : 'transparent', color: item.transport_mode === k ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)' }}>
                      {TRANSPORT_ICONS[k]} {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <TimeField label={tv.arrival ?? 'Chegada'} value={item.arrive_time} onChange={v => onPatch({ arrive_time: v })} />
                <TimeField label={tv.departure ?? 'Saída'} value={item.depart_time} onChange={v => onPatch({ depart_time: v })} />
              </div>
              {isPlace && (
                <>
                  <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginTop: 2 }}>
                    {tv.transportNote ?? 'Nota de transporte'}
                  </p>
                  <NoteEditor value={item.transport_note} placeholder={tv.transportNotePlaceholder ?? 'Voo, nº de reserva…'}
                    onSave={v => onPatch({ transport_note: v })} />
                </>
              )}
            </>
          )}

          {(isTransport || isNote) && (
            <>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginTop: isTransport ? 2 : 0 }}>
                {tv.note ?? 'Nota'}
              </p>
              <NoteEditor value={item.trip_note} placeholder={tv.notePlaceholder ?? 'Detalhes (opcional)…'}
                onSave={v => onPatch({ trip_note: v })} />
            </>
          )}

          {/* Row actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4, flexWrap: 'wrap' }}>
            {isPlace && (
              <button type="button" onClick={() => setEditingName(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>Nome</button>
            )}
            {isPlace && (
              <button type="button" onClick={() => setEditingNote(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>Nota</button>
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
function FreeItemAdder({ tripId, onAdded, forceOpen, initialKind, onClose }: {
  tripId: number; onAdded: () => void
  forceOpen?: boolean; initialKind?: 'note' | 'transport'; onClose?: () => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [open, setOpen] = useState(forceOpen ?? false)
  const [kind, setKind] = useState<'note' | 'transport'>(initialKind ?? 'note')
  const [title, setTitle] = useState('')
  const [day, setDay] = useState('')
  const [transportMode, setTransportMode] = useState<string | null>(null)
  const [arriveTime, setArriveTime] = useState('')
  const [departTime, setDepartTime] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setTitle(''); setDay(''); setTransportMode(null); setArriveTime(''); setDepartTime(''); setOpen(false)
    onClose?.()
  }

  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/voyage/trips/${tripId}/places`, {
        method: 'POST',
        body: JSON.stringify({
          name: title.trim(), kind,
          day_number: day ? Number(day) : null,
          ...(kind === 'transport' && {
            transport_mode: transportMode,
            arrive_time: arriveTime || null,
            depart_time: departTime || null,
          }),
        }),
      })
      reset()
      onAdded()
    } finally { setSaving(false) }
  }

  if (!open) return (
    // alignSelf: the parent is a column flex container, which stretches
    // children to its full width by default — without this the button spans
    // the whole row and looks like a text input instead of a pill button.
    <button type="button" onClick={() => setOpen(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.02em', padding: '5px 11px', borderRadius: 6, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
      {tv.actions?.addGeneric ? `+ ${tv.actions.addGeneric}` : '+ Item livre'}
    </button>
  )

  return (
    <div style={{ marginTop: 4, padding: 12, borderRadius: 10, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['note', 'transport'] as const).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, padding: '4px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${kind === k ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: kind === k ? 'var(--arvo-hover-bg)' : 'transparent', color: kind === k ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)' }}>
            {k === 'note' ? (tv.actions?.addNote ?? '📝 Anotação') : (tv.actions?.addTransport ?? '🚆 Transporte')}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
          placeholder={kind === 'note' ? (tv.notePlaceholderFree ?? 'Ex: Levar passaporte') : (tv.transportPlaceholderFree ?? 'Ex: Trem Lisboa → Porto')}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 4, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, outline: 'none' }} />
        <input value={day} onChange={e => setDay(e.target.value)} type="number" min="1" inputMode="numeric" placeholder={tv.dayPlaceholder ?? 'Dia'}
          style={{ width: 56, padding: '7px 8px', borderRadius: 4, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, outline: 'none', textAlign: 'center' }} />
      </div>

      {/* Transport-specific: pick the icon + times right away */}
      {kind === 'transport' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(TRANSPORT_LABELS).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTransportMode(transportMode === k ? null : k)}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 8px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${transportMode === k ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: transportMode === k ? 'var(--arvo-hover-bg)' : 'transparent', color: transportMode === k ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)' }}>
                {TRANSPORT_ICONS[k]} {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <TimeField label={tv.arrival ?? 'Chegada'} value={arriveTime || null} onChange={v => setArriveTime(v ?? '')} />
            <TimeField label={tv.departure ?? 'Saída'} value={departTime || null} onChange={v => setDepartTime(v ?? '')} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" onClick={reset}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 12px', borderRadius: 5, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}>{tv.actions?.cancel ?? 'Cancelar'}</button>
        <button type="button" onClick={save} disabled={saving || !title.trim()}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 14px', borderRadius: 5, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: saving || !title.trim() ? 'default' : 'pointer', opacity: saving || !title.trim() ? 0.5 : 1 }}>{tv.actions?.addGeneric ?? 'Adicionar'}</button>
      </div>
    </div>
  )
}

export default function TripItineraryPanel({ tripId, tripCity, tripCountry, destinations, canEdit, onPlacesChanged }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [items, setItems] = useState<PlanItem[]>([])
  const [activeTool, setActiveTool] = useState<'place' | 'stay' | 'transport' | 'note' | null>(null)
  const [showToolMenu, setShowToolMenu] = useState(false)
  const [pendingStayItemId, setPendingStayItemId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Pointer-events-based drag (works with mouse AND touch, unlike native HTML5
  // drag-and-drop which iOS/Android browsers don't support via touch).
  const itemsRef = useRef<PlanItem[]>([])
  itemsRef.current = items
  const dragIdRef = useRef<number | null>(null)
  const overIdRef = useRef<number | null>(null)
  const [dragVisual, setDragVisual] = useState<{ dragId: number | null; overId: number | null }>({ dragId: null, overId: null })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ places: PlanItem[] }>(`/voyage/trips/${tripId}/places`)
      setItems(data.places)
      onPlacesChanged?.()
    } finally {
      setLoading(false)
    }
  }, [tripId, onPlacesChanged])

  useEffect(() => { load() }, [load])

  async function patchItem(id: number, fields: Record<string, unknown>) {
    setItems(ps => ps.map(p => p.id === id ? { ...p, ...fields } : p))
    try {
      await apiFetch(`/voyage/trips/${tripId}/places/${id}`, { method: 'PATCH', body: JSON.stringify(fields) })
      // day_number drives the marker color on the map card, which fetches
      // places independently — without this, changing a place's day kept
      // showing the old color until a full page reload.
      onPlacesChanged?.()
    } catch { load() }
  }

  function persistOrder(updates: { id: number; sort_order: number }[]) {
    setItems(prev => prev.map(p => {
      const u = updates.find(x => x.id === p.id)
      return u ? { ...p, sort_order: u.sort_order } : p
    }))
    Promise.all(updates.map(u =>
      apiFetch(`/voyage/trips/${tripId}/places/${u.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: u.sort_order }) })
    )).catch(() => load())
  }

  function doReorder(draggedId: number, targetId: number) {
    const list = itemsRef.current
    const dragItem = list.find(i => i.id === draggedId)
    const targetItem = list.find(i => i.id === targetId)
    if (!dragItem || !targetItem || dragItem.day_number !== targetItem.day_number) return
    const group = list.filter(i => i.day_number === dragItem.day_number).slice().sort((a, b) => a.sort_order - b.sort_order)
    const without = group.filter(i => i.id !== draggedId)
    const targetIdx = without.findIndex(i => i.id === targetId)
    without.splice(targetIdx, 0, dragItem)
    persistOrder(without.map((it, idx) => ({ id: it.id, sort_order: idx })))
  }

  useEffect(() => {
    function rowIdAt(x: number, y: number): number | null {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      const rowEl = el?.closest('[data-row-id]') as HTMLElement | null
      return rowEl ? Number(rowEl.dataset.rowId) : null
    }
    function onMove(e: PointerEvent) {
      if (dragIdRef.current == null) return
      if (e.cancelable) e.preventDefault()
      const id = rowIdAt(e.clientX, e.clientY)
      if (id !== overIdRef.current) {
        overIdRef.current = id
        setDragVisual(v => ({ ...v, overId: id }))
      }
    }
    function finishDrag() {
      const draggedId = dragIdRef.current
      const targetId = overIdRef.current
      dragIdRef.current = null
      overIdRef.current = null
      setDragVisual({ dragId: null, overId: null })
      unlockPageScroll()
      if (draggedId != null && targetId != null && draggedId !== targetId) {
        doReorder(draggedId, targetId)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      unlockPageScroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startDrag(id: number) {
    dragIdRef.current = id
    overIdRef.current = null
    setDragVisual({ dragId: id, overId: null })
    // preventDefault() on pointermove alone isn't reliably honored by Safari/iOS
    // for blocking scroll on Pointer Events, so lock the page outright while a
    // drag is active — otherwise the page scrolls under the finger instead of
    // the row following it.
    lockPageScroll()
  }

  function sortDayByTime(day: number | null) {
    const group = items.filter(p => p.day_number === day).slice().sort((a, b) => a.sort_order - b.sort_order)
    const timed = group.filter(p => p.arrive_time).sort((a, b) => (a.arrive_time! < b.arrive_time! ? -1 : 1))
    const untimed = group.filter(p => !p.arrive_time)
    persistOrder([...timed, ...untimed].map((p, idx) => ({ id: p.id, sort_order: idx })))
  }

  // Days spanned by every stay (checkin..checkout, inclusive) must get their
  // own section even when no other item is scheduled there, otherwise a
  // multi-day stay would just vanish on the days between check-in and
  // check-out instead of showing a "still here" line.
  const stayDays = items.flatMap(p =>
    p.checkin_day != null && p.checkout_day != null
      ? Array.from({ length: p.checkout_day - p.checkin_day + 1 }, (_, i) => p.checkin_day! + i)
      : []
  )
  const days = Array.from(new Set([
    ...items.map(p => p.day_number).filter((d): d is number => d != null),
    ...stayDays,
  ])).sort((a, b) => a - b)
  const undated = items.filter(p => p.day_number == null)

  function staysOnDay(d: number) {
    return items.filter(p => p.checkin_day != null && p.checkout_day != null && p.checkin_day <= d && d <= p.checkout_day)
  }

  // Destinos distintos entre os itens de um dia, na ordem em que aparecem
  // (sort_order) — num dia de transição (ex: manhã em Paris, noite em
  // Amsterdã) isso vira ["Paris", "Amsterdã"] e o cabeçalho mostra a seta.
  function dayDestinationNames(d: number): string[] {
    if (destinations.length === 0) return []
    const dayItems = items.filter(p => p.day_number === d).sort((a, b) => a.sort_order - b.sort_order)
    const names: string[] = []
    for (const it of dayItems) {
      const dest = effectiveDestination(it, destinations)
      const name = dest?.city ?? dest?.country
      if (name && names[names.length - 1] !== name) names.push(name)
    }
    return [...new Set(names)]
  }

  function renderRows(list: PlanItem[]) {
    const sorted = list.slice().sort((a, b) => a.sort_order - b.sort_order)
    return sorted.map(it => (
      <ItemRow
        key={it.id} item={it} tripId={tripId} canEdit={canEdit} destinations={destinations}
        autoOpenStay={it.id === pendingStayItemId}
        dragging={dragVisual.dragId === it.id}
        dropTarget={dragVisual.overId === it.id && dragVisual.dragId !== it.id}
        onStartDrag={() => startDrag(it.id)}
        onPatch={f => patchItem(it.id, f)}
        onDelete={() => setItems(ps => ps.filter(x => x.id !== it.id))}
        onReload={load}
      />
    ))
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          {tv.itineraryTitle ?? 'Roteiro'}
        </p>
        <a href="/voyage/places" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          {tv.actions?.library ?? 'Biblioteca →'}
        </a>
      </div>

      {/* Um único "+ Adicionar" no topo (em vez de 3 botões separados) que
          abre 4 intenções claras; Lugar/Estadia reaproveitam o mesmo
          LibraryPicker (biblioteca ou colar link), só muda se pergunta o
          período de estadia em seguida. */}
      {canEdit && (
        <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--arvo-border-soft)' }}>
          {activeTool === null && !showToolMenu && (
            <button type="button" onClick={() => setShowToolMenu(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.02em', padding: '6px 14px', borderRadius: 6, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: 'pointer' }}>
              {tv.actions?.add ?? '+ Adicionar'}
            </button>
          )}

          {activeTool === null && showToolMenu && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => { setActiveTool('place'); setShowToolMenu(false) }}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer' }}>
                {tv.actions?.addPlace ?? '📍 Lugar'}
              </button>
              <button type="button" onClick={() => { setActiveTool('stay'); setShowToolMenu(false) }}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer' }}>
                {tv.actions?.addStay ?? '🏨🚗 Estadia / Carro'}
              </button>
              <button type="button" onClick={() => { setActiveTool('transport'); setShowToolMenu(false) }}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer' }}>
                {tv.actions?.addTransport ?? '🚆 Transporte'}
              </button>
              <button type="button" onClick={() => { setActiveTool('note'); setShowToolMenu(false) }}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--arvo-border)', background: 'none', color: 'var(--arvo-fg)', cursor: 'pointer' }}>
                {tv.actions?.addNote ?? '📝 Anotação'}
              </button>
              <button type="button" onClick={() => setShowToolMenu(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', fontSize: 12, padding: 4 }}>✕</button>
            </div>
          )}

          {(activeTool === 'place' || activeTool === 'stay') && (
            <LibraryPicker
              tripId={tripId} tripCity={tripCity} tripCountry={tripCountry} destinations={destinations}
              forceOpen forceMode="url"
              onClose={() => setActiveTool(null)}
              onAdded={p => {
                if (activeTool === 'stay') setPendingStayItemId(p.id)
                load()
              }}
            />
          )}

          {(activeTool === 'transport' || activeTool === 'note') && (
            <FreeItemAdder
              tripId={tripId} forceOpen initialKind={activeTool}
              onClose={() => setActiveTool(null)}
              onAdded={load}
            />
          )}
        </div>
      )}

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: dayColor(d), flexShrink: 0 }} />
                  <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: dayColor(d) }}>
                    {(tv.day ?? 'Dia {n}').replace('{n}', String(d))}
                    {dayDestinationNames(d).length > 0 && (
                      <span style={{ color: 'var(--arvo-fg-soft)', letterSpacing: '0.02em', textTransform: 'none' }}> — {dayDestinationNames(d).join(' → ')}</span>
                    )}
                  </p>
                </span>
                {canEdit && items.some(p => p.day_number === d && p.arrive_time) && (
                  <button type="button" onClick={() => sortDayByTime(d)} title="Reordenar os itens deste dia pelo horário de chegada"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)' }}>
                    {tv.sortByTime ?? 'Ordenar por horário'}
                  </button>
                )}
              </div>
              {staysOnDay(d)
                .filter(s => s.checkin_day !== d && (s.checkout_day === d || !isLogisticalStay(s.category)))
                .map(s => (
                  <p key={s.id} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>
                    {itemIcon(s)} {s.checkout_day === d
                      ? (tv.places?.stayCheckout ?? 'Check-out: {name}').replace('{name}', s.name) + (s.depart_time ? ` · ${s.depart_time}` : '')
                      : (tv.places?.stayInProgress ?? 'em andamento: {name}').replace('{name}', s.name)}
                  </p>
                ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{renderRows(items.filter(p => p.day_number === d))}</div>
            </div>
          ))}
          {undated.length > 0 && (
            <div>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>{tv.noDay ?? 'Sem dia'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{renderRows(undated)}</div>
            </div>
          )}
        </div>
      )}

      {canEdit && items.length > 0 && (
        <p style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)', textAlign: 'center' }}>
          {tv.dragHint ?? 'Toque e segure uma atividade para reordenar dentro do mesmo dia'}
        </p>
      )}
    </div>
  )
}
