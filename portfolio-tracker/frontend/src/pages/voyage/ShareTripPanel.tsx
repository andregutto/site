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

export default function ShareTripPanel({ trip, onUpdate }: Props) {
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [hideCost, setHideCost] = useState(trip.share_hide_cost)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)

  const shareUrl = trip.share_token
    ? `${window.location.origin}/trip/${trip.share_token}`
    : null

  async function generate() {
    setLoading(true)
    try {
      const data = await apiFetch<{ token: string }>(`/api/voyage/trips/${trip.id}/share`, {
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
      await apiFetch(`/api/voyage/trips/${trip.id}/share`, { method: 'DELETE' })
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
    border: '1px solid var(--arvo-border)', background: '#fff',
    fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)',
    outline: 'none',
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '20px 22px' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 16 }}>
        Compartilhar viagem
      </p>

      {shareUrl ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Link */}
          <div>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 6 }}>
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

          {/* Settings */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={hideCost}
              onChange={async e => {
                const v = e.target.checked
                setHideCost(v)
                await apiFetch(`/api/voyage/trips/${trip.id}/share`, {
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
                    await apiFetch(`/api/voyage/trips/${trip.id}/share`, {
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
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        </div>
      )}
    </div>
  )
}
