interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60 * 1000
const MAX_ATTEMPTS = 10

function cleanup() {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > WINDOW_MS) {
      store.delete(key)
    }
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  cleanup()

  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now })
    return { allowed: true, retryAfterMs: 0 }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart)
    return { allowed: false, retryAfterMs }
  }

  entry.count += 1
  return { allowed: true, retryAfterMs: 0 }
}
