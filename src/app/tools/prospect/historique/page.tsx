'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { MapMarker } from '../_Map'
import { useTranslation } from '@/lib/i18n'
import { SQHeader } from '@/components/sq/SQHeader'
import { SQFooter } from '@/components/sq/SQFooter'
import { C, sans } from '@/lib/sq-design'

const ProspectMap = dynamic(() => import('../_Map'), { ssr: false })

// ── Types ────────────────────────────────────────────────────────────────────

interface Run {
  id: string; created_at: string; neighborhood: string; category: string
  radius: number; total_found: number; total_skipped: number; total_prospects: number
}

interface Place {
  place_id: string; name: string; address: string; lat: number | null; lng: number | null
  rating: number | null; review_count: number; website: string | null; maps_url: string | null
  classification: string; score: number | null; services: string[] | null; summary: string | null
  has_instagram: boolean | null; instagram_url: string | null; website_quality: string | null
  phone: string | null; google_types: string[] | null; review_response_quality: string | null
}

// ── Filters state ─────────────────────────────────────────────────────────────

interface Filters {
  min_score: number; max_score: number
  has_website: 'all' | 'yes' | 'no'
  has_instagram: 'all' | 'yes' | 'no'
  website_quality: string
  review_response: string
  google_type: string
}

const DEFAULT_FILTERS: Filters = {
  min_score: 0, max_score: 100,
  has_website: 'all', has_instagram: 'all',
  website_quality: 'all', review_response: 'all', google_type: 'all',
}

const GOOGLE_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant', bakery: 'Boulangerie', cafe: 'Café', bar: 'Bar',
  florist: 'Fleuriste', clothing_store: 'Mode', grocery_or_supermarket: 'Épicerie',
  beauty_salon: 'Beauté', hair_care: 'Coiffeur', spa: 'Spa & Massage',
}

const WEBSITE_QUALITY_LABELS: Record<string, string> = {
  NONE: 'Aucun site', BASIC: 'Basique', OUTDATED: 'Obsolète', DECENT: 'Correct', GOOD: 'Bon',
}

