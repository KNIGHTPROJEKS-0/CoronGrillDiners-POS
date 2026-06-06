"use client"

import { useCallback } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle, AlertTriangle, TrendingUp, TrendingDown,
  Wallet, CreditCard, FileSpreadsheet, FileText, Printer, X, Ban,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftRecord {
  id: number
  cashier_name: string
  cashier_username: string
  start_time: string
  end_time: string | null
  status: "open" | "closed"
  archived: boolean
  notes: string | null
  start_balance: number
  end_balance: number | null
  total_cash_sales: number
  total_sales: number
  expected_cash: number | null
  discrepancy: number | null
}

interface SaleRecord {
  id: string
  order_number: string
  items: Array<{ name: string; quantity: number; price: number }>
  subtotal: number
  service_charge: number
  grand_total: number
  discount_percent?: number
  payment_method: string
  server_name: string
  created_by: string
  status: string
  void_reason: string | null
  created_at: string
}

interface ShiftSummaryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: ShiftRecord
  sales: SaleRecord[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₱${(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })
}

function getPaymentBreakdown(sales: SaleRecord[]) {
  const completed = sales.filter(s => s.status === "completed")
  const map: Record<string, { count: number; total: number }> = {}
  for (const s of completed) {
    if (!map[s.payment_method]) map[s.payment_method] = { count: 0, total: 0 }
    map[s.payment_method].count++
    map[s.payment_method].total += s.grand_total
  }
  return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
}

function itemsStr(items: Array<{ name: string; quantity: number }>) {
  return items?.map(i => `${i.quantity}x ${i.name}`).join(", ") || ""
}

