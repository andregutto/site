'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Barlow_Condensed } from 'next/font/google'
import * as XLSX from 'xlsx'
import type { MapMarker } from './_Map'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

const C = { paper: '#FDFAF5', ink: '#1C1917', warm: '#F4F0E6', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

const ProspectMap = dynamic(() => import('./_Map'), { ssr: false })

// ── Data ─────────────────────────────────────────────────────────────────────

const NEIGHBORHOODS = [
  { label: 'Sentier',               lat: 48.8648, lng: 2.3476 },
  { label: 'Montorgueil',           lat: 48.8634, lng: 2.3467 },
  { label: 'Les Halles',            lat: 48.8606, lng: 2.3477 },
  { label: 'Le Marais',             lat: 48.8565, lng: 2.3556 },
  { label: 'Pigalle / S.G.M.',      lat: 48.8818, lng: 2.3354 },
  { label: 'Canal Saint-Martin',    lat: 48.8701, lng: 2.3628 },
  { label: 'République',            lat: 48.8677, lng: 2.3636 },
  { label: 'Oberkampf',             lat: 48.8622, lng: 2.3724 },
  { label: 'Saint-Germain',         lat: 48.8542, lng: 2.3355 },
  { label: 'Montparnasse',          lat: 48.8422, lng: 2.3219 },
  { label: 'Bastille',              lat: 48.8534, lng: 2.3692 },
  { label: 'Belleville',            lat: 48.8701, lng: 2.3782 },
]

const CATEGORIES = [
  { label: 'Restaurant',           type: 'restaurant' },
  { label: 'Bistro / Brasserie',   type: 'restaurant', keyword: 'bistro' },
  { label: 'Boulangerie',          type: 'bakery' },
  { label: 'Pâtisserie',           type: 'bakery', keyword: 'patisserie' },
  { label: 'Café',                 type: 'cafe' },
  { label: 'Bar',                  type: 'bar' },
  { label: 'Épicerie fine',        type: 'grocery_or_supermarket', keyword: 'épicerie' },
  { label: 'Commerce de mode',     type: 'clothing_store' },
  { label: 'Fleuriste',            type: 'florist' },
  { label: 'Coiffeur / Beauté',    type: 'beauty_salon' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaceBasic {
  place_id:     string
  name:         string
  address:      string
  lat:          number
  lng:          number
  rating:       number | null
  review_count: number
  has_website:  boolean
  website:      string | null
  phone:        string | null
  is_open:      boolean | null
  maps_url:     string
  google_types: string[]
}

interface AnalysisResult {
  classification:  'CHAIN' | 'LARGE' | 'PROSPECT'
  class_reason:    string
  score?:          number
  score_breakdown?: { website: number; social: number; local_seo: number; engagement: number }
  services?:       string[]
  summary?:        string
  has_instagram?:  boolean
  instagram_url?:  string | null
  website_quality?: 'NONE' | 'BASIC' | 'OUTDATED' | 'DECENT' | 'GOOD'
  from_cache?:     boolean
}

type AnalyzeStatus =
  | { state: 'pending' }
  | { state: 'loading' }
  | { state: 'done'; result: AnalysisResult }
  | { state: 'error'; message: string }

interface Place extends PlaceBasic {
  analyzeStatus: AnalyzeStatus
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): { bg: string; fg: string; border: string } {
  if (score >= 75) return { bg: C.ink,     fg: C.paper, border: C.ink     }
  if (score >= 55) return { bg: '#3D3028', fg: C.paper, border: '#3D3028' }
  if (score >= 35) return { bg: C.warm,    fg: C.ink,   border: C.ink     }
  return                   { bg: C.paper,  fg: C.muted, border: C.muted   }
}

function ScoreBadge({ score }: { score: number }) {
  const { bg, fg, border } = scoreColor(score)
  return (
    <span style={{
      display: 'inline-block',
      background: bg, color: fg,
      border: `0.5px solid ${border}`,
      fontFamily: sans, fontSize: 11, fontVariantNumeric: 'tabular-nums',
      padding: '3px 8px', letterSpacing: '0.06em',
      minWidth: 36, textAlign: 'center',
    }}>
      {score}
    </span>
  )
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportExcel(places: Place[], nb: string, cat: string) {
  const prospects = places.filter(
    p => p.analyzeStatus.state === 'done' && p.analyzeStatus.result.classification === 'PROSPECT'
  )
  const rows = prospects.map((p, i) => {
    const r = p.analyzeStatus.state === 'done' ? p.analyzeStatus.result : null
    return [
      i + 1,
      p.name,
      r?.score ?? '',
      p.address,
      p.rating ?? '',
      p.review_count,
      p.website ?? '—',
      r?.instagram_url ?? (r?.has_instagram ? 'Oui' : '—'),
      r?.website_quality ?? '—',
      r?.services?.join(', ') ?? '—',
      r?.summary ?? '—',
      p.phone ?? '—',
      p.maps_url,
    ]
  })

  const header = ['N°', 'Établissement', 'Score /100', 'Adresse', 'Note', 'Avis', 'Site web', 'Instagram', 'Qualité site', 'Services recommandés', 'Analyse IA', 'Téléphone', 'Google Maps']
  const title  = [`STUDIO QUARTIER — Rapport de Prospection · ${nb} · ${cat}`, ...Array(12).fill('')]
  const date   = [`Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, ...Array(12).fill('')]

  const ws = XLSX.utils.aoa_to_sheet([title, date, [], header, ...rows])
  ws['!cols'] = [
    { wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 36 }, { wch: 6 }, { wch: 7 },
    { wch: 30 }, { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 55 }, { wch: 16 }, { wch: 20 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prospects')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `SQ_Prospection_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProspectPage() {
  const [neighborhoodIdx, setNeighborhoodIdx] = useState(0)
  const [categoryIdx,     setCategoryIdx]     = useState(0)
  const [radius,          setRadius]          = useState(600)
  const [places,          setPlaces]          = useState<Place[]>([])
  const [searching,       setSearching]       = useState(false)
  const [view,            setView]            = useState<'table' | 'map'>('table')
  const [error,           setError]           = useState<string | null>(null)
  const [ran,             setRan]             = useState(false)

  const nb  = NEIGHBORHOODS[neighborhoodIdx]
  const cat = CATEGORIES[categoryIdx]

  const prospects = places.filter(
    p => p.analyzeStatus.state === 'done' && p.analyzeStatus.result.classification === 'PROSPECT'
  )
  const skipped = places.filter(
    p => p.analyzeStatus.state === 'done' &&
      (p.analyzeStatus.result.classification === 'CHAIN' || p.analyzeStatus.result.classification === 'LARGE')
  ).length
  const pending  = places.filter(p => p.analyzeStatus.state === 'pending' || p.analyzeStatus.state === 'loading').length
  const done     = places.filter(p => p.analyzeStatus.state === 'done' || p.analyzeStatus.state === 'error').length
  const errors   = places.filter(p => p.analyzeStatus.state === 'error')
  const firstErr = errors.length > 0 ? (errors[0].analyzeStatus as { state: 'error'; message: string }).message : null

  const updatePlace = useCallback((place_id: string, status: AnalyzeStatus) => {
    setPlaces(prev => prev.map(p => p.place_id === place_id ? { ...p, analyzeStatus: status } : p))
  }, [])

  async function analyzeOne(p: PlaceBasic, runId: string): Promise<AnalysisResult | null> {
    updatePlace(p.place_id, { state: 'loading' })
    try {
      const res = await fetch('/api/sq/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id:     p.place_id,
          name:         p.name,
          address:      p.address,
          lat:          p.lat,
          lng:          p.lng,
          google_types: p.google_types,
          rating:       p.rating,
          review_count: p.review_count,
          website:      p.website,
          phone:        p.phone,
          maps_url:     p.maps_url,
          run_id:       runId,
        }),
      })
      const data: AnalysisResult = await res.json()
      if (!res.ok) {
        updatePlace(p.place_id, { state: 'error', message: (data as any).error ?? 'Erreur' })
        return null
      }
      updatePlace(p.place_id, { state: 'done', result: data })
      return data
    } catch (e) {
      updatePlace(p.place_id, { state: 'error', message: e instanceof Error ? e.message : 'Erreur réseau' })
      return null
    }
  }

  async function runAnalysis(list: PlaceBasic[], runId: string): Promise<{ prospects: number; skipped: number }> {
    let prospectCount = 0
    let skippedCount  = 0
    const CONCURRENCY = 3
    let i = 0
    async function worker() {
      while (i < list.length) {
        const p = list[i++]
        const result = await analyzeOne(p, runId)
        if (result?.classification === 'PROSPECT') prospectCount++
        else if (result) skippedCount++
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    return { prospects: prospectCount, skipped: skippedCount }
  }

  async function handleSearch() {
    setSearching(true)
    setError(null)
    setRan(true)
    setPlaces([])
    setView('table')

    const runId = crypto.randomUUID()
    const params = new URLSearchParams({
      lat:    String(nb.lat),
      lng:    String(nb.lng),
      radius: String(radius),
      type:   cat.type,
    })
    if ('keyword' in cat && cat.keyword) params.set('keyword', cat.keyword)

    try {
      const res  = await fetch(`/api/sq/search?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || 'Erreur recherche')
      const list: PlaceBasic[] = data.results ?? []
      setPlaces(list.map(p => ({ ...p, analyzeStatus: { state: 'pending' } })))
      setSearching(false)
      const counts = await runAnalysis(list, runId)
      // Save run summary to Supabase
      fetch('/api/sq/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:               runId,
          neighborhood:     nb.label,
          category:         cat.label,
          radius,
          total_found:      list.length,
          total_skipped:    counts.skipped,
          total_prospects:  counts.prospects,
        }),
      }).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSearching(false)
    }
  }

  const mapMarkers: MapMarker[] = prospects
    .filter(p => p.analyzeStatus.state === 'done')
    .map(p => {
      const r = (p.analyzeStatus as { state: 'done'; result: AnalysisResult }).result
      return {
        place_id: p.place_id,
        name:     p.name,
        lat:      p.lat,
        lng:      p.lng,
        score:    r.score ?? 0,
        services: r.services ?? [],
        summary:  r.summary ?? '',
        maps_url: p.maps_url,
        website:  p.website,
      }
    })

  const isRunning = searching || pending > 0

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      {/* ── Header ── */}
      <header style={{ background: C.paper }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontFamily: sans, textTransform: 'lowercase', letterSpacing: '0.6em', fontSize: 13, color: C.muted, marginLeft: 2 }}>
              studio
            </span>
            <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', fontSize: 52, lineHeight: 0.9, color: C.ink, marginTop: -2 }}>
              QUARTIER
            </span>
            <div style={{ width: '100%', height: '0.5px', background: C.ink, margin: '6px 0 4px' }} />
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
              Marketing Digital · Paris
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, paddingBottom: 4 }}>
            <a href="/tools/prospect/historique"
              style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted, textDecoration: 'none' }}>
              Historique ↗
            </a>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
              Outil interne
            </span>
          </div>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      {/* ── Main ── */}
      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section label */}
        <div style={{ marginBottom: 40 }}>
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
            Prospection · Intelligence commerciale
          </span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 12 }} />
        </div>

        {/* ── Filters ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, marginBottom: 48, alignItems: 'flex-end' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Quartier</span>
            <select
              value={neighborhoodIdx}
              onChange={e => setNeighborhoodIdx(Number(e.target.value))}
              disabled={isRunning}
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 24px 8px 0', cursor: 'pointer', minWidth: 200, outline: 'none', appearance: 'none' }}
            >
              {NEIGHBORHOODS.map((n, i) => <option key={n.label} value={i}>{n.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Catégorie</span>
            <select
              value={categoryIdx}
              onChange={e => setCategoryIdx(Number(e.target.value))}
              disabled={isRunning}
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 24px 8px 0', cursor: 'pointer', minWidth: 200, outline: 'none', appearance: 'none' }}
            >
              {CATEGORIES.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Rayon (m)</span>
            <input
              type="number" min={200} max={2000} step={100}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              disabled={isRunning}
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 0', width: 80, outline: 'none' }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <button
              onClick={handleSearch}
              disabled={isRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: C.ink, color: C.paper, cursor: isRunning ? 'wait' : 'pointer', opacity: isRunning ? 0.65 : 1 }}
            >
              <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted }}>01</span>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.28em', fontSize: 11, whiteSpace: 'nowrap' }}>
                {searching ? 'Recherche…' : isRunning ? 'Analyse en cours…' : 'Lancer la recherche'}
              </span>
              <span style={{ fontSize: 13 }}>→</span>
            </button>

            {prospects.length > 0 && !isRunning && (
              <button
                onClick={() => exportExcel(places, nb.label, cat.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: 'transparent', color: C.ink, cursor: 'pointer' }}
              >
                <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted }}>02</span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.28em', fontSize: 11, whiteSpace: 'nowrap' }}>
                  Excel · {prospects.length} prospect{prospects.length > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 13 }}>↓</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{ background: C.warm, border: `0.5px solid ${C.ink}`, padding: '14px 20px', marginBottom: 32 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted, display: 'block', marginBottom: 6 }}>Erreur</span>
            <span style={{ fontFamily: sans, fontSize: 13, color: C.ink }}>{error}</span>
          </div>
        )}

        {/* ── Analysis errors ── */}
        {!isRunning && errors.length > 0 && prospects.length === 0 && skipped === 0 && firstErr && (
          <div style={{ background: C.warm, border: `0.5px solid ${C.ink}`, padding: '14px 20px', marginBottom: 32 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted, display: 'block', marginBottom: 6 }}>
              Erreur d'analyse ({errors.length}/{places.length})
            </span>
            <span style={{ fontFamily: sans, fontSize: 13, color: C.ink }}>{firstErr}</span>
          </div>
        )}

        {/* ── Progress bar ── */}
        {places.length > 0 && (done < places.length) && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>
                Analyse en cours · {done}/{places.length}
              </span>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>
                {prospects.length} prospect{prospects.length > 1 ? 's' : ''} · {skipped} filtrés
              </span>
            </div>
            <div style={{ height: 2, background: C.warm, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, height: '100%',
                width: `${(done / places.length) * 100}%`,
                background: C.ink,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {/* ── Stats bar + view toggle ── */}
        {(prospects.length > 0 || skipped > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>
                {prospects.length} prospect{prospects.length > 1 ? 's' : ''} · score décroissant
              </span>
              {skipped > 0 && (
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>
                  {skipped} ignoré{skipped > 1 ? 's' : ''} (grandes enseignes)
                </span>
              )}
            </div>
            {prospects.length > 0 && !isRunning && (
              <div style={{ display: 'flex', gap: 0 }}>
                {(['table', 'map'] as const).map((v, idx) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10,
                      padding: '7px 16px',
                      border: `0.5px solid ${C.ink}`,
                      borderLeft: idx === 1 ? 'none' : `0.5px solid ${C.ink}`,
                      background: view === v ? C.ink : 'transparent',
                      color: view === v ? C.paper : C.ink,
                      cursor: 'pointer', borderRadius: 0,
                    }}
                  >
                    {v === 'table' ? 'Liste' : 'Carte'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Score legend ── */}
        {prospects.length > 0 && (
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { range: '75–100', score: 80, label: 'Très haute priorité' },
              { range: '55–74',  score: 65, label: 'Haute priorité' },
              { range: '35–54',  score: 45, label: 'Priorité moyenne' },
              { range: '0–34',   score: 20, label: 'Faible priorité' },
            ].map(({ range, score, label }) => (
              <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreBadge score={score} />
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, color: C.muted }}>{range} · {label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {ran && !searching && places.length === 0 && !error && (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, letterSpacing: '0.04em' }}>Aucun résultat pour ce secteur.</p>
        )}

        {/* ── MAP VIEW ── */}
        {view === 'map' && mapMarkers.length > 0 && (
          <div style={{ border: `0.5px solid ${C.ink}`, marginBottom: 40 }}>
            <ProspectMap markers={mapMarkers} center={[nb.lat, nb.lng]} />
          </div>
        )}

        {/* ── TABLE VIEW ── */}
        {view === 'table' && prospects.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.warm }}>
                  {['N°', 'Score', 'Établissement', 'Note · Avis', 'Site · Instagram', 'Qualité site', 'Services recommandés', 'Adresse', 'Actions'].map(h => (
                    <th key={h} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.muted, fontWeight: 400, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...prospects]
                  .sort((a, b) => {
                    const sa = a.analyzeStatus.state === 'done' ? (a.analyzeStatus.result.score ?? 0) : 0
                    const sb2 = b.analyzeStatus.state === 'done' ? (b.analyzeStatus.result.score ?? 0) : 0
                    return sb2 - sa
                  })
                  .map((p, i) => {
                    const r = p.analyzeStatus.state === 'done' ? p.analyzeStatus.result : null
                    const score = r?.score ?? 0
                    const rule = 'rgba(28,25,23,0.08)'
                    const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top', borderBottom: `0.5px solid ${rule}`, fontSize: 13, fontFamily: sans, color: C.ink }
                    return (
                      <tr key={p.place_id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                        <td style={{ ...td, color: C.muted, fontSize: 10 }}>{i + 1}</td>

                        <td style={{ ...td }}>
                          {r ? <ScoreBadge score={score} /> : <span style={{ color: C.muted }}>—</span>}
                        </td>

                        <td style={{ ...td, maxWidth: 200, fontWeight: 500 }}>{p.name}</td>

                        <td style={{ ...td, whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                          {p.rating !== null ? `${p.rating} ★` : '—'}
                          {' · '}
                          {p.review_count > 0 ? p.review_count.toLocaleString('fr-FR') + ' avis' : '—'}
                        </td>

                        <td style={{ ...td, fontSize: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {p.website ? (
                              <a href={p.website} target="_blank" rel="noopener noreferrer"
                                style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                                Site ↗
                              </a>
                            ) : (
                              <span style={{ color: C.muted }}>Aucun site</span>
                            )}
                            {r?.instagram_url ? (
                              <a href={r.instagram_url} target="_blank" rel="noopener noreferrer"
                                style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                                Instagram ↗
                              </a>
                            ) : r ? (
                              <span style={{ color: C.muted, fontSize: 11 }}>Pas d'Instagram</span>
                            ) : null}
                          </div>
                        </td>

                        <td style={{ ...td, fontSize: 11, color: C.muted }}>
                          {r?.website_quality ?? '—'}
                        </td>

                        <td style={{ ...td, maxWidth: 240, fontSize: 12, color: C.muted }}>
                          {r?.services?.length ? (
                            <ul style={{ margin: 0, paddingLeft: 14 }}>
                              {r.services.map(s => <li key={s}>{s}</li>)}
                            </ul>
                          ) : '—'}
                        </td>

                        <td style={{ ...td, color: C.muted, fontSize: 12, maxWidth: 200 }}>{p.address}</td>

                        <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12 }}>
                          <a href={p.maps_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: C.ink, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, textDecoration: 'none' }}>
                            Maps ↗
                          </a>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pending rows (analysis in progress) ── */}
        {view === 'table' && places.filter(p => p.analyzeStatus.state === 'pending' || p.analyzeStatus.state === 'loading').length > 0 && (
          <div style={{ marginTop: prospects.length > 0 ? 0 : 0 }}>
            {places
              .filter(p => p.analyzeStatus.state === 'pending' || p.analyzeStatus.state === 'loading')
              .map(p => (
                <div key={p.place_id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '11px 14px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`,
                  background: C.paper,
                }}>
                  <span style={{ fontFamily: sans, fontSize: 10, color: C.muted, width: 24 }}>·</span>
                  <span style={{ fontFamily: sans, fontSize: 13, color: p.analyzeStatus.state === 'loading' ? C.ink : C.muted, flex: 1 }}>
                    {p.name}
                  </span>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>
                    {p.analyzeStatus.state === 'loading' ? 'Analyse…' : 'En attente'}
                  </span>
                </div>
              ))}
          </div>
        )}

      </main>
    </div>
  )
}
