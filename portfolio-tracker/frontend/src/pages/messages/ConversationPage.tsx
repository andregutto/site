import { useEffect, useRef, useState, useCallback } from 'react'
import type React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/AuthContext'
import { PageLoader } from '../../components/ArvoLoader'
import Avatar from '../voyage/_shared/Avatar'
import ProfileLink from '../../components/ProfileLink'
import { linkifyText } from '../community/_shared/linkify'
import { useMessagingContext } from '../../contexts/MessagingContext'
import { useUpgrade } from '../../contexts/UpgradeContext'

const GOLD = '#C8B89A'
const TYPING_IDLE_MS = 2500

interface DmMessage {
  id: number
  sender_id: string
  body: string
  created_at: string
  deleted_at: string | null
}

interface ConversationDetail {
  id: number
  peer: { user_id: string; name?: string; username?: string; avatar_url?: string }
  peer_last_read_at: string | null
}

function dayLabel(iso: string, locale: string, todayLabel: string, yesterdayLabel: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (isSameDay(d, now)) return todayLabel
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (isSameDay(d, yest)) return yesterdayLabel
  return d.toLocaleDateString(locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatClock(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { t, locale } = useI18n()
  const tm = (t as any).messages ?? {}
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refresh: refreshUnread, notifyRead } = useMessagingContext()
  const { handleUpgradeError } = useUpgrade()

  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [notFriendsAnymore, setNotFriendsAnymore] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const peerTypingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentAt = useRef(0)

  const markRead = useCallback(async (id: number) => {
    try { await apiFetch(`/messages/conversations/${id}/read`, { method: 'POST' }) } catch { /* best-effort */ }
    refreshUnread()
  }, [refreshUnread])

  useEffect(() => {
    if (!conversationId) return
    const id = Number(conversationId)
    notifyRead(id)
    setConversation(null)
    setMessages([])

    async function load() {
      try {
        const [convRes, msgRes] = await Promise.all([
          apiFetch<{ conversation: ConversationDetail }>(`/messages/conversations/${id}`),
          apiFetch<{ messages: DmMessage[] }>(`/messages/conversations/${id}/messages`),
        ])
        setConversation(convRes.conversation)
        setMessages(msgRes.messages)
        setHasMore(msgRes.messages.length === 50)
        markRead(id) // fire-and-forget — não bloqueia a tela aparecer
      } catch (err: any) {
        handleUpgradeError(err)
        navigate('/messages')
      } finally {
        setLoading(false)
      }
    }
    load()

    return () => { notifyRead(-1) }
  }, [conversationId, navigate, markRead, notifyRead, handleUpgradeError])

  // Realtime: novas mensagens (INSERT) e edições de estado (UPDATE, usado por
  // apagar-pra-todos) chegam direto via postgres_changes filtrado pela conversa —
  // RLS garante que só participantes recebem essas linhas.
  useEffect(() => {
    if (!conversationId) return
    const id = Number(conversationId)

    const channel = supabase
      .channel(`dm-conversation-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const row = payload.new as DmMessage
        if (row.sender_id === user?.id) return
        setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
        markRead(id)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const row = payload.new as DmMessage
        setMessages(prev => prev.map(m => m.id === row.id ? row : m))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_participants_state', filter: `conversation_id=eq.${id}` }, (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string }
        if (row.user_id === user?.id) return
        setConversation(prev => prev ? { ...prev, peer_last_read_at: row.last_read_at } : prev)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, user?.id, markRead])

  // Typing indicator: canal de Broadcast efêmero por conversa — não grava nada
  // no banco, só troca eventos "estou digitando" direto entre os dois clientes.
  useEffect(() => {
    if (!conversationId) return
    const channel = supabase.channel(`dm-typing-${conversationId}`)
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.user_id === user?.id) return
        setPeerTyping(true)
        if (peerTypingTimeout.current) clearTimeout(peerTypingTimeout.current)
        peerTypingTimeout.current = setTimeout(() => setPeerTyping(false), TYPING_IDLE_MS)
      })
      .subscribe()
    typingChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      if (peerTypingTimeout.current) clearTimeout(peerTypingTimeout.current)
    }
  }, [conversationId, user?.id])

  function notifyTyping() {
    const now = Date.now()
    if (now - lastTypingSentAt.current < 1200) return
    lastTypingSentAt.current = now
    typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: user?.id } })
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  async function loadEarlier() {
    if (!conversation || !messages.length) return
    const before = messages[0].created_at
    const res = await apiFetch<{ messages: DmMessage[] }>(`/messages/conversations/${conversation.id}/messages?before=${encodeURIComponent(before)}`)
    setHasMore(res.messages.length === 50)
    setMessages(prev => [...res.messages, ...prev])
  }

  async function send() {
    const body = draft.trim()
    if (!body || !conversation || sending) return
    setSending(true)
    const optimistic: DmMessage = { id: -Date.now(), sender_id: user!.id, body, created_at: new Date().toISOString(), deleted_at: null }
    setMessages(prev => [...prev, optimistic])
    setDraft('')
    try {
      const res = await apiFetch<{ message: DmMessage }>(`/messages/conversations/${conversation.id}/messages`, {
        method: 'POST', body: JSON.stringify({ body }),
      })
      setMessages(prev => prev.map(m => m.id === optimistic.id ? res.message : m))
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      if (handleUpgradeError(err)) { /* modal aberto */ }
      else if (err?.message && /amigos/i.test(err.message)) setNotFriendsAnymore(true)
    } finally {
      setSending(false)
    }
  }

  async function deleteMessage(messageId: number, mode: 'me' | 'everyone') {
    if (!conversation) return
    setOpenMenuFor(null)
    const prev = messages
    if (mode === 'everyone') {
      setMessages(cur => cur.map(m => m.id === messageId ? { ...m, body: '', deleted_at: new Date().toISOString() } : m))
    } else {
      setMessages(cur => cur.filter(m => m.id !== messageId))
    }
    try {
      await apiFetch(`/messages/conversations/${conversation.id}/messages/${messageId}?mode=${mode}`, { method: 'DELETE' })
    } catch {
      setMessages(prev)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (loading || !conversation) return <PageLoader />

  const groups: { label: string; items: DmMessage[] }[] = []
  for (const m of messages) {
    const label = dayLabel(m.created_at, locale, tm.today ?? 'Hoje', tm.yesterday ?? 'Ontem')
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.label === label) lastGroup.items.push(m)
    else groups.push({ label, items: [m] })
  }

  const lastOwnMessage = [...messages].reverse().find(m => m.sender_id === user?.id && !m.deleted_at)
  const peerHasReadLastOwn = !!(lastOwnMessage && conversation.peer_last_read_at && new Date(conversation.peer_last_read_at) >= new Date(lastOwnMessage.created_at))

  return (
    <div className="dm-thread-shell">
      <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid var(--arvo-border)' }}>
        <button onClick={() => navigate('/messages')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', fontSize: 18, padding: 4 }}>←</button>
        {/* Avatar/nome levam pro perfil público do contato */}
        <ProfileLink username={conversation.peer.username} userId={conversation.peer.user_id}>
          <Avatar name={conversation.peer.name} avatarUrl={conversation.peer.avatar_url} size={34} />
        </ProfileLink>
        <div>
          <ProfileLink username={conversation.peer.username} userId={conversation.peer.user_id}>
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{conversation.peer.name ?? conversation.peer.username}</p>
          </ProfileLink>
          {peerTyping ? (
            <p style={{ fontSize: 13, color: GOLD, fontStyle: 'italic' }}>{tm.typing ?? 'digitando...'}</p>
          ) : conversation.peer.username && (
            <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>@{conversation.peer.username}</p>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4" style={{ padding: '16px 4px' }}>
        {hasMore && (
          <div className="flex justify-center">
            <button onClick={loadEarlier} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', background: 'none', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '5px 14px', cursor: 'pointer' }}>
              {tm.loadEarlier ?? 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}

        {groups.map(group => (
          <div key={group.label} className="space-y-2">
            <div className="flex justify-center">
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--arvo-fg-faint)' }}>
                {group.label}
              </span>
            </div>
            {group.items.map(m => {
              const mine = m.sender_id === user?.id
              const isLastOwn = lastOwnMessage?.id === m.id
              return (
                <div key={m.id} className="flex flex-col" style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  <div className="relative" style={{ maxWidth: 420 }}>
                    <div
                      onClick={() => { if (!m.deleted_at && m.id > 0) setOpenMenuFor(prev => prev === m.id ? null : m.id) }}
                      style={{
                        padding: '9px 13px', borderRadius: 14,
                        background: mine ? 'var(--arvo-hover-bg)' : 'var(--arvo-surface)',
                        border: '1px solid var(--arvo-border)',
                        cursor: (!m.deleted_at && m.id > 0) ? 'pointer' : 'default',
                      }}
                    >
                      {m.deleted_at ? (
                        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-faint)', fontStyle: 'italic', margin: 0 }}>
                          {tm.messageDeleted ?? 'Mensagem apagada'}
                          <span style={{ fontSize: 10, whiteSpace: 'nowrap', marginLeft: 8, fontStyle: 'normal' }}>{formatClock(m.created_at, locale)}</span>
                        </p>
                      ) : (
                        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
                          {linkifyText(m.body)}
                          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-faint)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            {formatClock(m.created_at, locale)}
                          </span>
                        </p>
                      )}
                    </div>
                    {openMenuFor === m.id && (
                      <>
                        {/* Camada invisível pra fechar o menu ao tocar/clicar fora, sem
                            depender de :hover (que não existe em touch). */}
                        <div className="fixed inset-0 z-[5]" onClick={() => setOpenMenuFor(null)} />
                        <div
                          className="absolute z-10"
                          style={{ [mine ? 'right' : 'left']: 0, top: '100%', marginTop: 4, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 10, minWidth: 160, boxShadow: 'var(--arvo-shadow-md)' }}
                        >
                          <button
                            onClick={() => deleteMessage(m.id, 'me')}
                            className="w-full text-left"
                            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px' }}
                          >{tm.deleteForMe ?? 'Apagar pra mim'}</button>
                          {mine && (
                            <button
                              onClick={() => deleteMessage(m.id, 'everyone')}
                              className="w-full text-left"
                              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-red, #D63B2F)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', borderTop: '1px solid var(--arvo-border-soft)' }}
                            >{tm.deleteForEveryone ?? 'Apagar pra todos'}</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {isLastOwn && peerHasReadLastOwn && (
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-faint)', marginTop: 2, marginRight: 4 }}>
                      {(tm.seenAt ?? 'Visto às {time}').replace('{time}', formatClock(conversation.peer_last_read_at!, locale))}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {notFriendsAnymore ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', textAlign: 'center', padding: '16px 0' }}>
          {tm.notFriendsAnymore ?? 'Vocês não são mais amigos.'}
        </p>
      ) : (
        <div className="flex items-end gap-2 pt-3" style={{ borderTop: '1px solid var(--arvo-border)' }}>
          <textarea
            value={draft}
            onChange={e => { setDraft(e.target.value); notifyTyping() }}
            onKeyDown={onKeyDown}
            placeholder={tm.typePlaceholder ?? 'Escreva uma mensagem...'}
            rows={1}
            style={{
              flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg)',
              background: 'var(--arvo-bg)', border: '1px solid var(--arvo-border)', borderRadius: 21,
              padding: '10px 16px', resize: 'none', lineHeight: 1.5, maxHeight: 120, boxSizing: 'border-box',
            }}
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            title={tm.send ?? 'Enviar'}
            style={{
              width: 42, height: 42, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', border: 'none', cursor: !draft.trim() ? 'default' : 'pointer',
              background: draft.trim() ? GOLD : 'var(--arvo-hover-bg)',
              color: draft.trim() ? '#1a1200' : 'var(--arvo-fg-faint)',
              opacity: sending ? 0.6 : 1, transition: 'background 160ms ease, color 160ms ease',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
