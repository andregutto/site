import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import type { Trip, TripStatus } from './types'

const RED = '#D63B2F'

interface Props {
  trip?: Trip
  onClose: () => void
  onSaved: (trip: Trip) => void
  onFromMoment?: () => void
}

export default function TripFormModal({ trip, onClose, onSaved, onFromMoment }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}

  const [title, setTitle] = useState(trip?.title ?? '')
  const [destination, setDestination] = useState(trip?.destination ?? '')
  const [country, setCountry] = useState(trip?.country ?? '')
  const [startDate, setStartDate] = useState(trip?.start_date ?? '')
  const [endDate, setEndDate] = useState(trip?.end_date ?? '')
  const [status, setStatus] = useState<TripStatus>(trip?.status ?? 'planning')
  const [summary, setSummary] = useState(trip?.summary ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Título obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const body = {
        title: title.trim(),
        destination: destination.trim() || null,
        country: country.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        summary: summary.trim() || null,
      }
      let result: { trip: Trip }
      if (trip) {
        result = await apiFetch(`/voyage/trips/${trip.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else {
        result = await apiFetch('/voyage/trips', { method: 'POST', body: JSON.stringify(body) })
      }
      onSaved(result.trip)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 3,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)',
    outline: 'none', transition: 'border-color 160ms ease',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 4,
    fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.20em',
    textTransform: 'uppercase', color: 'var(--arvo-fg-muted)',
  }

  const statuses: TripStatus[] = ['planning', 'ongoing', 'past']
  const statusLabels: Record<TripStatus, string> = {
    planning: tv.statusPlanning ?? 'Planejamento',
    ongoing:  tv.statusOngoing  ?? 'Em viagem',
    past:     tv.statusPast     ?? 'Concluída',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]"
        style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', boxShadow: 'var(--arvo-shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 2 }}>ARVO VOYAGE</p>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
              {trip ? tv.editTrip : tv.addTrip}
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, transition: 'all 160ms ease' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <label>
            <span style={labelStyle}>{tv.titleLabel ?? 'Título'} *</span>
            <input style={fieldStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="ex: Lisboa verão 2026"
              onFocus={e => (e.target.style.borderColor = 'var(--arvo-gold)')}
              onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
            />
          </label>

          {/* Destination + Country */}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span style={labelStyle}>{tv.destinationLabel ?? 'Destino'}</span>
              <input style={fieldStyle} value={destination} onChange={e => setDestination(e.target.value)} placeholder="ex: Lisboa"
                onFocus={e => (e.target.style.borderColor = 'var(--arvo-gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
              />
            </label>
            <label>
              <span style={labelStyle}>{tv.countryLabel ?? 'País'}</span>
              <input style={fieldStyle} value={country} onChange={e => setCountry(e.target.value)} placeholder="ex: Portugal"
                onFocus={e => (e.target.style.borderColor = 'var(--arvo-gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
              />
            </label>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span style={labelStyle}>Início</span>
              <input type="date" style={fieldStyle} value={startDate} onChange={e => setStartDate(e.target.value)}
                onFocus={e => (e.target.style.borderColor = 'var(--arvo-gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
              />
            </label>
            <label>
              <span style={labelStyle}>Fim</span>
              <input type="date" style={fieldStyle} value={endDate} onChange={e => setEndDate(e.target.value)}
                onFocus={e => (e.target.style.borderColor = 'var(--arvo-gold)')}
                onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
              />
            </label>
          </div>

          {/* Status */}
          <label>
            <span style={labelStyle}>{tv.statusLabel ?? 'Status'}</span>
            <div className="flex gap-2">
              {statuses.map(s => (
                <button
                  key={s} type="button"
                  onClick={() => setStatus(s)}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 3, cursor: 'pointer',
                    fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.12em',
                    textTransform: 'uppercase', transition: 'all 160ms ease',
                    border: status === s ? `1px solid ${RED}` : '1px solid var(--arvo-border)',
                    background: status === s ? 'rgba(214,59,47,0.08)' : 'transparent',
                    color: status === s ? RED : 'var(--arvo-fg-muted)',
                  }}
                >{statusLabels[s]}</button>
              ))}
            </div>
          </label>

          {/* Summary */}
          <label>
            <span style={labelStyle}>{tv.summaryLabel ?? 'Resumo'}</span>
            <textarea
              style={{ ...fieldStyle, resize: 'vertical', minHeight: 72 }}
              value={summary} onChange={e => setSummary(e.target.value)}
              placeholder="Uma frase sobre a viagem..."
              onFocus={e => (e.target.style.borderColor = 'var(--arvo-gold)')}
              onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
            />
          </label>

          {error && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: RED }}>{error}</p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.06em', padding: '8px 18px', borderRadius: 6, background: 'transparent', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}
            >Cancelar</button>
            <button type="submit" disabled={saving}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.06em', padding: '8px 20px', borderRadius: 6, background: RED, color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>

          {!trip && onFromMoment && (
            <div style={{ textAlign: 'center', paddingTop: 2 }}>
              <button type="button" onClick={onFromMoment}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--arvo-border)' }}
              >
                Ou criar a partir de um momento →
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
