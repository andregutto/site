import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { Switch } from '../../components/ui'
import type { Trip } from './types'

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.10)'

interface Props {
  trip: Trip
  onUpdate: (t: Partial<Trip>) => void
}

interface ShareLink { id: number; label: string; utm_campaign: string; created_at: string }

// Título de seção com switch à direita — padrão do modal inteiro: cada
// seção liga/desliga no próprio título, sem blocos longos de explicação.
function SectionHeader({ title, control }: { title: string; control?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>
        {title}
      </p>
      {control}
    </div>
  )
}

// Linha compacta de opção: texto à esquerda, Switch à direita
function OptionRow({ title, desc, checked, onChange, disabled }: {
  title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{title}</p>
        {desc && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{desc}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  )
}

// Linha de link: input readonly + copiar (+ abrir, opcional)
function LinkRow({ url, copied, onCopy, openHref, copyLabel }: { url: string; copied: boolean; onCopy: () => void; openHref?: string; copyLabel: string }) {
  const fieldStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 3, minWidth: 0,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)',
    outline: 'none', flex: 1,
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input readOnly value={url} style={fieldStyle} />
      <button
        type="button"
        onClick={onCopy}
        style={{ padding: '6px 14px', borderRadius: 5, background: copied ? 'var(--arvo-green, #1F8A5B)' : RED, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, flexShrink: 0, transition: 'background 280ms cubic-bezier(0.35, 0, 0.65, 1)' }}
      >
        {copied ? '✓' : copyLabel}
      </button>
      {openHref && (
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid ${RED}`, color: RED, textDecoration: 'none', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
          </svg>
        </a>
      )}
    </div>
  )
}

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
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)
  const [gatedCopied, setGatedCopied] = useState(false)
  const [hideCost, setHideCost] = useState(trip.share_hide_cost)
  const [showPlaceExpenses, setShowPlaceExpenses] = useState(trip.show_place_expenses)
  const [expiryDays, setExpiryDays] = useState<number | null>(null)
  // Galeria da Comunidade — consentimento SEPARADO do link público: pode
  // existir sem link e o link pode existir sem ela. Só o dono vê este modal.
  const [communityVisible, setCommunityVisible] = useState(!!trip.community_visible)

  // Links de divulgação (lead magnet do YouTube) — bloco só pra admin
  // (community_admins, mesmo isAdmin dos Recursos). Pra todo mundo o
  // endpoint devolve is_admin: false e o bloco simplesmente não aparece.
  // Colapsado por padrão pra não alongar o modal.
  const [isAdmin, setIsAdmin] = useState(false)
  const [promoOpen, setPromoOpen] = useState(false)
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

  // Switch do link público: ligar gera o link na hora (com as opções atuais);
  // desligar revoga com confirmação — mesma semântica dos botões antigos.
  async function toggleShare(on: boolean) {
    if (toggling) return
    if (!on) {
      if (!confirm(tv.confirm?.revokeShare ?? 'Revogar o link? Quem tiver o link não conseguirá mais acessar.')) return
      setToggling(true)
      try {
        await apiFetch(`/voyage/trips/${trip.id}/share`, { method: 'DELETE' })
        onUpdate({ share_token: null })
      } finally {
        setToggling(false)
      }
      return
    }
    setToggling(true)
    try {
      const data = await apiFetch<{ token: string }>(`/voyage/trips/${trip.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ hide_cost: hideCost, expires_in_days: expiryDays }),
      })
      onUpdate({ share_token: data.token, share_hide_cost: hideCost })
    } finally {
      setToggling(false)
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
  const subText: React.CSSProperties = { fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', lineHeight: 1.5 }
  const divider: React.CSSProperties = { borderTop: '1px solid var(--arvo-border-soft)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
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

        <div style={{ padding: '20px 24px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Link público ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionHeader
              title={sv.publicLink ?? 'Link público'}
              control={
                <Switch
                  checked={!!trip.share_token}
                  onChange={toggleShare}
                  disabled={toggling}
                  label={sv.publicLink ?? 'Link público'}
                />
              }
            />
            {shareUrl ? (
              <>
                <LinkRow url={shareUrl} copied={copied} onCopy={copyLink} openHref={shareUrl} copyLabel={tv.actions?.copy ?? 'Copiar'} />

                <OptionRow
                  title={sv.hideCost ?? 'Ocultar custos'}
                  desc={sv.hideCostDesc ?? 'Seguidores não verão os valores gastos'}
                  checked={hideCost}
                  onChange={async v => {
                    setHideCost(v)
                    await apiFetch(`/voyage/trips/${trip.id}/share`, {
                      method: 'POST',
                      body: JSON.stringify({ hide_cost: v, expires_in_days: expiryDays }),
                    })
                    onUpdate({ share_hide_cost: v })
                  }}
                />

                <OptionRow
                  title={sv.showExpenses ?? 'Mostrar gastos por lugar'}
                  desc={sv.showExpensesDesc ?? 'Exibe quanto você gastou em cada lugar no mapa'}
                  checked={showPlaceExpenses}
                  onChange={async v => {
                    setShowPlaceExpenses(v)
                    await apiFetch(`/voyage/trips/${trip.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ show_place_expenses: v }),
                    })
                    onUpdate({ show_place_expenses: v })
                  }}
                />

                {/* Validade — pills compactas na mesma linha do rótulo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', flexShrink: 0 }}>
                    {sv.validityShort ?? 'Validade'}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' }}>
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
                          padding: '3px 10px', borderRadius: 999,
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
              </>
            ) : (
              <p style={subText}>
                {sv.publicLinkOffDesc ?? 'Ative para gerar um link aberto: quem tiver o link vê lugares e notas, e pode importar para o Google Maps.'}
              </p>
            )}
          </div>

          {/* ── Link com cadastro — sem switch: existe enquanto o link
                 público estiver ativo (mesmo share_token no servidor) ───── */}
          <div style={{ ...divider, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10, opacity: gatedUrl ? 1 : 0.55 }}>
            <SectionHeader title={sv.gatedLink ?? 'Link com cadastro'} />
            {gatedUrl ? (
              <>
                <LinkRow url={gatedUrl} copied={gatedCopied} onCopy={copyGatedLink} copyLabel={tv.actions?.copy ?? 'Copiar'} />
                <p style={subText}>
                  {sv.gatedLinkDesc ?? 'Quem abrir precisa criar uma conta grátis para ver o roteiro'}
                </p>
              </>
            ) : (
              <p style={subText}>
                {sv.gatedLinkNeedsShare ?? 'Disponível enquanto o link público estiver ativo'}
              </p>
            )}
          </div>

          {/* ── Comunidade — independente do link público (aparece com ou
                 sem share_token). A viagem entra na galeria de viagens da
                 Comunidade, acessível só pra quem está logado. ──────────── */}
          <div style={{ ...divider, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SectionHeader
              title={sv.communityTitle ?? 'Comunidade'}
              control={
                <Switch
                  checked={communityVisible}
                  onChange={async v => {
                    setCommunityVisible(v)
                    try {
                      await apiFetch(`/voyage/trips/${trip.id}/community`, {
                        method: 'PATCH',
                        body: JSON.stringify({ visible: v }),
                      })
                      onUpdate({ community_visible: v })
                    } catch {
                      setCommunityVisible(!v)
                    }
                  }}
                  label={sv.communityTitle ?? 'Comunidade'}
                />
              }
            />
            <p style={subText}>{sv.communityToggleDesc ?? 'A viagem aparece na galeria de viagens da Comunidade Arvo'}</p>
            {/* Nota honesta: os flags de custo (ocultar custos / gastos por
                lugar) valem pra QUALQUER visão compartilhada, inclusive a da
                comunidade — não são exclusivos do link público. */}
            {communityVisible && (
              <p style={{ ...subText, color: 'var(--arvo-fg-muted)', fontSize: 11.5 }}>
                {sv.communityCostsNote ?? 'Custos seguem a configuração do link público acima'}
              </p>
            )}
          </div>

          {/* ── Links de divulgação (admin) — accordion fechado por padrão ── */}
          {isAdmin && gatedUrl && (
            <div style={{ ...divider, paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setPromoOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
                  {sv.promoTitle ?? 'Links de divulgação (admin)'}
                  {promoLinks.length > 0 && <span style={{ color: 'var(--arvo-fg-soft)', letterSpacing: 0 }}> ({promoLinks.length})</span>}
                </p>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5" style={{ flexShrink: 0, transform: promoOpen ? 'rotate(180deg)' : 'none', transition: 'transform 280ms cubic-bezier(0.35, 0, 0.65, 1)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5L6 8l3.5-3.5" />
                </svg>
              </button>

              {promoOpen && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {promoLinks.map(link => (
                      <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                        <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg)', flex: '0 1 auto', maxWidth: 140 }}>{link.label}</span>
                        <span className="min-w-0 truncate" style={{ fontFamily: 'var(--arvo-font-mono, monospace)', color: 'var(--arvo-fg-soft)', flex: 1, fontSize: 11.5 }}>{promoLinkUrl(link)}</span>
                        <button
                          type="button"
                          onClick={() => copyPromoLink(link)}
                          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'none', color: copiedLinkId === link.id ? 'var(--arvo-green, #1F8A5B)' : 'var(--arvo-fg-soft)', cursor: 'pointer', whiteSpace: 'nowrap' }}
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
                      <p style={subText}>{sv.promoEmpty ?? 'Nenhum link de divulgação ainda'}</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <input
                      value={newLinkLabel}
                      onChange={e => setNewLinkLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createPromoLink() }}
                      placeholder={sv.promoPlaceholder ?? 'Onde vai usar? Ex: Vídeo roteiro Lisboa'}
                      style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
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
            </div>
          )}

          {/* ── Rodapé: ver como visitante — abre a visão gated em aba nova
                 pro dono conferir exatamente o que um visitante vê ───────── */}
          {gatedUrl && (
            <div style={{ ...divider, paddingTop: 12 }}>
              <a
                href={gatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-muted)', textDecoration: 'none' }}
              >
                <svg width="12" height="12" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
                </svg>
                {sv.viewAsVisitor ?? 'Ver como visitante'}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
