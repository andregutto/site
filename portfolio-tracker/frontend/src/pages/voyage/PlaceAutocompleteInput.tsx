import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '../../lib/api'

interface Suggestion {
  place_id: string
  main_text: string
  secondary_text: string
}

export interface PlaceDetails {
  city: string | null
  country: string | null
  lat: number | null
  lng: number | null
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSelect: (details: PlaceDetails) => void
  placeholder?: string
  style?: React.CSSProperties
  onFocusStyle?: () => void
  onBlurStyle?: () => void
}

function newSession() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)
}

export default function PlaceAutocompleteInput({ value, onChange, onSelect, placeholder, style }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const sessionRef = useRef<string>(newSession())
  const skipNextFetch = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced autocomplete
  useEffect(() => {
    if (skipNextFetch.current) { skipNextFetch.current = false; return }
    const q = value.trim()
    if (q.length < 2) { setSuggestions([]); setOpen(false); return }
    const handle = setTimeout(async () => {
      try {
        const data = await apiFetch<{ suggestions: Suggestion[] }>(
          `/voyage/geo/autocomplete?q=${encodeURIComponent(q)}&session=${sessionRef.current}`
        )
        setSuggestions(data.suggestions ?? [])
        setOpen((data.suggestions ?? []).length > 0)
        setActive(-1)
      } catch {
        setSuggestions([]); setOpen(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [value])

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = useCallback(async (s: Suggestion) => {
    skipNextFetch.current = true
    onChange(s.main_text)
    setOpen(false)
    setSuggestions([])
    try {
      const data = await apiFetch<{ place: PlaceDetails | null }>(
        `/voyage/geo/details?place_id=${encodeURIComponent(s.place_id)}&session=${sessionRef.current}`
      )
      if (data.place) onSelect(data.place)
    } catch { /* ignore — texto livre permanece */ }
    sessionRef.current = newSession() // sessão termina ao buscar detalhes
  }, [onChange, onSelect])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        style={style}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
            background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 8,
            boxShadow: 'var(--arvo-shadow-lg)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.place_id}
              type="button"
              onMouseDown={e => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: i === active ? 'var(--arvo-hover-bg)' : 'transparent',
                border: 'none', cursor: 'pointer',
                fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)',
              }}
            >
              <span>{s.main_text}</span>
              {s.secondary_text && (
                <span style={{ color: 'var(--arvo-fg-soft)', fontSize: 12.5, marginLeft: 6 }}>{s.secondary_text}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
