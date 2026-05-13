import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import type { PortfolioValue, PerformanceSummary, PerformanceMonthly, PerformanceBenchmarks, AssetReturns, AssetDetail, ContributionRow } from '../lib/types'

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
  deleted: number; synced: number; errors: number; total: number
  details: Array<{ code: string; status: 'ok' | 'empty' | 'error'; points?: number; error?: string }>
}

export function useResetPriceHistory() {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<ResetResult | null>(null)

  const reset = useCallback(async (since = '2025-01-01') => {
    setLoading(true)
    setResult(null)
    try {
      const r = await apiFetch<ResetResult>('/portfolio/reset-price-history', {
        method: 'POST',
        body: JSON.stringify({ since }),
        headers: { 'Content-Type': 'application/json' },
      })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [])

  return { reset, loading, result }
}

export function usePerformanceSummary(from: string, to: string) {
  const [data, setData]     = useState<PerformanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch<PerformanceSummary>(`/performance/summary?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [from, to])

  return { data, loading, error }
}

export function usePerformanceMonthly(from: string, to: string) {
  const [data, setData]     = useState<PerformanceMonthly | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch<PerformanceMonthly>(`/performance/monthly?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'))
      .finally(() => setLoading(false))
  }, [from, to])

  return { data, loading, error }
}

export function usePerformanceBenchmarks(from: string, to: string) {
  const [data, setData]     = useState<PerformanceBenchmarks | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    apiFetch<PerformanceBenchmarks>(`/performance/benchmarks?from=${from}&to=${to}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [from, to])

  return { data, loading }
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
  const [inception, setInception] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ inception: string | null }>('/performance/inception')
      .then(r => setInception(r.inception))
      .catch(() => setInception(null))
  }, [])

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
