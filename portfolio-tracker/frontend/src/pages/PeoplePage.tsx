import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'

interface Context {
  type: 'voyage_trip'
  trip_id: number
  trip_title: string
  role: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface Contact {
  email: string
  user_id: string | null
  status: 'active' | 'pending'
  contexts: Context[]
}

function initials(email: string): string {
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : local.slice(0, 2).toUpperCase()
}

function RoleChip({ role }: { role: string }) {
  const label = role === 'editor' ? 'Editor' : 'Leitor'
  const color = role === 'editor' ? '#1B4FD8' : 'var(--arvo-fg-muted)'
  const bg    = role === 'editor' ? 'rgba(27,79,216,0.08)' : 'var(--arvo-hover-bg)'
  return (
    <span style={{
      fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em',
      textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999,
      background: bg, color, border: `1px solid ${role === 'editor' ? 'rgba(27,79,216,0.18)' : 'var(--arvo-border)'}`,
    }}>
      {label}
    </span>
  )
}

function ContactCard({ contact, onRemoved }: { contact: Contact; onRemoved: (memberId: number) => void }) {
  const [removing, setRemoving] = useState<number | null>(null)

  async function remove(ctx: Context) {
    if (!confirm(`Remover acesso de ${contact.email} à viagem "${ctx.trip_title}"?`)) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/api/voyage/trips/${ctx.trip_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id)
    } finally {
      setRemoving(null)
    }
  }

  const isActive = contact.status === 'active'

  return (
    <div style={{
      background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
      borderRadius: 14, padding: '20px 22px',
    }}>
      {/* Header do contato */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: isActive ? 'rgba(214,59,47,0.10)' : 'var(--arvo-hover-bg)',
          border: `1px solid ${isActive ? 'rgba(214,59,47,0.20)' : 'var(--arvo-border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--arvo-font-display)', fontSize: 14, letterSpacing: '0.06em',
            color: isActive ? RED : 'var(--arvo-fg-muted)',
          }}>
            {initials(contact.email)}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)',
            fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {contact.email}
          </p>
        </div>
        <span style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.20em',
          textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999,
          background: isActive ? 'rgba(31,138,91,0.10)' : 'rgba(200,184,154,0.12)',
          color: isActive ? '#1F8A5B' : GOLD,
          border: `1px solid ${isActive ? 'rgba(31,138,91,0.20)' : 'rgba(200,184,154,0.25)'}`,
          flexShrink: 0,
        }}>
          {isActive ? 'Ativo' : 'Pendente'}
        </span>
      </div>

      {/* Contextos */}
      <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <p style={{
          fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10,
        }}>
          Viagens compartilhadas
        </p>
        {contact.contexts.map(ctx => (
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
            <RoleChip role={ctx.role} />
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
              onClick={() => remove(ctx)}
              disabled={removing === ctx.member_id}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED,
                background: 'none', border: 'none', cursor: 'pointer',
                opacity: removing === ctx.member_id ? 0.4 : 1, padding: '2px 0', flexShrink: 0,
              }}
            >
              {removing === ctx.member_id ? '…' : 'Remover'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PeoplePage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ contacts: Contact[] }>('/api/people')
      setContacts(data.contacts)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleRemoved(memberId: number) {
    setContacts(prev =>
      prev
        .map(c => ({ ...c, contexts: c.contexts.filter(ctx => ctx.member_id !== memberId) }))
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
          Pessoas
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

      {/* Content */}
      {loading ? (
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
            <path strokeLinecap="round" d="M34 28a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/>
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
            Convide pessoas para suas viagens — elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map(contact => (
            <ContactCard
              key={contact.email}
              contact={contact}
              onRemoved={handleRemoved}
            />
          ))}
        </div>
      )}

      {/* Future messaging notice */}
      {contacts.length > 0 && (
        <div style={{
          marginTop: 28, padding: '14px 18px', borderRadius: 10,
          border: '1px solid var(--arvo-border-soft)',
          background: 'var(--arvo-hover-bg)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--arvo-fg-muted)" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 3h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4l-3 2V4a1 1 0 0 1 1-1z"/>
          </svg>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)' }}>
            Mensagens entre conexões — em breve.
          </p>
        </div>
      )}
    </div>
  )
}
