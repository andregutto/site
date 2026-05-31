'use client'

import { useState } from 'react'
import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

// ── Studio Quartier palette ───────────────────────────────────────────────────
const C = {
  paper: '#FDFAF5',
  ink:   '#1C1917',
  warm:  '#F4F0E6',
  muted: '#6B6760',
}
const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

// ── Data ─────────────────────────────────────────────────────────────────────
const NEIGHBORHOODS = [
  { label: 'Sentier',             lat: 48.8648, lng: 2.3476 },
  { label: 'Montorgueil',         lat: 48.8634, lng: 2.3467 },
  { label: 'Bourse',              lat: 48.8674, lng: 2.3408 },
  { label: 'Les Halles',          lat: 48.8606, lng: 2.3477 },
  { label: 'Place des Victoires', lat: 48.8655, lng: 2.3427 },
]

const CATEGORIES = [
  { label: 'Restaurant',           type: 'restaurant' },
  { label: 'Bistro',               type: 'restaurant', keyword: 'bistro' },
  { label: 'Boulangerie',          type: 'bakery' },
  { label: 'Pâtisserie',           type: 'bakery',     keyword: 'patisserie' },
  { label: 'Café',                 type: 'cafe' },
  { label: 'Bar',                  type: 'bar' },
  { label: 'Commerce de quartier', type: 'store' },
]

interface Prospect {
  place_id:     string
  name:         string
  address:      string
  rating:       number | null
  review_count: number
  has_website:  boolean
  website:      string | null
  is_open:      boolean | null
  maps_url:     string
}

