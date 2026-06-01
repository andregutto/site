'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { MapMarker } from '../_Map'
import { useTranslation } from '@/lib/i18n'
import { SQHeader } from '@/components/sq/SQHeader'

const ProspectMap = dynamic(() => import('../_Map'), { ssr: false })

const C = { paper: '#FDFAF5', ink: '#1C1917', warm: '#F4F0E6', muted: '#6B6760' }
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

// ── Types ────────────────────────────────────────────────────────────────────

interface Run {
  id:              string
  created_at:      string
  neighborhood:    string
  category:        string
  radius:          number
  total_found:     number
  total_skipped:   number
  total_prospects: number
}

interface Place {
  place_id:        string
  name:            string
  address:         string
  lat:             number | null
  lng:             number | null
  rating:          number | null
  review_count:    number
  website:         string | null
  maps_url:        string | null
  classification:  string
  score:           number | null
  services:        string[] | null
  summary:         string | null
  has_instagram:   boolean | null
  instagram_url:   string | null
  website_quality: string | null
  phone:           string | null
}

// ── Score badge ───────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return { bg: C.ink,     fg: C.paper }
  if (score >= 55) return { bg: '#3D3028', fg: C.paper }
  if (score >= 35) return { bg: C.warm,    fg: C.ink   }
  return                   { bg: C.paper,  fg: C.muted }
}