const REVIEW_LABELS: Record<string, string> = {
  NONE: '✗ Absent', INCONSISTENT: '~ Irrégulier', HUMAN: '✓ Humain',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 75 ? C.ink : score >= 55 ? '#3D3028' : score >= 35 ? C.warm : C.paper
  const fg = score >= 35 ? C.paper : C.muted
  const border = score >= 35 ? bg : C.muted
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${border}`, fontFamily: sans, fontSize: 12, fontWeight: 600, padding: '3px 8px', minWidth: 36, textAlign: 'center' }}>
      {score}
    </span>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontFamily: sans, fontSize: 11, padding: '5px 12px', border: `0.5px solid ${active ? C.ink : C.muted}`, background: active ? C.ink : 'transparent', color: active ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0, whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}

async function exportExcel(places: Place[], label: string) {
  const res  = await fetch('/api/sq/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ places, neighborhood: label, category: 'tous' }) })
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `SQ_prospects_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoriquePage() {
  const { t } = useTranslation()
  const [tab,            setTab]           = useState<'runs' | 'all'>('runs')
  const [runs,           setRuns]          = useState<Run[]>([])
  const [loadingRuns,    setLoadingRuns]   = useState(true)
  const [selectedRun,    setSelectedRun]   = useState<Run | null>(null)
  const [runPlaces,      setRunPlaces]     = useState<Place[]>([])
  const [loadingPlaces,  setLoadingPlaces] = useState(false)
  const [runView,        setRunView]       = useState<'table' | 'map'>('table')

  const [allPlaces,      setAllPlaces]     = useState<Place[]>([])
  const [loadingAll,     setLoadingAll]    = useState(false)
  const [allView,        setAllView]       = useState<'table' | 'map'>('table')
  const [filters,        setFilters]       = useState<Filters>(DEFAULT_FILTERS)
  const [totalProspects, setTotalProspects] = useState<number | null>(null)

  // ── Load runs ───────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/sq/runs').then(r => r.json()).then(d => {
      const runs: Run[] = d.runs ?? []
      setRuns(runs)
      setTotalProspects(runs.reduce((acc, r) => acc + (r.total_prospects ?? 0), 0))
    }).catch(() => {}).finally(() => setLoadingRuns(false))
  }, [])

  // ── Load run detail ──────────────────────────────────────────────────────────
  async function selectRun(run: Run) {
    if (selectedRun?.id === run.id) { setSelectedRun(null); setRunPlaces([]); return }
    setSelectedRun(run); setLoadingPlaces(true)
    try {
      const res = await fetch(`/api/sq/runs/${run.id}`)
      const d   = await res.json()
      setRunPlaces(d.places ?? [])
    } catch { setRunPlaces([]) } finally { setLoadingPlaces(false) }
  }

  // ── Load all prospects with filters ─────────────────────────────────────────
  const fetchAll = useCallback(async (f: Filters) => {
    setLoadingAll(true)
    const p = new URLSearchParams({
      min_score:       String(f.min_score),
      max_score:       String(f.max_score),
      has_website:     f.has_website,
      has_instagram:   f.has_instagram,
      website_quality: f.website_quality,
      review_response: f.review_response,
      google_type:     f.google_type,
    })
    try {
      const res = await fetch(`/api/sq/places?${p}`)
      const d   = await res.json()
      setAllPlaces(d.places ?? [])
    } catch { setAllPlaces([]) } finally { setLoadingAll(false) }
  }, [])

  useEffect(() => { if (tab === 'all') fetchAll(filters) }, [tab])

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    fetchAll(next)
  }

  const runProspects = runPlaces.filter(p => p.classification === 'PROSPECT')

  const labelStyle: React.CSSProperties = { fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.ink }
  const thStyle: React.CSSProperties    = { fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: C.ink, fontWeight: 600, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap', background: C.warm }
  const tdBase: React.CSSProperties     = { padding: '11px 14px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, fontSize: 13, fontFamily: sans, color: C.ink, verticalAlign: 'top' }

  // ── Stat cards ───────────────────────────────────────────────────────────────
  const totalWithoutSite = allPlaces.filter(p => !p.website).length
  const avgScore = allPlaces.length > 0 ? Math.round(allPlaces.reduce((s, p) => s + (p.score ?? 0), 0) / allPlaces.length) : null

  function PlaceTable({ places }: { places: Place[] }) {
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['#', 'Score', 'Établissement', 'Catégorie', 'Note', 'Site / IG', 'Qualité site', 'Avis réponses', 'Services suggérés', 'Adresse', ''].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {places.map((p, i) => (
              <tr key={p.place_id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                <td style={{ ...tdBase, color: C.muted, fontSize: 10 }}>{i + 1}</td>
                <td style={tdBase}>{p.score !== null ? <ScoreBadge score={p.score} /> : <span style={{ color: C.muted }}>—</span>}</td>
                <td style={{ ...tdBase, fontWeight: 600, maxWidth: 200 }}>{p.name}</td>
                <td style={{ ...tdBase, fontSize: 11, color: C.muted }}>
                  {(p.google_types ?? []).filter(t => GOOGLE_TYPE_LABELS[t]).map(t => GOOGLE_TYPE_LABELS[t]).slice(0, 1).join('') || '—'}
                </td>
                <td style={{ ...tdBase, whiteSpace: 'nowrap', fontSize: 12, color: C.muted }}>
                  {p.rating !== null ? `${p.rating} ★` : '—'} · {p.review_count > 0 ? p.review_count.toLocaleString('fr-FR') : '—'}
                </td>
                <td style={{ ...tdBase, fontSize: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>Site ↗</a> : <span style={{ color: C.muted }}>Sans site</span>}
                    {p.instagram_url ? <a href={p.instagram_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>Instagram ↗</a> : <span style={{ color: C.muted, fontSize: 11 }}>Sans IG</span>}
                  </div>
                </td>
                <td style={{ ...tdBase, fontSize: 11, color: C.muted }}>{p.website_quality ? WEBSITE_QUALITY_LABELS[p.website_quality] ?? p.website_quality : '—'}</td>
                <td style={{ ...tdBase, fontSize: 11, whiteSpace: 'nowrap' }}>
                  {p.review_response_quality === 'HUMAN'
                    ? <span style={{ color: '#2d6a4f' }}>✓ Humain</span>
                    : p.review_response_quality === 'INCONSISTENT'
                    ? <span style={{ color: C.ink }}>~ Irrégulier</span>
                    : p.review_response_quality === 'NONE'
                    ? <span style={{ color: C.muted }}>✗ Absent</span>
                    : <span style={{ color: C.muted }}>—</span>}
                </td>
                <td style={{ ...tdBase, maxWidth: 240, fontSize: 11, color: C.muted }}>
                  {p.services?.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{p.services.map(s => <span key={s} style={{ border: `0.5px solid ${C.muted}`, padding: '1px 6px', fontSize: 10 }}>{s}</span>)}</div> : '—'}
                </td>
                <td style={{ ...tdBase, color: C.muted, fontSize: 11, maxWidth: 180 }}>{p.address}</td>
                <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                  {p.maps_url && <a href={p.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, textDecoration: 'none', borderBottom: `1px solid ${C.ink}` }}>Maps</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>
      <SQHeader />

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <span style={{ ...labelStyle, fontSize: 12 }}>{t('section_history')}</span>
            {totalProspects !== null && (
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.muted }}>
                {totalProspects} prospects identifiés · {runs.length} recherches
              </span>
            )}
          </div>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 14 }} />
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', marginBottom: 40 }}>
          {([['runs', 'Historique des recherches'], ['all', 'Tous les prospects']] as const).map(([key, label], i) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, padding: '9px 20px', border: `0.5px solid ${C.ink}`, borderLeft: i === 1 ? 'none' : undefined, background: tab === key ? C.ink : 'transparent', color: tab === key ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
              {label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB: RUNS */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {tab === 'runs' && (
          <div>
            {loadingRuns && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('progress_loading')}</p>}
            {!loadingRuns && runs.length === 0 && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>
                {t('empty_history')}{' '}<a href="/tools/prospect" style={{ color: C.ink }}>{t('btn_launch_search')}</a>
              </p>
            )}
            {runs.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 48 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.warm }}>
                      {['#', 'Date', 'Zone', 'Catégorie', 'Rayon', 'Prospects', 'Filtrés', ''].map((h, i) => (
                        <th key={i} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run, i) => {
                      const isSelected = selectedRun?.id === run.id
                      const dt = new Date(run.created_at)
                      return (
                        <tr key={run.id} style={{ background: isSelected ? C.warm : i % 2 === 0 ? C.paper : C.warm, cursor: 'pointer' }} onClick={() => selectRun(run)}>
                          <td style={{ ...tdBase, color: C.muted, fontSize: 10 }}>{i + 1}</td>
                          <td style={{ ...tdBase, whiteSpace: 'nowrap', fontSize: 12 }}>
                            {dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' '}<span style={{ color: C.muted }}>{dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td style={tdBase}>{run.neighborhood}</td>
                          <td style={{ ...tdBase, color: C.muted }}>{run.category}</td>
                          <td style={{ ...tdBase, color: C.muted, fontSize: 12 }}>{run.radius} m</td>
                          <td style={tdBase}><span style={{ fontVariantNumeric: 'tabular-nums' }}>{run.total_prospects}</span></td>
                          <td style={{ ...tdBase, color: C.muted, fontSize: 12 }}>{run.total_skipped}</td>
                          <td style={tdBase}><span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: isSelected ? C.ink : C.muted }}>{isSelected ? t('btn_close') : t('btn_see')}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Run detail */}
            {selectedRun && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <span style={{ ...labelStyle }}>
                    {selectedRun.neighborhood} · {selectedRun.category} · {new Date(selectedRun.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  {runProspects.length > 0 && !loadingPlaces && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ display: 'flex' }}>
                        {(['table', 'map'] as const).map((v, idx) => (
                          <button key={v} onClick={() => setRunView(v)}
                            style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, padding: '6px 14px', border: `0.5px solid ${C.ink}`, borderLeft: idx === 1 ? 'none' : undefined, background: runView === v ? C.ink : 'transparent', color: runView === v ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                            {v === 'table' ? 'Liste' : 'Carte'}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => exportExcel(runProspects, selectedRun.neighborhood)}
                        style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, padding: '6px 14px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0 }}>
                        Excel ↓
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ height: '0.5px', background: C.ink, marginBottom: 24 }} />

                {loadingPlaces && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('progress_loading_prospects')}</p>}
                {!loadingPlaces && runProspects.length === 0 && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('empty_prospects_in_run')}</p>}

                {!loadingPlaces && runProspects.length > 0 && runView === 'map' && (() => {
                  const markers: MapMarker[] = runProspects.filter(p => p.lat && p.lng).map(p => ({ place_id: p.place_id, name: p.name, lat: p.lat!, lng: p.lng!, score: p.score ?? 0, services: p.services ?? [], summary: p.summary ?? '', maps_url: p.maps_url ?? '', website: p.website }))
                  return <div style={{ border: `0.5px solid ${C.ink}`, marginBottom: 40 }}><ProspectMap markers={markers} center={[markers[0]?.lat ?? 48.86, markers[0]?.lng ?? 2.35]} /></div>
                })()}
                {!loadingPlaces && runProspects.length > 0 && runView === 'table' && <PlaceTable places={runProspects} />}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB: TOUS LES PROSPECTS */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {tab === 'all' && (
          <div>
            {/* Stat strip */}
            {!loadingAll && allPlaces.length > 0 && (
              <div style={{ display: 'flex', gap: 32, marginBottom: 32, flexWrap: 'wrap' }}>
                {[
                  { label: 'Prospects trouvés', value: allPlaces.length },
                  { label: 'Sans site web', value: totalWithoutSite, highlight: true },
                  { label: 'Score moyen', value: avgScore !== null ? `${avgScore}/100` : '—' },
                  { label: 'Sans réponse avis', value: allPlaces.filter(p => p.review_response_quality === 'NONE').length, highlight: true },
                ].map(({ label, value, highlight }) => (
                  <div key={label} style={{ borderLeft: `2px solid ${highlight ? C.accent : C.ink}`, paddingLeft: 16 }}>
                    <div style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: sans, fontSize: 24, fontWeight: 700, color: highlight ? C.accent : C.ink }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Filter panel */}
            <div style={{ border: `0.5px solid ${C.ink}`, padding: '20px 24px', marginBottom: 28, background: C.warm }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>

                {/* Score range */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted }}>Score potentiel</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} max={100} step={5} value={filters.min_score}
                      onChange={e => updateFilter('min_score', Number(e.target.value))}
                      style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', width: 44, padding: '2px 0' }} />
                    <span style={{ color: C.muted, fontSize: 12 }}>–</span>
                    <input type="number" min={0} max={100} step={5} value={filters.max_score}
                      onChange={e => updateFilter('max_score', Number(e.target.value))}
                      style={{ fontFamily: sans, fontSize: 13, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, outline: 'none', width: 44, padding: '2px 0' }} />
                  </div>
                </div>

                {/* Site web */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted }}>Site web</span>
                  <div style={{ display: 'flex', gap: 0 }}>
                    {([['all', 'Tous'], ['no', 'Sans'], ['yes', 'Avec']] as const).map(([v, l], i) => (
                      <button key={v} onClick={() => updateFilter('has_website', v)}
                        style={{ fontFamily: sans, fontSize: 11, padding: '5px 10px', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: filters.has_website === v ? C.ink : 'transparent', color: filters.has_website === v ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Instagram */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted }}>Instagram</span>
                  <div style={{ display: 'flex', gap: 0 }}>
                    {([['all', 'Tous'], ['no', 'Sans'], ['yes', 'Avec']] as const).map(([v, l], i) => (
                      <button key={v} onClick={() => updateFilter('has_instagram', v)}
                        style={{ fontFamily: sans, fontSize: 11, padding: '5px 10px', border: `0.5px solid ${C.ink}`, borderLeft: i === 0 ? undefined : 'none', background: filters.has_instagram === v ? C.ink : 'transparent', color: filters.has_instagram === v ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Qualité site */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted }}>Qualité site</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Chip label="Tous" active={filters.website_quality === 'all'} onClick={() => updateFilter('website_quality', 'all')} />
                    {Object.entries(WEBSITE_QUALITY_LABELS).map(([v, l]) => (
                      <Chip key={v} label={l} active={filters.website_quality === v} onClick={() => updateFilter('website_quality', v)} />
                    ))}
                  </div>
                </div>

                {/* Réponse avis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted }}>Réponse aux avis</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Chip label="Tous" active={filters.review_response === 'all'} onClick={() => updateFilter('review_response', 'all')} />
                    {Object.entries(REVIEW_LABELS).map(([v, l]) => (
                      <Chip key={v} label={l} active={filters.review_response === v} onClick={() => updateFilter('review_response', v)} />
                    ))}
                  </div>
                </div>

                {/* Catégorie */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9, color: C.muted }}>Catégorie</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Chip label="Toutes" active={filters.google_type === 'all'} onClick={() => updateFilter('google_type', 'all')} />
                    {Object.entries(GOOGLE_TYPE_LABELS).map(([v, l]) => (
                      <Chip key={v} label={l} active={filters.google_type === v} onClick={() => updateFilter('google_type', v)} />
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Results header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: C.muted }}>
                {loadingAll ? 'Chargement…' : `${allPlaces.length} résultat${allPlaces.length !== 1 ? 's' : ''}`}
              </span>
              {allPlaces.length > 0 && !loadingAll && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex' }}>
                    {(['table', 'map'] as const).map((v, idx) => (
                      <button key={v} onClick={() => setAllView(v)}
                        style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, padding: '6px 14px', border: `0.5px solid ${C.ink}`, borderLeft: idx === 1 ? 'none' : undefined, background: allView === v ? C.ink : 'transparent', color: allView === v ? C.paper : C.ink, cursor: 'pointer', borderRadius: 0 }}>
                        {v === 'table' ? 'Liste' : 'Carte'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => exportExcel(allPlaces, 'tous')}
                    style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, padding: '6px 14px', border: `0.5px solid ${C.ink}`, background: 'transparent', color: C.ink, cursor: 'pointer', borderRadius: 0 }}>
                    Excel ↓
                  </button>
                </div>
              )}
            </div>

            {loadingAll && <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</p>}

            {!loadingAll && allPlaces.length === 0 && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Aucun prospect correspond aux filtres sélectionnés.</p>
            )}

            {!loadingAll && allPlaces.length > 0 && allView === 'map' && (() => {
              const markers: MapMarker[] = allPlaces.filter(p => p.lat && p.lng).map(p => ({ place_id: p.place_id, name: p.name, lat: p.lat!, lng: p.lng!, score: p.score ?? 0, services: p.services ?? [], summary: p.summary ?? '', maps_url: p.maps_url ?? '', website: p.website }))
              if (!markers.length) return null
              return <div style={{ border: `0.5px solid ${C.ink}`, marginBottom: 40 }}><ProspectMap markers={markers} center={[48.8566, 2.3522]} /></div>
            })()}

            {!loadingAll && allPlaces.length > 0 && allView === 'table' && <PlaceTable places={allPlaces} />}
          </div>
        )}

      </main>
      <SQFooter />
    </div>
  )
}
