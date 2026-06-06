const CACHE_NAME = 'cgd-pos-v2'
const OFFLINE_PAGE = '/offline.html'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_PAGE]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Only handle GET requests
  if (request.method !== 'GET') return

  // Skip Next.js internals entirely
  if (url.pathname.startsWith('/_next/')) return

  // Skip NextAuth API
  if (url.pathname.startsWith('/api/auth')) return

  // Network-first for API routes
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', offline: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }

  // Network-first for HTML pages — never cache HTML to avoid stale asset references
  const acceptsHtml = request.headers.get('accept')?.includes('text/html')
  if (acceptsHtml) {
    e.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_PAGE))
    )
    return
  }

  // Cache-first for static assets (images, fonts, etc.)
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone())
          return res
        })
      })
    )
  )
})