function ScoreBadge({ score }: { score: number }) {
  const { bg, fg } = scoreColor(score)
  return (
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${bg === C.paper ? C.muted : bg}`, fontFamily: sans, fontSize: 12, fontWeight: 600, padding: '3px 8px', minWidth: 36, textAlign: 'center' }}>
      {score}
    </span>
  )
}

// ── Excel export (via API — branded exceljs) ──────────────────────────────────

async function exportExcel(places: Place[], run: Run) {
  const prospects = places.filter(p => p.classification === 'PROSPECT')
  const res  = await fetch('/api/sq/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places: prospects, neighborhood: run.neighborhood, category: run.category }),
  })
  const blob = await res.blob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `SQ_${run.neighborhood}_${run.category}_${run.created_at.slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoriquePage() {
  const { t } = useTranslation()
  const [runs,          setRuns]          = useState<Run[]>([])
  const [selectedRun,   setSelectedRun]   = useState<Run | null>(null)
  const [places,        setPlaces]        = useState<Place[]>([])
  const [loadingRuns,   setLoadingRuns]   = useState(true)
  const [detailView,    setDetailView]    = useState<'table' | 'map'>('table')
  const [loadingPlaces, setLoadingPlaces] = useState(false)

  useEffect(() => {
    fetch('/api/sq/runs')
      .then(r => r.json())
      .then(d => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoadingRuns(false))
  }, [])

  async function selectRun(run: Run) {
    if (selectedRun?.id === run.id) { setSelectedRun(null); setPlaces([]); return }
    setSelectedRun(run)
    setLoadingPlaces(true)
    try {
      const res  = await fetch(`/api/sq/runs/${run.id}`)
      const data = await res.json()
      setPlaces(data.places ?? [])
    } catch { setPlaces([]) }
    finally  { setLoadingPlaces(false) }
  }

  const prospects = places.filter(p => p.classification === 'PROSPECT')

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      <SQHeader links={[{ href: '/tools/prospect', label: t('nav_new_search') }]} badge={t('section_history').split(' · ')[0]} />

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section label */}
        <div style={{ marginBottom: 40 }}>
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: C.ink }}>
            {t('section_history')} · {runs.length} {runs.length !== 1 ? t('history_count_plural') : t('history_count_singular')}
          </span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 14 }} />
        </div>

        {/* ── Runs table ── */}
        {loadingRuns && (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('progress_loading')}</p>
        )}

        {!loadingRuns && runs.length === 0 && (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>
            {t('empty_history')}{' '}
            <a href="/tools/prospect" style={{ color: C.ink }}>{t('btn_launch_search')}</a>
          </p>
        )}

        {runs.length > 0 && (
          <div style={{ overflowX: 'auto', marginBottom: 48 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.warm }}>
                  {(['th_num', 'th_date', 'th_neighborhood', 'th_category', 'th_radius', 'th_prospects', 'th_filtered', ''] as const).map((h, i) => (
                    <th key={i} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: C.ink, fontWeight: 500, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {h === '' ? '' : t(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => {
                  const isSelected = selectedRun?.id === run.id
                  const bg = isSelected ? C.warm : i % 2 === 0 ? C.paper : C.warm
                  const td: React.CSSProperties = { padding: '11px 14px', borderBottom: `0.5px solid rgba(28,25,23,0.08)`, fontSize: 13, fontFamily: sans, color: C.ink, verticalAlign: 'middle' }
                  const dt = new Date(run.created_at)
                  return (
                    <tr key={run.id} style={{ background: bg, cursor: 'pointer' }} onClick={() => selectRun(run)}>
                      <td style={{ ...td, color: C.muted, fontSize: 10 }}>{i + 1}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: 12 }}>
                        {dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' '}
                        <span style={{ color: C.muted }}>{dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={td}>{run.neighborhood}</td>
                      <td style={{ ...td, color: C.muted }}>{run.category}</td>
                      <td style={{ ...td, color: C.muted, fontSize: 12 }}>{run.radius} m</td>
                      <td style={td}>
                        <span style={{ fontFamily: sans, fontVariantNumeric: 'tabular-nums' }}>{run.total_prospects}</span>
                      </td>
                      <td style={{ ...td, color: C.muted, fontSize: 12 }}>{run.total_skipped}</td>
                      <td style={{ ...td }}>
                        <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10, color: isSelected ? C.ink : C.muted }}>
                          {isSelected ? t('btn_close') : t('btn_see')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Run detail ── */}
        {selectedRun && (
          <div>
            {/* Detail header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 12, color: C.ink }}>
                  {selectedRun.neighborhood} · {selectedRun.category} · {new Date(selectedRun.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <div style={{ height: '0.5px', background: C.ink, marginTop: 10 }} />
              </div>
              {prospects.length > 0 && !loadingPlaces && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {/* View toggle */}
                  <div style={{ display: 'flex', gap: 0 }}>
                    {(['table', 'map'] as const).map((v, idx) => (
                      <button key={v} onClick={() => setDetailView(v)}
                        style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, padding: '6px 14px', border: `0.5px solid ${C.ink}`, borderLeft: idx === 1 ? 'none' : `0.5px solid ${C.ink}`, background: detailView === v ? C.ink : 'transparent', color: detailView === v ? C.paper : C.muted, cursor: 'pointer', borderRadius: 0 }}>
                        {v === 'table' ? t('view_list') : t('view_map')}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => exportExcel(places, selectedRun)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 14px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: 'transparent', color: C.ink, cursor: 'pointer' }}>
                    <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, whiteSpace: 'nowrap' }}>{t('excel_download')}</span>
                  </button>
                </div>
              )}
            </div>

            {loadingPlaces && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('progress_loading_prospects')}</p>
            )}

            {!loadingPlaces && prospects.length === 0 && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>{t('empty_prospects_in_run')}</p>
            )}

            {/* Map view */}
            {!loadingPlaces && detailView === 'map' && prospects.length > 0 && (() => {
              const markers: MapMarker[] = prospects
                .filter(p => p.lat && p.lng)
                .map(p => ({
                  place_id: p.place_id,
                  name:     p.name,
                  lat:      p.lat!,
                  lng:      p.lng!,
                  score:    p.score ?? 0,
                  services: p.services ?? [],
                  summary:  p.summary ?? '',
                  maps_url: p.maps_url ?? '',
                  website:  p.website,
                }))
              return (
                <div style={{ border: `0.5px solid ${C.ink}`, marginBottom: 40 }}>
                  <ProspectMap markers={markers} center={[markers[0]?.lat ?? 48.86, markers[0]?.lng ?? 2.35]} />
                </div>
              )
            })()}

            {!loadingPlaces && detailView === 'table' && prospects.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.warm }}>
                      {(['th_num', 'th_score', 'th_business', 'th_rating', 'th_web_ig', 'th_site_quality', 'th_services', 'th_address', 'th_maps'] as const).map(h => (
                        <th key={h} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: C.ink, fontWeight: 500, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                          {t(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prospects.map((p, i) => {
                      const rule = 'rgba(28,25,23,0.08)'
                      const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top', borderBottom: `0.5px solid ${rule}`, fontSize: 13, fontFamily: sans, color: C.ink }
                      return (
                        <tr key={p.place_id} style={{ background: i % 2 === 0 ? C.paper : C.warm }}>
                          <td style={{ ...td, color: C.muted, fontSize: 10 }}>{i + 1}</td>

                          <td style={td}>
                            {p.score !== null ? <ScoreBadge score={p.score} /> : <span style={{ color: C.muted }}>—</span>}
                          </td>

                          <td style={{ ...td, maxWidth: 200, fontWeight: 500 }}>{p.name}</td>

                          <td style={{ ...td, whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                            {p.rating !== null ? `${p.rating} ★` : '—'} · {p.review_count > 0 ? p.review_count.toLocaleString('fr-FR') + ' ' + t('reviews_suffix') : '—'}
                          </td>

                          <td style={{ ...td, fontSize: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {p.website
                                ? <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>{t('link_website')}</a>
                                : <span style={{ color: C.muted }}>{t('no_website')}</span>
                              }
                              {p.instagram_url
                                ? <a href={p.instagram_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>{t('link_instagram')}</a>
                                : <span style={{ fontSize: 11, color: C.muted }}>{t('no_instagram')}</span>
                              }
                            </div>
                          </td>

                          <td style={{ ...td, fontSize: 11, color: C.muted }}>{p.website_quality ?? '—'}</td>

                          <td style={{ ...td, maxWidth: 220, fontSize: 12, color: C.muted }}>
                            {p.services?.length
                              ? <ul style={{ margin: 0, paddingLeft: 14 }}>{p.services.map(s => <li key={s}>{s}</li>)}</ul>
                              : '—'
                            }
                          </td>

                          <td style={{ ...td, color: C.muted, fontSize: 12, maxWidth: 200 }}>{p.address}</td>

                          <td style={td}>
                            <a href={p.maps_url ?? '#'} target="_blank" rel="noopener noreferrer"
                              style={{ color: C.ink, textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 10, textDecoration: 'none' }}>
                              {t('link_maps')}
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
