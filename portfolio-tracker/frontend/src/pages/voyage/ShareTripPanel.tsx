import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import type { Trip } from './types'

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.10)'

interface Props {
  trip: Trip
  onUpdate: (t: Partial<Trip>) => void
}

interface ShareLink { id: number; label: string; utm_campaign: string; created_at: string }

export function ShareModal({ trip, onUpdate, onClose }: Props & { onClose: () => void }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const sv = tv.share ?? {}
  const EXPIRY_OPTIONS = [
    { label: sv.expiry7 ?? '7 dias', value: 7 as number | null },
    { label: sv.expiry30 ?? '30 dias', value: 30 as number | null },
    { label: sv.expiry90 ?? '90 dias', value: 90 as number | null },
    { label: sv.expiryNone ?? 'Sem prazo', value: null as number | null },
  ]
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gatedCopied, setGatedCopied] = useState(false)
  const [hideCost, setHideCost] = useState(trip.share_hide_cost)
  const [showPlaceExpenses, setShowPlaceExpenses] = useState(trip.show_place_expenses)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)

  // Links de divulgação (lead magnet do YouTube) — bloco só pra admin
  // (community_admins, mesmo isAdmin dos Recursos). Pra todo mundo o
  // endpoint devolve is_admin: false e o bloco simplesmente não aparece.
  const [isAdmin, setIsAdmin] = useState(false)
  const [promoLinks, setPromoLinks] = useState<ShareLink[]>([])
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [creatingLink, setCreatingLink] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null)

  useEffect(() => {
    apiFetch<{ is_admin: boolean; links: ShareLink[] }>(`/voyage/trips/${trip.id}/share-links`)
      .then(data => { setIsAdmin(data.is_admin); setPromoLinks(data.links) })
      .catch(() => {})
  }, [trip.id])

  const shareUrl = trip.share_token
    ? `${window.location.origin}/trip/${trip.share_token}`
    : null

  // Link com cadastro: keyed por trip id (não por token) — a página
  // /voyage/shared/:tripId só existe enquanto o share estiver habilitado
  // (share_token não nulo no servidor).
  const gatedUrl = trip.share_token
    ? `${window.location.origin}/voyage/shared/${trip.id}`
    : null

  function promoLinkUrl(link: ShareLink): string {
    return `${window.location.origin}/voyage/shared/${trip.id}?utm_source=youtube&utm_campaign=${encodeURIComponent(link.utm_campaign)}`
  }

  function copyPromoLink(link: ShareLink) {
    navigator.clipboard.writeText(promoLinkUrl(link)).then(() => {
      setCopiedLinkId(link.id)
      setTimeout(() => setCopiedLinkId(null), 1800)
    })
  }

  async function createPromoLink() {
    if (creatingLink || !newLinkLabel.trim()) return
    setCreatingLink(true)
    try {
      const link = await apiFetch<ShareLink>(`/voyage/trips/${trip.id}/share-links`, {
        method: 'POST', body: JSON.stringify({ label: newLinkLabel.trim() }),
      })
      setPromoLinks(prev => [link, ...prev])
      setNewLinkLabel('')
    } finally {
      setCreatingLink(false)
    }
  }

  async function deletePromoLink(link: ShareLink) {
    await apiFetch(`/voyage/trips/${trip.id}/share-links/${link.id}`, { method: 'DELETE' })
    setPromoLinks(prev => prev.filter(l => l.id !== link.id))
  }

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
    if (!confirm(tv.confirm?.revokeShare ?? 'Revogar o link? Quem tiver o link não conseguirá mais acessar.')) return
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

  function copyGatedLink() {
    if (!gatedUrl) return
    navigator.clipboard.writeText(gatedUrl)
    setGatedCopied(true)
    setTimeout(() => setGatedCopied(false), 2000)
  }

  const fieldStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 3,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)',
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
              {sv.title ?? 'Compartilhar viagem'}
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
                  {sv.publicLink ?? 'Link público'}
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{ ...fieldStyle, flex: 1, color: 'var(--arvo-fg-soft)', fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    style={{ padding: '6px 14px', borderRadius: 5, background: copied ? '#1F8A5B' : RED, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, flexShrink: 0, transition: 'background 200ms' }}
                  >
                    {copied ? '✓' : (tv.actions?.copy ?? 'Copiar')}
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

              {/* Link com cadastro — mesma viagem, mas atrás de um gate de
                  login/cadastro (/voyage/shared/:tripId). É o link pra
                  descrição de vídeo quando o objetivo é converter cadastro,
                  não só mostrar o roteiro. */}
              {gatedUrl && (
                <div>
                  <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                    {sv.gatedLink ?? 'Link com cadastro'}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      readOnly
                      value={gatedUrl}
                      style={{ ...fieldStyle, flex: 1, color: 'var(--arvo-fg-soft)', fontSize: 12 }}
                    />
                    <button
                      type="button"
                      onClick={copyGatedLink}
                      style={{ padding: '6px 14px', borderRadius: 5, background: gatedCopied ? '#1F8A5B' : RED, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, flexShrink: 0, transition: 'background 200ms' }}
                    >
                      {gatedCopied ? '✓' : (tv.actions?.copy ?? 'Copiar')}
                    </button>
                  </div>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', marginTop: 6 }}>
                    {sv.gatedLinkDesc ?? 'Quem abrir precisa criar uma conta grátis para ver o roteiro'}
                  </p>
                </div>
              )}

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
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{sv.hideCost ?? 'Ocultar custos'}</p>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{sv.hideCostDesc ?? 'Seguidores não verão os valores gastos'}</p>
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
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{sv.showExpenses ?? 'Mostrar gastos por lugar'}</p>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{sv.showExpensesDesc ?? 'Exibe quanto você gastou em cada lugar no mapa'}</p>
                </div>
              </label>

              {/* Expiry */}
              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                  {sv.validity ?? 'Validade do link'}
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
                        fontFamily: 'var(--arvo-font-body)', fontSize: 12,
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

              {/* Links de divulgação — bloco só pra admin (community_admins):
                  rótulo → utm_campaign automático no link com cadastro, pra
                  medir qual vídeo converte (mesmo mecanismo dos Recursos). */}
              {isAdmin && gatedUrl && (
                <div style={{ paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)' }}>
                  <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                    {sv.promoTitle ?? 'Links de divulgação (admin)'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {promoLinks.map(link => (
                      <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                        <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg)', flex: '0 1 auto', maxWidth: 140 }}>{link.label}</span>
                        <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-mono, monospace)', color: 'var(--arvo-fg-soft)', flex: 1, fontSize: 11.5 }}>{promoLinkUrl(link)}</span>
                        <button
                          type="button"
                          onClick={() => copyPromoLink(link)}
                          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: copiedLinkId === link.id ? '#1F8A5B' : 'var(--arvo-fg-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {copiedLinkId === link.id ? '✓' : (tv.actions?.copy ?? 'Copiar')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePromoLink(link)}
                          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: RED, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {sv.promoDelete ?? 'Excluir'}
                        </button>
                      </div>
                    ))}
                    {promoLinks.length === 0 && (
                      <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                        {sv.promoEmpty ?? 'Nenhum link de divulgação ainda'}
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <input
                      value={newLinkLabel}
                      onChange={e => setNewLinkLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createPromoLink() }}
                      placeholder={sv.promoPlaceholder ?? 'Onde vai usar? Ex: Vídeo roteiro Lisboa'}
                      style={{ ...fieldStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={createPromoLink}
                      disabled={creatingLink || !newLinkLabel.trim()}
                      style={{ padding: '6px 14px', borderRadius: 5, background: RED, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, flexShrink: 0, opacity: (creatingLink || !newLinkLabel.trim()) ? 0.5 : 1 }}
                    >
                      {sv.promoGenerate ?? 'Gerar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Revoke */}
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--arvo-border-soft)' }}>
                <button
                  type="button"
                  onClick={revoke}
                  disabled={revoking}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: RED, background: 'none', border: 'none', cursor: 'pointer', opacity: revoking ? 0.5 : 1, padding: 0 }}
                >
                  {revoking ? (sv.revoking ?? 'Revogando…') : (sv.revoke ?? 'Revogar link público')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.6 }}>
                {sv.intro ?? 'Gere um link para compartilhar o roteiro com seguidores: eles verão os lugares, notas e podem importar para o Google Maps.'}
              </p>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hideCost}
                  onChange={e => setHideCost(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: '#0D0D0D' }}
                />
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{sv.hideCostPublic ?? 'Ocultar custos na página pública'}</p>
              </label>

              <div>
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
                  {sv.validityShort ?? 'Validade'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setExpiryDays(opt.value)}
                      style={{
                        padding: '4px 12px', borderRadius: 999,
                        fontFamily: 'var(--arvo-font-body)', fontSize: 12,
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
                style={{ padding: '9px 0', borderRadius: 8, background: loading ? 'var(--arvo-hover-bg)' : RED, color: loading ? 'var(--arvo-fg-muted)' : '#fff', border: 'none', cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 14, transition: 'all 160ms' }}
              >
                {loading ? (sv.generating ?? 'Gerando…') : (sv.generate ?? 'Gerar link público')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
