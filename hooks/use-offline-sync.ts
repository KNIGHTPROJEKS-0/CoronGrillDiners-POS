"use client"

import { useEffect } from "react"

const PENDING_KEY = "cgd-pending-sales"

export interface PendingSale {
  pendingId: number
  orderNumber: string
  items: Array<{ id: number; name: string; price: number; quantity: number }>
  subtotal: number
  serviceCharge: number
  discountPercent?: number
  grandTotal: number
  paymentMethod: string
  amountTendered: number
  changeAmount: number
  serverName: string
  createdBy: string
}

export function savePendingSale(sale: Omit<PendingSale, "pendingId">) {
  const pending = getPendingSales()
  pending.push({ ...sale, pendingId: Date.now() })
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
}

export function getPendingSales(): PendingSale[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]")
  } catch {
    return []
  }
}

async function syncPendingSales() {
  const pending = getPendingSales()
  if (pending.length === 0) return

  const failed: PendingSale[] = []
  for (const sale of pending) {
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sale),
      })
      if (!res.ok) failed.push(sale)
    } catch {
      failed.push(sale)
    }
  }

  localStorage.setItem(PENDING_KEY, JSON.stringify(failed))
  if (pending.length !== failed.length) {
    const synced = pending.length - failed.length
    console.log(`[CGD POS] Synced ${synced} offline order(s) to server`)
  }
}

export function useOfflineSync() {
  useEffect(() => {
    if (navigator.onLine) {
      syncPendingSales()
    }

    const handleOnline = () => {
      console.log("[CGD POS] Back online – syncing pending orders")
      syncPendingSales()
    }

    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [])
}
