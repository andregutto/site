'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Barlow_Condensed } from 'next/font/google'
import type { MapMarker } from './_Map'
import { useTranslation } from '@/lib/i18n'
import { SQHeader } from '@/components/sq/SQHeader'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })
import { C, sans } from '@/lib/sq-design'

const ProspectMap = dynamic(() => import('./_Map'), { ssr: false })

const NEIGHBORHOODS = [
  { label: '1er — Louvre / Halles',       lat: 48.8603, lng: 2.3477 },
  { label: '2e — Bourse / Sentier',       lat: 48.8668, lng: 2.3459 },
  { label: '3e — Temple / Marais Nord',   lat: 48.8635, lng: 2.3609 },
  { label: '4e — Marais / Île St-Louis',  lat: 48.8534, lng: 2.3558 },
  { label: '5e — Quartier Latin',         lat: 48.8462, lng: 2.3508 },
  { label: '6e — Saint-Germain',          lat: 48.8495, lng: 2.3340 },
  { label: '7e — Invalides / Tour Eiffel',lat: 48.8566, lng: 2.3156 },
  { label: '8e — Champs-Élysées',         lat: 48.8750, lng: 2.3098 },
  { label: '9e — Opéra / Pigalle',        lat: 48.8763, lng: 2.3376 },
  { label: '10e — Gare du Nord / Est',    lat: 48.8752, lng: 2.3620 },
  { label: '11e — Oberkampf / Nation',    lat: 48.8589, lng: 2.3792 },
  { label: '12e — Bastille / Vincennes',  lat: 48.8423, lng: 2.3915 },
  { label: '13e — Gobelins / Chinatown',  lat: 48.8322, lng: 2.3561 },
  { label: '14e — Montparnasse Sud',      lat: 48.8330, lng: 2.3247 },
  { label: '15e — Vaugirard',             lat: 48.8414, lng: 2.2966 },
  { label: '16e — Passy / Trocadéro',     lat: 48.8634, lng: 2.2741 },
  { label: '17e — Batignolles',           lat: 48.8836, lng: 2.3113 },
  { label: '18e — Montmartre',            lat: 48.8927, lng: 2.3445 },
  { label: '19e — Buttes-Chaumont',       lat: 48.8823, lng: 2.3794 },
  { label: '20e — Ménilmontant',          lat: 48.8647, lng: 2.3989 },
]

const CATEGORIES = [
  { label: 'Restaurant',         type: 'restaurant' },
  { label: 'Bistro / Brasserie', type: 'restaurant', keyword: 'bistro' },
  { label: 'Boulangerie',        type: 'bakery' },
  { label: 'Pâtisserie',         type: 'bakery', keyword: 'patisserie' },
  { label: 'Café',               type: 'cafe' },
  { label: 'Bar',                type: 'bar' },
  { label: 'Épicerie fine',      type: 'grocery_or_supermarket', keyword: 'épicerie' },
  { label: 'Commerce de mode',   type: 'clothing_store' },
  { label: 'Fleuriste',          type: 'florist' },
  { label: 'Coiffeur / Beauté',  type: 'beauty_salon' },
]

interface PlaceBasic {
  place_id: string; name: string; address: string; lat: number; lng: number
  rating: number | null; review_count: number; has_website: boolean
  website: string | null; phone: string | null; is_open: boolean | null
  maps_url: string; google_types: string[]
}

interface AnalysisResult {
  classification: 'CHAIN' | 'LARGE' | 'PROSPECT'; class_reason: string
  score?: number; score_breakdown?: { website: number; social: number; local_seo: number; engagement: number }
  services?: string[]; summary?: string; has_instagram?: boolean
  instagram_url?: string | null; website_quality?: 'NONE' | 'BASIC' | 'OUTDATED' | 'DECENT' | 'GOOD'
  from_cache?: boolean
}

type AnalyzeStatus =
  | { state: 'pending' }
  | { state: 'loading' }
  | { state: 'done'; result: AnalysisResult }
  | { state: 'error'; message: string }

interface Place extends PlaceBasic { analyzeStatus: AnalyzeStatus }

function scoreColor(score: number): { bg: string; fg: string; border: string } {
  if (score >= 75) return { bg: C.ink,     fg: C.paper, border: C.ink     }
  if (score >= 55) return { bg: '#3D3028', fg: C.paper, border: '#3D3028' }
  if (score >= 35) return { bg: C.warm,    fg: C.ink,   border: C.ink     }
  return                   { bg: C.paper,  fg: C.muted, border: C.muted   }
}

