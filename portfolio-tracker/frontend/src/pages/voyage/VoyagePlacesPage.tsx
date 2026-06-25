import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useTheme } from '../../contexts/ThemeContext'
import OpeningHoursBlock from './_shared/OpeningHours'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Same pin style as VoyageMapPage/TripMapCard (category emoji in a teardrop
// marker) so a place looks the same wherever its map shows up. There's no
// per-day color here since library places aren't tied to a trip day.
function makePlaceIcon(emoji: string) {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;background:${RED};border:2px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,0.25);transform:rotate(-45deg)"><span style="transform:rotate(45deg)">${emoji}</span></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  })
}

function FitBounds({ places }: { places: Place[] }) {
  const map = useMap()
  useEffect(() => {
    if (!places.length) return
    if (places.length === 1) { map.setView([places[0].lat!, places[0].lng!], 14); return }
    map.fitBounds(L.latLngBounds(places.map(p => [p.lat!, p.lng!])), { padding: [40, 40] })
  }, [places, map])
  return null
}

const RED = '#D63B2F'
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
  opening_hours: string[] | null
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
  aluguel: '🚗', carro: '🚗', carros: '🚗',
}

function categoryIcon(cat: string | null): string {
  if (!cat) return '📌'
  const key = cat.toLowerCase().trim()
  for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return v
  }
  return '📌'
}

// ── URL Importer ──────────────────────────────────────────────────────────────
function UrlImporter({ onImported }: { onImported: (place: Place) => void }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setLast(null)
    try {
      const data = await apiFetch<{ place: Place }>('/voyage/places/from-url', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      })
      onImported(data.place)
      setLast(data.place.name)
      setUrl('')
    } catch {
      setError(tv.errors?.import ?? 'Erro ao importar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '16px 18px' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10 }}>
        Importar por link
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="url"
          placeholder="https://maps.google.com/maps/place/…"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null) }}
          style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: `1px solid ${error ? RED : 'var(--arvo-border)'}`, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none', boxSizing: 'border-box' }}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          style={{ padding: '7px 0', borderRadius: 6, background: loading || !url.trim() ? 'var(--arvo-hover-bg)' : 'var(--arvo-fg)', color: loading || !url.trim() ? 'var(--arvo-fg-muted)' : 'var(--arvo-bg)', border: 'none', cursor: loading || !url.trim() ? 'default' : 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, transition: 'all 160ms' }}
        >
          {loading ? 'Importando…' : 'Adicionar à biblioteca'}
        </button>
        {error && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED }}>{error}</p>}
        {last && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: '#1F8A5B' }}>✓ {last} adicionado</p>}
      </form>
    </div>
  )
}

