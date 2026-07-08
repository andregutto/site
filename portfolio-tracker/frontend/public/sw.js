// Bump a versão a cada leva de deploys relevante: o auto-reload das abas
// abertas (controllerchange em main.tsx) só dispara quando os BYTES deste
// arquivo mudam — sem bump, sessões antigas (Safari/PWA suspensos) ficam
// presas num bundle velho indefinidamente, mesmo com vários deploys novos.
const CACHE = 'arvo-v38'
const STATIC = ['/manifest.json', '/favicon.svg', '/offline.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Never intercept cross-origin requests (Supabase auth, external APIs)
  if (url.origin !== self.location.origin) return

  // Never intercept the Supabase proxy either — /sb/* is same-origin (so it'd otherwise
  // fall into the cache-first bucket below meant for our own static assets), but it's
  // actually third-party storage/auth traffic that must always hit the network: caching it
  // can serve a stale/broken response (e.g. a photo that failed once) forever afterwards.
  if (url.pathname.startsWith('/sb/')) return

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(cached =>
          cached ?? new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    )
    return
  }

  // Navigation requests: network-first, fall back to offline.html
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline.html').then(cached =>
          cached ?? new Response('Offline', { status: 503 })
        )
      )
    )
    return
  }

  // Cache-first for same-origin static assets (GET only)
  if (request.method !== 'GET') return
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return res
      })
    })
  )
})
