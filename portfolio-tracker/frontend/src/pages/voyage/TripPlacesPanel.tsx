import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import PlaceExpensesPanel from './PlaceExpensesPanel'

const RED = '#D63B2F'
const GOLD = '#C8B89A'

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

interface TripPlace {
  id: number
  name: string
  category: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  day_number: number | null
  sort_order: number
  is_highlight: boolean
  rating: number | null
  visited: boolean
  trip_note: string | null
  expense_total?: number
  expense_count?: number
}

interface LibraryPlace {
  id: number
  name: string
  category: string | null
  city: string | null
  address: string | null
  google_maps_url: string | null
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
  pontos: '📍', turísticos: '📍',
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

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function StarRating({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n === value ? 0 : n)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: onChange ? 'pointer' : 'default', fontSize: 13, opacity: (value ?? 0) >= n ? 1 : 0.25 }}
        >★</button>
      ))}
    </div>
  )
}

// ── Add from library picker ───────────────────────────────────────────────────
function LibraryPicker({ tripId, tripCity, tripCountry, onAdded }: {
  tripId: number; tripCity: string | null; tripCountry: string | null; onAdded: (p: TripPlace) => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'library' | 'url'>('library')
  const [library, setLibrary] = useState<LibraryPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const hasDestination = !!(tripCity || tripCountry)

  async function openPicker() {
    setOpen(true)
    if (library.length > 0) return
    setLoading(true)
    const data = await apiFetch<{ places: LibraryPlace[] }>('/voyage/places')
    setLibrary(data.places)
    setLoading(false)
  }

  async function addPlace(p: LibraryPlace) {
    setAdding(p.id)
    try {
      const data = await apiFetch<{ place: TripPlace }>(`/voyage/trips/${tripId}/places`, {
        method: 'POST',
        body: JSON.stringify({
          library_place_id: p.id,
          name: p.name,
          category: p.category,
          address: p.address,
          google_maps_url: p.google_maps_url,
        }),
      })
      onAdded(data.place)
    } finally {
      setAdding(null)
    }
  }

  async function importFromUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!urlInput.trim()) return
    setUrlLoading(true)
    setUrlError(null)
    try {
      const data = await apiFetch<{ place: LibraryPlace; trip_place: TripPlace | null }>(
        '/voyage/places/from-url',
        { method: 'POST', body: JSON.stringify({ url: urlInput.trim(), trip_id: tripId }) }
      )
      if (data.trip_place) {
        onAdded(data.trip_place)
        setOpen(false)
      } else {
        setLibrary(prev => [...prev.filter(p => p.id !== data.place.id), data.place])
        setMode('library')
        setUrlInput('')
      }
    } catch (err: any) {
      setUrlError(err.message ?? 'Erro ao importar o lugar')
    } finally {
      setUrlLoading(false)
    }
  }

  function matchesDestination(p: LibraryPlace): boolean {
    if (!hasDestination) return true
    const city = normalize(p.city ?? '')
    const addr = normalize(p.address ?? '')
    return (
      (!!tripCity && (city.includes(normalize(tripCity)) || addr.includes(normalize(tripCity)))) ||
      (!!tripCountry && (city.includes(normalize(tripCountry)) || addr.includes(normalize(tripCountry))))
    )
  }

  const destinationPlaces = library.filter(matchesDestination)
  const visibleLibrary = (showAll || !hasDestination) ? library : destinationPlaces
  const filtered = visibleLibrary.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.city ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.04em',
    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    transition: 'opacity 160ms',
  }

  if (!open) return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={openPicker}
        style={{ ...btnBase, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        + Adicionar da biblioteca
      </button>
      <button
        type="button"
        onClick={() => { setOpen(true); setMode('url') }}
        style={{ ...btnBase, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-soft)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 8.5a2.5 2.5 0 003.5 0l2-2a2.5 2.5 0 00-3.5-3.5l-.6.6M8.5 5.5a2.5 2.5 0 00-3.5 0l-2 2a2.5 2.5 0 003.5 3.5l.6-.6" />
        </svg>
        {tv.places?.mapsLink ?? '+ Colar link do Maps'}
      </button>
    </div>
  )

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => setMode('library')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.20em', textTransform: 'uppercase', color: mode === 'library' ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', borderBottom: mode === 'library' ? '1px solid var(--arvo-fg)' : '1px solid transparent', paddingBottom: 2 }}>
            {!showAll && hasDestination && destinationPlaces.length > 0 ? `${tripCity ?? tripCountry}` : 'Biblioteca'}
          </button>
          <button type="button" onClick={() => setMode('url')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.20em', textTransform: 'uppercase', color: mode === 'url' ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', borderBottom: mode === 'url' ? '1px solid var(--arvo-fg)' : '1px solid transparent', paddingBottom: 2 }}>
            Link Maps
          </button>
        </div>
        <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', fontSize: 12 }}>✕</button>
      </div>

      {mode === 'url' ? (
        <form onSubmit={importFromUrl} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }}>
            Cole o link do Google Maps — o lugar será salvo na biblioteca e adicionado à viagem.
          </p>
          <input
            autoFocus
            type="url"
            placeholder="https://maps.google.com/maps/place/…"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setUrlError(null) }}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: `1px solid ${urlError ? RED : 'var(--arvo-border)'}`, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none', boxSizing: 'border-box' }}
          />
          {urlError && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED }}>{urlError}</p>
          )}
          <button
            type="submit"
            disabled={urlLoading || !urlInput.trim()}
            style={{ padding: '7px 0', borderRadius: 6, background: urlLoading || !urlInput.trim() ? 'var(--arvo-hover-bg)' : 'var(--arvo-fg)', color: urlLoading || !urlInput.trim() ? 'var(--arvo-fg-muted)' : 'var(--arvo-bg)', border: 'none', cursor: urlLoading || !urlInput.trim() ? 'default' : 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, transition: 'all 160ms' }}
          >
            {urlLoading ? 'Importando…' : 'Adicionar à viagem'}
          </button>
        </form>
      ) : (
        <>
          <input
            type="text"
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 3, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
            autoFocus
          />
          {loading ? (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>Carregando…</p>
          ) : library.length === 0 ? (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
              Biblioteca vazia — importe do Google Takeout ou cole um link do Maps.
            </p>
          ) : filtered.length === 0 && !search ? (
            <div>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginBottom: 8 }}>
                Nenhum lugar de {tripCity ?? tripCountry} na biblioteca.
              </p>
              <button type="button" onClick={() => setShowAll(true)}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Ver todos os {library.length} lugares →
              </button>
            </div>
          ) : (
            <>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filtered.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPlace(p)}
                    disabled={adding === p.id}
                    style={{
                      textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid transparent', background: 'transparent',
                      fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)',
                      display: 'flex', alignItems: 'center', gap: 8, opacity: adding === p.id ? 0.5 : 1,
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 16 }}>{catIcon(p.category)}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    {p.city && <span style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>{p.city}</span>}
                  </button>
                ))}
              </div>
              {hasDestination && !search && (
                <button type="button" onClick={() => setShowAll(v => !v)}
                  style={{ marginTop: 8, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showAll
                    ? `Mostrar só ${tripCity ?? tripCountry} (${destinationPlaces.length})`
                    : `Ver todos os ${library.length} lugares da biblioteca`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Place row ─────────────────────────────────────────────────────────────────
function PlaceRow({ place, tripId, canEdit, onUpdate, onDelete, onReload }: {
  place: TripPlace
  tripId: number
  canEdit: boolean
  onUpdate: (p: TripPlace) => void
  onDelete: (id: number) => void
  onReload: () => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(place.trip_note ?? '')
  const [saving, setSaving] = useState(false)
  const [showExpenses, setShowExpenses] = useState(false)
  const hasExpenses = (place.expense_total ?? 0) > 0

  async function toggleVisited() {
    const res = await apiFetch<{ place: TripPlace }>(
      `/voyage/trips/${tripId}/places/${place.id}`,
      { method: 'PATCH', body: JSON.stringify({ visited: !place.visited }) }
    )
    onUpdate(res.place)
  }

  async function saveNote() {
    setSaving(true)
    const res = await apiFetch<{ place: TripPlace }>(
      `/voyage/trips/${tripId}/places/${place.id}`,
      { method: 'PATCH', body: JSON.stringify({ trip_note: note.trim() || null }) }
    )
    onUpdate(res.place)
    setSaving(false)
    setEditing(false)
  }

  async function del() {
    if (!confirm((tv.confirm?.removePlaceFromTrip ?? 'Remover "{name}" da viagem?').replace('{name}', place.name))) return
    await apiFetch(`/voyage/trips/${tripId}/places/${place.id}`, { method: 'DELETE' })
    onDelete(place.id)
  }

  return (
    <div style={{
      background: 'var(--arvo-surface)', border: `1px solid ${place.is_highlight ? RED : 'var(--arvo-border)'}`,
      borderRadius: 10, padding: '10px 12px',
      boxShadow: place.is_highlight ? `0 0 0 1px ${RED}22` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {canEdit && (
          <button
            type="button"
            onClick={toggleVisited}
            style={{ marginTop: 2, flexShrink: 0, width: 18, height: 18, borderRadius: 999, border: `1.5px solid ${place.visited ? '#1F8A5B' : 'var(--arvo-border)'}`, background: place.visited ? '#1F8A5B' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 160ms' }}
          >
            {place.visited && <span style={{ fontSize: 10, color: '#fff' }}>✓</span>}
          </button>
        )}
        <span style={{ fontSize: 18, flexShrink: 0 }}>{catIcon(place.category)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: place.visited ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg)', fontWeight: 500, textDecoration: place.visited ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {place.name}
            </p>
            {place.is_highlight && (
              <span style={{ fontSize: 10, color: RED, fontFamily: 'var(--arvo-font-display)', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>highlight</span>
            )}
          </div>
          {place.address && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {place.address}
            </p>
          )}
          {place.rating != null && <StarRating value={place.rating} />}
          {place.trip_note && !editing && (
            <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 12, color: GOLD, marginTop: 4 }}>
              {place.trip_note}
            </p>
          )}
          {hasExpenses && (
            <button
              type="button"
              onClick={() => canEdit && setShowExpenses(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, padding: 0, background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="6" cy="6" r="5" /><path strokeLinecap="round" d="M6 3.5v5M4.7 7.2c0 .7.6 1 1.3 1s1.3-.3 1.3-1-.6-.9-1.3-.9-1.3-.3-1.3-.9.6-1 1.3-1 1.3.3 1.3 1" />
              </svg>
              {fmtCurrency(place.expense_total ?? 0)}
              <span style={{ color: 'var(--arvo-fg-muted)' }}>· {place.expense_count} {place.expense_count === 1 ? (tv.expenses?.expenseOne ?? 'despesa') : (tv.expenses?.expenseMany ?? 'despesas')}</span>
            </button>
          )}
          {editing && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Nota sobre este lugar…"
                style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none' }}
              />
              <button type="button" onClick={saveNote} disabled={saving}
                style={{ padding: '5px 10px', borderRadius: 4, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: 'pointer', fontSize: 11 }}>
                {saving ? '…' : 'Salvar'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setNote(place.trip_note ?? '') }}
                style={{ padding: '5px 8px', borderRadius: 4, background: 'none', border: '1px solid var(--arvo-border)', cursor: 'pointer', fontSize: 11, color: 'var(--arvo-fg-muted)' }}>
                ✕
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {place.google_maps_url && (
            <a href={place.google_maps_url} target="_blank" rel="noopener noreferrer"
              style={{ padding: 4, color: 'var(--arvo-fg-soft)', display: 'flex', alignItems: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
              </svg>
            </a>
          )}
          {canEdit && (
            <>
              <button type="button" onClick={() => setShowExpenses(true)}
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: hasExpenses ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)', borderRadius: 4 }}
                title="Despesas">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="6" cy="6" r="5" /><path strokeLinecap="round" d="M6 3.5v5M4.7 7.2c0 .7.6 1 1.3 1s1.3-.3 1.3-1-.6-.9-1.3-.9-1.3-.3-1.3-.9.6-1 1.3-1 1.3.3 1.3 1" />
                </svg>
              </button>
              <button type="button" onClick={() => setEditing(!editing)}
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', borderRadius: 4 }}
                title="Nota">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
                </svg>
              </button>
              <button type="button" onClick={del}
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', borderRadius: 4 }}
                title="Remover">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {showExpenses && (
        <PlaceExpensesPanel
          tripId={tripId}
          placeId={place.id}
          placeName={place.name}
          onClose={() => setShowExpenses(false)}
          onChanged={onReload}
        />
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function TripPlacesPanel({ tripId, tripCity, tripCountry, canEdit }: Props) {
  const [places, setPlaces] = useState<TripPlace[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ places: TripPlace[] }>(`/voyage/trips/${tripId}/places`)
      setPlaces(data.places)
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          Lugares
        </p>
        {places.length > 0 && (
          <a href="/voyage/places" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.04em' }}>
            Biblioteca →
          </a>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2].map(i => <div key={i} style={{ height: 52, borderRadius: 10, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />)}
        </div>
      ) : places.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', marginBottom: 8 }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="rgba(200,184,154,0.30)" strokeWidth="1.3" style={{ marginBottom: 2 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3C11 3 7 7 7 12c0 7 9 16 9 16s9-9 9-16c0-5-4-9-9-9z"/>
            <circle cx="16" cy="12" r="2.5"/>
          </svg>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, marginTop: 8 }}>
            Nenhum lugar adicionado ainda
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {places.map(p => (
            <PlaceRow
              key={p.id}
              place={p}
              tripId={tripId}
              canEdit={canEdit}
              onUpdate={updated => setPlaces(ps => ps.map(x => x.id === updated.id ? updated : x))}
              onDelete={id => setPlaces(ps => ps.filter(x => x.id !== id))}
              onReload={load}
            />
          ))}
        </div>
      )}

      {canEdit && (
        <LibraryPicker
          tripId={tripId}
          tripCity={tripCity}
          tripCountry={tripCountry}
          onAdded={p => setPlaces(ps => [...ps, p])}
        />
      )}
    </div>
  )
}
