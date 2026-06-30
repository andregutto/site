import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import Avatar from './voyage/_shared/Avatar'
import { RoleChip, StatusChip } from './voyage/_shared/Chips'

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
}

type Context = TripContext | FinanceContext | MomentContext | FriendContext

interface Contact {
  email: string
  name?: string
  username?: string
  avatar_url?: string
  user_id: string | null
  status: 'active' | 'pending'
  contexts: Context[]
}

interface Trip { id: number; title: string }
interface Group { id: number; name: string }
interface UserSuggestion { user_id: string; username: string; name?: string; avatar_url?: string }

// ── Etiqueta de direção ───────────────────────────────────────────────────────
function DirectionTag({ direction }: { direction: Direction }) {
  if (direction === 'shared_with_me') return (
    <span style={{
      fontFamily: 'var(--arvo-font-display)', fontSize: 8.5, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--arvo-fg-soft)',
      background: 'var(--arvo-hover-bg)', padding: '2px 6px', borderRadius: 4,
      flexShrink: 0,
    }}>
      convidado
    </span>
  )
  return null
}

function ContactCard({
  contact, trips, groups, onRemoved, onFriendChanged,
}: {
  contact: Contact
  trips: Trip[]
  groups: Group[]
  onRemoved: (memberId: number, type: string) => void
  onFriendChanged: () => void
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [shareMode, setShareMode] = useState<'trip' | 'group' | null>(null)
  const [shareTarget, setShareTarget] = useState<number | ''>('')
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState('')

  async function removeTrip(ctx: TripContext) {
    if (!confirm(`Remover acesso de ${contact.email} à viagem "${ctx.trip_title}"?`)) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/voyage/trips/${ctx.trip_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'voyage_trip')
    } finally {
      setRemoving(null)
    }
  }

  async function removeMoment(ctx: MomentContext) {
    if (!confirm(`Remover acesso de ${contact.email} ao momento "${ctx.moment_name}"? As transações dele(a) neste momento serão apagadas.`)) return
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
    if (!confirm(`Remover ${contact.email} de pessoas?`)) return
    await apiFetch(`/people/friends/${ctx.friend_id}`, { method: 'DELETE' })
    onFriendChanged()
  }

  async function confirmShare() {
    if (!shareMode || shareTarget === '') return
    setSharing(true)
    setShareError('')
    try {
      const path = shareMode === 'trip'
        ? `/voyage/trips/${shareTarget}/invite`
        : `/shared/groups/${shareTarget}/invite`
      await apiFetch(path, { method: 'POST', body: JSON.stringify({ email: contact.email }) })
      setShareMode(null)
      setShareTarget('')
      onFriendChanged()
    } catch (ex: unknown) {
      setShareError((ex as Error).message ?? 'Erro ao compartilhar')
    } finally {
      setSharing(false)
    }
  }

  const isActive = contact.status === 'active'
  const tripContexts    = contact.contexts.filter((c): c is TripContext    => c.type === 'voyage_trip')
  const financeContexts = contact.contexts.filter((c): c is FinanceContext => c.type === 'shared_finance')
  const momentContexts  = contact.contexts.filter((c): c is MomentContext  => c.type === 'finance_moment')
  const friendContexts  = contact.contexts.filter((c): c is FriendContext  => c.type === 'friend')
  const displayName = contact.name || contact.email

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
        <StatusChip status={contact.status} />
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--arvo-fg-soft)" strokeWidth="1.5" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>

      {!expanded ? null : (<>
      {/* Viagens */}
      {tripContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14, marginBottom: financeContexts.length > 0 ? 14 : 0 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10,
          }}>
            Viagens
          </p>
          {tripContexts.map(ctx => (
            <div key={ctx.member_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid var(--arvo-border-soft)',
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-fg-muted)" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 11.5l3-7 4 3 3-5 4 3"/>
                <path strokeLinecap="round" d="M1 14.5h14"/>
              </svg>
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {ctx.trip_title}
              </span>
              <DirectionTag direction={ctx.direction} />
              <RoleChip role={ctx.role} />
              {ctx.member_status === 'pending' && (
                <span style={{
                  fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: GOLD,
                }}>
                  pendente
                </span>
              )}
              {ctx.direction === 'owned_by_me' ? (
                <button
                  type="button"
                  onClick={() => removeTrip(ctx)}
                  disabled={removing === ctx.member_id}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED,
                    background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                    opacity: removing === ctx.member_id ? 0.4 : 1, padding: '2px 0',
                  }}
                >
                  {removing === ctx.member_id ? '…' : 'Remover'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/voyage/${ctx.trip_id}`)}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)',
                    background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 0',
                  }}
                >
                  Ver →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Finanças compartilhadas */}
      {financeContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10,
          }}>
            Finanças
          </p>
          {financeContexts.map(ctx => (
            <div key={ctx.member_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid var(--arvo-border-soft)',
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-fg-muted)" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6.5"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v6M6 7h3a1 1 0 010 2H6"/>
              </svg>
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {ctx.group_name}
              </span>
              <DirectionTag direction={ctx.direction} />
              {ctx.member_status === 'pending' && (
                <span style={{
                  fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: GOLD,
                }}>
                  pendente
                </span>
              )}
              <button
                type="button"
                onClick={() => navigate('/finances/shared')}
                style={{
                  fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)',
                  background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 0',
                }}
              >
                {ctx.direction === 'owned_by_me' ? 'Gerir →' : 'Ver →'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Momentos compartilhados */}
      {momentContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14, marginBottom: 14 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10,
          }}>
            Momentos compartilhados
          </p>
          {momentContexts.map(ctx => (
            <div key={ctx.member_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: '1px solid var(--arvo-border-soft)',
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-fg-muted)" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5l1.8 4.2 4.6.4-3.5 3 1 4.5L8 11.3l-3.9 2.3 1-4.5-3.5-3 4.6-.4z"/>
              </svg>
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {ctx.moment_name}
              </span>
              <DirectionTag direction={ctx.direction} />
              <RoleChip role={ctx.role} />
              {ctx.member_status === 'pending' && (
                <span style={{
                  fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: GOLD,
                }}>
                  pendente
                </span>
              )}
              {ctx.direction === 'owned_by_me' ? (
                <button
                  type="button"
                  onClick={() => removeMoment(ctx)}
                  disabled={removing === ctx.member_id}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED,
                    background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                    opacity: removing === ctx.member_id ? 0.4 : 1, padding: '2px 0',
                  }}
                >
                  {removing === ctx.member_id ? '…' : 'Remover'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/finances/moments')}
                  style={{
                    fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)',
                    background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 0',
                  }}
                >
                  Ver →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Amizade direta */}
      {friendContexts.length > 0 && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14, marginBottom: 14 }}>
          {friendContexts.map(ctx => (
            <div key={ctx.friend_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              {ctx.friend_status === 'pending' && ctx.direction === 'shared_with_me' ? (
                <>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', flex: 1 }}>
                    Convidou você para se conectar
                  </span>
                  <button
                    type="button" onClick={() => acceptFriend(ctx)} disabled={accepting}
                    className="arvo-btn arvo-btn--primary" style={{ fontSize: 11, padding: '4px 12px' }}
                  >
                    {accepting ? '…' : 'Aceitar'}
                  </button>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', flex: 1 }}>
                    {ctx.friend_status === 'pending' ? 'Convite enviado, aguardando' : 'Conectado'}
                  </span>
                  <button
                    type="button" onClick={() => unfriend(ctx)}
                    style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Remover
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compartilhar viagem/categoria com esta pessoa */}
      <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shareMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={shareTarget}
              onChange={e => setShareTarget(e.target.value ? Number(e.target.value) : '')}
              style={{ flex: 1, fontSize: 12.5, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }}
            >
              <option value="">{shareMode === 'trip' ? 'Selecione a viagem' : 'Selecione a categoria'}</option>
              {(shareMode === 'trip' ? trips : groups).map(item => (
                <option key={item.id} value={item.id}>{'title' in item ? item.title : item.name}</option>
              ))}
            </select>
            <button type="button" onClick={confirmShare} disabled={sharing || shareTarget === ''} className="arvo-btn arvo-btn--primary" style={{ fontSize: 11, padding: '5px 12px' }}>
              {sharing ? '…' : 'Convidar'}
            </button>
            <button type="button" onClick={() => { setShareMode(null); setShareError('') }} style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16 }}>
            <button type="button" onClick={() => setShareMode('trip')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              + Compartilhar viagem
            </button>
            <button type="button" onClick={() => setShareMode('group')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              + Compartilhar categoria
            </button>
          </div>
        )}
        {shareError && <p style={{ fontSize: 11, color: RED }}>{shareError}</p>}
      </div>
      </>)}
    </div>
  )
}

export default function PeoplePage() {
  const { t } = useI18n()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [trips, setTrips]   = useState<Trip[]>([])
  const [groups, setGroups] = useState<Group[]>([])
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
      setLoadError((ex as Error).message ?? 'Erro ao carregar pessoas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    apiFetch<{ trips: Trip[] }>('/voyage/trips').then(r => setTrips(r.trips)).catch(() => {})
    apiFetch<Group[]>('/shared/groups').then(setGroups).catch(() => {})
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
      setInviteError((ex as Error).message ?? 'Erro ao convidar')
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
                {activeCount} ativ{activeCount === 1 ? 'o' : 'os'}
              </span>
            )}
            {pendingCount > 0 && (
              <span style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: GOLD,
                background: 'rgba(200,184,154,0.10)', padding: '2px 10px', borderRadius: 999,
                border: '1px solid rgba(200,184,154,0.20)',
              }}>
                {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Convidar amigo */}
      <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, marginBottom: 8, position: 'relative' }}>
        <input
          type="text" required placeholder="email@exemplo.com ou @usuario"
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          style={{
            flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '10px 14px',
            borderRadius: 10, border: '1px solid var(--arvo-border)',
            background: 'var(--arvo-surface)', color: 'var(--arvo-fg)',
          }}
        />
        <button type="submit" disabled={inviting} className="arvo-btn arvo-btn--primary" style={{ flexShrink: 0 }}>
          {inviting ? '…' : '+ Convidar'}
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
            Não foi possível carregar suas pessoas: {loadError}
          </p>
          <button type="button" onClick={() => load()} className="arvo-btn arvo-btn--primary" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
            Tentar de novo
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
            Nenhuma conexão ainda
          </p>
          <p style={{
            fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14,
            color: GOLD, textAlign: 'center', maxWidth: 300, lineHeight: 1.6,
          }}>
            Convide alguém pelo e-mail acima para começar.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map((contact, i) => (
            <div key={contact.email} style={{ animation: 'fadeUp 320ms cubic-bezier(0.22,0.61,0.36,1) both', animationDelay: `${i * 50}ms` }}>
              <ContactCard contact={contact} trips={trips} groups={groups} onRemoved={handleRemoved} onFriendChanged={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
