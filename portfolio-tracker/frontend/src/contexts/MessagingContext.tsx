import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface MessagingContextValue {
  unreadTotal: number
  refresh: () => Promise<void>
  // Called by ConversationPage when a message is appended while the thread is open,
  // so the header badge doesn't count messages the user is already looking at.
  notifyRead: (conversationId: number) => void
}

const MessagingContext = createContext<MessagingContextValue | null>(null)

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [unreadTotal, setUnreadTotal] = useState(0)
  const openConversationId = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ unread_count: number }>('/messages/unread-count')
      setUnreadTotal(data.unread_count)
    } catch {
      // ignore — badge just stays stale until next refresh
    }
  }, [])

  const notifyRead = useCallback((conversationId: number) => {
    openConversationId.current = conversationId
  }, [])

  useEffect(() => {
    if (!user) return
    refresh()
  }, [user, refresh])

  // Rede de segurança para o balão de não-lidas: o realtime (abaixo) é o caminho
  // principal e instantâneo, mas se o socket cair/ficar instável o badge poderia
  // não atualizar até reconectar. Um poll leve de 60s (só com a aba visível) +
  // refetch imediato no focus/visibilidade garante que uma mensagem nova sempre
  // apareça, mesmo sem realtime.
  useEffect(() => {
    if (!user) return
    let interval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (interval) return
      interval = setInterval(refresh, 60 * 1000)
    }
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') { refresh(); startPolling() }
      else stopPolling()
    }
    const onFocus = () => { refresh(); startPolling() }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    if (document.visibilityState === 'visible') startPolling()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      stopPolling()
    }
  }, [user, refresh])

  // Realtime: subscribe to INSERTs on dm_messages. The server-side filter can't
  // scope by "conversations I'm in", so we subscribe broadly and rely on RLS —
  // Postgres only ever sends rows the current session is allowed to SELECT.
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('dm-messages-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        (payload) => {
          const row = payload.new as { sender_id: string; conversation_id: number }
          if (row.sender_id === user.id) return
          if (openConversationId.current === row.conversation_id) return
          setUnreadTotal(prev => prev + 1)
        }
      )
      .on('system', { event: '*' }, (payload: any) => {
        // Fallback: if the socket drops and reconnects, refetch the authoritative count via REST.
        if (payload?.status === 'ok' || payload?.extension === 'postgres_changes') refresh()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh()
      })

    return () => { supabase.removeChannel(channel) }
  }, [user, refresh])

  return (
    <MessagingContext.Provider value={{ unreadTotal, refresh, notifyRead }}>
      {children}
    </MessagingContext.Provider>
  )
}

export function useMessagingContext() {
  const ctx = useContext(MessagingContext)
  if (!ctx) throw new Error('useMessagingContext must be used inside MessagingProvider')
  return ctx
}
