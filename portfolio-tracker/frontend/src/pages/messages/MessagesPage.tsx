import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import Avatar from '../voyage/_shared/Avatar'
import { formatTimestamp } from '../../lib/notifications'
import { useActiveFriends } from '../../hooks/useActiveFriends'
import MessagingPaywall from './MessagingPaywall'

const GOLD = '#C8B89A'
const RED = '#D63B2F'
const ACTION_WIDTH = 72 // px per revealed action button (archive/delete on the left)
const OPEN_THRESHOLD = 36 // px of drag before actions start snapping open
const UNREAD_THRESHOLD = 70 // px of right-swipe before "mark as unread" fires

interface ConversationSummary {
  id: number
  peer: { user_id: string; name?: string; username?: string; avatar_url?: string }
  last_message: { body: string; created_at: string; from_me: boolean; deleted_at: string | null } | null
  last_message_at: string
  unread_count: number
}

function SwipeableRow({ children, onArchive, onDelete, onMarkUnread }: {
  children: React.ReactNode
  onArchive: () => void
  onDelete: () => void
  onMarkUnread: () => void
}) {
  const { t } = useI18n()
  const tm = (t as any).messages ?? {}
  const [dragX, setDragX] = useState(0)
  const [open, setOpen] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const axisLocked = useRef<'x' | 'y' | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    axisLocked.current = null
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y
    if (!axisLocked.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axisLocked.current !== 'x') return
    e.preventDefault()
    const base = open ? -ACTION_WIDTH * 2 : 0
    setDragX(Math.max(-ACTION_WIDTH * 2 - 20, Math.min(UNREAD_THRESHOLD + 20, base + dx)))
  }

  function onTouchEnd() {
    if (!touchStart.current) return
    touchStart.current = null
    if (dragX >= UNREAD_THRESHOLD) {
      onMarkUnread()
      setDragX(0); setOpen(false)
      return
    }
    if (dragX <= -OPEN_THRESHOLD) {
      setDragX(-ACTION_WIDTH * 2); setOpen(true)
    } else {
      setDragX(0); setOpen(false)
    }
  }

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 14 }}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH * 2 }}>
        <button
          onClick={() => { onArchive(); setDragX(0); setOpen(false) }}
          className="flex-1 flex items-center justify-center"
          style={{ background: 'var(--arvo-fg-soft)', color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11 }}
        >{tm.archive ?? 'Arquivar'}</button>
        <button
          onClick={() => { onDelete(); setDragX(0); setOpen(false) }}
          className="flex-1 flex items-center justify-center"
          style={{ background: RED, color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11 }}
        >{tm.deleteAction ?? 'Apagar'}</button>
      </div>
      <div className="absolute inset-y-0 left-0 flex items-center justify-start" style={{ width: UNREAD_THRESHOLD + 20, opacity: Math.min(1, Math.max(0, dragX) / UNREAD_THRESHOLD) }}>
        <span style={{ color: GOLD, fontFamily: 'var(--arvo-font-body)', fontSize: 11, paddingLeft: 14 }}>{tm.markUnread ?? 'Não lida'}</span>
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dragX}px)`, transition: touchStart.current ? 'none' : 'transform 200ms ease' }}
      >
        {children}
      </div>
    </div>
  )
}

export default function MessagesPage() {
  const { t, locale } = useI18n()
  const tm = (t as any).messages ?? {}
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [premiumBlocked, setPremiumBlocked] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const friends = useActiveFriends()

  function load(archived: boolean) {
    setLoading(true)
    apiFetch<{ conversations: ConversationSummary[] }>(`/messages/conversations${archived ? '?archived=true' : ''}`)
      .then(res => setConversations(res.conversations))
      .catch(err => { if (err?.message === 'premium_required') setPremiumBlocked(true) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(showArchived) }, [showArchived])

  async function startConversation(peerUserId: string) {
    const res = await apiFetch<{ conversation: { id: number } }>('/messages/conversations', {
      method: 'POST', body: JSON.stringify({ peer_user_id: peerUserId }),
    })
    navigate(`/messages/${res.conversation.id}`)
  }

  function archiveConversation(id: number) {
    setConversations(prev => prev.filter(c => c.id !== id))
    apiFetch(`/messages/conversations/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived: !showArchived }) }).catch(() => load(showArchived))
  }

  function deleteConversation(id: number) {
    setConversations(prev => prev.filter(c => c.id !== id))
    apiFetch(`/messages/conversations/${id}`, { method: 'DELETE' }).catch(() => load(showArchived))
  }

  function markUnread(id: number) {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, unread_count: Math.max(1, c.unread_count) } : c))
    apiFetch(`/messages/conversations/${id}/unread`, { method: 'POST' }).catch(() => load(showArchived))
  }

  if (premiumBlocked) return <MessagingPaywall />

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

      <div className="flex items-center gap-1" style={{ background: 'var(--arvo-chip-bg, var(--arvo-hover-bg))', borderRadius: 999, padding: 3, width: 'fit-content' }}>
        {[{ key: false, label: tm.tabActive ?? 'Ativas' }, { key: true, label: tm.tabArchived ?? 'Arquivadas' }].map(tab => (
          <button
            key={String(tab.key)}
            onClick={() => setShowArchived(tab.key)}
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.04em', padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: showArchived === tab.key ? 'var(--arvo-pill-active-bg)' : 'transparent',
              color: showArchived === tab.key ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-soft)',
            }}
          >{tab.label}</button>
        ))}
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

      {loading ? (
        <PageLoader />
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2" style={{ padding: '56px 0' }}>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 16, color: GOLD, textAlign: 'center' }}>
            {showArchived ? (tm.emptyArchived ?? 'Nenhuma conversa arquivada.') : (tm.emptyTitle ?? 'Nenhuma conversa por aqui.')}
          </p>
          {!showArchived && (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', textAlign: 'center' }}>
              {tm.emptySubtitle ?? 'Comece uma conversa com um amigo ativo.'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => (
            <SwipeableRow
              key={c.id}
              onArchive={() => archiveConversation(c.id)}
              onDelete={() => deleteConversation(c.id)}
              onMarkUnread={() => markUnread(c.id)}
            >
              <button
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
            </SwipeableRow>
          ))}
        </div>
      )}
    </div>
  )
}
