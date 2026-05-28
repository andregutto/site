'use client'

import { useState } from 'react'

const NEIGHBORHOODS = [
  { label: 'Sentier',            lat: 48.8648, lng: 2.3476 },
  { label: 'Montorgueil',        lat: 48.8634, lng: 2.3467 },
  { label: 'Bourse',             lat: 48.8674, lng: 2.3408 },
  { label: 'Les Halles',         lat: 48.8606, lng: 2.3477 },
  { label: 'Place des Victoires',lat: 48.8655, lng: 2.3427 },
]

const CATEGORIES = [
  { label: 'Restaurante',          type: 'restaurant' },
  { label: 'Bistrô',               type: 'restaurant', keyword: 'bistro' },
  { label: 'Boulangerie',          type: 'bakery' },
  { label: 'Pâtisserie',           type: 'bakery',     keyword: 'patisserie' },
  { label: 'Café',                 type: 'cafe' },
  { label: 'Bar',                  type: 'bar' },
  { label: 'Commerce de proximité',type: 'store' },
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
  const headers = ['Nome','Endereço','Rating','Avaliações','Tem site','Site','Status','Maps']
  const lines = rows.map(r => [
    `"${r.name.replace(/"/g, '""')}"`,
    `"${r.address.replace(/"/g, '""')}"`,
    r.rating ?? '',
    r.review_count,
    r.has_website ? 'Sim' : 'Não',
    r.website ?? '',
    r.is_open === true ? 'Aberto' : r.is_open === false ? 'Fechado' : '—',
    r.maps_url,
  ].join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `prospectos_${Date.now()}.csv`
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
      if (!res.ok) throw new Error(data.error || 'Erro desconhecido')
      setResults(data.results ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🔍 Prospecção — Studio Quartier</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 24 }}>
        Busca estabelecimentos com baixa presença digital no 1er/2ème arrondissement.
      </p>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
        <label style={labelStyle}>
          Bairro
          <select value={neighborhoodIdx} onChange={e => setNeighborhoodIdx(Number(e.target.value))} style={selectStyle}>
            {NEIGHBORHOODS.map((n, i) => <option key={n.label} value={i}>{n.label}</option>)}
          </select>
        </label>

        <label style={labelStyle}>
          Categoria
          <select value={categoryIdx} onChange={e => setCategoryIdx(Number(e.target.value))} style={selectStyle}>
            {CATEGORIES.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
          </select>
        </label>

        <label style={labelStyle}>
          Raio (m)
          <input
            type="number" min={100} max={2000} step={100}
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            style={{ ...selectStyle, width: 90 }}
          />
        </label>

        <button onClick={handleSearch} disabled={loading} style={btnStyle}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>

        {results.length > 0 && (
          <button onClick={() => exportCSV(results)} style={{ ...btnStyle, background: '#16a34a' }}>
            Exportar CSV ({results.length})
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Resultados */}
      {searched && !loading && results.length === 0 && !error && (
        <p style={{ color: '#666', fontSize: 14 }}>Nenhum resultado encontrado.</p>
      )}

      {results.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
            <b>{results.length}</b> resultado(s) — ordenados por prioridade de prospecção
            {' '}<span style={{ color: '#16a34a' }}>■</span> sem site
            {' '}<span style={{ color: '#f59e0b' }}>■</span> &lt; 50 avaliações
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                  {['#','Nome','Rating','Avaliações','Tem site','Endereço','Status','Maps'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const priority = !r.has_website ? 0 : r.review_count < 50 ? 1 : 2
                  const rowBg = priority === 0 ? '#f0fdf4' : priority === 1 ? '#fffbeb' : '#fff'
                  return (
                    <tr key={r.place_id} style={{ background: rowBg, borderBottom: '1px solid #e5e7eb' }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 200 }}>{r.name}</td>
                      <td style={tdStyle}>
                        {r.rating !== null
                          ? <span>{r.rating} <span style={{ color: '#f59e0b' }}>★</span></span>
                          : <span style={{ color: '#aaa' }}>—</span>}
                      </td>
                      <td style={tdStyle}>{r.review_count > 0 ? r.review_count.toLocaleString('fr-FR') : '—'}</td>
                      <td style={tdStyle}>
                        {r.has_website
                          ? <a href={r.website!} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: 11 }}>Sim ↗</a>
                          : <span style={{ color: '#16a34a', fontWeight: 700 }}>Não ✓</span>}
                      </td>
                      <td style={{ ...tdStyle, color: '#555', maxWidth: 220 }}>{r.address}</td>
                      <td style={tdStyle}>
                        {r.is_open === true  && <span style={{ color: '#16a34a' }}>Aberto</span>}
                        {r.is_open === false && <span style={{ color: '#dc2626' }}>Fechado</span>}
                        {r.is_open === null  && <span style={{ color: '#aaa' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <a href={r.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none', fontSize: 11, whiteSpace: 'nowrap' }}>
                          Ver Maps ↗
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

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 12, fontWeight: 600, color: '#374151',
}
const selectStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db',
  fontSize: 13, background: '#fff', cursor: 'pointer', minWidth: 160,
}
const btnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#1d4ed8', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', alignSelf: 'flex-end',
}
const thStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280',
  borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '9px 12px', verticalAlign: 'middle',
}
