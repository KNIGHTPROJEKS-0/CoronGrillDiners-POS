"use client"

import { useEffect, useState } from "react"
import {
  type PrinterRole,
  type PrinterStatus,
  getPrinterStatus,
  subscribePrinterStatus,
  restoreMetaStatus,
  autoReconnectUSB,
  autoReconnectBluetooth,
} from "@/lib/printer-connection"

let restored = false

export function usePrinterStatus(role: PrinterRole): PrinterStatus {
  const [st, setSt] = useState<PrinterStatus>({ connected: false, name: "", type: null })

  useEffect(() => {
    if (!restored) {
      restored = true
      restoreMetaStatus("cashier")
      restoreMetaStatus("kitchen")
      // Attempt silent auto-reconnect for both printers on first mount.
      // autoReconnectBluetooth uses getDevices() (Chrome 85+) — no picker dialog.
      // autoReconnectUSB uses getPorts() — no picker dialog.
      // Both are fire-and-forget; failures are silently ignored.
      const roles: PrinterRole[] = ["cashier", "kitchen"]
      for (const r of roles) {
        autoReconnectBluetooth(r).catch(() => {})
        autoReconnectUSB(r).catch(() => {})
      }
    }
    setSt(getPrinterStatus(role))
    return subscribePrinterStatus(() => setSt(getPrinterStatus(role)))
  }, [role])

  return st
}
