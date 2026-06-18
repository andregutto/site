import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import Avatar from './voyage/_shared/Avatar'
import { RoleChip, StatusChip } from './voyage/_shared/Chips'

const RED  = '#D63B2F'
const GOLD = '#C8B89A'

interface TripContext {
  type: 'voyage_trip'
  trip_id: number
  trip_title: string
  role: string
  member_id: number
  member_status: 'active' | 'pending'
}

interface FinanceContext {
  type: 'shared_finance'
  group_id: number
  group_name: string
  member_id: number
  member_status: 'active' | 'pending'
}

type Context = TripContext | FinanceContext

interface Contact {
  email: string
  user_id: string | null
  status: 'active' | 'pending'
  contexts: Context[]
}


function ContactCard({ contact, onRemoved }: { contact: Contact; onRemoved: (memberId: number, type: string) => void }) {
  const navigate = useNavigate()
  const [removing, setRemoving] = useState<number | null>(null)

  async function removeTrip(ctx: TripContext) {
    if (!confirm(`Remover acesso de ${contact.email} à viagem "${ctx.trip_title}"?`)) return
    setRemoving(ctx.member_id)
    try {
      await apiFetch(`/api/voyage/trips/${ctx.trip_id}/members/${ctx.member_id}`, { method: 'DELETE' })
      onRemoved(ctx.member_id, 'voyage_trip')
    } finally {
      setRemoving(null)
    }
  }

  const isActive = contact.status === 'active'
  const tripContexts    = contact.contexts.filter((c): c is TripContext    => c.type === 'voyage_trip')
  const financeContexts = contact.contexts.filter((c): c is FinanceContext => c.type === 'shared_finance')

  return (
    <div style={{
      background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
      borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px',
    }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Avatar email={contact.email} size={44} tone={isActive ? 'active' : 'neutral'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)',
            fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {contact.email}
          </p>
        </div>
        <StatusChip status={contact.status} />
      </div>

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
                Gerir →
              </button>
            </div>
          ))}
        </div>
      )}
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
            Convide pessoas para suas viagens ou compartilhe categorias de finanças.
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

      {contacts.length > 0 && (
        <div style={{
          marginTop: 28, padding: '14px 18px', borderRadius: 10,
          border: '1px solid var(--arvo-border-soft)', background: 'var(--arvo-hover-bg)',
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
