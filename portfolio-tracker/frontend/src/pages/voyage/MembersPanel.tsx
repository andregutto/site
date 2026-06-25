import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import Avatar from './_shared/Avatar'
import { RoleChip, StatusChip } from './_shared/Chips'

interface Member {
  id: number
  user_id: string | null
  invite_email: string | null
  role: 'owner' | 'editor' | 'viewer'
  status: 'pending' | 'active' | 'left'
  joined_at: string | null
  display: { name: string; email: string; avatar_url?: string }
}

interface Friend {
  email: string
  name?: string
  avatar_url?: string
  user_id: string | null
}

interface UserSuggestion { user_id: string; username: string; name?: string; avatar_url?: string }

interface Props {
  tripId: number
  isOwner: boolean
}

const RED = '#D63B2F'

export default function MembersPanel({ tripId, isOwner }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [friends, setFriends] = useState<Friend[]>([])
  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ url: string } | null>(null)
  const [inviteDirectOk, setInviteDirectOk] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<{ members: Member[] }>(`/voyage/trips/${tripId}/members`)
      setMembers(data.members)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tripId])

  // Atalho de "convidar amigos": reaproveita a lista unificada de /people,
  // filtrando só conexões já confirmadas — sem isso o owner teria que
  // digitar o e-mail/@ de alguém que já está conectado na plataforma.
  useEffect(() => {
    apiFetch<{ contacts: { email: string; name?: string; avatar_url?: string; user_id: string | null; contexts: { type: string; friend_status?: string }[] }[] }>('/people')
      .then(data => {
        const list = data.contacts
          .filter(c => c.contexts.some(ctx => ctx.type === 'friend' && (ctx as any).friend_status === 'active'))
          .map(c => ({ email: c.email, name: c.name, avatar_url: c.avatar_url, user_id: c.user_id }))
        setFriends(list)
      })
      .catch(() => {})
  }, [])

  const isEmailLike = /\S+@\S+\.\S+/.test(inviteQuery)
  const memberEmails = new Set(members.map(m => m.invite_email).filter(Boolean))
  const availableFriends = friends.filter(f => !memberEmails.has(f.email))

  useEffect(() => {
    const query = inviteQuery.trim().replace(/^@/, '')
    if (isEmailLike || query.length < 2) { setSuggestions([]); return }
    const handle = setTimeout(() => {
      apiFetch<UserSuggestion[]>(`/people/search?q=${encodeURIComponent(query)}`)
        .then(r => { setSuggestions(r); setShowSuggestions(true) })
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [inviteQuery, isEmailLike])

  async function sendInvite(payload: { email?: string; username?: string }) {
    setInviting(true)
    setInviteError('')
    setInviteResult(null)
    setInviteDirectOk(false)
    try {
      const data = await apiFetch<{ direct: boolean; invite_url?: string }>(`/voyage/trips/${tripId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, role: inviteRole }),
      })
      if (data.direct) {
        setInviteDirectOk(true)
      } else if (data.invite_url) {
        setInviteResult({ url: data.invite_url })
      }
      setInviteQuery('')
      setSuggestions([])
      setShowSuggestions(false)
      load()
    } catch (ex: unknown) {
      setInviteError((ex as Error).message ?? 'Erro ao convidar')
    } finally {
      setInviting(false)
    }
  }

  function inviteFriend(f: Friend) {
    if (f.user_id) {
      // já tem conta — convite direto sem precisar resolver @/e-mail
      apiFetch(`/voyage/trips/${tripId}/invite`, { method: 'POST', body: JSON.stringify({ email: f.email, role: inviteRole }) })
        .then(() => { setInviteDirectOk(true); load() })
        .catch((ex: unknown) => setInviteError((ex as Error).message ?? 'Erro ao convidar'))
    } else {
      sendInvite({ email: f.email })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEmailLike) { sendInvite({ email: inviteQuery.trim() }); return }
    const username = inviteQuery.trim().replace(/^@/, '')
    if (username.length < 3) return
    sendInvite({ username })
  }

  async function removeMember(memberId: number) {
    setRemoving(memberId)
    try {
      await apiFetch(`/voyage/trips/${tripId}/members/${memberId}`, { method: 'DELETE' })
      setMembers(ms => ms.filter(m => m.id !== memberId))
    } finally {
      setRemoving(null)
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fieldStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 3,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
    outline: 'none',
  }

  return (
    <div>
      {/* Member list */}
      {loading ? (
        <div style={{ height: 40, background: 'var(--arvo-hover-bg)', borderRadius: 8, animation: 'pulse 1.5s ease infinite' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={m.display.name} email={m.display.email} avatarUrl={m.display.avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.display.name}
                </p>
              </div>
              {m.status !== 'active' && <StatusChip status={m.status} />}
              <RoleChip role={m.role} />
              {isOwner && m.role !== 'owner' && (
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  disabled={removing === m.id}
                  style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', borderRadius: 4, opacity: removing === m.id ? 0.4 : 1 }}
                  title="Remover"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite form (owner/editor only) */}
      {isOwner && (
        <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
              Convidar
            </p>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}
              style={{ ...fieldStyle, padding: '4px 8px', fontSize: 11.5, minWidth: 76 }}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Leitor</option>
            </select>
          </div>

          {/* Atalho: amigos já conectados na plataforma */}
          {availableFriends.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {availableFriends.map(f => (
                <button
                  key={f.email}
                  type="button"
                  onClick={() => inviteFriend(f)}
                  title={`Convidar ${f.name || f.email} como ${inviteRole === 'editor' ? 'editor' : 'leitor'}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px',
                    borderRadius: 999, border: '1px solid var(--arvo-border)', background: 'var(--arvo-hover-bg)',
                    cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg)',
                  }}
                >
                  <Avatar name={f.name} email={f.email} avatarUrl={f.avatar_url} size={20} />
                  {f.name || f.email}
                  <span style={{ color: 'var(--arvo-fg-soft)' }}>+</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                style={{ ...fieldStyle, flex: 1 }}
                type="text"
                placeholder="email@exemplo.com ou @usuario"
                value={inviteQuery}
                onChange={e => setInviteQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              <button
                type="submit"
                disabled={inviting || (!isEmailLike && inviteQuery.trim().replace(/^@/, '').length < 3)}
                style={{
                  padding: '7px 14px', borderRadius: 6, flexShrink: 0,
                  background: inviting ? 'var(--arvo-hover-bg)' : 'var(--arvo-fg)',
                  color: inviting ? 'var(--arvo-fg-muted)' : 'var(--arvo-bg)',
                  border: 'none', cursor: inviting ? 'default' : 'pointer',
                  fontFamily: 'var(--arvo-font-body)', fontSize: 12, transition: 'all 160ms',
                }}
              >
                {inviting ? '…' : 'Convidar'}
              </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: -4, zIndex: 30,
                background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
                borderRadius: 10, boxShadow: 'var(--arvo-shadow-md)', overflow: 'hidden',
              }}>
                {suggestions.map(s => (
                  <button
                    type="button" key={s.user_id}
                    onClick={() => sendInvite({ username: s.username })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <Avatar name={s.name} avatarUrl={s.avatar_url} size={26} />
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>
                      {s.name || `@${s.username}`}
                    </span>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                      @{s.username}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {inviteError && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, marginTop: 8 }}>{inviteError}</p>}

          {inviteDirectOk && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: '#1F8A5B', marginTop: 10 }}>
              ✓ Adicionado direto — já é um membro ativo da viagem.
            </p>
          )}

          {/* Invite link result — só aparece quando o destinatário ainda não tem conta */}
          {inviteResult && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 6 }}>
                Sem conta no Arvo ainda — link de convite gerado
              </p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  readOnly
                  value={inviteResult.url}
                  style={{ ...fieldStyle, flex: 1, fontSize: 11, color: 'var(--arvo-fg-soft)' }}
                />
                <button
                  type="button"
                  onClick={() => copyLink(inviteResult.url)}
                  style={{ padding: '6px 12px', borderRadius: 5, background: copied ? '#1F8A5B' : 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, flexShrink: 0, transition: 'background 200ms' }}
                >
                  {copied ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
