import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../../lib/api'

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.10)'
const GOLD = '#C8B89A'

interface Place {
  id: number
  name: string
  category: string | null
  city: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  notes: string | null
  source: string
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

function categoryIcon(cat: string | null): string {
  if (!cat) return '📌'
  const key = cat.toLowerCase().trim()
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '📌'
}

// ── Takeout Importer ──────────────────────────────────────────────────────────
function TakeoutImporter({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    if (files.length === 0) return
    setImporting(true)
    setError('')
    setResult(null)
    try {
      const parsed: { list_name: string; geojson: object }[] = []
      for (const f of files) {
        const text = await f.text()
        const geojson = JSON.parse(text)
        const list_name = f.name.replace(/\.json$/i, '')
        parsed.push({ list_name, geojson })
      }
      const data = await apiFetch<{ imported: number; total_in_files: number }>(
        '/api/voyage/places/import-takeout',
        { method: 'POST', body: JSON.stringify({ files: parsed }) }
      )
      setResult({ imported: data.imported, total: data.total_in_files })
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      onImported()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao importar')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '20px 22px' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4 }}>
        Importar Google Takeout
      </p>
      <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, marginBottom: 14, lineHeight: 1.5 }}>
        Exporte seus lugares em <strong style={{ fontStyle: 'normal', color: 'var(--arvo-fg-soft)' }}>takeout.google.com</strong> → Google Maps → Listas salvas. Selecione os arquivos .json aqui.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".json"
        multiple
        onChange={e => setFiles(Array.from(e.target.files ?? []))}
        style={{ display: 'none' }}
        id="takeout-input"
      />
      <label
        htmlFor="takeout-input"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          border: `2px dashed ${files.length > 0 ? RED : 'var(--arvo-border)'}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 12,
          background: files.length > 0 ? RED_SOFT : 'transparent',
          transition: 'all 200ms',
        }}
      >
        <span style={{ fontSize: 20 }}>📂</span>
        <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: files.length > 0 ? RED : 'var(--arvo-fg-soft)' }}>
          {files.length > 0
            ? `${files.length} arquivo${files.length > 1 ? 's' : ''} selecionado${files.length > 1 ? 's' : ''}: ${files.map(f => f.name.replace('.json', '')).join(', ')}`
            : 'Clique para selecionar os .json das listas'}
        </span>
      </label>

      {files.length > 0 && (
        <button
          type="button"
          onClick={handleImport}
          disabled={importing}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 8,
            background: importing ? 'var(--arvo-hover-bg)' : RED,
            color: importing ? 'var(--arvo-fg-muted)' : '#fff',
            border: 'none', cursor: importing ? 'default' : 'pointer',
            fontFamily: 'var(--arvo-font-body)', fontSize: 13, transition: 'all 160ms',
          }}
        >
          {importing ? 'Importando e geocodificando…' : `Importar ${files.length} lista${files.length > 1 ? 's' : ''}`}
        </button>
      )}

      {result && (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: '#1F8A5B', marginTop: 10 }}>
          ✓ {result.imported} lugares importados de {result.total} encontrados
        </p>
      )}
      {error && (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: RED, marginTop: 10 }}>{error}</p>
      )}
    </div>
  )
}

// ── Place Card ─────────────────────────────────────────────────────────────────
function PlaceCard({ place, onDelete }: { place: Place; onDelete: (id: number) => void }) {
  const [deleting, setDeleting] = useState(false)

  async function del() {
    if (!confirm(`Remover "${place.name}" da biblioteca?`)) return
    setDeleting(true)
    await apiFetch(`/api/voyage/places/${place.id}`, { method: 'DELETE' })
    onDelete(place.id)
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{categoryIcon(place.category)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {place.name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          {place.city && (
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', background: 'var(--arvo-hover-bg)', padding: '1px 7px', borderRadius: 999 }}>
              {place.city}
            </span>
          )}
          {place.category && (
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)' }}>
              {place.category}
            </span>
          )}
        </div>
        {place.address && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {place.address}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {place.google_maps_url && (
          <a
            href={place.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: 5, color: 'var(--arvo-fg-soft)', display: 'flex', alignItems: 'center' }}
            title="Abrir no Google Maps"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
            </svg>
          </a>
        )}
        <button
          type="button"
          onClick={del}
          disabled={deleting}
          style={{ padding: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', borderRadius: 4, opacity: deleting ? 0.4 : 1 }}
          title="Remover"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VoyagePlacesPage() {
  const [places, setPlaces]   = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [cityFilter, setCityFilter] = useState('')

  const cities = Array.from(new Set(places.map(p => p.city).filter(Boolean) as string[])).sort()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ places: Place[] }>('/api/voyage/places')
      setPlaces(data.places)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = places.filter(p => {
    const matchQ = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCity = !cityFilter || p.city === cityFilter
    return matchQ && matchCity
  })

  return (
    <div className="max-w-4xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 6 }}>
          ARVO VOYAGE
        </p>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
          Lugares
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sidebar: import + filters */}
        <div className="flex flex-col gap-5">
          <TakeoutImporter onImported={load} />

          {/* Filters */}
          {places.length > 0 && (
            <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '16px 18px' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 12 }}>
                Filtros
              </p>
              <input
                type="text"
                placeholder="Buscar por nome…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 3, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 13, marginBottom: 8, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setCityFilter('')}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 10px', borderRadius: 999, border: `1px solid ${!cityFilter ? RED : 'var(--arvo-border)'}`, background: !cityFilter ? RED_SOFT : 'transparent', color: !cityFilter ? RED : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
                >
                  Todas
                </button>
                {cities.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCityFilter(c)}
                    style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 10px', borderRadius: 999, border: `1px solid ${cityFilter === c ? RED : 'var(--arvo-border)'}`, background: cityFilter === c ? RED_SOFT : 'transparent', color: cityFilter === c ? RED : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Place list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4].map(i => <div key={i} style={{ height: 72, borderRadius: 10, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 12 }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="rgba(200,184,154,0.35)" strokeWidth="1.5" style={{ marginBottom: 4 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 4C13.4 4 8 9.4 8 16c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"/>
                <circle cx="20" cy="16" r="4"/>
              </svg>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)' }}>
                {places.length === 0 ? 'Nenhum lugar na biblioteca' : 'Nenhum resultado'}
              </p>
              {places.length === 0 && (
                <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD }}>
                  Importe suas listas do Google Maps para começar
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginBottom: 4 }}>
                {filtered.length} lugar{filtered.length !== 1 ? 'es' : ''}
                {cityFilter ? ` em ${cityFilter}` : ''}
                {search ? ` · "${search}"` : ''}
              </p>
              {filtered.map(p => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  onDelete={id => setPlaces(ps => ps.filter(pl => pl.id !== id))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
