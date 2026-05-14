interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class TTLCache {
  private store    = new Map<string, CacheEntry<unknown>>()
  private inflight = new Map<string, Promise<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs })
  }

  // Concurrent-safe: a second caller with the same key joins the existing in-flight
  // promise instead of launching a second fetch, preventing BCB/brapi rate-limit spikes.
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) return cached

    const existing = this.inflight.get(key) as Promise<T> | undefined
    if (existing) return existing

    const promise = fetcher()
      .then(data => { this.set(key, data, ttlMs); this.inflight.delete(key); return data })
      .catch(err  => { this.inflight.delete(key); throw err })

    this.inflight.set(key, promise)
    return promise
  }

  deletePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }
}

export const cache = new TTLCache()

export const TTL = {
  PRICE_CURRENT:    5  * 60 * 1000,
  PRICE_HISTORICAL: 60 * 60 * 1000,
  FX_CURRENT:       5  * 60 * 1000,
  FX_HISTORICAL:    60 * 60 * 1000,
  BCB_RATES:        6  * 60 * 60 * 1000,
}
