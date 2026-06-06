"use client"

import { useState } from "react"
import { Wallet, LogIn, LogOut, Loader2, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

interface ShiftStartModalProps {
  open: boolean
  cashierName: string
  onStart: (startBalance: number) => Promise<boolean>
  staleShiftsClosed?: number
  onSignOut?: () => void
}

export default function ShiftStartModal({ open, cashierName, onStart, staleShiftsClosed = 0, onSignOut }: ShiftStartModalProps) {
  const [startBalance, setStartBalance] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const amount = parseFloat(startBalance)
    if (isNaN(amount) || amount < 0) {
      setError("Please enter a valid starting cash amount.")
      return
    }
    setIsLoading(true)
    const ok = await onStart(amount)
    setIsLoading(false)
    if (!ok) setError("Failed to start shift. Please try again.")
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    onSignOut?.()
  }

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader>
          <div className="flex items-center justify-center mb-3">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <Wallet className="h-7 w-7 text-green-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Start Your Shift</DialogTitle>
          <DialogDescription className="text-center">
            Welcome, <span className="font-semibold text-foreground">{cashierName}</span>!
            <br />
            <span className="text-xs">{today}</span>
          </DialogDescription>
        </DialogHeader>

        {staleShiftsClosed > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 mt-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold leading-snug">Previous shift was not closed</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-snug">
                Your last shift was automatically closed by the system. All sales from that session are still recorded. Check with your admin if you need a copy.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="startBalance" className="text-sm font-medium">
              Starting Cash Balance (₱)
            </Label>
            <Input
              id="startBalance"
              type="number"
              value={startBalance}
              onChange={(e) => setStartBalance(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              autoFocus
              required
              disabled={isLoading || isSigningOut}
              className="text-lg font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Count and enter the cash currently in the drawer.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isLoading || isSigningOut}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-4 w-4" />
            )}
            {isLoading ? "Starting shift..." : "Begin Shift"}
          </Button>
        </form>

        {onSignOut && (
          <>
            <div className="flex items-center gap-3 my-1">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground hover:text-red-600 hover:bg-red-50 gap-2"
              onClick={handleSignOut}
              disabled={isLoading || isSigningOut}
            >
              {isSigningOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isSigningOut ? "Signing out…" : "Sign Out"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
