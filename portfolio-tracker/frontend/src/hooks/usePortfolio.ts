import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { PortfolioValue, PerformanceSummary, PerformanceMonthly, PerformanceBenchmarks, AssetReturns, AssetDetail, ContributionRow } from '../lib/types'

// Daily cache v7 — bumped to invalidate pre-userId-scoping entries (2026-05-22).
// Keys include userId so different users never share cached data.
const CACHE_PREFIX = 'perf7_'

function perfCacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { date, data } = JSON.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    return date === today ? (data as T) : null
  } catch { return null }
}

function perfCacheSet(key: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      data,
    }))
  } catch {}
}

export function usePortfolioValue() {
  const [data, setData]     = useState<PortfolioValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<PortfolioValue>('/portfolio/value')
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar portfólio')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}

export interface SyncDetail {
  id: number; code: string; status: 'ok' | 'empty' | 'error'; points?: number; error?: string
}
export interface SyncResult {
  synced: number; errors: number; total: number; details: SyncDetail[]
}

export function useSyncHistory() {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<SyncResult | null>(null)

  const sync = useCallback(async () => {
    setLoading(true)
    setResult(null)
    try {
      const r = await apiFetch<SyncResult>('/portfolio/sync-history', { method: 'POST' })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [])

  return { sync, loading, result }
}

export interface ResetResult {
  status: 'started'
  deleted: number
  total: number
}

export function useResetPriceHistory() {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<ResetResult | null>(null)

  const reset = useCallback(async () => {
    setLoading(true)
    setResult(null)
    try {
      const r = await apiFetch<ResetResult>('/portfolio/reset-price-history', { method: 'POST' })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [])

  return { reset, loading, result }
}

export function usePerformanceSummary(from: string, to: string) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [data, setData]     = useState<PerformanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const doFetch = useCallback(async (force: boolean) => {
    if (!userId) return
    const key = `summary_${userId}_${from}_${to}`
    if (!force) {
      const cached = perfCacheGet<PerformanceSummary>(key)
      if (cached) { setData(cached); setLoading(false); return }
    }
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<PerformanceSummary>(`/performance/summary?from=${from}&to=${to}`)
      setData(result)
      perfCacheSet(key, result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [from, to, userId])

  const refresh = useCallback(() => doFetch(true), [doFetch])
  useEffect(() => { setData(null); setError(null) }, [userId])
  useEffect(() => { doFetch(false) }, [doFetch])

  return { data, loading, error, refresh }
}

export function usePerformanceMonthly(from: string, to: string) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [data, setData]     = useState<PerformanceMonthly | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  const doFetch = useCallback(async (force: boolean) => {
    if (!userId) return
    const key = `monthly_${userId}_${from}_${to}`
    if (!force) {
      const cached = perfCacheGet<PerformanceMonthly>(key)
      if (cached) { setData(cached); setLoading(false); return }
    }
    setLoading(true)
    setError(null)
    try {
      const result = await apiFetch<PerformanceMonthly>(`/performance/monthly?from=${from}&to=${to}`)
      setData(result)
      perfCacheSet(key, result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [from, to, userId])

  const refresh = useCallback(() => doFetch(true), [doFetch])
  useEffect(() => { setData(null); setError(null) }, [userId])
  useEffect(() => { doFetch(false) }, [doFetch])

  return { data, loading, error, refresh }
}

export function usePerformanceBenchmarks(from: string, to: string) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [data, setData]     = useState<PerformanceBenchmarks | null>(null)
  const [loading, setLoading] = useState(true)

  const doFetch = useCallback(async (force: boolean) => {
    if (!userId) return
    const key = `benchmarks_${userId}_${from}_${to}`
    if (!force) {
      const cached = perfCacheGet<PerformanceBenchmarks>(key)
      if (cached) { setData(cached); setLoading(false); return }
    }
    setLoading(true)
    try {
      const result = await apiFetch<PerformanceBenchmarks>(`/performance/benchmarks?from=${from}&to=${to}`)
      setData(result)
      perfCacheSet(key, result)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, userId])

  const refresh = useCallback(() => doFetch(true), [doFetch])
  useEffect(() => { setData(null) }, [userId])
  useEffect(() => { doFetch(false) }, [doFetch])

  return { data, loading, refresh }
}

export function useAssetReturns(from: string | null, to: string | null) {
  const [data, setData]     = useState<AssetReturns | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!from || !to) { setData(null); return }
    setLoading(true)
    apiFetch<AssetReturns>(`/performance/asset-returns?from=${from}&to=${to}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [from, to])

  return { data, loading }
}

export function usePerformanceInception() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const inceptionKey = userId ? `perf_inception_v1_${userId}` : null

  const [inception, setInception] = useState<string | null>(() => {
    try { return inceptionKey ? localStorage.getItem(inceptionKey) : null } catch { return null }
  })

  useEffect(() => { setInception(null) }, [userId])

  useEffect(() => {
    if (!userId) return
    apiFetch<{ inception: string | null }>('/performance/inception')
      .then(r => {
        setInception(r.inception)
        if (!inceptionKey) return
        if (r.inception) localStorage.setItem(inceptionKey, r.inception)
        else localStorage.removeItem(inceptionKey)
      })
      .catch(() => {})
  }, [userId, inceptionKey])

  return inception
}

export function useAssetDetail(id: number | null) {
  const [data, setData]       = useState<AssetDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    apiFetch<AssetDetail>(`/assets/${id}/detail`)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}

export function useContributions() {
  const [data, setData]       = useState<ContributionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    apiFetch<ContributionRow[]>('/contributions')
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
