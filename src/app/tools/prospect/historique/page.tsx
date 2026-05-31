'use client'

import { useState, useEffect } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import * as XLSX from 'xlsx'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

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
  place_id:       string
  name:           string
  address:        string
  rating:         number | null
  review_count:   number
  website:        string | null
  maps_url:       string
  classification: string
  score:          number | null
  services:       string[] | null
  summary:        string | null
  has_instagram:  boolean | null
  instagram_url:  string | null
  website_quality: string | null
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
    <span style={{ display: 'inline-block', background: bg, color: fg, border: `0.5px solid ${bg === C.paper ? C.muted : bg}`, fontFamily: sans, fontSize: 11, padding: '3px 8px', minWidth: 36, textAlign: 'center' }}>
      {score}
    </span>
  )
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportExcel(places: Place[], run: Run) {
  const prospects = places.filter(p => p.classification === 'PROSPECT')
  const rows = prospects.map((p, i) => [
    i + 1, p.name, p.score ?? '', p.address,
    p.rating ?? '', p.review_count,
    p.website ?? '—',
    p.instagram_url ?? (p.has_instagram ? 'Oui' : '—'),
    p.website_quality ?? '—',
    p.services?.join(', ') ?? '—',
    p.summary ?? '—',
    p.maps_url,
  ])
  const header = ['N°', 'Établissement', 'Score /100', 'Adresse', 'Note', 'Avis', 'Site web', 'Instagram', 'Qualité site', 'Services recommandés', 'Analyse IA', 'Google Maps']
  const title  = [`STUDIO QUARTIER — ${run.neighborhood} · ${run.category}`, ...Array(11).fill('')]
  const date   = [new Date(run.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), ...Array(11).fill('')]
  const ws = XLSX.utils.aoa_to_sheet([title, date, [], header, ...rows])
  ws['!cols'] = [
    { wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 36 }, { wch: 6 }, { wch: 7 },
    { wch: 30 }, { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 55 }, { wch: 20 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prospects')
  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `SQ_${run.neighborhood}_${run.category}_${run.created_at.slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoriquePage() {
  const [runs,          setRuns]          = useState<Run[]>([])
  const [selectedRun,   setSelectedRun]   = useState<Run | null>(null)
  const [places,        setPlaces]        = useState<Place[]>([])
  const [loadingRuns,   setLoadingRuns]   = useState(true)
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

      {/* ── Header ── */}
      <header style={{ background: C.paper }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontFamily: sans, letterSpacing: '0.6em', fontSize: 13, color: C.muted, marginLeft: 2 }}>studio</span>
            <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', fontSize: 52, lineHeight: 0.9, color: C.ink, marginTop: -2 }}>
              QUARTIER
            </span>
            <div style={{ width: '100%', height: '0.5px', background: C.ink, margin: '6px 0 4px' }} />
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Marketing Digital · Paris</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, paddingBottom: 4 }}>
            <a href="/tools/prospect"
              style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted, textDecoration: 'none' }}>
              ← Nouvelle recherche
            </a>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
              Outil interne
            </span>
          </div>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '48px 48px 96px' }}>

        {/* Section label */}
        <div style={{ marginBottom: 40 }}>
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
            Historique · {runs.length} recherche{runs.length !== 1 ? 's' : ''}
          </span>
          <div style={{ height: '0.5px', background: C.ink, marginTop: 12 }} />
        </div>

        {/* ── Runs table ── */}
        {loadingRuns && (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement…</p>
        )}

        {!loadingRuns && runs.length === 0 && (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>
            Aucune recherche enregistrée.{' '}
            <a href="/tools/prospect" style={{ color: C.ink }}>Lancer une recherche →</a>
          </p>
        )}

        {runs.length > 0 && (
          <div style={{ overflowX: 'auto', marginBottom: 48 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.warm }}>
                  {['N°', 'Date', 'Quartier', 'Catégorie', 'Rayon', 'Prospects', 'Filtrés', ''].map(h => (
                    <th key={h} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.muted, fontWeight: 400, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                      {h}
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
                          {isSelected ? 'Fermer ↑' : 'Voir →'}
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
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
                  {selectedRun.neighborhood} · {selectedRun.category} · {new Date(selectedRun.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <div style={{ height: '0.5px', background: C.ink, marginTop: 10 }} />
              </div>
              {prospects.length > 0 && !loadingPlaces && (
                <button
                  onClick={() => exportExcel(places, selectedRun)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: 'transparent', color: C.ink, cursor: 'pointer' }}
                >
                  <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted }}>02</span>
                  <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.28em', fontSize: 10, whiteSpace: 'nowrap' }}>
                    Excel · {prospects.length} prospect{prospects.length > 1 ? 's' : ''}
                  </span>
                  <span>↓</span>
                </button>
              )}
            </div>

            {loadingPlaces && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Chargement des prospects…</p>
            )}

            {!loadingPlaces && prospects.length === 0 && (
              <p style={{ fontFamily: sans, fontSize: 13, color: C.muted }}>Aucun prospect trouvé dans cette recherche.</p>
            )}

            {!loadingPlaces && prospects.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.warm }}>
                      {['N°', 'Score', 'Établissement', 'Note · Avis', 'Site · Instagram', 'Qualité site', 'Services recommandés', 'Adresse', 'Maps'].map(h => (
                        <th key={h} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 9, color: C.muted, fontWeight: 400, padding: '10px 14px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                          {h}
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
                            {p.rating !== null ? `${p.rating} ★` : '—'} · {p.review_count > 0 ? p.review_count.toLocaleString('fr-FR') + ' avis' : '—'}
                          </td>

                          <td style={{ ...td, fontSize: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {p.website
                                ? <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>Site ↗</a>
                                : <span style={{ color: C.muted }}>Aucun site</span>
                              }
                              {p.instagram_url
                                ? <a href={p.instagram_url} target="_blank" rel="noopener noreferrer" style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>Instagram ↗</a>
                                : <span style={{ fontSize: 11, color: C.muted }}>Pas d'Instagram</span>
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
          </div>
        )}

      </main>
    </div>
  )
}
