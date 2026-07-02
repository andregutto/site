import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import Avatar from './voyage/_shared/Avatar'
import { RoleChip } from './voyage/_shared/Chips'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'

type Direction = 'owned_by_me' | 'shared_with_me'

interface TripContext {
  type: 'voyage_trip'
  direction: Direction
  trip_id: number
  trip_title: string
  role: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface FinanceContext {
  type: 'shared_finance'
  direction: Direction
  group_id: number
  group_name: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface MomentContext {
  type: 'finance_moment'
  direction: Direction
  moment_id: number
  moment_name: string
  role: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface FriendContext {
  type: 'friend'
  direction: Direction
  friend_id: number
  friend_status: 'active' | 'pending'
  accept_token?: string
  auto_accept_invites?: boolean
}

type Context = TripContext | FinanceContext | MomentContext | FriendContext

interface Balance { currency: string; amount: number }

interface Contact {
  email: string
  name?: string
  username?: string
  avatar_url?: string
  user_id: string | null
  status: 'active' | 'pending'
  contexts: Context[]
  balances?: Balance[]
}

interface Trip { id: number; title: string }
interface Group { id: number; name: string }
interface MomentOption { id: number; name: string }
interface UserSuggestion { user_id: string; username: string; name?: string; avatar_url?: string }

// Toggle estilo iOS — usado no lugar de <input type="checkbox"> (que destoa
// do resto do app, sempre estilizado com pills/switches próprios).
function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={onChange} disabled={disabled}
      style={{
        position: 'relative', width: 36, height: 21, borderRadius: 999, flexShrink: 0,
        border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 0,
        background: checked ? RED : 'var(--arvo-border)',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 180ms ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 17 : 2,
        width: 17, height: 17, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left 180ms cubic-bezier(0.4, 0, 0.2, 1)',
      }} />
    </button>
  )
}

// Linha unificada pra qualquer recurso compartilhado (viagem/categoria/momento) —
// mesmo padrão visual nos três, em vez de cada seção ter seu próprio estilo de
// botão "Remover"/"Ver". Pendente vira um ponto dourado (sem texto repetido —
// a seção já deixa claro o que é); dono vê um × pra revogar o acesso; convidado
// vê uma seta pra abrir o recurso.
function ResourceRow({
  icon, title, role, status, ownedByMe, onRemove, onView, removing, pendingTitle,
}: {
  icon: React.ReactNode
  title: string
  role?: string
  status: 'active' | 'pending'
  ownedByMe: boolean
  onRemove?: () => void
  onView: () => void
  removing?: boolean
  pendingTitle: string
}) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: '1px solid var(--arvo-border-soft)' }}>
      <span style={{ color: 'var(--arvo-fg-muted)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
      {role && <RoleChip role={role} />}
      {status === 'pending' ? (
        <span title={pendingTitle} style={{ width: 7, height: 7, borderRadius: 999, background: GOLD, flexShrink: 0 }} />
      ) : ownedByMe && onRemove ? (
        <button
          type="button" onClick={onRemove} disabled={removing} title={t.people.removeAccessTitle}
          style={{
            width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: '1px solid var(--arvo-border)', cursor: removing ? 'default' : 'pointer',
            color: 'var(--arvo-fg-soft)', opacity: removing ? 0.4 : 1, transition: 'border-color 140ms, color 140ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.color = 'var(--arvo-fg-soft)' }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path strokeLinecap="round" d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      ) : (
        <button
          type="button" onClick={onView} title={t.people.view}
          style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)' }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 2l4 4-4 4" />
          </svg>
        </button>
      )}
    </div>
  )
}

function ContactCard({
  contact, trips, groups, moments, onRemoved, onFriendChanged,
}: {
  contact: Contact
  trips: Trip[]
  groups: Group[]
  moments: MomentOption[]
  onRemoved: (memberId: number, type: string) => void
  onFriendChanged: () => void
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [togglingAutoAccept, setTogglingAutoAccept] = useState(false)
  const [shareMode, setShareMode] = useState<'trip' | 'group' | 'moment' | null>(null)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [shareTarget, setShareTarget] = useState<number | ''>('')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')

  async function removeTrip(ctx: TripContext) {
    if (!confirm(t.people.removeTripConfirm.replace('{email}', contact.email).replace('{title}', ctx.trip_title))) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/voyage/trips/${ctx.trip_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'voyage_trip')
    } finally {
      setRemoving(null)
    }
  }

  async function removeFinance(ctx: FinanceContext) {
    if (!confirm(t.people.removeCategoryConfirm.replace('{email}', contact.email).replace('{name}', ctx.group_name))) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/shared/groups/${ctx.group_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'shared_finance')
    } finally {
      setRemoving(null)
    }
  }

  async function removeMoment(ctx: MomentContext) {
    if (!confirm(t.people.removeMomentConfirm.replace('{email}', contact.email).replace('{name}', ctx.moment_name))) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/finances/moments/${ctx.moment_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'finance_moment')
    } finally {
      setRemoving(null)
    }
  }

  async function acceptFriend(ctx: FriendContext) {
    if (!ctx.accept_token) return
    setAccepting(true)
    try {
      await apiFetch('/people/invite/accept', { method: 'POST', body: JSON.stringify({ token: ctx.accept_token }) })
      onFriendChanged()
    } finally {
      setAccepting(false)
    }
  }

  async function unfriend(ctx: FriendContext) {
    if (!confirm(t.people.removeFriendConfirm.replace('{email}', contact.email))) return
    await apiFetch(`/people/friends/${ctx.friend_id}`, { method: 'DELETE' })
    onFriendChanged()
  }

  async function toggleAutoAccept(ctx: FriendContext) {
    if (!contact.user_id) return
    setTogglingAutoAccept(true)
    try {
      await apiFetch('/people/friends/auto-accept', {
        method: 'PATCH',
        body: JSON.stringify({ friend_user_id: contact.user_id, auto_accept_invites: !ctx.auto_accept_invites }),
      })
      onFriendChanged()
    } finally {
      setTogglingAutoAccept(false)
    }
  }

  async function confirmShare() {
    if (!shareMode || shareTarget === '') return
    setSharing(true)
    setShareError('')
    try {
      const path = shareMode === 'trip'
        ? `/voyage/trips/${shareTarget}/invite`
        : shareMode === 'moment'
        ? `/finances/moments/${shareTarget}/invite`
        : `/shared/groups/${shareTarget}/invite`
      await apiFetch(path, { method: 'POST', body: JSON.stringify({ email: contact.email }) })
      setShareMode(null)
      setShareTarget('')
      onFriendChanged()
    } catch (ex: unknown) {
      setShareError((ex as Error).message ?? t.people.shareErrorDefault)
    } finally {
      setSharing(false)
    }
  }

  const tripContexts    = contact.contexts.filter((c): c is TripContext    => c.type === 'voyage_trip')
  const financeContexts = contact.contexts.filter((c): c is FinanceContext => c.type === 'shared_finance')
  const momentContexts  = contact.contexts.filter((c): c is MomentContext  => c.type === 'finance_moment')
  const friendContexts  = contact.contexts.filter((c): c is FriendContext  => c.type === 'friend')
  const displayName = contact.name || contact.email

  // Estado de amizade resumido num único valor — vira o badge do cabeçalho
  // (era ali que "Ativo" conflitava com "Conectado" lá dentro: agora só
  // existe um lugar dizendo o status da relação).
  const incomingPending = friendContexts.find(c => c.friend_status === 'pending' && c.direction === 'shared_with_me' && c.accept_token)
  const mineFriendCtx = friendContexts.find(c => c.direction === 'owned_by_me')
  const outgoingPending = friendContexts.find(c => c.friend_status === 'pending' && c.direction === 'owned_by_me')
  const removableFriendCtx = mineFriendCtx ?? friendContexts[0]
  const isConnected = friendContexts.length > 0 && !incomingPending && !outgoingPending
  const friendState: 'incoming' | 'outgoing' | 'connected' | null =
    friendContexts.length === 0 ? null : incomingPending ? 'incoming' : outgoingPending ? 'outgoing' : 'connected'
  const auto = mineFriendCtx?.auto_accept_invites ?? false
  const isActive = friendState === 'connected' || contact.status === 'active'

  return (
    <div style={{
      background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
      borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px',
    }}>
      {/* Cabeçalho — sempre visível; o resto só aparece expandido (senão a
          lista fica enorme com várias pessoas) */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: expanded ? 16 : 0, textAlign: 'left' }}
      >
        <Avatar name={contact.name} email={contact.email} avatarUrl={contact.avatar_url} size={44} tone={isActive ? 'active' : 'neutral'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)',
            fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'baseline', gap: 6,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
            {contact.username && (
              <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>@{contact.username}</span>
            )}
          </p>
          <p style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1,
          }}>
            {contact.email}
          </p>
        </div>
        {/* Saldo agregado de despesas divididas — soma finance_moment_expense_shares de
            TODOS os Momentos compartilhados com essa pessoa, não só um. Positivo = ela
            me deve, negativo = eu devo a ela (ver GET /people no backend). */}
        {(contact.balances ?? []).map(b => (
          <span
            key={b.currency}
            title={b.amount > 0 ? t.people.balanceTheyOweYou : t.people.balanceYouOweThem}
            style={{
              flexShrink: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600,
              color: b.amount > 0 ? '#1F8A5B' : RED,
            }}
          >
            {b.amount > 0 ? '+' : '−'}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: b.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(b.amount))}
          </span>
        ))}
        {/* Badge único de relação — só aparece se houver conexão de amizade
            (direta ou pendente); o tooltip explica o que cada estado significa,
            já que "Ativo" sozinho não dizia nada sobre o que está conectado. */}
        {friendState && (
          <span
            title={friendState === 'connected' ? t.people.connectedTooltip : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
              padding: '3px 9px', borderRadius: 999,
              background: friendState === 'connected' ? 'rgba(31,138,91,0.10)' : 'rgba(200,184,154,0.14)',
              color: friendState === 'connected' ? '#1F8A5B' : GOLD,
              border: `1px solid ${friendState === 'connected' ? 'rgba(31,138,91,0.22)' : 'rgba(200,184,154,0.30)'}`,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor', flexShrink: 0 }} />
            {friendState === 'connected' ? t.people.connected : t.people.pending}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>

      {!expanded ? null : (<>
      {/* Convite de amizade pendente recebido — ação principal, fica no topo
          do corpo expandido, fora das listas de recursos. */}
      {incomingPending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(200,184,154,0.10)', border: '1px solid rgba(200,184,154,0.25)', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', flex: 1 }}>
            {t.people.invitedYouConnect}
          </span>
          <button
            type="button" onClick={() => acceptFriend(incomingPending)} disabled={accepting}
            className="arvo-btn arvo-btn--primary" style={{ fontSize: 11, padding: '4px 12px' }}
          >
            {accepting ? '…' : t.people.accept}
          </button>
        </div>
      )}

      {/* Viagens */}
      {tripContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 12, marginBottom: 4 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4,
          }}>
            {t.people.sectionTrips}
          </p>
          {tripContexts.map(ctx => (
            <ResourceRow
              key={ctx.member_id}
              icon={
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 11.5l3-7 4 3 3-5 4 3"/>
                  <path strokeLinecap="round" d="M1 14.5h14"/>
                </svg>
              }
              title={ctx.trip_title}
              role={ctx.role}
              status={ctx.member_status}
              ownedByMe={ctx.direction === 'owned_by_me'}
              onRemove={() => removeTrip(ctx)}
              onView={() => navigate(`/voyage/${ctx.trip_id}`)}
              removing={removing === ctx.member_id}
              pendingTitle={t.people.pending}
            />
          ))}
        </div>
      )}

      {/* Finanças compartilhadas */}
      {financeContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 12, marginBottom: 4 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4,
          }}>
            {t.people.sectionFinances}
          </p>
          {financeContexts.map(ctx => (
            <ResourceRow
              key={ctx.member_id}
              icon={
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6.5"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v6M6 7h3a1 1 0 010 2H6"/>
                </svg>
              }
              title={ctx.group_name}
              status={ctx.member_status}
              ownedByMe={ctx.direction === 'owned_by_me'}
              onRemove={() => removeFinance(ctx)}
              onView={() => navigate('/finances/shared')}
              removing={removing === ctx.member_id}
              pendingTitle={t.people.pending}
            />
          ))}
        </div>
      )}

      {/* Momentos compartilhados */}
      {momentContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 12, marginBottom: 4 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 4,
          }}>
            {t.people.sectionMoments}
          </p>
          {momentContexts.map(ctx => (
            <ResourceRow
              key={ctx.member_id}
              icon={
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5l1.8 4.2 4.6.4-3.5 3 1 4.5L8 11.3l-3.9 2.3 1-4.5-3.5-3 4.6-.4z"/>
                </svg>
              }
              title={ctx.moment_name}
              role={ctx.role}
              status={ctx.member_status}
              ownedByMe={ctx.direction === 'owned_by_me'}
              onRemove={() => removeMoment(ctx)}
              onView={() => navigate('/finances/moments')}
              removing={removing === ctx.member_id}
              pendingTitle={t.people.pending}
            />
          ))}
        </div>
      )}

      {/* Auto-aceite — só faz sentido pra quem já está conectado */}
      {isConnected && contact.user_id && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '12px', borderRadius: 10, background: 'var(--arvo-hover-bg)' }}>
          <Toggle
            checked={auto} disabled={togglingAutoAccept}
            onChange={() => toggleAutoAccept(mineFriendCtx ?? { type: 'friend', direction: 'owned_by_me', friend_id: 0, friend_status: 'active', auto_accept_invites: false })}
          />
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.4 }}>
            {t.people.autoAcceptLabel}
          </span>
        </div>
      )}

      {/* Compartilhar — um botão só, com um menu compacto em vez de 3 textos
          soltos disputando espaço. */}
      <div style={{ borderTop: '1px solid var(--arvo-border-soft)', marginTop: 14, paddingTop: 14 }}>
        {shareMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={shareTarget}
              onChange={e => setShareTarget(e.target.value ? Number(e.target.value) : '')}
              style={{ flex: 1, fontSize: 12.5, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }}
            >
              <option value="">{shareMode === 'trip' ? t.people.selectTrip : shareMode === 'moment' ? t.people.selectMoment : t.people.selectCategory}</option>
              {(shareMode === 'trip' ? trips : shareMode === 'moment' ? moments : groups).map(item => (
                <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>
              ))}
            </select>
            <button type="button" onClick={confirmShare} disabled={sharing || shareTarget === ''} className="arvo-btn arvo-btn--primary" style={{ fontSize: 11, padding: '5px 12px' }}>
              {sharing ? '…' : t.people.inviteCta}
            </button>
            <button type="button" onClick={() => { setShareMode(null); setShareError('') }} style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              {t.people.cancel}
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <button
              type="button" onClick={() => setShowShareMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.02em',
                padding: '6px 14px', borderRadius: 999, background: 'none', border: '1px solid var(--arvo-border)',
                color: 'var(--arvo-fg-muted)', cursor: 'pointer',
              }}
            >
              {t.people.shareButton}
            </button>
            {showShareMenu && (
              <>
                <div onClick={() => setShowShareMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, minWidth: 190,
                  background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 10,
                  boxShadow: 'var(--arvo-shadow-lg)', overflow: 'hidden',
                }}>
                  {([
                    ['trip', t.people.shareTrip],
                    ['group', t.people.shareCategory],
                    ['moment', t.people.shareMoment],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode} type="button"
                      onClick={() => { setShareMode(mode); setShowShareMenu(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {shareError && <p style={{ fontSize: 11, color: RED, marginTop: 8 }}>{shareError}</p>}
      </div>

      {/* Remover pessoa — única ação que de fato desfaz a conexão (e revoga
          todo compartilhamento); separada das ações de "remover acesso a
          este recurso" (os × nas listas acima) pra não confundir as duas. */}
      {friendContexts.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)' }}>
          <button
            type="button" onClick={() => unfriend(removableFriendCtx)}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, fontFamily: 'var(--arvo-font-body)', fontSize: 12,
              background: 'none', border: '1px solid rgba(214,59,47,0.30)', color: RED, cursor: 'pointer',
            }}
          >
            {t.people.removePersonButton}
          </button>
        </div>
      )}
      </>)}
    </div>
  )
}

