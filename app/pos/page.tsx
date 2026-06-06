"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2, LayoutDashboard, AlertTriangle, RefreshCw } from "lucide-react"
import { useSession } from "next-auth/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import ProductGrid from "../components/product-grid"
import CartSidebar from "../components/cart-sidebar"
import CategorySidebar from "../components/category-sidebar"
import ShiftStartModal from "../components/shift-start-modal"
import ShiftCloseModal from "../components/shift-close-modal"
import { useShift } from "@/hooks/use-shift"
import { useProducts } from "../context/product-context"

export default function AdminPOSPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isEditMode, toggleEditMode } = useProducts()

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
  } = useShift()

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.replace("/")
    }
  }, [status, session, router])

  if (
    status === "loading" ||
    (status === "authenticated" && session?.user?.role !== "admin")
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
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">Coron Grill Diners</h1>
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                  Admin Mode
                </span>
              </div>
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant={isEditMode ? "default" : "outline"}
                size="sm"
                onClick={toggleEditMode}
              >
                {isEditMode ? "Done Editing" : "Edit Menu"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/admin")}
                className="gap-1.5"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Button>
              <div className="relative w-40 sm:w-56">
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
