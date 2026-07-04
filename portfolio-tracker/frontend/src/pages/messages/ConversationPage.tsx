import { useEffect, useRef, useState, useCallback } from 'react'
import type React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/AuthContext'
import { PageLoader } from '../../components/ArvoLoader'
import Avatar from '../voyage/_shared/Avatar'
import { linkifyText } from '../community/_shared/linkify'
import { useMessagingContext } from '../../contexts/MessagingContext'
import MessagingPaywall from './MessagingPaywall'

const GOLD = '#C8B89A'

interface DmMessage {
  id: number
  sender_id: string
  body: string
  created_at: string
}

interface ConversationDetail {
  id: number
  peer: { user_id: string; name?: string; username?: string; avatar_url?: string }
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

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { t, locale } = useI18n()
  const tm = (t as any).messages ?? {}
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refresh: refreshUnread, notifyRead } = useMessagingContext()

  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [premiumBlocked, setPremiumBlocked] = useState(false)
  const [notFriendsAnymore, setNotFriendsAnymore] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const markRead = useCallback(async (id: number) => {
    try { await apiFetch(`/messages/conversations/${id}/read`, { method: 'POST' }) } catch { /* best-effort */ }
    refreshUnread()
  }, [refreshUnread])

  useEffect(() => {
    if (!conversationId) return
    const id = Number(conversationId)
    notifyRead(id)

    async function load() {
      try {
        const [convRes, msgRes] = await Promise.all([
          apiFetch<{ conversations: (ConversationDetail & { last_message_at: string })[] }>('/messages/conversations'),
          apiFetch<{ messages: DmMessage[] }>(`/messages/conversations/${id}/messages`),
        ])
        const conv = convRes.conversations.find(c => c.id === id)
        if (!conv) { navigate('/messages'); return }
        setConversation(conv)
        setMessages(msgRes.messages)
        setHasMore(msgRes.messages.length === 50)
        await markRead(id)
      } catch (err: any) {
        if (err?.message === 'premium_required') setPremiumBlocked(true)
      } finally {
        setLoading(false)
      }
    }
    load()

    return () => { notifyRead(-1) }
  }, [conversationId, navigate, markRead, notifyRead])

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
    const optimistic: DmMessage = { id: -Date.now(), sender_id: user!.id, body, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    setDraft('')
    try {
      const res = await apiFetch<{ message: DmMessage }>(`/messages/conversations/${conversation.id}/messages`, {
        method: 'POST', body: JSON.stringify({ body }),
      })
      setMessages(prev => prev.map(m => m.id === optimistic.id ? res.message : m))
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      if (err?.message && /amigos/i.test(err.message)) setNotFriendsAnymore(true)
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (premiumBlocked) return <MessagingPaywall />
  if (loading || !conversation) return <PageLoader />

  const groups: { label: string; items: DmMessage[] }[] = []
  for (const m of messages) {
    const label = dayLabel(m.created_at, locale, tm.today ?? 'Hoje', tm.yesterday ?? 'Ontem')
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.label === label) lastGroup.items.push(m)
    else groups.push({ label, items: [m] })
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="flex items-center gap-3 pb-3" style={{ borderBottom: '1px solid var(--arvo-border)' }}>
        <button onClick={() => navigate('/messages')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', fontSize: 18, padding: 4 }}>←</button>
        <Avatar name={conversation.peer.name} avatarUrl={conversation.peer.avatar_url} size={34} />
        <div>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{conversation.peer.name ?? conversation.peer.username}</p>
          {conversation.peer.username && <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)' }}>@{conversation.peer.username}</p>}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4" style={{ padding: '16px 4px' }}>
        {hasMore && (
          <div className="flex justify-center">
            <button onClick={loadEarlier} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', background: 'none', border: '1px solid var(--arvo-border)', borderRadius: 999, padding: '5px 14px', cursor: 'pointer' }}>
              {tm.loadEarlier ?? 'Carregar mensagens anteriores'}
            </button>
          </div>
        )}

        {groups.map(group => (
          <div key={group.label} className="space-y-2">
            <div className="flex justify-center">
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--arvo-fg-faint)' }}>
                {group.label}
              </span>
            </div>
            {group.items.map(m => {
              const mine = m.sender_id === user?.id
              return (
                <div key={m.id} className="flex" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '72%', padding: '9px 13px', borderRadius: 14,
                    background: mine ? 'var(--arvo-hover-bg)' : 'var(--arvo-surface)',
                    border: mine ? '1px solid var(--arvo-border)' : '1px solid var(--arvo-border)',
                  }}>
                    <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {linkifyText(m.body)}
                    </p>
                    <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, color: 'var(--arvo-fg-faint)', marginTop: 4, textAlign: mine ? 'right' : 'left' }}>
                      {new Date(m.created_at).toLocaleTimeString(locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {notFriendsAnymore ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', textAlign: 'center', padding: '16px 0' }}>
          {tm.notFriendsAnymore ?? 'Vocês não são mais amigos.'}
        </p>
      ) : (
        <div className="flex items-end gap-2 pt-3" style={{ borderTop: '1px solid var(--arvo-border)' }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tm.typePlaceholder ?? 'Escreva uma mensagem...'}
            rows={1}
            style={{
              flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)',
              background: 'var(--arvo-bg)', border: '1px solid var(--arvo-border)', borderRadius: 10,
              padding: '10px 12px', resize: 'none', lineHeight: 1.5, maxHeight: 120,
            }}
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim()}
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: GOLD, color: '#1a1200', opacity: sending || !draft.trim() ? 0.5 : 1,
            }}
          >{tm.send ?? 'Enviar'}</button>
        </div>
      )}
    </div>
  )
}
