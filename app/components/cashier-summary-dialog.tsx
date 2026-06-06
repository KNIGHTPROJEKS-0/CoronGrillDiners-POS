"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Printer, RefreshCw, CheckCircle, X, AlertTriangle, Wallet, CreditCard,
  TrendingUp, ShoppingBag, Ban, History, KeyRound,
} from "lucide-react"
import { useProducts } from "../context/product-context"

interface SaleRecord {
  id: string
  order_number: string
  items: Array<{ name: string; quantity: number; price: number }>
  subtotal: number
  service_charge: number
  discount_percent?: number
  grand_total: number
  amount_tendered?: number
  change_amount?: number
  payment_method: string
  server_name: string
  created_by: string
  status: string
  void_reason: string | null
  created_at: string
}

interface StatRow {
  status: string
  count: number
  total: number
}

interface SummaryData {
  date: string
  cashier: string
  stats: StatRow[]
  orders: SaleRecord[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  cashierName: string
}

function fmt(n: number) {
  return `₱${(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function PaymentIcon({ method }: { method: string }) {
  if (method === "cash") return <Wallet className="h-3 w-3 inline mr-0.5" />
  if (method === "card") return <CreditCard className="h-3 w-3 inline mr-0.5" />
  return <span className="mr-0.5 text-[10px] font-bold">G</span>
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
      <CheckCircle className="h-2.5 w-2.5" />Done
    </span>
  )
  if (status === "void") return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
      <X className="h-2.5 w-2.5" />Void
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
      <Ban className="h-2.5 w-2.5" />Cancelled
    </span>
  )
}

export default function CashierSummaryDialog({ open, onOpenChange, cashierName }: Props) {
  const { refreshProducts } = useProducts()
  const router = useRouter()
  const today = new Date().toLocaleDateString("en-CA")
  const [date, setDate] = useState(today)
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [error, setError] = useState("")

  // Void-by-code state — per order
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidPanel, setVoidPanel] = useState<string | null>(null)
  const [voidCode, setVoidCode] = useState<Record<string, string>>({})
  const [voidReason, setVoidReason] = useState<Record<string, string>>({})
  const [voidError, setVoidError] = useState<Record<string, string>>({})

  // Cancel state
  const [cancelPanel, setCancelPanel] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/sales/my?date=${date}`)
      if (res.ok) setData(await res.json())
      else setError("Failed to load history.")
    } catch {
      setError("Failed to load history.")
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    if (open) fetchData()
  }, [open, fetchData])

  const getStat = (status: string) => data?.stats.find(s => s.status === status)
  const completedStat = getStat("completed")
  const voidStat = getStat("void")
  const cancelledStat = getStat("cancelled")

  const filteredOrders = (data?.orders ?? []).filter(o =>
    statusFilter === "all" || o.status === statusFilter
  )

  const handleVoidWithCode = async (orderId: string) => {
    const code = (voidCode[orderId] ?? "").trim()
    if (!code) {
      setVoidError(prev => ({ ...prev, [orderId]: "Please enter the void authorization code." }))
      return
    }
    setVoidingId(orderId)
    setVoidError(prev => ({ ...prev, [orderId]: "" }))

    try {
      const res = await fetch("/api/void-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          saleId: orderId,
          reason: (voidReason[orderId] ?? "").trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setVoidError(prev => ({ ...prev, [orderId]: json.error ?? "Failed to void order." }))
      } else {
        setVoidPanel(null)
        setVoidCode(prev => { const n = { ...prev }; delete n[orderId]; return n })
        setVoidReason(prev => { const n = { ...prev }; delete n[orderId]; return n })
        fetchData()
        refreshProducts().catch(() => {})
      }
    } catch {
      setVoidError(prev => ({ ...prev, [orderId]: "Network error. Please try again." }))
    } finally {
      setVoidingId(null)
    }
  }

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId)
    setCancelError("")
    try {
      const res = await fetch(`/api/sales/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "cancelled",
          voidReason: cancelReason.trim() || "Cancelled by cashier",
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setCancelError(json.error ?? "Failed to cancel order.")
      } else {
        setCancelPanel(null)
        setCancelReason("")
        fetchData()
        refreshProducts().catch(() => {})
      }
    } catch {
      setCancelError("Network error. Please try again.")
    } finally {
      setCancellingId(null)
    }
  }

  const handleViewOrder = (order: SaleRecord) => {
    // Build text receipt exactly the same way as storeReceiptData in checkout
    const W = 32
    const pad = (str: string, len: number, align: "left" | "right" = "left") => {
      const s = String(str).substring(0, len)
      return align === "right" ? s.padStart(len) : s.padEnd(len)
    }
    const leftRight = (left: string, right: string) => {
      const gap = W - left.length - right.length
      if (gap <= 0) return (left.substring(0, W - right.length - 1) + " " + right).substring(0, W)
      return left + " ".repeat(gap) + right
    }
    const center = (text: string) => {
      const s = text.substring(0, W)
      const p = Math.max(0, Math.floor((W - s.length) / 2))
      return " ".repeat(p) + s
    }
    const divider = (ch = "-") => ch.repeat(W)

    const dateTime = new Date(order.created_at).toLocaleString("en-PH", {
      month: "long", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    })

    const lines: string[] = []
    lines.push(center("CORON GRILL DINERS"))
    lines.push(center("Beside Panda House,"))
    lines.push(center("1 Don Pedro St, Brgy. Poblacion"))
    lines.push(center("Coron, Palawan"))
    lines.push(divider())
    lines.push(leftRight("Date:", dateTime.substring(0, 20)))
    lines.push(leftRight("Order #:", order.order_number))
    lines.push(leftRight("Server:", order.server_name || cashierName))
    lines.push(leftRight("Payment:", order.payment_method.toUpperCase()))
    lines.push(divider())
    lines.push(leftRight("QTY  ITEM", "PRICE"))
    lines.push(divider())
    for (const item of order.items as any[]) {
      const qty = `${item.quantity}x`.padEnd(5)
      const price = `P${(item.price * item.quantity).toFixed(2)}`
      const nameLen = W - qty.length - price.length - 1
      const name = item.name.substring(0, nameLen).padEnd(nameLen)
      lines.push(`${qty}${name} ${price}`)
      if (item.name.length > nameLen) {
        const rest = item.name.substring(nameLen)
        for (let i = 0; i < rest.length; i += nameLen) lines.push("     " + rest.substring(i, i + nameLen))
      }
    }
    lines.push(divider())
    lines.push(leftRight("Subtotal:", `P${order.subtotal.toFixed(2)}`))
    if ((order.discount_percent ?? 0) > 0) {
      lines.push(leftRight(`Sr. Citizen Disc.(${order.discount_percent}%):`, `-P${order.service_charge.toFixed(2)}`))
    }
    lines.push(divider("-"))
    lines.push(leftRight("GRAND TOTAL:", `P${order.grand_total.toFixed(2)}`))
    lines.push(divider("-"))
    if (order.payment_method === "cash") {
      const tendered = order.amount_tendered ?? order.grand_total
      const change   = order.change_amount ?? 0
      lines.push(leftRight("Tendered:", `P${tendered.toFixed(2)}`))
      lines.push(leftRight("Change:",   `P${change.toFixed(2)}`))
    }
    lines.push(divider())
    lines.push(center("Thank you for dining!"))
    lines.push(center("Visit us again in Coron!"))
    lines.push(center("--- END OF RECEIPT ---"))
    const receiptText = lines.join("\n")

    // Kitchen ticket text
    const kSep = "=".repeat(W)
    const kLines: string[] = ["** KITCHEN **", kSep, `Order #:  ${order.order_number}`]
    const kTimePart = dateTime.includes(",") ? dateTime.split(",").pop()?.trim() ?? dateTime : dateTime
    kLines.push(`Time:     ${kTimePart}`, `Server:   ${order.server_name || cashierName}`)
    kLines.push(kSep)
    for (const item of order.items as any[]) kLines.push(`${item.quantity}x  ${item.name}`)
    kLines.push(kSep, "** END OF ORDER **")
    const kitchenText = kLines.join("\n")

    // PrintData for direct BLE/USB printing on the /receipt page
    const printData = {
      items: (order.items as any[]).map((it: any, idx: number) => ({
        id: idx, name: it.name, price: it.price, quantity: it.quantity,
      })),
      subtotal: order.subtotal,
      discountPercent: order.discount_percent ?? 0,
      discountAmount: order.service_charge,
      grandTotal: order.grand_total,
      amountTendered: order.amount_tendered ?? order.grand_total,
      change: order.change_amount ?? 0,
      orderNumber: order.order_number,
      serverName: order.server_name || cashierName,
      dateTime,
      paymentMethod: order.payment_method,
    }

    try {
      localStorage.setItem("cgd_active_receipt", JSON.stringify({
        receiptText,
        kitchenText,
        autoPrintKitchen: false,
        orderNumber: order.order_number,
        printDataJson: JSON.stringify(printData),
        returnPath: "/",
        ts: Date.now(),
      }))
    } catch { /* Safari private mode */ }

    onOpenChange(false)
    router.push("/receipt")
  }

  const handlePrint = () => {
    if (!data) return

    const printWindow = window.open("", "_blank", "width=850,height=700")
    if (!printWindow) {
      alert("Allow pop-ups to print your summary.")
      return
    }

    const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    })

    const completedOrders = data.orders.filter(o => o.status === "completed")
    const voidOrders = data.orders.filter(o => o.status === "void")
    const cancelledOrders = data.orders.filter(o => o.status === "cancelled")
    const totalRevenue = completedOrders.reduce((s, o) => s + o.grand_total, 0)

    const orderRows = (orders: SaleRecord[], showReason = false) =>
      orders.map(o => `
        <tr>
          <td>${fmtTime(o.created_at)}</td>
          <td><strong>${o.order_number}</strong></td>
          <td style="text-transform:capitalize">${o.payment_method}</td>
          <td>${(o.items as any[])?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")}</td>
          <td style="text-align:right;font-family:monospace">₱${o.grand_total.toFixed(2)}</td>
          ${showReason ? `<td style="color:#666;font-style:italic">${o.void_reason ?? ""}</td>` : ""}
        </tr>
      `).join("")

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order History — ${cashierName} — ${date}</title>
        <style>
          @page { size: auto; margin: 2cm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          .header { margin-bottom: 20px; }
          .meta { color: #555; font-size: 11px; }
          .stats { display: flex; gap: 20px; margin-bottom: 20px; }
          .stat-box { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; flex: 1; }
          .stat-box .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
          .stat-box .value { font-size: 18px; font-weight: bold; margin-top: 4px; }
          .stat-box .sub { font-size: 11px; color: #555; margin-top: 2px; }
          .green { color: #16a34a; }
          .red { color: #dc2626; }
          .gray { color: #6b7280; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; padding: 6px 8px; background: #f5f5f5; border-bottom: 2px solid #ddd; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
          tr:last-child td { border-bottom: none; }
          .footer { margin-top: 30px; font-size: 10px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
          .no-print { position: fixed; top: 12px; right: 16px; z-index: 1000; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="no-print">
          <button onclick="window.close()" style="background:#1a1a2e;color:#fff;border:none;padding:9px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif">&#8592; Close Window</button>
        </div>
        <div class="header">
          <h1>Order History Report</h1>
          <div class="meta">
            <strong>Cashier:</strong> ${cashierName} &nbsp;|&nbsp;
            <strong>Date:</strong> ${dateLabel} &nbsp;|&nbsp;
            <strong>Printed:</strong> ${new Date().toLocaleString("en-PH")}
          </div>
          <div style="margin-top:6px;font-size:11px;color:#888">Coron Grill Diners — Beside Panda House, 1 Don Pedro St, Barangay Poblacion, Coron</div>
        </div>

        <div class="stats">
          <div class="stat-box">
            <div class="label">Completed Orders</div>
            <div class="value green">${completedOrders.length}</div>
            <div class="sub">₱${totalRevenue.toFixed(2)} revenue</div>
          </div>
          <div class="stat-box">
            <div class="label">Void Orders</div>
            <div class="value red">${voidOrders.length}</div>
            <div class="sub">₱${voidOrders.reduce((s, o) => s + o.grand_total, 0).toFixed(2)} forfeited</div>
          </div>
          <div class="stat-box">
            <div class="label">Cancelled Orders</div>
            <div class="value gray">${cancelledOrders.length}</div>
            <div class="sub">₱${cancelledOrders.reduce((s, o) => s + o.grand_total, 0).toFixed(2)} cancelled</div>
          </div>
          <div class="stat-box">
            <div class="label">Total Orders</div>
            <div class="value">${data.orders.length}</div>
            <div class="sub">all statuses</div>
          </div>
        </div>

        ${completedOrders.length > 0 ? `
        <h2>Completed Orders (${completedOrders.length})</h2>
        <table>
          <thead><tr><th>Time</th><th>Order #</th><th>Payment</th><th>Items</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>${orderRows(completedOrders)}</tbody>
          <tfoot><tr>
            <td colspan="4" style="font-weight:bold;padding-top:8px">Total Revenue</td>
            <td style="text-align:right;font-weight:bold;font-family:monospace;padding-top:8px">₱${totalRevenue.toFixed(2)}</td>
          </tr></tfoot>
        </table>
        ` : ""}

        ${voidOrders.length > 0 ? `
        <h2>Void Orders (${voidOrders.length})</h2>
        <table>
          <thead><tr><th>Time</th><th>Order #</th><th>Payment</th><th>Items</th><th style="text-align:right">Amount</th><th>Reason</th></tr></thead>
          <tbody>${orderRows(voidOrders, true)}</tbody>
        </table>
        ` : ""}

        ${cancelledOrders.length > 0 ? `
        <h2>Cancelled Orders (${cancelledOrders.length})</h2>
        <table>
          <thead><tr><th>Time</th><th>Order #</th><th>Payment</th><th>Items</th><th style="text-align:right">Amount</th><th>Reason</th></tr></thead>
          <tbody>${orderRows(cancelledOrders, true)}</tbody>
        </table>
        ` : ""}

        <div class="footer">End of Report — Coron Grill Diners POS System</div>
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 400)
  }

  const totalOrders = data?.orders.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Order History
          </DialogTitle>
          <DialogDescription>
            {cashierName} — view and manage your daily transactions
          </DialogDescription>
        </DialogHeader>

        {/* Date picker + actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm bg-white flex-1"
          />
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data || loading} className="gap-2">
            <Printer className="h-4 w-4" />Print
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex-shrink-0">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? null : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">Completed</p>
                <p className="text-xl font-bold text-green-700 mt-0.5">{completedStat?.count ?? 0}</p>
                <p className="text-xs text-green-600 font-mono mt-0.5">{fmt(completedStat?.total ?? 0)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                <p className="text-[10px] text-red-600 font-semibold uppercase tracking-wide">Void</p>
                <p className="text-xl font-bold text-red-700 mt-0.5">{voidStat?.count ?? 0}</p>
                <p className="text-xs text-red-600 font-mono mt-0.5">{fmt(voidStat?.total ?? 0)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Cancelled</p>
                <p className="text-xl font-bold text-gray-700 mt-0.5">{cancelledStat?.count ?? 0}</p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{fmt(cancelledStat?.total ?? 0)}</p>
              </div>
              <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                <p className="text-[10px] text-primary font-semibold uppercase tracking-wide">Total</p>
                <p className="text-xl font-bold mt-0.5">{totalOrders}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">all orders</p>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              {["all", "completed", "void", "cancelled"].map((f) => {
                const count = f === "all" ? totalOrders : (data.orders.filter(o => o.status === f).length)
                return (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                  </button>
                )
              })}
            </div>

            {/* Orders list */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 pr-1">
              {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShoppingBag className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No {statusFilter === "all" ? "" : statusFilter} orders for this date.</p>
                </div>
              ) : filteredOrders.map((order) => (
                <div key={order.id} className={`border rounded-lg px-3 py-2.5 bg-white ${order.status !== "completed" ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm">{order.order_number}</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          <PaymentIcon method={order.payment_method} />{order.payment_method}
                        </span>
                        <StatusBadge status={order.status} />
                        {(order.discount_percent ?? 0) > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                            {order.discount_percent}% Senior
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{fmtTime(order.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {(order.items as any[])?.map((it: any) => `${it.quantity}× ${it.name}`).join(", ")}
                      </p>
                      {order.void_reason && (
                        <p className="text-xs text-red-500 italic mt-0.5">Reason: {order.void_reason}</p>
                      )}
                    </div>

                    <div className="flex items-start gap-1.5 flex-shrink-0">
                      <p className="font-bold text-sm font-mono">{fmt(order.grand_total)}</p>

                      {/* Per-order reprint — goes to the full /receipt print page */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-green-700"
                        title="Reprint receipt / kitchen ticket"
                        onClick={() => handleViewOrder(order)}
                      >
                        <Printer className="h-3 w-3" />
                      </Button>

                      {order.status === "completed" && (
                        cancelPanel === order.id ? (
                          /* ── Cancel panel ── */
                          <div className="flex flex-col gap-1.5 items-end min-w-[190px]">
                            <div className="flex items-center gap-1 text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 w-full">
                              <Ban className="h-3 w-3 flex-shrink-0" />
                              <span>Cancel order {order.order_number}?</span>
                            </div>
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              className="border rounded px-2 py-0.5 text-xs w-full"
                              autoFocus
                            />
                            {cancelError && cancelPanel === order.id && (
                              <p className="text-[10px] text-red-600 w-full">{cancelError}</p>
                            )}
                            <div className="flex gap-1 w-full">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2 flex-1 text-orange-700 border-orange-300 hover:bg-orange-50"
                                onClick={() => handleCancel(order.id)}
                                disabled={cancellingId === order.id}
                              >
                                {cancellingId === order.id
                                  ? <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                  : "Confirm Cancel"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2"
                                onClick={() => { setCancelPanel(null); setCancelError("") }}
                              >
                                Back
                              </Button>
                            </div>
                          </div>
                        ) : voidPanel === order.id ? (
                          /* ── Void-by-code panel ── */
                          <div className="flex flex-col gap-1.5 items-end min-w-[190px]">
                            <div className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 w-full">
                              <KeyRound className="h-3 w-3 flex-shrink-0" />
                              <span>Enter admin void code</span>
                            </div>
                            <input
                              type="text"
                              placeholder="e.g. CGD-V1-K7M2X1"
                              value={voidCode[order.id] ?? ""}
                              onChange={(e) =>
                                setVoidCode(prev => ({ ...prev, [order.id]: e.target.value.toUpperCase() }))
                              }
                              className="border rounded px-2 py-0.5 text-xs w-full font-mono tracking-wider"
                              autoFocus
                            />
                            <input
                              type="text"
                              placeholder="Reason (optional)"
                              value={voidReason[order.id] ?? ""}
                              onChange={(e) =>
                                setVoidReason(prev => ({ ...prev, [order.id]: e.target.value }))
                              }
                              className="border rounded px-2 py-0.5 text-xs w-full"
                            />
                            {voidError[order.id] && (
                              <p className="text-[10px] text-red-600 w-full">{voidError[order.id]}</p>
                            )}
                            <div className="flex gap-1 w-full">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 text-[10px] px-2 flex-1"
                                onClick={() => handleVoidWithCode(order.id)}
                                disabled={voidingId === order.id}
                              >
                                {voidingId === order.id
                                  ? <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                  : "Confirm Void"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] px-2"
                                onClick={() => {
                                  setVoidPanel(null)
                                  setVoidError(prev => ({ ...prev, [order.id]: "" }))
                                }}
                              >
                                Back
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* ── Normal action buttons ── */
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 text-orange-600 border-orange-200 hover:bg-orange-50 w-full justify-start gap-1"
                              onClick={() => { setVoidPanel(null); setCancelPanel(order.id); setCancelReason(""); setCancelError("") }}
                            >
                              <Ban className="h-2.5 w-2.5" />Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50 w-full justify-start gap-1"
                              onClick={() => { setCancelPanel(null); setVoidPanel(order.id) }}
                            >
                              <KeyRound className="h-2.5 w-2.5" />Void
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total revenue footer */}
            <div className="flex-shrink-0 border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Revenue (completed)</span>
              <span className="text-lg font-bold text-green-600 font-mono">
                {fmt(data.orders.filter(o => !o.status || o.status === "completed").reduce((s, o) => s + o.grand_total, 0))}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
