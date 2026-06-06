"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"
import { useOfflineSync } from "@/hooks/use-offline-sync"

export default function SwRegister() {
  const [isOffline, setIsOffline] = useState(false)
  useOfflineSync()

  useEffect(() => {
    setIsOffline(!navigator.onLine)

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => console.log("[CGD POS] Service Worker registered"))
        .catch((err) => console.error("[CGD POS] SW registration failed:", err))
    }

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-yellow-500 px-4 py-2 text-sm font-medium text-yellow-950">
      <WifiOff className="h-4 w-4" />
      You are offline — orders will be saved locally and synced when reconnected
    </div>
  )
}