function PaymentIcon({ method }: { method: string }) {
  if (method === "cash") return <Wallet className="h-3.5 w-3.5 inline mr-1 text-green-600" />
  if (method === "card") return <CreditCard className="h-3.5 w-3.5 inline mr-1 text-blue-600" />
  return <span className="mr-1 text-[10px] font-bold text-purple-600">G</span>
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

// ─── CSV Export (opens in Excel) ──────────────────────────────────────────────

function csvEscape(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? "" : String(val)
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCSV(rows: (string | number | null)[][]): string {
  return rows.map(r => r.map(csvEscape).join(",")).join("\r\n")
}

function downloadFile(content: string, filename: string, mime: string) {
  const BOM = "\uFEFF"
  const blob = new Blob([BOM + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadExcel(shift: ShiftRecord, sales: SaleRecord[]) {
  const disc = shift.discrepancy ?? 0
  const discLabel = disc > 0 ? "Overage" : disc < 0 ? "Shortage" : "Balanced"
  const shiftDate = new Date(shift.start_time).toLocaleDateString("en-CA")
  const payBreak = getPaymentBreakdown(sales)
  const completed = sales.filter(s => s.status === "completed")
  const voided   = sales.filter(s => s.status === "void")
  const cancelled = sales.filter(s => s.status === "cancelled")
  // Live-computed totals — always match what is shown on screen
  const liveTotalSales = completed.reduce((a, s) => a + s.grand_total, 0)
  const liveCashSales  = completed.filter(s => s.payment_method === "cash").reduce((a, s) => a + s.grand_total, 0)
  const liveOtherSales = liveTotalSales - liveCashSales

  const rows: (string | number | null)[][] = [
    ["CORON GRILL DINERS — SHIFT SUMMARY REPORT"],
    [],
    ["Cashier", shift.cashier_name],
    ["Username", `@${shift.cashier_username}`],
    ["Date", fmtDate(shift.start_time)],
    ["Shift Start", fmtTime(shift.start_time)],
    ["Shift End", shift.end_time ? fmtTime(shift.end_time) : "Ongoing"],
    ["Shift Status", shift.status === "open" ? "Active" : "Closed"],
    [],
    ["--- FINANCIAL OVERVIEW ---"],
    ["Starting Cash", shift.start_balance],
    ["Cash Sales", liveCashSales],
    ["Other Payment Sales", liveOtherSales],
    ["Total Sales", liveTotalSales],
  ]

  if (shift.status === "closed") {
    rows.push(
      ["Expected Cash in Drawer", shift.expected_cash ?? 0],
      ["Actual Cash Counted", shift.end_balance ?? 0],
      [discLabel, Math.abs(disc)],
    )
  }

  rows.push(
    [],
    ["--- PAYMENT METHOD BREAKDOWN ---"],
    ["Payment Method", "Orders", "Total Amount"],
  )
  for (const [method, { count, total }] of payBreak) {
    rows.push([method.charAt(0).toUpperCase() + method.slice(1), count, total])
  }

  rows.push(
    [],
    ["--- ORDER COUNTS ---"],
    ["Completed Orders", completed.length],
    ["Voided Orders", voided.length],
    ["Cancelled Orders", cancelled.length],
    ["Total Orders", sales.length],
  )

  if (shift.notes) rows.push([], ["Notes", shift.notes])

  rows.push(
    [],
    ["--- ORDER LIST ---"],
    ["#", "Order No.", "Time", "Items", "Payment Method", "Subtotal", "Discount/Charge", "Total", "Status", "Void Reason"],
  )
  sales.forEach((s, i) => {
    const discountVal = (s.discount_percent ?? 0) > 0 ? -s.service_charge : s.service_charge
    rows.push([
      i + 1,
      s.order_number,
      fmtDateTime(s.created_at),
      itemsStr(s.items),
      s.payment_method.charAt(0).toUpperCase() + s.payment_method.slice(1),
      s.subtotal,
      discountVal,
      s.grand_total,
      s.status.charAt(0).toUpperCase() + s.status.slice(1),
      s.void_reason ?? "",
    ])
  })

  downloadFile(toCSV(rows), `Shift_${shift.cashier_username}_${shiftDate}.csv`, "text/csv;charset=utf-8;")
}

// ─── Word Export (HTML-based .doc — opens in Word / LibreOffice) ──────────────

function downloadDocx(shift: ShiftRecord, sales: SaleRecord[]) {
  const disc = shift.discrepancy ?? 0
  const discLabel = disc > 0 ? "Overage" : disc < 0 ? "Shortage" : "Balanced"
  const shiftDate = new Date(shift.start_time).toLocaleDateString("en-CA")
  const payBreak = getPaymentBreakdown(sales)
  const completed = sales.filter(s => s.status === "completed")
  const voided   = sales.filter(s => s.status === "void")
  const cancelled = sales.filter(s => s.status === "cancelled")
  // Live-computed totals — always match what is shown on screen
  const liveTotalSales = completed.reduce((a, s) => a + s.grand_total, 0)
  const liveCashSales  = completed.filter(s => s.payment_method === "cash").reduce((a, s) => a + s.grand_total, 0)
  const liveOtherSales = liveTotalSales - liveCashSales

  const tr = (cells: string[], header = false) => {
    const tag = header ? "th" : "td"
    const bg  = header ? "background:#e8e8e8;" : ""
    return `<tr>${cells.map(c => `<${tag} style="border:1px solid #ccc;padding:5px 8px;${bg}">${c}</${tag}>`).join("")}</tr>`
  }
  const table = (rows: string) =>
    `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">${rows}</table>`

  const summaryRows = [
    ["Cashier", shift.cashier_name],
    ["Username", `@${shift.cashier_username}`],
    ["Date", fmtDate(shift.start_time)],
    ["Shift Start", fmtTime(shift.start_time)],
    ["Shift End", shift.end_time ? fmtTime(shift.end_time) : "Ongoing"],
    ["Status", shift.status === "open" ? "Active" : "Closed"],
    ["Starting Cash", fmt(shift.start_balance)],
    ["Cash Sales", fmt(liveCashSales)],
    ["Other Payment Sales", fmt(liveOtherSales)],
    ["Total Sales", fmt(liveTotalSales)],
    ...(shift.status === "closed" ? [
      ["Expected Cash", fmt(shift.expected_cash ?? 0)],
      ["Actual Cash", fmt(shift.end_balance ?? 0)],
      [discLabel, fmt(Math.abs(disc))],
    ] : []),
    ...(shift.notes ? [["Notes", shift.notes]] : []),
  ]

  const payRows = [
    tr(["Payment Method", "Orders", "Total Amount"], true),
    ...payBreak.map(([m, { count, total }]) =>
      tr([m.charAt(0).toUpperCase() + m.slice(1), String(count), fmt(total)])
    ),
    tr(["TOTAL", String(completed.length), fmt(liveTotalSales)]),
  ].join("")

  const orderRows = [
    tr(["Order No.", "Time", "Items", "Payment", "Total", "Status", "Void Reason"], true),
    ...sales.map(s => tr([
      s.order_number,
      fmtDateTime(s.created_at),
      itemsStr(s.items),
      s.payment_method.charAt(0).toUpperCase() + s.payment_method.slice(1),
      fmt(s.grand_total),
      s.status.charAt(0).toUpperCase() + s.status.slice(1),
      s.void_reason ?? "",
    ])),
  ].join("")

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Shift Report</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; margin: 2cm; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 2px; }
  h2 { font-size: 13pt; margin-top: 16px; margin-bottom: 6px; }
  p.sub { text-align: center; color: #555; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; }
  th { background: #e8e8e8; font-weight: bold; }
  .label { font-weight: bold; width: 40%; }
  .footer { text-align: right; color: #888; font-size: 9pt; margin-top: 20px; }
</style>
</head>
<body>
<h1>CORON GRILL DINERS</h1>
<p class="sub">Beside Panda House, 1 Don Pedro St, Barangay Poblacion, Coron</p>
<h2 style="text-align:center;">SHIFT SUMMARY REPORT</h2>

<h2>Shift Information</h2>
${table(summaryRows.map(([l, v]) => tr([`<span class="label">${l}</span>`, v])).join(""))}

<h2>Payment Method Breakdown</h2>
${table(payRows)}

<h2>Order Counts</h2>
<p>Completed: <b>${completed.length}</b> &nbsp; Voided: <b>${voided.length}</b> &nbsp; Cancelled: <b>${cancelled.length}</b> &nbsp; Total: <b>${sales.length}</b></p>

<h2>Order List</h2>
${table(orderRows)}

<p class="footer">Report generated: ${new Date().toLocaleString("en-PH")}</p>
</body></html>`

  downloadFile(html, `Shift_${shift.cashier_username}_${shiftDate}.doc`, "application/msword")
}

// ─── 58mm Thermal Receipt Print ───────────────────────────────────────────────

function printThermalSummary(shift: ShiftRecord, sales: SaleRecord[]) {
  const W = 32
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

  const completed  = sales.filter(s => s.status === "completed")
  const voided     = sales.filter(s => s.status === "void")
  const cancelled  = sales.filter(s => s.status === "cancelled")
  const liveTotalSales = completed.reduce((a, s) => a + s.grand_total, 0)
  const liveCashSales  = completed.filter(s => s.payment_method === "cash").reduce((a, s) => a + s.grand_total, 0)
  const liveOtherSales = liveTotalSales - liveCashSales
  const payBreak = getPaymentBreakdown(sales)

  const money = (n: number) => `P${(n || 0).toFixed(2)}`
  const shiftDate = fmtDate(shift.start_time)

  const lines: string[] = []
  lines.push(center("CORON GRILL DINERS"))
  lines.push(center("Beside Panda House,"))
  lines.push(center("1 Don Pedro St, Brgy."))
  lines.push(center("Poblacion, Coron"))
  lines.push(divider("="))
  lines.push(center("SHIFT SUMMARY"))
  lines.push(divider("="))
  lines.push(leftRight("Cashier:", shift.cashier_name.substring(0, W - 9)))
  lines.push(leftRight("User:", `@${shift.cashier_username}`.substring(0, W - 6)))
  lines.push(leftRight("Date:", shiftDate.substring(0, W - 6)))
  lines.push(leftRight("Start:", fmtTime(shift.start_time)))
  lines.push(leftRight("End:", shift.end_time ? fmtTime(shift.end_time) : "Ongoing"))
  lines.push(leftRight("Status:", shift.status === "open" ? "Active" : "Closed"))
  lines.push(divider())
  lines.push(center("FINANCIAL"))
  lines.push(divider())
  lines.push(leftRight("Start Cash:", money(shift.start_balance)))
  lines.push(leftRight("Cash Sales:", money(liveCashSales)))
  lines.push(leftRight("Other Sales:", money(liveOtherSales)))
  lines.push(leftRight("Total Sales:", money(liveTotalSales)))
  if (shift.status === "closed") {
    lines.push(divider())
    lines.push(leftRight("Exp. Cash:", money(shift.expected_cash ?? 0)))
    lines.push(leftRight("Actual Cash:", money(shift.end_balance ?? 0)))
    const disc = shift.discrepancy ?? 0
    const discLabel = disc > 0 ? "Overage:" : disc < 0 ? "Shortage:" : "Balanced:"
    lines.push(leftRight(discLabel, money(Math.abs(disc))))
  }
  lines.push(divider())
  lines.push(center("PAYMENT BREAKDOWN"))
  lines.push(divider())
  for (const [method, { count, total }] of payBreak) {
    const label = `${method.charAt(0).toUpperCase() + method.slice(1)} (${count}x):`
    lines.push(leftRight(label, money(total)))
  }
  lines.push(divider())
  lines.push(center("ORDERS"))
  lines.push(divider())
  lines.push(leftRight("Completed:", String(completed.length)))
  lines.push(leftRight("Voided:", String(voided.length)))
  lines.push(leftRight("Cancelled:", String(cancelled.length)))
  lines.push(leftRight("Total:", String(sales.length)))
  if (shift.notes) {
    lines.push(divider())
    lines.push(center("NOTES"))
    lines.push(shift.notes.substring(0, W))
  }
  lines.push(divider("="))
  lines.push(center("Thank you!"))
  lines.push(center("Coron Grill Diners POS"))
  lines.push(divider("="))
  lines.push("")
  const receiptText = lines.join("\n")

  const w = window.open("", "_blank", "width=420,height=700")
  if (!w) { alert("Allow pop-ups to print the shift summary receipt."); return }

  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Shift Summary — ${shift.cashier_name}</title>
    <style>
      @page { size: 58mm auto; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #f5f5f5; font-family: sans-serif; }
      .wrap { display: flex; flex-direction: column; align-items: center; padding: 12px; min-height: 100vh; }
      .toolbar { display: flex; gap: 8px; margin-bottom: 14px; width: 100%; max-width: 320px; }
      .btn { flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: sans-serif; }
      .btn-print { background: #111827; color: #fff; }
      .btn-close  { background: #e5e7eb; color: #374151; }
      .receipt { background: #fff; border-radius: 4px; box-shadow: 0 2px 12px rgba(0,0,0,.15); padding: 12px 10px; width: 300px; }
      pre { font-family: 'Courier New', Courier, monospace; font-size: 10.5px; line-height: 1.45; color: #111; white-space: pre; }
      @media print {
        @page { size: 58mm auto; margin: 0; }
        body { background: #fff; }
        .wrap { padding: 0; align-items: flex-start; }
        .toolbar { display: none !important; }
        .receipt { box-shadow: none; border-radius: 0; width: 58mm; padding: 2mm; }
        pre { font-size: 9pt; line-height: 1.35; }
      }
    </style>
  </head><body>
    <div class="wrap">
      <div class="toolbar">
        <button class="btn btn-print" onclick="window.print()">🖨 Print Receipt</button>
        <button class="btn btn-close" onclick="window.close()">✕ Close</button>
      </div>
      <div class="receipt"><pre>${receiptText.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre></div>
    </div>
  </body></html>`)
  w.document.close()
  w.focus()
}

// ─── Modal Component ──────────────────────────────────────────────────────────

export default function ShiftSummaryModal({ open, onOpenChange, shift, sales }: ShiftSummaryModalProps) {
  const disc = shift.discrepancy ?? 0
  const isOver = shift.status === "closed" && disc > 0
  const isShort = shift.status === "closed" && disc < 0
  const isExact = shift.status === "closed" && disc === 0
  const isOpen = shift.status === "open"

  const completed = sales.filter(s => s.status === "completed")
  const voided = sales.filter(s => s.status === "void")
  const cancelled = sales.filter(s => s.status === "cancelled")
  const payBreak = getPaymentBreakdown(sales)

  // Always compute totals live from the orders list so open shifts and
  // post-close voids are always reflected accurately.
  const liveTotalSales = completed.reduce((a, s) => a + s.grand_total, 0)
  const liveCashSales = completed
    .filter(s => s.payment_method === "cash")
    .reduce((a, s) => a + s.grand_total, 0)
  const liveOtherSales = liveTotalSales - liveCashSales

  const handleExcelDownload = useCallback(() => downloadExcel(shift, sales), [shift, sales])
  const handleDocxDownload = useCallback(() => downloadDocx(shift, sales), [shift, sales])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Shift Report — {shift.cashier_name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {fmtDate(shift.start_time)} · {fmtTime(shift.start_time)}
            {shift.end_time ? ` → ${fmtTime(shift.end_time)}` : " (ongoing)"}
            {" · "}@{shift.cashier_username}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1">

          {/* ── Financial Overview ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Financial Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <OverviewCard label="Starting Cash" value={fmt(shift.start_balance)} />
              <OverviewCard label="Cash Sales" value={fmt(liveCashSales)} valueClass="text-green-600" />
              <OverviewCard label="Other Sales" value={fmt(liveOtherSales)} valueClass="text-blue-600" />
              <OverviewCard label="Total Sales" value={fmt(liveTotalSales)} valueClass="font-bold text-base" />
              {!isOpen && (
                <>
                  <OverviewCard label="Expected Cash" value={fmt(shift.expected_cash ?? 0)} />
                  <OverviewCard label="Actual Cash" value={fmt(shift.end_balance ?? 0)} />
                </>
              )}
            </div>
            {!isOpen && (
              <div className={`mt-3 rounded-lg px-4 py-3 flex items-center justify-between ${isExact ? "bg-green-50 border border-green-200" : isOver ? "bg-blue-50 border border-blue-200" : "bg-red-50 border border-red-200"}`}>
                <div className={`flex items-center gap-2 font-semibold ${isExact ? "text-green-700" : isOver ? "text-blue-700" : "text-red-700"}`}>
                  {isExact
                    ? <CheckCircle className="h-4 w-4" />
                    : isOver
                    ? <TrendingUp className="h-4 w-4" />
                    : <TrendingDown className="h-4 w-4" />
                  }
                  <span>{isExact ? "Balanced" : isOver ? "Extra Cash" : "Missing Cash"}</span>
                </div>
                <span className={`font-mono font-bold text-base ${isExact ? "text-green-700" : isOver ? "text-blue-700" : "text-red-700"}`}>
                  {disc >= 0 ? "+" : "-"}{fmt(Math.abs(disc))}
                </span>
              </div>
            )}
            {isOpen && (
              <div className="mt-3 rounded-lg px-4 py-2.5 bg-green-50 border border-green-200 text-green-700 text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />Shift currently active
              </div>
            )}
          </section>

          <Separator />

          {/* ── Payment Breakdown ──────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payment Method Breakdown</h3>
            {payBreak.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed sales recorded.</p>
            ) : (
              <div className="space-y-2">
                {payBreak.map(([method, { count, total }]) => (
                  <div key={method} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium capitalize flex items-center">
                      <PaymentIcon method={method} />
                      {method} <span className="text-muted-foreground ml-1.5 font-normal">({count} order{count !== 1 ? "s" : ""})</span>
                    </span>
                    <span className="font-mono font-semibold text-sm">{fmt(total)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-2 px-3">
                  <span className="text-sm font-semibold">Total Revenue</span>
                  <span className="font-mono font-bold text-sm">{fmt(liveTotalSales)}</span>
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* ── Order Counts ───────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CountCard label="Total Orders" count={sales.length} color="bg-gray-50 border" />
              <CountCard label="Completed" count={completed.length} color="bg-green-50 border-green-200 border text-green-700" />
              <CountCard label="Voided" count={voided.length} color="bg-red-50 border-red-200 border text-red-700" />
              <CountCard label="Cancelled" count={cancelled.length} color="bg-gray-100 border text-gray-600" />
            </div>
          </section>

          {shift.notes && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground italic bg-gray-50 rounded-lg px-3 py-2">{shift.notes}</p>
              </section>
            </>
          )}

          <Separator />

          {/* ── Order List ─────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              All Orders ({sales.length})
            </h3>
            {sales.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No orders found for this shift.</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Time</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Order #</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Items</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Payment</th>
                        <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total</th>
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sales.map((order) => (
                        <tr
                          key={order.id}
                          className={`hover:bg-gray-50/80 ${order.status !== "completed" ? "opacity-55" : ""}`}
                        >
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(order.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="font-mono font-semibold">{order.order_number}</span>
                            {(order.discount_percent ?? 0) > 0 && (
                              <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full font-medium">
                                {order.discount_percent}% Senior
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[220px] truncate" title={itemsStr(order.items)}>
                            {itemsStr(order.items)}
                          </td>
                          <td className="px-3 py-2 capitalize whitespace-nowrap">
                            <PaymentIcon method={order.payment_method} />
                            {order.payment_method}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-right whitespace-nowrap">{fmt(order.grand_total)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <StatusBadge status={order.status} />
                            {order.void_reason && (
                              <span className="ml-1 text-muted-foreground italic" title={order.void_reason}>
                                — {order.void_reason}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-sm">Revenue (completed orders)</td>
                        <td className="px-3 py-2 font-mono text-right text-sm text-green-700">
                          {fmt(completed.reduce((s, o) => s + o.grand_total, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ── Export / Print Buttons ─────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              className="flex-1 gap-2 bg-gray-800 hover:bg-gray-900 text-white"
              onClick={() => printThermalSummary(shift, sales)}
            >
              <Printer className="h-4 w-4" />
              Print Receipt (58mm)
            </Button>
            <Button
              className="flex-1 gap-2 bg-green-700 hover:bg-green-800 text-white"
              onClick={handleExcelDownload}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              className="flex-1 gap-2 bg-blue-700 hover:bg-blue-800 text-white"
              onClick={handleDocxDownload}
            >
              <FileText className="h-4 w-4" />
              Export Word
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function OverviewCard({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg border px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-mono font-semibold text-sm ${valueClass}`}>{value}</p>
    </div>
  )
}

function CountCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${color}`}>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className="font-bold text-lg leading-tight">{count}</p>
    </div>
  )
}