function ScoreBadge({ score }: { score: number }) {
  const { bg, fg, border } = scoreColor(score)
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${border}`, fontFamily: sans, fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '3px 9px', minWidth: 36, textAlign: 'center' }}>
      {score}
    </span>
  )
}

async function exportExcel(places: Place[], neighborhood: string, category: string) {
  const prospects = places.filter(p => p.analyzeStatus.state === 'done' && p.analyzeStatus.result.classification === 'PROSPECT')
  const payload = prospects.map(p => {
    const r = p.analyzeStatus.state === 'done' ? p.analyzeStatus.result : null
    return { place_id: p.place_id, name: p.name, address: p.address, rating: p.rating, review_count: p.review_count, website: p.website, phone: p.phone, maps_url: p.maps_url, classification: r?.classification, score: r?.score ?? null, services: r?.services ?? null, summary: r?.summary ?? null, has_instagram: r?.has_instagram ?? null, instagram_url: r?.instagram_url ?? null, website_quality: r?.website_quality ?? null }
  })
  const res  = await fetch('/api/sq/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places: payload, neighborhood, category }) })
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `SQ_${neighborhood}_${category}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProspectPage() {
  const { t } = useTranslation()
  const [neighborhoodIdx, setNeighborhoodIdx] = useState(0)
  const [categoryIdx,     setCategoryIdx]     = useState(0)
  const [radius,          setRadius]          = useState(600)
  const [maxResults,      setMaxResults]      = useState(15)
  const [places,          setPlaces]          = useState<Place[]>([])
  const [searching,       setSearching]       = useState(false)
  const [view,            setView]            = useState<'table' | 'map'>('table')
  const [error,           setError]           = useState<string | null>(null)
  const [ran,             setRan]             = useState(false)
  const [selected,        setSelected]        = useState<Set<string>>(new Set())
  const [addingCRM,       setAddingCRM]       = useState(false)
  const [crmMsg,          setCrmMsg]          = useState<string | null>(null)

  const nb  = NEIGHBORHOODS[neighborhoodIdx]
  const cat = CATEGORIES[categoryIdx]

  const prospects = places.filter(p => p.analyzeStatus.state === 'done' && p.analyzeStatus.result.classification === 'PROSPECT')
  const skipped   = places.filter(p => p.analyzeStatus.state === 'done' && (p.analyzeStatus.result.classification === 'CHAIN' || p.analyzeStatus.result.classification === 'LARGE')).length
  const pending   = places.filter(p => p.analyzeStatus.state === 'pending' || p.analyzeStatus.state === 'loading').length
  const done      = places.filter(p => p.analyzeStatus.state === 'done' || p.analyzeStatus.state === 'error').length
  const errors    = places.filter(p => p.analyzeStatus.state === 'error')
  const firstErr  = errors.length > 0 ? (errors[0].analyzeStatus as { state: 'error'; message: string }).message : null

  const updatePlace = useCallback((place_id: string, status: AnalyzeStatus) => {
    setPlaces(prev => prev.map(p => p.place_id === place_id ? { ...p, analyzeStatus: status } : p))
  }, [])

  async function analyzeOne(p: PlaceBasic, runId: string): Promise<AnalysisResult | null> {
    updatePlace(p.place_id, { state: 'loading' })
    try {
      const res = await fetch('/api/sq/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ place_id: p.place_id, name: p.name, address: p.address, lat: p.lat, lng: p.lng, google_types: p.google_types, rating: p.rating, review_count: p.review_count, website: p.website, phone: p.phone, maps_url: p.maps_url, run_id: runId }) })
      const data: AnalysisResult = await res.json()
      if (!res.ok) { updatePlace(p.place_id, { state: 'error', message: (data as any).error ?? t('error_label') }); return null }
      updatePlace(p.place_id, { state: 'done', result: data }); return data
    } catch (e) {
      updatePlace(p.place_id, { state: 'error', message: e instanceof Error ? e.message : t('error_label') }); return null
    }
  }

  async function runAnalysis(list: PlaceBasic[], runId: string) {
    let prospectCount = 0, skippedCount = 0
    const CONCURRENCY = 3; let i = 0
    async function worker() { while (i < list.length) { const p = list[i++]; const r = await analyzeOne(p, runId); if (r?.classification === 'PROSPECT') prospectCount++; else if (r) skippedCount++ } }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    return { prospects: prospectCount, skipped: skippedCount }
  }

  async function handleSearch() {
    setSearching(true); setError(null); setRan(true); setPlaces([]); setView('table')
    const runId = crypto.randomUUID()
    const params = new URLSearchParams({ lat: String(nb.lat), lng: String(nb.lng), radius: String(radius), type: cat.type, maxResults: String(maxResults) })
    if ('keyword' in cat && cat.keyword) params.set('keyword', cat.keyword)
    try {
      const res  = await fetch(`/api/sq/search?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.message || t('error_label'))
      const list: PlaceBasic[] = data.results ?? []
      setPlaces(list.map(p => ({ ...p, analyzeStatus: { state: 'pending' } }))); setSearching(false)
      const counts = await runAnalysis(list, runId)
      fetch('/api/sq/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: runId, neighborhood: nb.label, category: cat.label, radius, total_found: list.length, total_skipped: counts.skipped, total_prospects: counts.prospects }) }).catch(() => {})
    } catch (e) { setError(e instanceof Error ? e.message : t('error_label')); setSearching(false) }
  }

  const mapMarkers: MapMarker[] = prospects.filter(p => p.analyzeStatus.state === 'done').map(p => {
    const r = (p.analyzeStatus as { state: 'done'; result: AnalysisResult }).result
    return { place_id: p.place_id, name: p.name, lat: p.lat, lng: p.lng, score: r.score ?? 0, services: r.services ?? [], summary: r.summary ?? '', maps_url: p.maps_url, website: p.website }
  })

  const isRunning = searching || pending > 0

  // shared styles
  const labelStyle = { fontFamily: sans, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontSize: 11, fontWeight: 600, color: C.ink }
  const thStyle: React.CSSProperties = { fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10, color: C.ink, fontWeight: 600, padding: '11px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap', background: C.warm }

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      <SQHeader />

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section label */}
        <div style={{ marginBottom: 40 }}>
          <span style={{ ...labelStyle, fontSize: 12 }}>{t('section_prospection')}</span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 14 }} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, marginBottom: 48, alignItems: 'flex-end' }}>

          {[
            { labelKey: 'filter_neighborhood' as const, el: (
              <select value={neighborhoodIdx} onChange={e => setNeighborhoodIdx(Number(e.target.value))} disabled={isRunning}
                style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 24px 8px 0', cursor: 'pointer', minWidth: 200, outline: 'none', appearance: 'none' }}>
                {NEIGHBORHOODS.map((n, i) => <option key={n.label} value={i}>{n.label}</option>)}
              </select>
            )},
            { labelKey: 'filter_category' as const, el: (
              <select value={categoryIdx} onChange={e => setCategoryIdx(Number(e.target.value))} disabled={isRunning}
                style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 24px 8px 0', cursor: 'pointer', minWidth: 200, outline: 'none', appearance: 'none' }}>
                {CATEGORIES.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
              </select>
            )},
            { labelKey: 'filter_radius' as const, el: (
              <input type="number" min={200} max={2000} step={100} value={radius} onChange={e => setRadius(Number(e.target.value))} disabled={isRunning}
                style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 0', width: 80, outline: 'none' }} />
            )},
            { labelKey: 'filter_max_results' as const, el: (
              <input type="number" min={5} max={25} step={5} value={maxResults} onChange={e => setMaxResults(Number(e.target.value))} disabled={isRunning}
                style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 0', width: 60, outline: 'none' }} />
            )},
          ].map(({ labelKey, el }) => (
            <div key={labelKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ ...labelStyle }}>{t(labelKey)}</span>
              {el}
            </div>
          ))}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <button onClick={handleSearch} disabled={isRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 24px', border: 'none', borderRadius: 0, background: C.accent, color: C.paper, cursor: isRunning ? 'wait' : 'pointer', opacity: isRunning ? 0.65 : 1 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {searching ? t('btn_searching') : isRunning ? t('btn_analyzing') : t('btn_search')}
              </span>
              <span>→</span>
            </button>

            {prospects.length > 0 && !isRunning && (
              <button onClick={() => exportExcel(places, nb.label, cat.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: 'transparent', color: C.ink, cursor: 'pointer' }}>
                <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.08em', color: C.muted }}>02</span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {t('btn_excel')} · {prospects.length}
                </span>
                <span>↓</span>
              </button>
            )}
            {selected.size > 0 && !isRunning && (
              <button onClick={async () => {
                setAddingCRM(true); setCrmMsg(null)
                const toAdd = prospects.filter(p => selected.has(p.place_id)).map(p => { const r = p.analyzeStatus.state === 'done' ? p.analyzeStatus.result : null; return { ...p, score: r?.score ?? null, services: r?.services ?? null, summary: r?.summary ?? null, instagram_url: r?.instagram_url ?? null, neighborhood: nb.label, category: cat.label } })
                const res  = await fetch('/api/sq/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clients: toAdd }) })
                const data = await res.json()
                if (res.ok) { setCrmMsg(`${toAdd.length} ${t('progress_prospects')} → CRM`); setSelected(new Set()) }
                else setCrmMsg(`${t('error_label')}: ${data.error}`)
                setAddingCRM(false)
              }} disabled={addingCRM}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 22px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: C.warm, color: C.ink, cursor: 'pointer' }}>
                <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.08em', color: C.muted }}>03</span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {addingCRM ? t('btn_adding') : `${t('btn_add_crm')} · ${selected.size}`}
                </span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: C.warm, border: `0.5px solid ${C.ink}`, padding: '16px 20px', marginBottom: 32 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: C.muted, display: 'block', marginBottom: 6 }}>{t('error_label')}</span>
            <span style={{ fontFamily: sans, fontSize: 14, color: C.ink }}>{error}</span>
          </div>
        )}

        {/* CRM feedback */}
        {crmMsg && (
          <div style={{ background: C.warm, border: `0.5px solid ${C.ink}`, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: sans, fontSize: 14, color: C.ink }}>{crmMsg}</span>
            <a href="/tools/clients" style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink, textDecoration: 'none', borderBottom: `1px solid ${C.ink}`, paddingBottom: 1 }}>{t('btn_see_clients')}</a>
          </div>
        )}

        {/* Analysis errors */}
        {!isRunning && errors.length > 0 && prospects.length === 0 && skipped === 0 && firstErr && (
          <div style={{ background: C.warm, border: `0.5px solid ${C.ink}`, padding: '16px 20px', marginBottom: 32 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: C.muted, display: 'block', marginBottom: 6 }}>
              {t('error_analysis_label')} ({errors.length}/{places.length})
            </span>
            <span style={{ fontFamily: sans, fontSize: 14, color: C.ink }}>{firstErr}</span>
          </div>
        )}

        {/* Progress bar */}
        {places.length > 0 && done < places.length && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: C.ink }}>
                {t('progress_analyzing')} · {done}/{places.length}
              </span>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: C.muted }}>
                {prospects.length} {t('progress_prospects')} · {skipped} {t('progress_filtered')}
              </span>
            </div>
            <div style={{ height: 3, background: C.warm, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(done / places.length) * 100}%`, background: C.ink, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {/* Stats bar + view toggle */}
        {(prospects.length > 0 || skipped > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 28 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 11, color: C.ink }}>
                {prospects.length} {t('progress_prospects')} · {t('progress_score_desc')}
              </span>
              {skipped > 0 && (
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 11, color: C.muted }}>
                  {skipped} {t('progress_ignored')}
                </span>
              )}
            </div>
            {prospects.length > 0 && !isRunning && (
              <div style={{ display: 'flex' }}>
                {(['table', 'map'] as const).map((v, idx) => (
                  <button key={v} onClick={() => setView(v)}
                    style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, padding: '7px 18px', border: `0.5px solid ${C.ink}`, borderLeft: idx === 1 ? 'none' : `0.5px solid ${C.ink}`, background: view === v ? C.ink : 'transparent', color: view === v ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                    {v === 'table' ? t('view_list') : t('view_map')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Score legend */}
        {prospects.length > 0 && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { range: '75–100', score: 80, labelKey: 'score_very_high' as const },
              { range: '55–74',  score: 65, labelKey: 'score_high'      as const },
              { range: '35–54',  score: 45, labelKey: 'score_mid'       as const },
              { range: '0–34',   score: 20, labelKey: 'score_low'       as const },
            ].map(({ range, score, labelKey }) => (
              <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScoreBadge score={score} />
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: C.muted }}>{range} · {t(labelKey)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {ran && !searching && places.length === 0 && !error && (
          <p style={{ fontFamily: sans, fontSize: 14, color: C.muted }}>{t('empty_results')}</p>
        )}

        {/* Map */}
        {view === 'map' && mapMarkers.length > 0 && (
          <div style={{ border: `0.5px solid ${C.ink}`, marginBottom: 40 }}>
            <ProspectMap markers={mapMarkers} center={[nb.lat, nb.lng]} />
          </div>
        )}

        {/* Table */}
        {view === 'table' && prospects.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {(['', 'th_num', 'th_score', 'th_business', 'th_rating', 'th_web_ig', 'th_site_quality', 'th_services', 'th_address', 'th_actions'] as const).map((h, i) => (
                    <th key={i} style={thStyle}>{h === '' ? '' : t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...prospects].sort((a, b) => { const sa = a.analyzeStatus.state === 'done' ? (a.analyzeStatus.result.score ?? 0) : 0; const sb2 = b.analyzeStatus.state === 'done' ? (b.analyzeStatus.result.score ?? 0) : 0; return sb2 - sa }).map((p, i) => {
                  const r = p.analyzeStatus.state === 'done' ? p.analyzeStatus.result : null
                  const score = r?.score ?? 0
                  const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top', borderBottom: `0.5px solid rgba(28,25,23,0.1)`, fontSize: 13, fontFamily: sans, color: C.ink }
                  return (
                    <tr key={p.place_id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                      <td style={{ ...td, padding: '12px 8px 12px 14px', width: 24 }}>
                        <input type="checkbox" checked={selected.has(p.place_id)} onChange={e => setSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(p.place_id) : s.delete(p.place_id); return s })} style={{ cursor: 'pointer', accentColor: C.ink }} />
                      </td>
                      <td style={{ ...td, color: C.muted, fontSize: 11 }}>{i + 1}</td>
                      <td style={td}>{r ? <ScoreBadge score={score} /> : <span style={{ color: C.muted }}>—</span>}</td>
                      <td style={{ ...td, maxWidth: 200, fontWeight: 600 }}>{p.name}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                        {p.rating !== null ? `${p.rating} ★` : '—'}{' · '}{p.review_count > 0 ? p.review_count.toLocaleString('fr-FR') + ' ' + t('reviews_suffix') : '—'}
                      </td>
                      <td style={{ ...td, fontSize: 13 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>{t('link_website')}</a> : <span style={{ color: C.muted }}>{t('no_website')}</span>}
                          {r?.instagram_url ? <a href={r.instagram_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>{t('link_instagram')}</a> : r ? <span style={{ color: C.muted, fontSize: 12 }}>{t('no_instagram')}</span> : null}
                        </div>
                      </td>
                      <td style={{ ...td, fontSize: 12, color: C.muted }}>{r?.website_quality ?? '—'}</td>
                      <td style={{ ...td, maxWidth: 240, fontSize: 12, color: C.muted }}>
                        {r?.services?.length ? <ul style={{ margin: 0, paddingLeft: 14 }}>{r.services.map(s => <li key={s}>{s}</li>)}</ul> : '—'}
                      </td>
                      <td style={{ ...td, color: C.muted, fontSize: 12, maxWidth: 200 }}>{p.address}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <a href={p.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, textDecoration: 'none', borderBottom: `1px solid ${C.ink}`, paddingBottom: 1 }}>{t('link_maps')}</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pending rows */}
        {view === 'table' && places.filter(p => p.analyzeStatus.state === 'pending' || p.analyzeStatus.state === 'loading').length > 0 && (
          <div>
            {places.filter(p => p.analyzeStatus.state === 'pending' || p.analyzeStatus.state === 'loading').map(p => (
              <div key={p.place_id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, background: C.paper }}>
                <span style={{ fontFamily: sans, fontSize: 11, color: C.muted, width: 24 }}>·</span>
                <span style={{ fontFamily: sans, fontSize: 13, color: p.analyzeStatus.state === 'loading' ? C.ink : C.muted, flex: 1 }}>{p.name}</span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, color: C.muted }}>
                  {p.analyzeStatus.state === 'loading' ? t('progress_analyzing_one') : t('progress_pending')}
                </span>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
