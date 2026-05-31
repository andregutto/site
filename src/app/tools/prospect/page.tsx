'use client'

import { useState } from 'react'
import { Barlow_Condensed } from 'next/font/google'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

// ── Studio Quartier palette ──────────────────────────────────────────────────
const C = {
  paper: '#FDFAF5',
  ink:   '#1C1917',
  warm:  '#F4F0E6',
  muted: '#6B6760',
}

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

// ── Styles ───────────────────────────────────────────────────────────────────
const sq = {
  page: {
    background: C.paper,
    color: C.ink,
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    minHeight: '100vh',
    padding: '64px 48px',
    maxWidth: 1200,
    margin: '0 auto',
  } as React.CSSProperties,

  label: {
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontSize: 11,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    color: C.muted,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  } as React.CSSProperties,

  select: {
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontSize: 14,
    color: C.ink,
    background: C.paper,
    border: 'none',
    borderBottom: `0.5px solid ${C.ink}`,
    borderRadius: 0,
    padding: '8px 0',
    cursor: 'pointer',
    minWidth: 180,
    outline: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
  } as React.CSSProperties,

  btnPrimary: {
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontSize: 11,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    background: C.ink,
    color: C.warm,
    border: 'none',
    borderRadius: 0,
    padding: '12px 28px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  btnSecondary: {
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontSize: 11,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    background: C.warm,
    color: C.ink,
    border: 'none',
    borderRadius: 0,
    padding: '12px 28px',
    cursor: 'pointer',
    boxShadow: `inset 0 0 0 0.5px ${C.ink}`,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  th: {
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontSize: 10,
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.22em',
    color: C.muted,
    padding: '10px 16px',
    textAlign: 'left' as const,
    borderBottom: `0.5px solid ${C.ink}`,
    whiteSpace: 'nowrap' as const,
    background: C.warm,
  } as React.CSSProperties,

  td: {
    padding: '10px 16px',
    verticalAlign: 'middle' as const,
    fontSize: 13,
    borderBottom: `0.5px solid rgba(28,25,23,0.15)`,
  } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────
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
    <div style={sq.page}>

      {/* ── Header ── */}
      <header style={{ marginBottom: 64 }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
          <span style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif', fontSize: 12, letterSpacing: '0.6em', color: C.muted, marginLeft: 2 }}>
            studio
          </span>
          <span className={barlow.className} style={{ fontSize: 52, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', lineHeight: 0.9, color: C.ink, marginTop: -4 }}>
            Prospection
          </span>
          <div style={{ width: '100%', height: '0.5px', background: C.ink, margin: '6px 0 4px' }} />
          <span style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: C.muted }}>
            Outil interne · Studio Quartier
          </span>
        </div>
      </header>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, marginBottom: 48, alignItems: 'flex-end' }}>

        <label style={sq.label}>
          Quartier
          <div style={{ position: 'relative' }}>
            <select value={neighborhoodIdx} onChange={e => setNeighborhoodIdx(Number(e.target.value))} style={sq.select}>
              {NEIGHBORHOODS.map((n, i) => <option key={n.label} value={i}>{n.label}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none', fontSize: 10 }}>↓</span>
          </div>
        </label>

        <label style={sq.label}>
          Catégorie
          <div style={{ position: 'relative' }}>
            <select value={categoryIdx} onChange={e => setCategoryIdx(Number(e.target.value))} style={sq.select}>
              {CATEGORIES.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none', fontSize: 10 }}>↓</span>
          </div>
        </label>

        <label style={sq.label}>
          Rayon (m)
          <input
            type="number" min={100} max={2000} step={100}
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            style={{ ...sq.select, width: 80 }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={handleSearch} disabled={loading} style={{ ...sq.btnPrimary, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Recherche…' : 'Rechercher'}
          </button>

          {results.length > 0 && (
            <button onClick={() => exportCSV(results)} style={sq.btnSecondary}>
              Exporter CSV ({results.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: C.warm, boxShadow: `inset 0 0 0 0.5px ${C.ink}`, padding: '14px 20px', marginBottom: 24, fontSize: 13, color: C.ink }}>
          <span style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 4 }}>Erreur</span>
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {searched && !loading && results.length === 0 && !error && (
        <p style={{ fontSize: 13, color: C.muted, letterSpacing: '0.04em' }}>Aucun résultat.</p>
      )}

      {/* ── Results ── */}
      {results.length > 0 && (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 32, marginBottom: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.22em', color: C.muted }}>
              {results.length} établissement{results.length > 1 ? 's' : ''} · priorité décroissante
            </span>
            <div style={{ display: 'flex', gap: 20 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: C.ink }} />
                Sans site — {noSite}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: C.muted }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: C.warm, boxShadow: `inset 0 0 0 0.5px ${C.ink}` }} />
                {'< 50 avis — ' + fewReview}
              </span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['N°', 'Établissement', 'Note', 'Avis', 'Site web', 'Adresse', 'Statut', 'Maps'].map(h => (
                    <th key={h} style={sq.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const priority = !r.has_website ? 0 : r.review_count < 50 ? 1 : 2
                  const rowBg    = priority === 0 ? C.ink  : priority === 1 ? C.warm : C.paper
                  const rowFg    = priority === 0 ? C.warm : C.ink
                  const rowMuted = priority === 0 ? 'rgba(244,240,230,0.55)' : C.muted
                  const tdPriority = { ...sq.td, color: rowFg, borderBottomColor: priority === 0 ? 'rgba(244,240,230,0.18)' : 'rgba(28,25,23,0.15)' }

                  return (
                    <tr key={r.place_id} style={{ background: rowBg }}>
                      <td style={{ ...tdPriority, color: rowMuted, fontSize: 11 }}>{i + 1}</td>
                      <td style={{ ...tdPriority, fontWeight: 400, maxWidth: 200 }}>{r.name}</td>
                      <td style={tdPriority}>
                        {r.rating !== null
                          ? <span>{r.rating}</span>
                          : <span style={{ color: rowMuted }}>—</span>}
                      </td>
                      <td style={tdPriority}>
                        {r.review_count > 0
                          ? r.review_count.toLocaleString('fr-FR')
                          : <span style={{ color: rowMuted }}>—</span>}
                      </td>
                      <td style={tdPriority}>
                        {r.has_website
                          ? <a href={r.website!} target="_blank" rel="noopener noreferrer"
                              style={{ color: rowFg, textDecoration: 'underline', fontSize: 11, textUnderlineOffset: 3 }}>
                              Oui ↗
                            </a>
                          : <span style={{ fontWeight: 400, letterSpacing: '0.06em', fontSize: 11, textTransform: 'uppercase' }}>Non</span>}
                      </td>
                      <td style={{ ...tdPriority, color: rowMuted, maxWidth: 220, fontSize: 12 }}>{r.address}</td>
                      <td style={tdPriority}>
                        {r.is_open === true  && <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ouvert</span>}
                        {r.is_open === false && <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: rowMuted }}>Fermé</span>}
                        {r.is_open === null  && <span style={{ color: rowMuted }}>—</span>}
                      </td>
                      <td style={tdPriority}>
                        <a href={r.maps_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: rowFg, textDecoration: 'none', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
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

    </div>
  )
}
