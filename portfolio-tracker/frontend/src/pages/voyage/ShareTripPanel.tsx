import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import type { Trip } from './types'

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.10)'

interface Props {
  trip: Trip
  onUpdate: (t: Partial<Trip>) => void
}

const EXPIRY_OPTIONS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
  { label: 'Sem prazo', value: null },
]

export function ShareModal({ trip, onUpdate, onClose }: Props & { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hideCost, setHideCost] = useState(trip.share_hide_cost)
  const [showPlaceExpenses, setShowPlaceExpenses] = useState(trip.show_place_expenses)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)

  const shareUrl = trip.share_token
    ? `${window.location.origin}/trip/${trip.share_token}`
    : null

  async function generate() {
    setLoading(true)
    try {
      const data = await apiFetch<{ token: string }>(`/voyage/trips/${trip.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ hide_cost: hideCost, expires_in_days: expiryDays }),
      })
      onUpdate({ share_token: data.token, share_hide_cost: hideCost })
    } finally {
      setLoading(false)
    }
  }

  async function revoke() {
    if (!confirm('Revogar o link? Quem tiver o link não conseguirá mais acessar.')) return
    setRevoking(true)
    try {
      await apiFetch(`/voyage/trips/${trip.id}/share`, { method: 'DELETE' })
      onUpdate({ share_token: null })
    } finally {
      setRevoking(false)
    }
  }

  function copyLink() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fieldStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 3,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)',
    outline: 'none',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]"
        style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', boxShadow: 'var(--arvo-shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 2 }}>ARVO VOYAGE</p>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
              Compartilhar viagem
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, transition: 'all 160ms ease' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: '24px 24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {shareUrl ? (
            <>
              {/* Link */}
              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                  Link público
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{ ...fieldStyle, flex: 1, color: 'var(--arvo-fg-soft)', fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    style={{ padding: '6px 14px', borderRadius: 5, background: copied ? '#1F8A5B' : RED, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, flexShrink: 0, transition: 'background 200ms' }}
                  >
                    {copied ? '✓' : 'Copiar'}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid ${RED}`, color: RED, textDecoration: 'none', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Hide cost */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hideCost}
                  onChange={async e => {
                    const v = e.target.checked
                    setHideCost(v)
                    await apiFetch(`/voyage/trips/${trip.id}/share`, {
                      method: 'POST',
                      body: JSON.stringify({ hide_cost: v, expires_in_days: expiryDays }),
                    })
                    onUpdate({ share_hide_cost: v })
                  }}
                  style={{ width: 14, height: 14, accentColor: '#0D0D0D' }}
                />
                <div>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>Ocultar custos</p>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>Seguidores não verão os valores gastos</p>
                </div>
              </label>

              {/* Show expenses per place */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showPlaceExpenses}
                  onChange={async e => {
                    const v = e.target.checked
                    setShowPlaceExpenses(v)
                    await apiFetch(`/voyage/trips/${trip.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ show_place_expenses: v }),
                    })
                    onUpdate({ show_place_expenses: v })
                  }}
                  style={{ width: 14, height: 14, accentColor: '#0D0D0D' }}
                />
                <div>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>Mostrar gastos por lugar</p>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>Exibe quanto você gastou em cada lugar no mapa</p>
                </div>
              </label>

              {/* Expiry */}
              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                  Validade do link
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={async () => {
                        setExpiryDays(opt.value)
                        await apiFetch(`/voyage/trips/${trip.id}/share`, {
                          method: 'POST',
                          body: JSON.stringify({ hide_cost: hideCost, expires_in_days: opt.value }),
                        })
                      }}
                      style={{
                        padding: '4px 12px', borderRadius: 999,
                        fontFamily: 'var(--arvo-font-body)', fontSize: 11,
                        border: `1px solid ${expiryDays === opt.value ? RED : 'var(--arvo-border)'}`,
                        background: expiryDays === opt.value ? RED_SOFT : 'transparent',
                        color: expiryDays === opt.value ? RED : 'var(--arvo-fg-muted)',
                        cursor: 'pointer', transition: 'all 160ms',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Revoke */}
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--arvo-border-soft)' }}>
                <button
                  type="button"
                  onClick={revoke}
                  disabled={revoking}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: RED, background: 'none', border: 'none', cursor: 'pointer', opacity: revoking ? 0.5 : 1, padding: 0 }}
                >
                  {revoking ? 'Revogando…' : 'Revogar link público'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--arvo-fg-soft)', lineHeight: 1.6 }}>
                Gere um link para compartilhar o roteiro com seguidores — eles verão os lugares, notas e podem importar para o Google Maps.
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hideCost}
                  onChange={e => setHideCost(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: '#0D0D0D' }}
                />
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>Ocultar custos na página pública</p>
              </label>

              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                  Validade
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setExpiryDays(opt.value)}
                      style={{
                        padding: '4px 12px', borderRadius: 999,
                        fontFamily: 'var(--arvo-font-body)', fontSize: 11,
                        border: `1px solid ${expiryDays === opt.value ? RED : 'var(--arvo-border)'}`,
                        background: expiryDays === opt.value ? RED_SOFT : 'transparent',
                        color: expiryDays === opt.value ? RED : 'var(--arvo-fg-muted)',
                        cursor: 'pointer', transition: 'all 160ms',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={generate}
                disabled={loading}
                style={{ padding: '9px 0', borderRadius: 8, background: loading ? 'var(--arvo-hover-bg)' : RED, color: loading ? 'var(--arvo-fg-muted)' : '#fff', border: 'none', cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, transition: 'all 160ms' }}
              >
                {loading ? 'Gerando…' : 'Gerar link público'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ShareTripPanel({ trip, onUpdate }: Props) {
  const [open, setOpen] = useState(false)

  const hasLink = !!trip.share_token

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', padding: '10px 0', borderRadius: 10,
          fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.03em',
          border: `1px solid ${hasLink ? 'var(--arvo-border)' : RED}`,
          background: hasLink ? 'var(--arvo-surface)' : RED,
          color: hasLink ? 'var(--arvo-fg)' : '#fff',
          cursor: 'pointer', transition: 'all 160ms ease',
          boxShadow: 'var(--arvo-shadow-sm)',
        }}
        onMouseEnter={e => {
          if (!hasLink) e.currentTarget.style.opacity = '0.88'
          else e.currentTarget.style.background = 'var(--arvo-hover-bg)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = '1'
          e.currentTarget.style.background = hasLink ? 'var(--arvo-surface)' : RED
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="3" r="1.5"/>
          <circle cx="3" cy="7" r="1.5"/>
          <circle cx="11" cy="11" r="1.5"/>
          <path strokeLinecap="round" d="M4.5 6.2l5-2.5M4.5 7.8l5 2.5"/>
        </svg>
        {hasLink ? 'Link compartilhado' : 'Compartilhar viagem'}
        {hasLink && (
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#1F8A5B', flexShrink: 0 }} />
        )}
      </button>

      {open && (
        <ShareModal
          trip={trip}
          onUpdate={fields => { onUpdate(fields); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
