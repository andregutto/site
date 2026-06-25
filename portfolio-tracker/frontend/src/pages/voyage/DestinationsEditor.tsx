import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import type { TripDestination } from './types'

const GOLD = '#C8B89A'

interface Props {
  // Quando tripId existe, cada ação já persiste via API (edição de uma
  // viagem existente). Sem tripId, tudo fica em memória local com ids
  // temporários negativos — usado no formulário de criação, que só envia
  // o array pronto no POST /trips.
  tripId?: number
  destinations: TripDestination[]
  onChange: (destinations: TripDestination[]) => void
  dark?: boolean
}

export default function DestinationsEditor({ tripId, destinations, onChange, dark }: Props) {
  const [adding, setAdding] = useState(false)
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [dayStart, setDayStart] = useState('')
  const [dayEnd, setDayEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const fg = dark ? '#fff' : 'var(--arvo-fg)'
  const fgSoft = dark ? 'rgba(255,255,255,0.6)' : 'var(--arvo-fg-soft)'
  const border = dark ? 'rgba(255,255,255,0.18)' : 'var(--arvo-border)'

  function reset() {
    setCity(''); setCountry(''); setDayStart(''); setDayEnd(''); setAdding(false)
  }

  async function addDestination() {
    if (!city.trim() && !country.trim()) return
    setSaving(true)
    const payload = {
      city: city.trim() || null,
      country: country.trim() || null,
      day_start: dayStart ? Number(dayStart) : null,
      day_end: dayEnd ? Number(dayEnd) : null,
    }
    try {
      if (tripId) {
        const data = await apiFetch<{ destination: TripDestination }>(`/voyage/trips/${tripId}/destinations`, {
          method: 'POST', body: JSON.stringify(payload),
        })
        onChange([...destinations, data.destination])
      } else {
        const tempId = -(Date.now())
        onChange([...destinations, { id: tempId, trip_id: 0, sort_order: destinations.length, ...payload }])
      }
      reset()
    } finally {
      setSaving(false)
    }
  }

  async function removeDestination(d: TripDestination) {
    if (tripId && d.id > 0) {
      await apiFetch(`/voyage/trips/${tripId}/destinations/${d.id}`, { method: 'DELETE' })
    }
    onChange(destinations.filter(x => x.id !== d.id))
  }

  function dayRangeLabel(d: TripDestination) {
    if (d.day_start == null && d.day_end == null) return null
    if (d.day_start != null && d.day_end != null && d.day_start !== d.day_end) return `dia ${d.day_start}–${d.day_end}`
    return `dia ${d.day_start ?? d.day_end}`
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {destinations.map(d => (
          <span
            key={d.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px',
              borderRadius: 999, border: `1px solid ${border}`,
              background: dark ? 'rgba(255,255,255,0.08)' : 'var(--arvo-hover-bg)',
              fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: fg,
            }}
          >
            {[d.city, d.country].filter(Boolean).join(', ') || '—'}
            {dayRangeLabel(d) && <span style={{ color: fgSoft, fontSize: 10.5 }}>· {dayRangeLabel(d)}</span>}
            <button
              type="button" onClick={() => removeDestination(d)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: fgSoft, padding: 2, display: 'flex' }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M1.5 1.5l6 6M7.5 1.5l-6 6" />
              </svg>
            </button>
          </span>
        ))}

        {!adding && (
          <button
            type="button" onClick={() => setAdding(true)}
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: fgSoft,
              background: 'none', border: `1px dashed ${border}`, borderRadius: 999, padding: '4px 12px', cursor: 'pointer',
            }}
          >
            + Adicionar destino
          </button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <input
            autoFocus value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade"
            style={{ width: 110, padding: '5px 8px', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.08)' : 'var(--arvo-surface)', color: fg, fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none' }}
          />
          <input
            value={country} onChange={e => setCountry(e.target.value)} placeholder="País"
            style={{ width: 90, padding: '5px 8px', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.08)' : 'var(--arvo-surface)', color: fg, fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none' }}
          />
          <input
            value={dayStart} onChange={e => setDayStart(e.target.value)} type="number" min="1" placeholder="Dia ini." inputMode="numeric"
            style={{ width: 64, padding: '5px 8px', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.08)' : 'var(--arvo-surface)', color: fg, fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none', textAlign: 'center' }}
          />
          <input
            value={dayEnd} onChange={e => setDayEnd(e.target.value)} type="number" min="1" placeholder="Dia fim" inputMode="numeric"
            style={{ width: 64, padding: '5px 8px', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.08)' : 'var(--arvo-surface)', color: fg, fontFamily: 'var(--arvo-font-body)', fontSize: 12, outline: 'none', textAlign: 'center' }}
          />
          <button type="button" onClick={addDestination} disabled={saving}
            style={{ padding: '5px 12px', borderRadius: 5, background: dark ? GOLD : 'var(--arvo-fg)', color: dark ? '#000' : 'var(--arvo-bg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12 }}>
            {saving ? '…' : 'Salvar'}
          </button>
          <button type="button" onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: fgSoft, fontFamily: 'var(--arvo-font-body)', fontSize: 12 }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
