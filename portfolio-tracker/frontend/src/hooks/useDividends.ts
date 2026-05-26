import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export interface DividendRow {
  id: string
  asset_id: number
  code: string
  name: string
  ex_date: string
  pay_date: string | null
  amount_per_share: number
  amount_total: number
  currency: string
  amount_brl: number
  dividend_type: string
  source: string
}

export interface DividendSummary {
  total_brl: number
  by_asset: Array<{ asset_id: number; code: string; name: string; total_brl: number; count: number }>
  by_month: Array<{ month: string; total_brl: number }>
}

const CACHE_KEY = 'div_summary_'
const CACHE_TTL = 10 * 60 * 1000

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number }
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null }
    return data
  } catch { return null }
}

function cacheSet<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch { /* ignore */ }
}

export function useDividendSummary(from: string, to: string) {
  const [data, setData] = useState<DividendSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const key = `${CACHE_KEY}${from}_${to}`
    const cached = cacheGet<DividendSummary>(key)
    if (cached) { setData(cached); setLoading(false); return }
    setLoading(true)
    try {
      const d = await apiFetch<DividendSummary>(`/dividends/summary?from=${from}&to=${to}`)
      cacheSet(key, d)
      setData(d)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])
  return { data, loading, refresh: load }
}

export function useDividends(from?: string, to?: string, assetId?: number) {
  const [data, setData] = useState<DividendRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      if (assetId) params.set('asset_id', String(assetId))
      const rows = await apiFetch<DividendRow[]>(`/dividends?${params}`)
      setData(rows)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [from, to, assetId])

  useEffect(() => { load() }, [load])
  return { data, loading, refresh: load }
}

export function useDividendSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(() => localStorage.getItem('div_last_sync'))

  const sync = useCallback(async (force = false) => {
    const INTERVAL = 6 * 60 * 60 * 1000 // 6 hours
    if (!force && lastSync && Date.now() - new Date(lastSync).getTime() < INTERVAL) return
    setSyncing(true)
    try {
      await apiFetch('/dividends/sync', { method: 'POST' })
      const now = new Date().toISOString()
      localStorage.setItem('div_last_sync', now)
      setLastSync(now)
    } catch { /* ignore */ } finally {
      setSyncing(false)
    }
  }, [lastSync])

  return { sync, syncing }
}