function exportCSV(rows: Prospect[]) {
  const headers = ['Établissement','Adresse','Note','Avis','Site web','URL','Statut','Maps']
  const lines = rows.map(r => [
    `"${r.name.replace(/"/g, '""')}"`,
    `"${r.address.replace(/"/g, '""')}"`,
    r.rating ?? '',
    r.review_count,
    r.has_website ? 'Oui' : 'Non',
    r.website ?? '',
    r.is_open === true ? 'Ouvert' : r.is_open === false ? 'Fermé' : '—',
    r.maps_url,
  ].join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `prospection_${Date.now()}.csv`
  a.click()
}

export default function ProspectPage() {
  const [neighborhoodIdx, setNeighborhoodIdx] = useState(0)
  const [categoryIdx,     setCategoryIdx]     = useState(0)
  const [radius,          setRadius]          = useState(500)
  const [results,         setResults]         = useState<Prospect[]>([])
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [searched,        setSearched]        = useState(false)

  async function handleSearch() {
    setLoading(true)
    setError(null)
    setSearched(true)
    const nb  = NEIGHBORHOODS[neighborhoodIdx]
    const cat = CATEGORIES[categoryIdx]
    const params = new URLSearchParams({
      lat:    String(nb.lat),
      lng:    String(nb.lng),
      radius: String(radius),
      type:   cat.type,
    })
    if (cat.keyword) params.set('keyword', cat.keyword)
    try {
      const res = await fetch(`/api/prospects?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue')
      setResults(data.results ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const noSite    = results.filter(r => !r.has_website).length
  const fewReview = results.filter(r =>  r.has_website && r.review_count < 50).length

  return (
    <div style={{ background: C.paper, minHeight: '100vh', fontFamily: sans, color: C.ink }}>

      {/* ── Header / Logo ── */}
      <header style={{ background: C.paper }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 48px 36px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {/* Wordmark — sq-logo pattern at medium scale */}
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
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
          {/* Tool label */}
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted, paddingBottom: 4 }}>
            Outil interne
          </span>
        </div>
        <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
      </header>

      {/* ── Page content ── */}
      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 40px 96px' }}>

        {/* Page title */}
        <div style={{ marginBottom: 48 }}>
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
            Prospection · 1er / 2ème arrondissement
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
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 24px 8px 0', cursor: 'pointer', minWidth: 180, outline: 'none', appearance: 'none' as const }}
            >
              {NEIGHBORHOODS.map((n, i) => <option key={n.label} value={i}>{n.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Catégorie</span>
            <select
              value={categoryIdx}
              onChange={e => setCategoryIdx(Number(e.target.value))}
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 24px 8px 0', cursor: 'pointer', minWidth: 200, outline: 'none', appearance: 'none' as const }}
            >
              {CATEGORIES.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>Rayon (m)</span>
            <input
              type="number" min={100} max={2000} step={100}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              style={{ fontFamily: sans, fontSize: 14, color: C.ink, background: 'transparent', border: 'none', borderBottom: `0.5px solid ${C.ink}`, borderRadius: 0, padding: '8px 0', width: 80, outline: 'none' }}
            />
          </div>

          {/* Buttons — SQ directory button pattern */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: C.ink, color: C.paper, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}
            >
              <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted }}>01</span>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.28em', fontSize: 11, flex: 1, whiteSpace: 'nowrap' as const }}>
                {loading ? 'Recherche…' : 'Rechercher'}
              </span>
              <span style={{ fontSize: 13 }}>→</span>
            </button>

            {results.length > 0 && (
              <button
                onClick={() => exportCSV(results)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', border: `0.5px solid ${C.ink}`, borderRadius: 0, background: 'transparent', color: C.ink, cursor: 'pointer' }}
              >
                <span style={{ fontFamily: sans, fontSize: 10, letterSpacing: '0.1em', color: C.muted }}>02</span>
                <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.28em', fontSize: 11, flex: 1, whiteSpace: 'nowrap' as const }}>
                  Exporter CSV ({results.length})
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

        {/* ── Empty ── */}
        {searched && !loading && results.length === 0 && !error && (
          <p style={{ fontFamily: sans, fontSize: 13, color: C.muted, letterSpacing: '0.04em' }}>Aucun résultat.</p>
        )}

        {/* ── Results ── */}
        {results.length > 0 && (
          <>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 16 }}>
              <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted }}>
                {results.length} établissement{results.length > 1 ? 's' : ''} · priorité décroissante
              </span>
              <div style={{ display: 'flex', gap: 24 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: C.ink }} />
                  Sans site — {noSite}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, color: C.muted }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: C.warm, boxShadow: `inset 0 0 0 0.5px ${C.ink}` }} />
                  {'Peu d\'avis — ' + fewReview}
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.warm }}>
                    {['N°','Établissement','Note','Avis','Site web','Adresse','Statut','Maps'].map(h => (
                      <th key={h} style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9, color: C.muted, fontWeight: 400, padding: '10px 16px', textAlign: 'left', borderBottom: `0.5px solid ${C.ink}`, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const priority = !r.has_website ? 0 : r.review_count < 50 ? 1 : 2
                    const bg   = priority === 0 ? C.ink  : priority === 1 ? C.warm : C.paper
                    const fg   = priority === 0 ? C.warm : C.ink
                    const dim  = priority === 0 ? 'rgba(244,240,230,0.45)' : C.muted
                    const rule = priority === 0 ? 'rgba(244,240,230,0.12)' : 'rgba(28,25,23,0.12)'
                    const td: React.CSSProperties = { padding: '11px 16px', verticalAlign: 'middle', borderBottom: `0.5px solid ${rule}`, fontSize: 13, fontFamily: sans, color: fg }

                    return (
                      <tr key={r.place_id} style={{ background: bg }}>
                        <td style={{ ...td, color: dim, fontSize: 10 }}>{i + 1}</td>

                        <td style={{ ...td, maxWidth: 220 }}>{r.name}</td>

                        <td style={{ ...td, color: r.rating !== null ? fg : dim }}>
                          {r.rating !== null ? r.rating : '—'}
                        </td>

                        <td style={{ ...td, color: r.review_count > 0 ? fg : dim }}>
                          {r.review_count > 0 ? r.review_count.toLocaleString('fr-FR') : '—'}
                        </td>

                        <td style={td}>
                          {r.has_website ? (
                            <a href={r.website!} target="_blank" rel="noopener noreferrer"
                              style={{ color: fg, textDecoration: 'underline', textUnderlineOffset: 3, fontSize: 11 }}>
                              Oui ↗
                            </a>
                          ) : (
                            /* Badge ink / no site */
                            <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 9, padding: '4px 10px', background: C.paper, color: C.ink }}>
                              Non
                            </span>
                          )}
                        </td>

                        <td style={{ ...td, color: dim, maxWidth: 220, fontSize: 12 }}>{r.address}</td>

                        <td style={td}>
                          {r.is_open === true  && <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: fg }}>Ouvert</span>}
                          {r.is_open === false && <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, color: dim }}>Fermé</span>}
                          {r.is_open === null  && <span style={{ color: dim }}>—</span>}
                        </td>

                        <td style={td}>
                          <a href={r.maps_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: fg, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            Maps ↗
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
