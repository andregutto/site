import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import Avatar from './_shared/Avatar'
import { RoleChip, StatusChip } from './_shared/Chips'

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.10)'

interface Member {
  id: number
  user_id: string | null
  invite_email: string | null
  role: 'owner' | 'editor' | 'viewer'
  status: 'pending' | 'active' | 'left'
  joined_at: string | null
  display: { name: string; email: string; avatar_url?: string }
}

interface Props {
  tripId: number
  isOwner: boolean
}

export default function MembersPanel({ tripId, isOwner }: Props) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<{ members: Member[] }>(`/api/voyage/trips/${tripId}/members`)
      setMembers(data.members)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tripId])

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.includes('@')) return
    setInviting(true)
    setInviteResult(null)
    try {
      const data = await apiFetch<{ invite_url: string }>(`/api/voyage/trips/${tripId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      setInviteResult({ url: data.invite_url })
      setInviteEmail('')
      load()
    } catch {
      // ignore
    } finally {
      setInviting(false)
    }
  }

  async function removeMember(memberId: number) {
    setRemoving(memberId)
    try {
      await apiFetch(`/api/voyage/trips/${tripId}/members/${memberId}`, { method: 'DELETE' })
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
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 16 }}>
        Colaboradores
      </p>

      {/* Member list */}
      {loading ? (
        <div style={{ height: 40, background: 'var(--arvo-hover-bg)', borderRadius: 8, animation: 'pulse 1.5s ease infinite' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={m.display.name} email={m.display.email} />
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
        <form onSubmit={sendInvite} style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14 }}>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
            Convidar
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              style={{ ...fieldStyle, flex: 1 }}
              type="email"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
            {/* Role toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--arvo-border)', borderRadius: 4, overflow: 'hidden' }}>
              {(['editor', 'viewer'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  style={{
                    padding: '6px 10px', background: inviteRole === r ? RED : 'transparent',
                    color: inviteRole === r ? '#fff' : 'var(--arvo-fg-muted)',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.12em',
                    textTransform: 'uppercase', transition: 'all 160ms',
                  }}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={inviting || !inviteEmail.includes('@')}
            style={{
              width: '100%', padding: '7px 0', borderRadius: 6,
              background: inviting || !inviteEmail.includes('@') ? 'var(--arvo-hover-bg)' : RED,
              color: inviting || !inviteEmail.includes('@') ? 'var(--arvo-fg-muted)' : '#fff',
              border: 'none', cursor: inviting || !inviteEmail.includes('@') ? 'default' : 'pointer',
              fontFamily: 'var(--arvo-font-body)', fontSize: 12, transition: 'all 160ms',
            }}
          >
            {inviting ? 'Enviando…' : 'Gerar link de convite'}
          </button>

          {/* Invite link result */}
          {inviteResult && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: RED_SOFT, border: `1px solid ${RED}30` }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: RED, marginBottom: 6 }}>
                Link gerado
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
                  style={{ padding: '6px 12px', borderRadius: 5, background: copied ? '#1F8A5B' : RED, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, flexShrink: 0, transition: 'background 200ms' }}
                >
                  {copied ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
