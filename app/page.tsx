"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2, AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { useSession, signOut } from "next-auth/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import ProductGrid from "./components/product-grid"
import CartSidebar from "./components/cart-sidebar"
import CategorySidebar from "./components/category-sidebar"
import ShiftStartModal from "./components/shift-start-modal"
import ShiftCloseModal from "./components/shift-close-modal"
import { useShift } from "@/hooks/use-shift"
import { useOnlineStatus, useOfflineSync } from "@/hooks/use-offline-sync"

export default function POSPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const { data: session, status } = useSession()
  const router = useRouter()
  const isOnline = useOnlineStatus()
  useOfflineSync()

  const {
    shift,
    loading,
    shiftError,
    showStartModal,
    showCloseModal,
    setShowCloseModal,
    startShift,
    closeShift,
    refreshShift,
    staleShiftsClosed,
  } = useShift()

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "admin") {
      router.replace("/admin")
    }
  }, [status, session, router])

  if (
    status === "loading" ||
    (status === "authenticated" && session?.user?.role === "admin")
  ) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <CategorySidebar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        shift={shift}
        onCloseShift={() => setShowCloseModal(true)}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="sticky top-0 z-10 bg-background p-4 border-b">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">Coron Grill Diners</h1>
              {shift && !loading && (
                <p className="text-xs text-muted-foreground">
                  Shift started ·{" "}
                  {new Date(shift.start_time).toLocaleTimeString("en-PH", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                  {" "}· Starting cash: ₱{shift.start_balance.toFixed(2)}
                </p>
              )}
            </div>

            {/* Connection status badge */}
            <Badge
              variant="outline"
              className={`flex items-center gap-1.5 flex-shrink-0 text-xs font-medium ${
                isOnline
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {isOnline ? "Online" : "Offline"}
            </Badge>

            <div className="relative w-48 sm:w-64 flex-shrink-0">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {shiftError && (
          <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">Unable to reach the server. Shift information could not be loaded.</span>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
              onClick={refreshShift}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          <ProductGrid category={selectedCategory} searchQuery={searchQuery} />
        </div>
      </main>

      <CartSidebar />

      {!loading && !shiftError && session?.user && (
        <>
          <ShiftStartModal
            open={showStartModal}
            cashierName={session.user.name ?? ""}
            onStart={startShift}
            staleShiftsClosed={staleShiftsClosed}
            onSignOut={async () => { localStorage.removeItem("cart"); await signOut({ redirect: false }); window.location.href = "/login" }}
          />
          {shift && (
            <ShiftCloseModal
              open={showCloseModal}
              shift={shift}
              onClose={closeShift}
              onOpenChange={setShowCloseModal}
            />
          )}
        </>
      )}
    </div>
  )
}
