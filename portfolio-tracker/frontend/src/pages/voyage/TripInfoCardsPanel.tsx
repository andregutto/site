import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { Switch } from '../../components/ui'
import ArvoLoader from '../../components/ArvoLoader'
import CategoryIcon, { ICON_KEYS } from '../community/_shared/CategoryIcon'

// Grid de "Informações úteis" da viagem: agência, transporte, passeio,
// hospedagem, restaurante ou tipo livre (com ícone à escolha). Cards sempre
// visíveis, sem accordion. Usado em dois contextos:
// - Página da viagem (dono/membros): todos os cards; dono ganha adicionar
//   (card "+" na 1ª posição), editar (clique no corpo, bottom-sheet) e
//   excluir (X no card ou dentro do editor) + badge nos ocultos.
// - Visões compartilhadas (TripShareView): só os cards shared, sem controles
//   (o payload público já vem filtrado do servidor).

const GOLD = '#C8B89A'
const EASE = 'cubic-bezier(0.35, 0, 0.65, 1)' // curva quase linear padrão do app (~280ms)

export interface InfoCardData {
  id: number
  kind: string
  title: string
  body: string | null
  phone: string | null
  url: string | null
  shared?: boolean
  icon_key?: string | null
}

const PREDEFINED_KINDS = ['agency', 'transport', 'tour', 'lodging', 'restaurant'] as const

// Ícones outline no traço da plataforma (stroke 1.5, sem preenchimento) —
// um por tipo; tipo livre cai no ícone genérico de nota.
function KindIcon({ kind, size = 18 }: { kind: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: '0 0 20 20', fill: 'none' as const,
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'agency': // maleta (agência de viagens)
      return (
        <svg {...common}>
          <rect x="3" y="6.5" width="14" height="9.5" rx="1.6" />
          <path d="M7.5 6.5V5.2A1.7 1.7 0 019.2 3.5h1.6a1.7 1.7 0 011.7 1.7v1.3M3 10.5h14" />
        </svg>
      )
    case 'transport': // ônibus/transfer
      return (
        <svg {...common}>
          <rect x="4" y="3" width="12" height="11.5" rx="2" />
          <path d="M4 9.5h12M8 12.2h.01M12 12.2h.01" />
          <path d="M6.5 14.5L5.5 17M13.5 14.5l1 2.5" />
        </svg>
      )
    case 'tour': // ingresso (passeio)
      return (
        <svg {...common}>
          <path d="M2.5 8.5V6A1.5 1.5 0 014 4.5h12A1.5 1.5 0 0117.5 6v2.5a1.5 1.5 0 000 3V14a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 14v-2.5a1.5 1.5 0 000-3z" />
          <path d="M12.5 4.5v11" strokeDasharray="2.2 2.2" />
        </svg>
      )
    case 'lodging': // cama (hospedagem)
      return (
        <svg {...common}>
          <path d="M2.5 15.5V8M2.5 12.5h15M17.5 15.5V10a2 2 0 00-2-2H8.5v4.5" />
          <circle cx="5.5" cy="10" r="1.3" />
        </svg>
      )
    case 'restaurant': // garfo e faca
      return (
        <svg {...common}>
          <path d="M6 3v14M4 3v3.8a2 2 0 004 0V3" />
          <path d="M14.5 3c-1.5 1.2-2.3 2.9-2.3 4.8 0 1.6.9 2.7 2.3 2.7V17M14.5 3v7.5" />
        </svg>
      )
    default: // nota genérica (tipo livre)
      return (
        <svg {...common}>
          <rect x="4" y="3" width="12" height="14" rx="1.6" />
          <path d="M7 7h6M7 10h6M7 13h4" />
        </svg>
      )
  }
}

function kindLabel(kind: string, ic: any): string {
  switch (kind) {
    case 'agency': return ic.kindAgency ?? 'Agência'
    case 'transport': return ic.kindTransport ?? 'Transporte'
    case 'tour': return ic.kindTour ?? 'Passeio'
    case 'lodging': return ic.kindLodging ?? 'Hospedagem'
    case 'restaurant': return ic.kindRestaurant ?? 'Restaurante'
    case 'other': return ic.kindOther ?? 'Outro'
    default: return kind // tipo livre: mostra o texto como foi cadastrado
  }
}

