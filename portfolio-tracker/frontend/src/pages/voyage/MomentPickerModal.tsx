import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'

interface Moment {
  id: number
  name: string
  icon: string | null
  color: string | null
  start_date: string | null
  end_date: string | null
  budget: number | null
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  if (start && end && start === end) return fmtDate(start)
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
  if (start) return `a partir de ${fmtDate(start)}`
  return `até ${fmtDate(end!)}`
}

interface Props {
  onClose: () => void
}

export default function MomentPickerModal({ onClose }: Props) {
  const navigate = useNavigate()
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [creating, setCreating] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiFetch<{ moments: Moment[] }>('/voyage/moments-for-picker')
      .then(d => setMoments(d.moments))
      .finally(() => setLoading(false))
    setTimeout(() => searchRef.current?.focus(), 80)
  }, [])

  const filtered = moments.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase())
  )

  async function pick(moment: Moment) {
    if (creating) return
    setCreating(moment.id)
    try {
      const result = await apiFetch<{ trip: { id: number } }>(
        `/api/voyage/from-moment/${moment.id}`,
        { method: 'POST' }
      )
      navigate(`/voyage/${result.trip.id}`)
    } catch {
      setCreating(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-[18px] sm:rounded-[18px] flex flex-col"
        style={{
          background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)',
          boxShadow: 'var(--arvo-shadow-lg)', maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}
        >
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 2 }}>
              ARVO VOYAGE
            </p>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
              Criar viagem a partir de um momento
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar momento…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
              fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
              outline: 'none',
            }}
            onFocus={e => (e.target.style.borderColor = GOLD)}
            onBlur={e => (e.target.style.borderColor = 'var(--arvo-border)')}
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto px-6 pb-6" style={{ flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 64, borderRadius: 10, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ paddingTop: 32, textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-muted)' }}>
                {moments.length === 0
                  ? 'Nenhum momento encontrado. Crie um em Finanças → Momentos.'
                  : 'Nenhum resultado para essa busca.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
              {filtered.map(m => {
                const isCreating = creating === m.id
                const dateStr = fmtDateRange(m.start_date, m.end_date)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m)}
                    disabled={!!creating}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                      background: isCreating ? 'var(--arvo-hover-bg)' : 'transparent',
                      border: `1px solid ${isCreating ? 'var(--arvo-border)' : 'var(--arvo-border)'}`,
                      cursor: creating ? 'default' : 'pointer',
                      opacity: creating && !isCreating ? 0.5 : 1,
                      transition: 'all 160ms ease',
                      width: '100%',
                    }}
                    onMouseEnter={e => { if (!creating) e.currentTarget.style.background = 'var(--arvo-hover-bg)' }}
                    onMouseLeave={e => { if (!isCreating) e.currentTarget.style.background = 'transparent' }}
                  >
                    {/* Ícone / cor do momento */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: m.color ? `${m.color}20` : 'var(--arvo-hover-bg)',
                      border: `1px solid ${m.color ? `${m.color}30` : 'var(--arvo-border)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      {m.icon || '✦'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)',
                        fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginBottom: 2,
                      }}>
                        {m.name}
                      </p>
                      {dateStr && (
                        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                          {dateStr}
                        </p>
                      )}
                    </div>

                    {isCreating ? (
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)', flexShrink: 0 }}>
                        Criando…
                      </span>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--arvo-fg-muted)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" d="M5 2l5 5-5 5"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
