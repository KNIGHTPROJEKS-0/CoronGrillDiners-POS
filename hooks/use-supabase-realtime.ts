import { useEffect, useRef, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables")
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE"
  new: Record<string, unknown>
  old: Record<string, unknown>
}

interface RealtimeSubscriptionOptions {
  table: string
  filter?: string
  onInsert?: (payload: RealtimePayload) => void
  onUpdate?: (payload: RealtimePayload) => void
  onDelete?: (payload: RealtimePayload) => void
  enabled?: boolean
}

export function useSupabaseRealtime(options: RealtimeSubscriptionOptions) {
  const {
    table,
    filter,
    onInsert,
    onUpdate,
    onDelete,
    enabled = true,
  } = options

  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isMountedRef = useRef(true)

  const subscribe = useCallback(() => {
    if (!enabled) return

    // Unsubscribe from existing subscription
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current)
      subscriptionRef.current = null
    }

    let channel = supabase.channel(`realtime:${table}`)

    if (filter) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter,
        },
        (payload: RealtimePayload) => {
          if (!isMountedRef.current) return

          switch (payload.eventType) {
            case "INSERT":
              onInsert?.(payload)
              break
            case "UPDATE":
              onUpdate?.(payload)
              break
            case "DELETE":
              onDelete?.(payload)
              break
          }
        }
      )
    } else {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        (payload: RealtimePayload) => {
          if (!isMountedRef.current) return

          switch (payload.eventType) {
            case "INSERT":
              onInsert?.(payload)
              break
            case "UPDATE":
              onUpdate?.(payload)
              break
            case "DELETE":
              onDelete?.(payload)
              break
          }
        }
      )
    }

    subscriptionRef.current = channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.error(`Realtime subscription error for table: ${table}`, status)
      }
    })
  }, [table, filter, onInsert, onUpdate, onDelete, enabled])

  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current)
      subscriptionRef.current = null
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      subscribe()
    }

    return () => {
      unsubscribe()
      isMountedRef.current = false
    }
  }, [enabled, subscribe, unsubscribe])

  return {
    subscribe,
    unsubscribe,
    isConnected: !!subscriptionRef.current,
  }
}

// Helper function to create filter strings for Supabase Realtime
export function createRealtimeFilter(column: string, operator: string, value: string | number) {
  return `${column}${operator}${value}`
}