// ── Takeout Importer ──────────────────────────────────────────────────────────
function TakeoutImporter({ onImported, onDeleteAll }: { onImported: () => void; onDeleteAll: () => void }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [files, setFiles] = useState<File[]>([])
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState<{ imported: number; total: number; skipped: number } | null>(null)
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
      const data = await apiFetch<{ imported: number; total_in_files: number; skipped: number }>(
        '/voyage/places/import-takeout',
        { method: 'POST', body: JSON.stringify({ files: parsed }) }
      )
      setResult({ imported: data.imported, total: data.total_in_files, skipped: data.skipped ?? 0 })
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      onImported()
    } catch {
      setError(tv.errors?.import ?? 'Erro ao importar')
    } finally {
      setImporting(false)
    }
  }

  async function handleDeleteAll() {
    if (!confirm(tv.confirm?.deleteAllPlaces ?? 'Apagar TODOS os lugares da biblioteca? Esta ação não pode ser desfeita.')) return
    setDeleting(true)
    try {
      await apiFetch('/voyage/places/all', { method: 'DELETE' })
      onDeleteAll()
    } catch {
      setError(tv.errors?.delete ?? 'Erro ao apagar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          Importar Google Takeout
        </p>
        <button
          type="button"
          onClick={handleDeleteAll}
          disabled={deleting}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, background: 'none', border: 'none', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.5 : 1, padding: 0 }}
        >
          {deleting ? 'Apagando…' : 'Apagar todos'}
        </button>
      </div>
      <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, marginBottom: 14, lineHeight: 1.5 }}>
        Em <strong style={{ fontStyle: 'normal', color: 'var(--arvo-fg-soft)' }}>takeout.google.com</strong> exporte o Google Maps e selecione aqui os <strong style={{ fontStyle: 'normal', color: 'var(--arvo-fg-soft)' }}>.json de cada lista</strong> (Restaurantes, Quero ir, etc.). O nome do arquivo vira a categoria.
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
          border: `2px dashed ${files.length > 0 ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 12,
          background: files.length > 0 ? 'var(--arvo-hover-bg)' : 'transparent',
          transition: 'all 200ms',
        }}
      >
        <span style={{ fontSize: 20 }}>📂</span>
        <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: files.length > 0 ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)' }}>
          {files.length > 0
            ? `${files.length} arquivo${files.length > 1 ? 's' : ''}: ${files.map(f => f.name.replace('.json', '')).join(', ')}`
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
            background: importing ? 'var(--arvo-hover-bg)' : 'var(--arvo-fg)',
            color: importing ? 'var(--arvo-fg-muted)' : 'var(--arvo-bg)',
            border: 'none', cursor: importing ? 'default' : 'pointer',
            fontFamily: 'var(--arvo-font-body)', fontSize: 13, transition: 'all 160ms',
          }}
        >
          {importing ? 'Importando…' : `Importar ${files.length} lista${files.length > 1 ? 's' : ''}`}
        </button>
      )}

      {result && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: '#1F8A5B' }}>
            ✓ {result.imported} lugares importados
          </p>
          {result.skipped > 0 && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 3 }}>
              {result.skipped} entradas puladas (pins sem nome — provavelmente marcadores manuais no mapa)
            </p>
          )}
        </div>
      )}
      {error && (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: RED, marginTop: 10 }}>{error}</p>
      )}
    </div>
  )
}

// ── Place Card ─────────────────────────────────────────────────────────────────
function PlaceCard({ place, onDelete }: { place: Place; onDelete: (id: number) => void }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [deleting, setDeleting] = useState(false)

  async function del() {
    if (!confirm((tv.confirm?.removePlaceFromLibrary ?? 'Remover "{name}" da biblioteca?').replace('{name}', place.name))) return
    setDeleting(true)
    await apiFetch(`/voyage/places/${place.id}`, { method: 'DELETE' })
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
  const { resolvedTheme } = useTheme()
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [places, setPlaces]   = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showMap, setShowMap] = useState(false)

  const cities = Array.from(new Set(places.map(p => p.city).filter(Boolean) as string[])).sort()
  const categories = Array.from(new Set(places.map(p => p.category).filter(Boolean) as string[])).sort()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ places: Place[] }>('/voyage/places')
      setPlaces(data.places)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = places.filter(p => {
    const matchQ = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCity = !cityFilter || p.city === cityFilter
    const matchCategory = !categoryFilter || p.category === categoryFilter
    return matchQ && matchCity && matchCategory
  })
  const filteredWithCoords = filtered.filter((p): p is Place & { lat: number; lng: number } => p.lat != null && p.lng != null)

  return (
    <div className="max-w-4xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 6 }}>
          ARVO VOYAGE
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
            Lugares
          </h1>
          {places.some(p => p.lat && p.lng) && (
            <button
              type="button"
              onClick={() => setShowMap(v => !v)}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, padding: '4px 12px', borderRadius: 6,
                border: `1px solid ${showMap ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
                background: showMap ? 'var(--arvo-hover-bg)' : 'transparent',
                color: showMap ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', cursor: 'pointer',
              }}
            >
              {showMap ? '🗺 Ocultar mapa' : '🗺 Ver no mapa'}
            </button>
          )}
        </div>
      </div>

      {/* Map view — reflete os mesmos filtros (busca/cidade/categoria) da lista */}
      {showMap && (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--arvo-border)', boxShadow: 'var(--arvo-shadow-sm)', marginBottom: 24, height: 480 }}>
          {filteredWithCoords.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-hover-bg)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD }}>
                Nenhum lugar com coordenadas para esse filtro
              </p>
            </div>
          ) : (
          <MapContainer
            center={[filteredWithCoords[0].lat!, filteredWithCoords[0].lng!]}
            zoom={5}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              key={resolvedTheme}
              attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
              url={resolvedTheme === 'dark'
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
              }
            />
            <FitBounds places={filteredWithCoords} />
            {filteredWithCoords.map(p => (
              <Marker key={p.id} position={[p.lat!, p.lng!]} icon={makePlaceIcon(categoryIcon(p.category))}>
                <Popup>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', minWidth: 160 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</p>
                    {p.category && <p style={{ fontSize: 10.5, color: '#999', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.category}</p>}
                    {p.city && <p style={{ fontSize: 11, color: '#888' }}>{p.city}</p>}
                    {p.address && <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{p.address}</p>}
                    <OpeningHoursBlock hours={p.opening_hours} />
                    {p.notes && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#888', marginBottom: 4 }}>{p.notes}</p>}
                    {p.google_maps_url && (
                      <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: '#555', textDecoration: 'none' }}>
                        {tv.public?.openInMaps ?? 'Abrir no Google Maps →'}
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sidebar: filters + import */}
        <div className="flex flex-col gap-5">
          {/* Filters */}
          {places.length > 0 && (
            <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '16px 18px' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 12 }}>
                Filtros
              </p>
              <input
                type="text"
                placeholder="Buscar por nome…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 3, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 13, marginBottom: 10, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none' }}
              />
              {cities.length > 0 && (
                <>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>Cidade</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setCityFilter('')}
                      style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 10px', borderRadius: 999, border: `1px solid ${!cityFilter ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: !cityFilter ? 'var(--arvo-hover-bg)' : 'transparent', color: !cityFilter ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
                    >
                      Todas
                    </button>
                    {cities.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCityFilter(c)}
                        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 10px', borderRadius: 999, border: `1px solid ${cityFilter === c ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: cityFilter === c ? 'var(--arvo-hover-bg)' : 'transparent', color: cityFilter === c ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {categories.length > 0 && (
                <>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, color: 'var(--arvo-fg-soft)', marginBottom: 6 }}>Categoria</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('')}
                      style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 10px', borderRadius: 999, border: `1px solid ${!categoryFilter ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: !categoryFilter ? 'var(--arvo-hover-bg)' : 'transparent', color: !categoryFilter ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
                    >
                      Todas
                    </button>
                    {categories.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategoryFilter(c)}
                        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, padding: '3px 10px', borderRadius: 999, border: `1px solid ${categoryFilter === c ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: categoryFilter === c ? 'var(--arvo-hover-bg)' : 'transparent', color: categoryFilter === c ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', cursor: 'pointer' }}
                      >
                        {categoryIcon(c)} {c}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <UrlImporter onImported={p => setPlaces(ps => [p, ...ps.filter(x => x.id !== p.id)])} />
          <TakeoutImporter onImported={load} onDeleteAll={load} />
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
                {categoryFilter ? ` · ${categoryFilter}` : ''}
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
