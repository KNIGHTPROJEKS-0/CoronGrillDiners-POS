import { useEffect, useRef, useCallback } from "react"

export type PollingPriority = "critical" | "high" | "medium" | "low"

export const POLLING_INTERVALS: Record<PollingPriority, number> = {
  critical: 0, // Real-time - use Supabase Realtime instead
  high: 5000, // 5 seconds
  medium: 30000, // 30 seconds
  low: 120000, // 2 minutes
}

interface UseIntelligentPollingOptions {
  enabled?: boolean
  priority?: PollingPriority
  onFocusRefetch?: boolean
  onVisibilityChangeRefetch?: boolean
}

export function useIntelligentPolling(
  callback: () => void | Promise<void>,
  options: UseIntelligentPollingOptions = {}
) {
  const {
    enabled = true,
    priority = "medium",
    onFocusRefetch = true,
    onVisibilityChangeRefetch = true,
  } = options

  const interval = POLLING_INTERVALS[priority]
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  // Critical priority should use Supabase Realtime, not polling
  if (priority === "critical") {
    console.warn("Critical priority should use Supabase Realtime instead of polling")
  }

  const startPolling = useCallback(() => {
    if (!enabled || interval === 0) return

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Initial fetch
    if (isMountedRef.current) {
      callback()
    }

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      if (isMountedRef.current && enabled) {
        callback()
      }
    }, interval)
  }, [callback, enabled, interval])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Start/stop polling based on enabled state
  useEffect(() => {
    if (enabled) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => {
      stopPolling()
      isMountedRef.current = false
    }
  }, [enabled, startPolling, stopPolling])

  // Refetch on window focus
  useEffect(() => {
    if (!onFocusRefetch || !enabled) return

    const handleFocus = () => {
      if (isMountedRef.current) {
        callback()
      }
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [onFocusRefetch, enabled, callback])

  // Refetch on visibility change (tab switch)
  useEffect(() => {
    if (!onVisibilityChangeRefetch || !enabled) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMountedRef.current) {
        callback()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [onVisibilityChangeRefetch, enabled, callback])

  return {
    startPolling,
    stopPolling,
    isPolling: enabled && interval > 0,
  }
}
