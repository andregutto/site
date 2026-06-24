import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../lib/api'
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
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

const POLL_MS = 5 * 60 * 1000

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
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(refresh, POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
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

  return (
    <NotificationsContext.Provider value={{ active, history, unreadCount: active.length, loading, refresh, dismiss, dismissAll, restore, removeFromHistory, clearHistory }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotificationsContext must be used inside NotificationsProvider')
  return ctx
}
