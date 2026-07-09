import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { invalidateActiveFriends } from '../hooks/useActiveFriends'
import type { NotificationItem, NotificationsResponse } from '../lib/types'

interface NotificationsContextValue {
  active: NotificationItem[]
  history: NotificationItem[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  dismiss: (item: NotificationItem) => Promise<void>
  dismissAll: () => Promise<void>
  restore: (item: NotificationItem) => Promise<void>
  removeFromHistory: (item: NotificationItem) => Promise<void>
  clearHistory: () => Promise<void>
  acceptInvite: (item: NotificationItem) => Promise<void>
}

const ACCEPT_ENDPOINT: Partial<Record<string, string>> = {
  trip_invite: '/voyage/invite/accept',
  moment_invite: '/finances/moments/invite/accept',
  shared_group_invite: '/shared/invite/accept',
  friend_invite: '/people/invite/accept',
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

// Poll de 60s enquanto a aba está visível. O intervalo de 5min fazia
// notificações (ex.: um amigo aceitando seu convite) demorarem minutos pra
// aparecer. Pausamos quando a aba fica oculta (economia de rede/bateria) e
// refazemos o fetch imediatamente ao voltar o foco / visibilidade.
const POLL_MS = 60 * 1000

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<NotificationItem[]>([])
  const [history, setHistory] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<NotificationsResponse>('/notifications')
      setActive(data.active)
      setHistory(data.history)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    let interval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (interval) return
      interval = setInterval(refresh, POLL_MS)
    }
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null }
    }

    // Pausa o polling quando a aba fica oculta; ao voltar, refetch imediato +
    // retoma o intervalo. Assim uma notificação nova aparece assim que o usuário
    // volta pra aba, sem esperar o próximo tick.
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
  }, [refresh])

  const dismiss = useCallback(async (item: NotificationItem) => {
    setActive(prev => prev.filter(i => i.key !== item.key))
    setHistory(prev => [{ ...item, dismissed_at: new Date().toISOString() }, ...prev.filter(i => i.key !== item.key)])

    try {
      await apiFetch('/notifications/dismiss', {
        method: 'POST',
        body: JSON.stringify({
          key: item.key, type: item.type, params: item.params,
          severity: item.severity, link: item.link, occurred_at: item.occurred_at,
        }),
      })
    } catch {
      await refresh()
    }
  }, [refresh])

  const dismissAll = useCallback(async () => {
    await Promise.all(active.map(item => dismiss(item)))
  }, [active, dismiss])

  const restore = useCallback(async (item: NotificationItem) => {
    setHistory(prev => prev.filter(i => i.key !== item.key))
    setActive(prev => [...prev, { ...item, dismissed_at: null }])

    try {
      await apiFetch(`/notifications/dismiss/${encodeURIComponent(item.key)}`, { method: 'DELETE' })
    } finally {
      await refresh()
    }
  }, [refresh])

  const removeFromHistory = useCallback(async (item: NotificationItem) => {
    setHistory(prev => prev.filter(i => i.key !== item.key))
    try {
      await apiFetch(`/notifications/dismiss/${encodeURIComponent(item.key)}`, { method: 'DELETE' })
    } catch {
      await refresh()
    }
  }, [refresh])

  const clearHistory = useCallback(async () => {
    setHistory([])
    try {
      await apiFetch('/notifications/dismiss', { method: 'DELETE' })
    } catch {
      await refresh()
    }
  }, [refresh])

  // Aceita um convite (viagem/momento/categoria/amizade) direto na notificação,
  // sem precisar navegar até a página de aceite — mesma rota usada pelas
  // páginas públicas de convite, só que chamada inline.
  const acceptInvite = useCallback(async (item: NotificationItem) => {
    // Amizade/convite pode ter acabado de virar ativo: os chips de amigos releem.
    invalidateActiveFriends()
    const endpoint = ACCEPT_ENDPOINT[item.type]
    if (!endpoint) return
    const token = item.params.token
    await apiFetch(endpoint, { method: 'POST', body: JSON.stringify({ token }) })
    setActive(prev => prev.filter(i => i.key !== item.key))
    await refresh()
  }, [refresh])

  return (
    <NotificationsContext.Provider value={{ active, history, unreadCount: active.length, loading, refresh, dismiss, dismissAll, restore, removeFromHistory, clearHistory, acceptInvite }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotificationsContext must be used inside NotificationsProvider')
  return ctx
}
