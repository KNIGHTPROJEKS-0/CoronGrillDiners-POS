"use client"

import { useState, useEffect } from "react"
import { signOut } from "next-auth/react"
import { Wallet, CheckCircle, AlertTriangle, TrendingUp, Loader2, Printer, LogOut, EyeOff } from "lucide-react"
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
import type { Shift } from "@/hooks/use-shift"

interface ShiftCloseModalProps {
  open: boolean
  shift: Shift
  onClose: (endBalance: number) => Promise<Shift | null>
  onOpenChange: (open: boolean) => void
}

function fmt(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })
}

const AUTO_LOGOUT_SECONDS = 8

export default function ShiftCloseModal({ open, shift, onClose, onOpenChange }: ShiftCloseModalProps) {
  const [actualCash, setActualCash] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [closedShift, setClosedShift] = useState<Shift | null>(null)
  const [error, setError] = useState("")
  const [countdown, setCountdown] = useState(AUTO_LOGOUT_SECONDS)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const amount = parseFloat(actualCash) || 0

  // Auto-logout countdown after shift is closed
  useEffect(() => {
    if (!closedShift) return
    setCountdown(AUTO_LOGOUT_SECONDS)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setIsSigningOut(true)
          localStorage.removeItem("cart"); signOut({ redirect: false }).then(() => { window.location.href = "/login" })
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [closedShift])

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isNaN(amount) || amount < 0) {
      setError("Please enter a valid cash amount.")
      return
    }
    setError("")
    setIsLoading(true)
    const result = await onClose(amount)
    setIsLoading(false)
    if (result) {
      setClosedShift(result)
    } else {
      setError("Failed to close shift. Please try again.")
    }
  }

  const handlePrint = async () => {
    if (!closedShift) return
    /* Fetch this cashier's orders for the shift day, then filter to the
       shift window so multi-shift days don't bleed into each other. */
    let orders: any[] = []
    try {
      const shiftDate = new Date(closedShift.start_time).toLocaleDateString("en-CA")
      const res = await fetch(`/api/sales/my?date=${shiftDate}`)
      if (res.ok) {
        const data = await res.json()
        const all: any[] = data.orders ?? []
        const start = new Date(closedShift.start_time).getTime()
        const end = closedShift.end_time ? new Date(closedShift.end_time).getTime() : Date.now()
        orders = all.filter((o) => {
          const t = new Date(o.created_at).getTime()
          return t >= start && t <= end
        })
      }
    } catch { /* non-fatal — print without order detail */ }

    const disc = closedShift.discrepancy ?? 0
    const fmtP = (n: number) => `₱${(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const fmtT = (iso: string) => new Date(iso).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    })
    const completed = orders.filter((o) => o.status === "completed")
    const voided    = orders.filter((o) => o.status === "void")
    const cancelled = orders.filter((o) => o.status === "cancelled")

    const orderRow = (o: any, showReason = false) => `
      <tr>
        <td>${new Date(o.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
        <td><strong>${o.order_number}</strong></td>
        <td style="text-transform:capitalize">${o.payment_method}</td>
        <td style="font-size:10px">${(o.items as any[])?.map((it: any) => `${it.quantity}×${it.name}`).join(", ")}</td>
        <td style="text-align:right;font-family:monospace">${fmtP(o.grand_total)}</td>
        ${showReason ? `<td style="color:#888;font-style:italic;font-size:10px">${o.void_reason ?? ""}</td>` : ""}
      </tr>`

    const tbl = (rows: any[], showReason = false) => rows.length === 0 ? "<p style='color:#888;font-size:11px'>None</p>" : `
      <table>
        <thead><tr>
          <th>Time</th><th>Order #</th><th>Payment</th><th>Items</th>
          <th style="text-align:right">Amount</th>
          ${showReason ? "<th>Reason</th>" : ""}
        </tr></thead>
        <tbody>${rows.map((o) => orderRow(o, showReason)).join("")}</tbody>
      </table>`

    const html = `<!DOCTYPE html><html><head>
      <title>Shift Summary — ${closedShift.cashier_name}</title>
      <style>
        @page { size: A4; margin: 2cm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
        h1 { font-size: 22px; margin: 0 0 4px; }
        h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 2px solid #ddd; padding-bottom: 4px; }
        .no-print { position: fixed; top: 12px; right: 16px; z-index: 1000; }
        @media print { .no-print { display: none !important; } }
        .meta { color: #555; font-size: 11px; margin-bottom: 4px; }
        .stats { display: flex; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
        .stat { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; flex: 1; min-width: 120px; }
        .stat .lbl { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat .val { font-size: 20px; font-weight: bold; margin-top: 4px; }
        .stat .sub { font-size: 11px; color: #555; margin-top: 2px; }
        .cashflow { background: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 18px; margin: 16px 0; }
        .cf-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
        .cf-total { display: flex; justify-content: space-between; padding: 8px 0 4px; font-size: 15px; font-weight: bold; border-top: 2px solid #ccc; margin-top: 6px; }
        .disc { border-radius: 6px; padding: 8px 14px; display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 8px; }
        .disc.ok  { background: #dcfce7; color: #15803d; }
        .disc.over{ background: #dbeafe; color: #1d4ed8; }
        .disc.short{ background: #fee2e2; color: #dc2626; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
        th { text-align: left; padding: 5px 8px; background: #f5f5f5; border-bottom: 2px solid #ddd; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
        td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
        .sig { display: flex; gap: 60px; margin-top: 40px; }
        .sig-line { flex: 1; border-top: 1px solid #555; padding-top: 4px; font-size: 11px; color: #555; }
        .footer { margin-top: 30px; font-size: 10px; color: #aaa; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
      </style>
    </head><body>
      <h1>Shift Summary Report</h1>
      <div class="meta"><strong>Coron Grill Diners</strong> — Beside Panda House, 1 Don Pedro St, Barangay Poblacion, Coron</div>
      <div class="meta">
        <strong>Cashier:</strong> ${closedShift.cashier_name} &nbsp;|&nbsp;
        <strong>Shift Start:</strong> ${fmtT(closedShift.start_time)} &nbsp;|&nbsp;
        <strong>Shift End:</strong> ${closedShift.end_time ? fmtT(closedShift.end_time) : "—"} &nbsp;|&nbsp;
        <strong>Printed:</strong> ${new Date().toLocaleString("en-PH")}
      </div>

      <div class="stats">
        <div class="stat">
          <div class="lbl">Completed Orders</div>
          <div class="val" style="color:#16a34a">${completed.length}</div>
          <div class="sub">${fmtP(completed.reduce((s, o) => s + o.grand_total, 0))} revenue</div>
        </div>
        <div class="stat">
          <div class="lbl">Void Orders</div>
          <div class="val" style="color:#dc2626">${voided.length}</div>
          <div class="sub">${fmtP(voided.reduce((s, o) => s + o.grand_total, 0))} forfeited</div>
        </div>
        <div class="stat">
          <div class="lbl">Cancelled</div>
          <div class="val" style="color:#6b7280">${cancelled.length}</div>
          <div class="sub">${fmtP(cancelled.reduce((s, o) => s + o.grand_total, 0))}</div>
        </div>
        <div class="stat">
          <div class="lbl">Total Sales</div>
          <div class="val">${fmtP(closedShift.total_sales)}</div>
          <div class="sub">all methods</div>
        </div>
      </div>

      <h2>Cash Reconciliation</h2>
      <div class="cashflow">
        <div class="cf-row"><span>Starting Cash</span><span>${fmtP(closedShift.start_balance)}</span></div>
        <div class="cf-row"><span>Cash Sales (+)</span><span>${fmtP(closedShift.total_cash_sales)}</span></div>
        <div class="cf-total"><span>Expected Cash in Drawer</span><span>${fmtP(closedShift.expected_cash ?? 0)}</span></div>
        <div class="cf-row" style="margin-top:8px"><span>Actual Cash Counted</span><span>${fmtP(closedShift.end_balance ?? 0)}</span></div>
        <div class="disc ${disc === 0 ? "ok" : disc > 0 ? "over" : "short"}">
          <span>${disc === 0 ? "Balanced ✓" : disc > 0 ? "Extra Cash" : "Missing Cash"}</span>
          <span>${disc >= 0 ? "+" : "-"}${fmtP(Math.abs(disc))}</span>
        </div>
      </div>

      ${completed.length > 0 ? `<h2>Completed Orders (${completed.length})</h2>${tbl(completed)}` : ""}
      ${voided.length > 0 ? `<h2>Void Orders (${voided.length})</h2>${tbl(voided, true)}` : ""}
      ${cancelled.length > 0 ? `<h2>Cancelled Orders (${cancelled.length})</h2>${tbl(cancelled, true)}` : ""}

      <div class="sig">
        <div class="sig-line">Cashier Signature: ${closedShift.cashier_name}</div>
        <div class="sig-line">Supervisor / Admin</div>
      </div>
      <div class="footer">Generated by Coron Grill Diners POS System</div>
      <div class="no-print" style="margin-bottom:8px">
        <button onclick="window.close()" style="background:#1a1a2e;color:#fff;border:none;padding:9px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif">&#8592; Close Window</button>
      </div>
    </body></html>`

    const w = window.open("", "_blank", "width=900,height=700")
    if (!w) { alert("Allow pop-ups to print the shift summary."); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 600)
  }

  const handleSignOutNow = () => {
    setIsSigningOut(true)
    localStorage.removeItem("cart")
    signOut({ redirect: false }).then(() => { window.location.href = "/login" })
  }

  if (closedShift) {
    const disc = closedShift.discrepancy ?? 0
    const isOver = disc > 0
    const isShort = disc < 0
    const isExact = disc === 0

    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-sm print:shadow-none"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          hideCloseButton
        >
          <DialogHeader>
            <div className="flex items-center justify-center mb-2">
              <div className={`h-14 w-14 rounded-full flex items-center justify-center ${isExact ? "bg-green-100" : isOver ? "bg-blue-100" : "bg-red-100"}`}>
                {isExact ? (
                  <CheckCircle className="h-7 w-7 text-green-600" />
                ) : isOver ? (
                  <TrendingUp className="h-7 w-7 text-blue-600" />
                ) : (
                  <AlertTriangle className="h-7 w-7 text-red-600" />
                )}
              </div>
            </div>
            <DialogTitle className="text-center">Shift Closed</DialogTitle>
            <DialogDescription className="text-center text-xs">
              {closedShift.cashier_name} · {formatTime(closedShift.start_time)} – {closedShift.end_time ? formatTime(closedShift.end_time) : "now"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm mt-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Starting Cash</span><span className="font-mono">{fmt(closedShift.start_balance)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cash Sales</span><span className="font-mono text-green-600">+{fmt(closedShift.total_cash_sales)}</span></div>
            <div className="flex justify-between font-medium border-t pt-2"><span>Expected Cash</span><span className="font-mono">{fmt(closedShift.expected_cash ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Actual Cash</span><span className="font-mono">{fmt(closedShift.end_balance ?? 0)}</span></div>
            <Separator />
            <div className={`flex justify-between font-bold text-base rounded-lg px-3 py-2 ${isExact ? "bg-green-50 text-green-700" : isOver ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
              <span>{isOver ? "Extra Cash" : isShort ? "Missing Cash" : "Balanced"}</span>
              <span className="font-mono">{isOver ? "+" : isShort ? "-" : ""}{fmt(Math.abs(disc))}</span>
            </div>
            {(isOver || isShort) && (
              <p className="text-[11px] text-muted-foreground italic text-center -mt-0.5">
                {isOver ? "Drawer had more cash than expected." : "Drawer had less cash than expected."}
              </p>
            )}
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>Total Sales (all methods)</span>
              <span className="font-mono">{fmt(closedShift.total_sales)}</span>
            </div>
          </div>

          {/* Auto-logout countdown */}
          <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5 text-center">
            <p className="text-xs text-orange-700">
              Signing out automatically in{" "}
              <span className="font-bold text-orange-800 text-sm">{countdown}s</span>
            </p>
          </div>

          <div className="flex gap-2 mt-3">
            <Button variant="outline" className="flex-1" onClick={handlePrint} disabled={isSigningOut}>
              <Printer className="mr-2 h-4 w-4" />Print
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700 gap-2"
              onClick={handleSignOutNow}
              disabled={isSigningOut}
            >
              {isSigningOut
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <LogOut className="h-4 w-4" />
              }
              {isSigningOut ? "Signing out…" : "Sign Out Now"}
            </Button>
          </div>

          {/* Print-only version */}
          <div className="hidden print:block">
            <ShiftPrintReceipt shift={closedShift} />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="h-14 w-14 rounded-full bg-orange-100 flex items-center justify-center">
              <Wallet className="h-7 w-7 text-orange-600" />
            </div>
          </div>
          <DialogTitle className="text-center">Close Shift</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Started at {formatTime(shift.start_time)} · Count your drawer and enter the actual cash to tally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 text-sm bg-muted/40 rounded-lg p-3 mt-2">
          <div className="flex justify-between"><span className="text-muted-foreground">Starting Cash</span><span className="font-mono">{fmt(shift.start_balance)}</span></div>
          <div className="flex items-center gap-2 border-t pt-2 text-muted-foreground">
            <EyeOff className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs">
              Cash sales &amp; expected drawer total are hidden. Count your drawer first — the tally is revealed after you close the shift.
            </span>
          </div>
        </div>

        <form onSubmit={handleClose} className="space-y-3 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="actualCash">Actual Cash in Drawer (₱)</Label>
            <Input
              id="actualCash"
              type="number"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              autoFocus
              required
              disabled={isLoading}
              className="text-lg font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoading ? "Closing..." : "Close Shift"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ShiftPrintReceipt({ shift }: { shift: Shift }) {
  const disc = shift.discrepancy ?? 0
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("en-PH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true })

  return (
    <div style={{ fontFamily: "monospace", fontSize: "12px", width: "80mm", margin: "0 auto", padding: "8px" }}>
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>CORON GRILL DINERS</div>
        <div style={{ fontSize: "10px" }}>Beside Panda House, 1 Don Pedro St</div>
        <div style={{ fontSize: "10px" }}>Barangay Poblacion, Coron</div>
        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div style={{ fontWeight: "bold", fontSize: "13px" }}>SHIFT SUMMARY</div>
      </div>

      <div style={{ marginBottom: "6px" }}>
        <div><strong>Cashier:</strong> {shift.cashier_name}</div>
        <div><strong>Start:</strong> {formatTime(shift.start_time)}</div>
        {shift.end_time && <div><strong>End:</strong> {formatTime(shift.end_time)}</div>}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

      <table style={{ width: "100%", fontSize: "11px" }}>
        <tbody>
          <tr><td>Starting Cash</td><td style={{ textAlign: "right" }}>₱{shift.start_balance.toFixed(2)}</td></tr>
          <tr><td>Cash Sales</td><td style={{ textAlign: "right" }}>+₱{shift.total_cash_sales.toFixed(2)}</td></tr>
          <tr><td>Expected Cash</td><td style={{ textAlign: "right" }}>₱{(shift.expected_cash ?? 0).toFixed(2)}</td></tr>
          <tr><td>Actual Cash</td><td style={{ textAlign: "right" }}>₱{(shift.end_balance ?? 0).toFixed(2)}</td></tr>
          <tr><td style={{ borderTop: "1px dashed #000", paddingTop: "4px", fontWeight: "bold" }}>{disc > 0 ? "EXTRA CASH" : disc < 0 ? "MISSING CASH" : "BALANCED"}</td>
            <td style={{ borderTop: "1px dashed #000", paddingTop: "4px", fontWeight: "bold", textAlign: "right" }}>{disc > 0 ? "+" : disc < 0 ? "-" : ""}₱{Math.abs(disc).toFixed(2)}</td>
          </tr>
          <tr><td colSpan={2} style={{ paddingTop: "4px" }}> </td></tr>
          <tr><td style={{ fontWeight: "bold" }}>TOTAL SALES (ALL)</td><td style={{ fontWeight: "bold", textAlign: "right" }}>₱{Number(shift.total_sales || 0).toFixed(2)}</td></tr>
        </tbody>
      </table>

      <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
      <div style={{ textAlign: "center", fontSize: "10px" }}>Thank you for your service!</div>
    </div>
  )
}
