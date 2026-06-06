"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"

export interface Shift {
  id: number
  cashier_id: number
  cashier_name: string
  cashier_username: string
  start_time: string
  end_time: string | null
  status: "open" | "closed"
  start_balance: number
  end_balance: number | null
  total_cash_sales: number
  total_sales: number
  expected_cash: number | null
  discrepancy: number | null
}

export function useShift() {
  const { data: session, status } = useSession()
  const [shift, setShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(true)
  const [shiftError, setShiftError] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [staleShiftsClosed, setStaleShiftsClosed] = useState(0)

  const fetchCurrentShift = useCallback(async () => {
    if (!session?.user) return
    setShiftError(false)
    try {
      const res = await fetch("/api/shifts/current")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.staleShiftsClosed) {
        setStaleShiftsClosed(data.staleShiftsClosed)
      }
      if (data.shift) {
        setShift(data.shift)
        setShowStartModal(false)
      } else {
        setShift(null)
        const isAdmin = (session.user as any).role === "admin"
        if (!isAdmin) setShowStartModal(true)
      }
    } catch {
      setShiftError(true)
      const isAdmin = (session.user as any).role === "admin"
      if (!isAdmin) setShowStartModal(false)
    } finally {
      setLoading(false)
    }
  }, [session?.user])

  useEffect(() => {
    if (status === "authenticated") {
      fetchCurrentShift()
    } else if (status === "unauthenticated") {
      setLoading(false)
    }
  }, [status, fetchCurrentShift])

  const startShift = async (startBalance: number): Promise<boolean> => {
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startBalance }),
      })
      if (!res.ok) return false
      const data = await res.json()
      setShift(data.shift)
      setShowStartModal(false)
      setStaleShiftsClosed(0)
      return true
    } catch {
      return false
    }
  }

  const closeShift = async (endBalance: number): Promise<Shift | null> => {
    try {
      const res = await fetch("/api/shifts/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endBalance }),
      })
      if (!res.ok) return null
      const data = await res.json()
      setShift(data.shift)
      return data.shift
    } catch {
      return null
    }
  }

  return {
    shift,
    loading,
    shiftError,
    showStartModal,
    setShowStartModal,
    showCloseModal,
    setShowCloseModal,
    startShift,
    closeShift,
    refreshShift: fetchCurrentShift,
    staleShiftsClosed,
  }
}