// Ícone de olho cortado — mesmo desenho usado nos toggles de visibilidade do
// CostCard/roteiro, pra affordance consistente de "oculto no compartilhamento".
export function EyeOffIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.3 4.9A8.6 8.6 0 0110 4.7c5.5 0 8.3 5.3 8.3 5.3a13.6 13.6 0 01-2.1 2.8M11.8 11.8a2.5 2.5 0 01-3.6-3.5M4.9 6.1A13.3 13.3 0 001.7 10s2.8 5.3 8.3 5.3c1 0 1.9-.2 2.7-.5" />
      <path d="M2.5 2.5l15 15" />
    </svg>
  )
}

export function EyeIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.7 10S4.5 4.7 10 4.7 18.3 10 18.3 10 15.5 15.3 10 15.3 1.7 10 1.7 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  )
}

// Badge "oculto no compartilhamento" — usado aqui e no roteiro
export function HiddenFromShareBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
      fontFamily: 'var(--arvo-font-display)', fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--arvo-fg-muted)', padding: '2px 7px', borderRadius: 999,
      border: '1px solid var(--arvo-border)', background: 'var(--arvo-hover-bg)',
    }}>
      <EyeOffIcon size={10} />
      {label}
    </span>
  )
}

// ── Editor (bottom-sheet) ─────────────────────────────────────────────────────
function InfoCardEditor({ tripId, card, onSaved, onDeleted, onClose }: {
  tripId: number
  card: InfoCardData | null // null = novo
  onSaved: (card: InfoCardData) => void
  onDeleted: (id: number) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const ic = tv.infoCards ?? {}

  const isPredefined = (k: string) => (PREDEFINED_KINDS as readonly string[]).includes(k)
  const [kind, setKind] = useState<string>(card ? (isPredefined(card.kind) ? card.kind : 'other') : 'agency')
  const [customKind, setCustomKind] = useState(card && !isPredefined(card.kind) && card.kind !== 'other' ? card.kind : '')
  const [iconKey, setIconKey] = useState<string>(card?.icon_key || ICON_KEYS[0])
  const [title, setTitle] = useState(card?.title ?? '')
  const [body, setBody] = useState(card?.body ?? '')
  const [phone, setPhone] = useState(card?.phone ?? '')
  const [url, setUrl] = useState(card?.url ?? '')
  const [shared, setShared] = useState(card?.shared ?? true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 5, display: 'block',
  }

  async function save() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const payload = {
        kind: kind === 'other' ? (customKind.trim() || 'other') : kind,
        title: title.trim(),
        body: body.trim() || null,
        phone: phone.trim() || null,
        url: url.trim() || null,
        shared,
        // Ícone à escolha só se aplica ao tipo livre; nos pré-definidos fica null
        icon_key: kind === 'other' ? iconKey : null,
      }
      const data = card
        ? await apiFetch<{ card: InfoCardData }>(`/voyage/trips/${tripId}/info-cards/${card.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch<{ card: InfoCardData }>(`/voyage/trips/${tripId}/info-cards`, { method: 'POST', body: JSON.stringify(payload) })
      onSaved(data.card)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function del() {
    if (!card || deleting) return
    if (!confirm((ic.confirmDelete ?? 'Excluir "{title}"?').replace('{title}', card.title))) return
    setDeleting(true)
    try {
      await apiFetch(`/voyage/trips/${tripId}/info-cards/${card.id}`, { method: 'DELETE' })
      onDeleted(card.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--arvo-surface)', boxShadow: 'var(--arvo-shadow-lg)', padding: '20px 22px calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>
            {card ? (ic.editTitle ?? 'Editar informação') : (ic.addTitle ?? 'Nova informação')}
          </p>
          <button
            type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Tipo — 5 pré-definidos + "outro" com texto livre */}
          <div>
            <span style={labelStyle}>{ic.kindLabel ?? 'Tipo'}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {[...PREDEFINED_KINDS, 'other'].map(k => (
                <button
                  key={k} type="button" onClick={() => setKind(k)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'var(--arvo-font-body)', fontSize: 12.5,
                    border: `1px solid ${kind === k ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
                    background: kind === k ? 'var(--arvo-hover-bg)' : 'transparent',
                    color: kind === k ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)',
                    transition: `all 280ms ${EASE}`,
                  }}
                >
                  <KindIcon kind={k} size={13} />
                  {kindLabel(k, ic)}
                </button>
              ))}
            </div>
            {kind === 'other' && (
              <>
                <input
                  value={customKind} onChange={e => setCustomKind(e.target.value)}
                  placeholder={ic.kindOtherPlaceholder ?? 'Ex: Seguro viagem'}
                  maxLength={40}
                  style={{ ...fieldStyle, marginTop: 8 }}
                />
                {/* Ícone à escolha pro tipo livre — mesmo picker da Comunidade */}
                <span style={{ ...labelStyle, marginTop: 10 }}>{ic.iconLabel ?? 'Ícone'}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ICON_KEYS.map(k => (
                    <button
                      key={k} type="button" onClick={() => setIconKey(k)} title={k}
                      style={{
                        width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        border: `1px solid ${iconKey === k ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
                        background: iconKey === k ? 'var(--arvo-hover-bg)' : 'transparent',
                        color: iconKey === k ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)',
                        transition: `all 280ms ${EASE}`,
                      }}
                    >
                      <CategoryIcon iconKey={k} size={15} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <span style={labelStyle}>{ic.titleLabel ?? 'Título'}</span>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder={ic.titlePlaceholder ?? 'Ex: Agência Azul Viagens'}
              style={fieldStyle}
            />
          </div>

          <div>
            <span style={labelStyle}>{ic.bodyLabel ?? 'Texto'}</span>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              placeholder={ic.bodyPlaceholder ?? 'Detalhes, referências, instruções…'}
              rows={3}
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={labelStyle}>{ic.phoneLabel ?? 'Telefone'}</span>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78"
                style={fieldStyle}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={labelStyle}>{ic.urlLabel ?? 'Link'}</span>
              <input
                type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://…"
                style={fieldStyle}
              />
            </div>
          </div>

          {/* Incluir no compartilhamento — vale pra TODAS as superfícies externas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 2 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>
                {ic.includeInShare ?? 'Incluir no compartilhamento'}
              </p>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                {ic.includeInShareDesc ?? 'Aparece no link público, no link com cadastro e na Comunidade'}
              </p>
            </div>
            <Switch checked={shared} onChange={setShared} label={ic.includeInShare ?? 'Incluir no compartilhamento'} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
            {card && (
              <button
                type="button" onClick={del} disabled={deleting}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '7px 12px', borderRadius: 6, background: 'none', border: '1px solid var(--arvo-border)', color: '#D63B2F', cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}
              >
                {ic.delete ?? 'Excluir'}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button
              type="button" onClick={onClose}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '7px 14px', borderRadius: 6, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}
            >
              {tv.actions?.cancel ?? 'Cancelar'}
            </button>
            <button
              type="button" onClick={save} disabled={saving || !title.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '7px 16px', borderRadius: 6, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: saving || !title.trim() ? 'default' : 'pointer', opacity: saving || !title.trim() ? 0.5 : 1 }}
            >
              {saving && <ArvoLoader size={13} />}
              {ic.save ?? 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Resolve o ícone do card: tipos pré-definidos usam KindIcon; tipo livre com
// icon_key escolhido usa CategoryIcon (picker reusado da Comunidade); tipo
// livre sem icon_key (cards antigos, criados antes desta mudança) cai no
// ícone genérico de nota do KindIcon.
function CardIcon({ kind, iconKey, size = 18 }: { kind: string; iconKey?: string | null; size?: number }) {
  const isPredefined = (PREDEFINED_KINDS as readonly string[]).includes(kind)
  if (!isPredefined && iconKey) return <CategoryIcon iconKey={iconKey} size={size} />
  return <KindIcon kind={kind} size={size} />
}

// ── Card individual ────────────────────────────────────────────────────────────
function InfoCard({ card: c, canEdit, hiddenLabel, onEdit, onDelete }: {
  card: InfoCardData
  canEdit: boolean
  hiddenLabel: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 8,
        padding: '14px 14px 12px', borderRadius: 12, background: 'var(--arvo-hover-bg)',
        border: '1px solid var(--arvo-border-soft)', cursor: canEdit ? 'pointer' : 'default',
        transition: `border-color 280ms ${EASE}`, minHeight: 0,
      }}
      onClick={canEdit ? onEdit : undefined}
    >
      {canEdit && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="×"
          style={{
            position: 'absolute', top: 8, right: 8, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: 999, cursor: 'pointer', color: 'var(--arvo-fg-faint)', flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      )}

      <span style={{
        width: 34, height: 34, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(200,184,154,0.18)', color: GOLD, flexShrink: 0,
      }}>
        <CardIcon kind={c.kind} iconKey={c.icon_key} size={17} />
      </span>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingRight: canEdit ? 16 : 0 }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 500, color: 'var(--arvo-fg)' }}>{c.title}</p>
          {canEdit && c.shared === false && <HiddenFromShareBadge label={hiddenLabel} />}
        </div>
        {c.body && (
          <p style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', marginTop: 3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{c.body}</p>
        )}
      </div>

      {(c.phone || c.url) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto', paddingTop: 4, flexWrap: 'wrap' }}>
          {c.phone && (
            <a
              href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: GOLD, textDecoration: 'none' }}
            >
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.2 2.8h3l1.4 3.7-1.9 1.4a11.5 11.5 0 005.4 5.4l1.4-1.9 3.7 1.4v3a1.5 1.5 0 01-1.6 1.5C8.6 16.7 3.3 11.4 2.7 4.4a1.5 1.5 0 011.5-1.6z" />
              </svg>
              {c.phone}
            </a>
          )}
          {c.url && (
            <a
              href={c.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: GOLD, textDecoration: 'none', maxWidth: 200, overflow: 'hidden' }}
            >
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.url.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// Card "+" — sempre na primeira posição, mesmo formato/tamanho dos demais
function AddCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: 110, borderRadius: 12, border: '1px dashed var(--arvo-border)', background: 'none',
        color: 'var(--arvo-fg-soft)', cursor: 'pointer', transition: `border-color 280ms ${EASE}, color 280ms ${EASE}`,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M9 2.5v13M2.5 9h13" />
      </svg>
      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5 }}>{label}</span>
    </button>
  )
}

// ── Grid de cards ──────────────────────────────────────────────────────────────
export default function TripInfoCardsPanel({ tripId, cards, isOwner = false, onChanged }: {
  tripId?: number
  cards: InfoCardData[]
  isOwner?: boolean
  onChanged?: (cards: InfoCardData[]) => void
}) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const ic = tv.infoCards ?? {}
  const [editing, setEditing] = useState<InfoCardData | 'new' | null>(null)

  const canEdit = isOwner && tripId != null
  const hiddenLabel = tv.partialShare?.hiddenBadge ?? 'oculto no compartilhamento'

  // Sem cards e sem dono: nada a mostrar
  if (cards.length === 0 && !canEdit) return null

  async function handleDelete(card: InfoCardData) {
    if (!tripId) return
    if (!confirm((ic.confirmDelete ?? 'Excluir "{title}"?').replace('{title}', card.title))) return
    await apiFetch(`/voyage/trips/${tripId}/info-cards/${card.id}`, { method: 'DELETE' })
    onChanged?.(cards.filter(x => x.id !== card.id))
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Eyebrow — separa visualmente da seção seguinte, sem interação */}
      <p style={{
        fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--arvo-fg-muted)', marginBottom: 10,
      }}>
        {ic.title ?? 'Informações úteis'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {canEdit && <AddCard label={ic.add ?? 'Adicionar informação'} onClick={() => setEditing('new')} />}
        {cards.map(c => (
          <InfoCard
            key={c.id}
            card={c}
            canEdit={canEdit}
            hiddenLabel={hiddenLabel}
            onEdit={() => setEditing(c)}
            onDelete={() => handleDelete(c)}
          />
        ))}
      </div>

      {editing && canEdit && tripId != null && (
        <InfoCardEditor
          tripId={tripId}
          card={editing === 'new' ? null : editing}
          onSaved={c => onChanged?.(editing === 'new' ? [...cards, c] : cards.map(x => x.id === c.id ? c : x))}
          onDeleted={id => onChanged?.(cards.filter(x => x.id !== id))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
