import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import Avatar from '../voyage/_shared/Avatar'
import { formatTimestamp } from '../../lib/notifications'
import { useActiveFriends } from '../../hooks/useActiveFriends'
import MessagingPaywall from './MessagingPaywall'

const GOLD = '#C8B89A'

interface ConversationSummary {
  id: number
  peer: { user_id: string; name?: string; username?: string; avatar_url?: string }
  last_message: { body: string; created_at: string; from_me: boolean; deleted_at: string | null } | null
  last_message_at: string
  unread_count: number
}

export default function MessagesPage() {
  const { t, locale } = useI18n()
  const tm = (t as any).messages ?? {}
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [premiumBlocked, setPremiumBlocked] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const friends = useActiveFriends()

  useEffect(() => {
    apiFetch<{ conversations: ConversationSummary[] }>('/messages/conversations')
      .then(res => setConversations(res.conversations))
      .catch(err => { if (err?.message === 'premium_required') setPremiumBlocked(true) })
      .finally(() => setLoading(false))
  }, [])

  async function startConversation(peerUserId: string) {
    const res = await apiFetch<{ conversation: { id: number } }>('/messages/conversations', {
      method: 'POST', body: JSON.stringify({ peer_user_id: peerUserId }),
    })
    navigate(`/messages/${res.conversation.id}`)
  }

  if (premiumBlocked) return <MessagingPaywall />
  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, color: 'var(--arvo-fg)' }}>{tm.title ?? 'Mensagens'}</h1>
        <button
          onClick={() => setShowPicker(v => !v)}
          style={{
            fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: GOLD, color: '#1a1200',
          }}
        >{tm.newMessage ?? 'Nova mensagem'}</button>
      </div>

      {showPicker && (
        <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14, padding: '14px 16px' }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 10 }}>
            {tm.pickFriend ?? 'Escolha um amigo'}
          </p>
          {friends.length === 0 ? (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-faint)' }}>{tm.noFriendsYet ?? 'Você ainda não tem amigos ativos.'}</p>
          ) : (
            <div className="space-y-1">
              {friends.filter(f => f.user_id).map(f => (
                <button
                  key={f.user_id}
                  onClick={() => startConversation(f.user_id!)}
                  className="flex items-center gap-3 w-full text-left"
                  style={{ padding: '8px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <Avatar name={f.name} email={f.email} avatarUrl={f.avatar_url} size={30} />
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)' }}>{f.name ?? f.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2" style={{ padding: '56px 0' }}>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 16, color: GOLD, textAlign: 'center' }}>
            {tm.emptyTitle ?? 'Nenhuma conversa por aqui.'}
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', textAlign: 'center' }}>
            {tm.emptySubtitle ?? 'Comece uma conversa com um amigo ativo.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/messages/${c.id}`)}
              className="flex items-center gap-3 w-full text-left"
              style={{
                background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14,
                padding: '12px 16px', cursor: 'pointer',
              }}
            >
              <Avatar name={c.peer.name} avatarUrl={c.peer.avatar_url} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--arvo-fg)' }}>
                    {c.peer.name ?? c.peer.username ?? '—'}
                  </span>
                  {c.peer.username && <span style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>@{c.peer.username}</span>}
                </div>
                {c.last_message && (
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: c.last_message.deleted_at ? 'italic' : 'normal' }}>
                    {c.last_message.deleted_at
                      ? (tm.messageDeleted ?? 'Mensagem apagada')
                      : <>{c.last_message.from_me ? `${tm.you ?? 'Você'}: ` : ''}{c.last_message.body}</>}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1" style={{ flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-faint)' }}>
                  {formatTimestamp(c.last_message_at, locale)}
                </span>
                {c.unread_count > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--arvo-red)',
                    color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {c.unread_count > 9 ? '9+' : c.unread_count}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