export default function PeoplePage() {
  const { t } = useI18n()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [trips, setTrips]   = useState<Trip[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [moments, setMoments] = useState<MomentOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await apiFetch<{ contacts: Contact[] }>('/people')
      setContacts(data.contacts)
    } catch (ex: unknown) {
      setLoadError((ex as Error).message ?? t.people.loadErrorDefault)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    apiFetch<{ trips: Trip[] }>('/voyage/trips').then(r => setTrips(r.trips)).catch(() => {})
    apiFetch<Group[]>('/shared/groups').then(setGroups).catch(() => {})
    apiFetch<MomentOption[]>('/finances/moments-for-picker').then(setMoments).catch(() => {})
  }, [])

  const isEmailLike = /\S+@\S+\.\S+/.test(inviteEmail)

  useEffect(() => {
    const query = inviteEmail.trim().replace(/^@/, '')
    if (isEmailLike || query.length < 2) { setSuggestions([]); return }
    const handle = setTimeout(() => {
      apiFetch<UserSuggestion[]>(`/people/search?q=${encodeURIComponent(query)}`)
        .then(r => { setSuggestions(r); setShowSuggestions(true) })
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [inviteEmail, isEmailLike])

  async function sendInvite(payload: { email?: string; username?: string }) {
    setInviting(true)
    setInviteError('')
    try {
      await apiFetch('/people/invite', { method: 'POST', body: JSON.stringify(payload) })
      setInviteEmail('')
      setSuggestions([])
      setShowSuggestions(false)
      load()
    } catch (ex: unknown) {
      setInviteError((ex as Error).message ?? t.people.inviteErrorDefault)
    } finally {
      setInviting(false)
    }
  }

  function pickSuggestion(s: UserSuggestion) {
    sendInvite({ username: s.username })
  }

  function handleInvite(e: FormEvent) {
    e.preventDefault()
    if (isEmailLike) { sendInvite({ email: inviteEmail.trim() }); return }
    const username = inviteEmail.trim().replace(/^@/, '')
    if (username.length < 3) return
    sendInvite({ username })
  }

  function handleRemoved(memberId: number) {
    setContacts(prev =>
      prev
        .map(c => ({ ...c, contexts: c.contexts.filter(ctx => !('member_id' in ctx) || ctx.member_id !== memberId) }))
        .filter(c => c.contexts.length > 0)
    )
  }

  const activeCount  = contacts.filter(c => c.status === 'active').length
  const pendingCount = contacts.filter(c => c.status === 'pending').length

  return (
    <div className="max-w-2xl mx-auto px-4 2xl:px-8 py-6">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.30em',
          textTransform: 'uppercase', color: RED, marginBottom: 6,
        }}>
          ARVO
        </p>
        <h1 style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 28, letterSpacing: '0.08em',
          color: 'var(--arvo-fg)', marginBottom: 10,
        }}>
          {t.nav.people}
        </h1>
        {!loading && contacts.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {activeCount > 0 && (
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: '#1F8A5B',
                background: 'rgba(31,138,91,0.08)', padding: '2px 10px', borderRadius: 999,
                border: '1px solid rgba(31,138,91,0.16)',
              }}>
                {(activeCount === 1 ? t.people.nActiveOne : t.people.nActiveMany).replace('{n}', String(activeCount))}
              </span>
            )}
            {pendingCount > 0 && (
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: GOLD,
                background: 'rgba(200,184,154,0.10)', padding: '2px 10px', borderRadius: 999,
                border: '1px solid rgba(200,184,154,0.20)',
              }}>
                {(pendingCount === 1 ? t.people.nPendingOne : t.people.nPendingMany).replace('{n}', String(pendingCount))}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Convidar amigo */}
      <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative' }}>
        <input
          type="text" required placeholder={t.people.inviteFormPlaceholder}
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          style={{
            flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '8px 12px',
            borderRadius: 8, border: '1px solid var(--arvo-border)',
            background: 'var(--arvo-surface)', color: 'var(--arvo-fg)',
          }}
        />
        <button type="submit" disabled={inviting} className="arvo-btn arvo-btn--primary arvo-btn--sm" style={{ flexShrink: 0 }}>
          {inviting ? '…' : t.people.inviteFormButton}
        </button>

        {showSuggestions && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 90, marginTop: 4, zIndex: 10,
            background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
            borderRadius: 10, boxShadow: 'var(--arvo-shadow-sm)', overflow: 'hidden',
          }}>
            {suggestions.map(s => (
              <button
                type="button" key={s.user_id}
                onClick={() => pickSuggestion(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <Avatar name={s.name} avatarUrl={s.avatar_url} size={28} />
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)' }}>
                  {s.name || `@${s.username}`}
                </span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)' }}>
                  @{s.username}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>
      {inviteError && <p style={{ fontSize: 12, color: RED, marginBottom: 16 }}>{inviteError}</p>}

      {loadError ? (
        <div style={{
          padding: '16px 18px', borderRadius: 10, border: '1px solid rgba(214,59,47,0.25)',
          background: 'rgba(214,59,47,0.06)', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: RED }}>
            {t.people.loadErrorPrefix} {loadError}
          </p>
          <button type="button" onClick={() => load()} className="arvo-btn arvo-btn--primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
            {t.people.retry}
          </button>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => (
            <div key={i} style={{
              height: 160, borderRadius: 14,
              background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite',
            }} />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 320, gap: 16,
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="rgba(200,184,154,0.30)" strokeWidth="1.4">
            <circle cx="19" cy="17" r="7"/>
            <path strokeLinecap="round" d="M4 42c0-8.3 6.7-15 15-15"/>
            <circle cx="34" cy="19" r="5.5"/>
            <path strokeLinecap="round" d="M44 42c0-5.5-4.5-10-10-10"/>
          </svg>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 20, letterSpacing: '0.06em',
            color: 'var(--arvo-fg-muted)', textAlign: 'center',
          }}>
            {t.people.emptyTitle}
          </p>
          <p style={{
            fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14,
            color: GOLD, textAlign: 'center', maxWidth: 300, lineHeight: 1.6,
          }}>
            {t.people.emptyBody}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map((contact, i) => (
            <div key={contact.email} style={{ animation: 'fadeUp 320ms cubic-bezier(0.22,0.61,0.36,1) both', animationDelay: `${i * 50}ms` }}>
              <ContactCard contact={contact} trips={trips} groups={groups} moments={moments} onRemoved={handleRemoved} onFriendChanged={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
