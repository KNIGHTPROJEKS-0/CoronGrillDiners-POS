"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Printer,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  Wallet,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Receipt,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftWithStats {
  id: number;
  cashier_name: string;
  cashier_username: string;
  start_time: string;
  end_time: string | null;
  status: "open" | "closed";
  archived: boolean;
  notes: string | null;
  start_balance: number;
  end_balance: number | null;
  total_cash_sales: number;
  total_sales: number;
  expected_cash: number | null;
  discrepancy: number | null;
  completed_count: number;
  void_count: number;
  cancelled_count: number;
  total_order_count: number;
  completed_total: number;
  void_total: number;
}

interface SaleRecord {
  id: string;
  order_number: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  subtotal: number;
  service_charge: number;
  grand_total: number;
  discount_percent?: number;
  payment_method: string;
  server_name: string;
  created_by: string;
  status: string;
  void_reason: string | null;
  created_at: string;
  isOvernightShiftOrder?: boolean;
  overnightShiftLabel?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  return `₱${(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function durationStr(start: string, end: string | null) {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const mins = Math.floor((e.getTime() - s.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function itemsSummary(items: SaleRecord["items"]) {
  if (!Array.isArray(items) || items.length === 0) return "—";
  const top = items
    .slice(0, 2)
    .map((i) => `${i.quantity}× ${i.name}`)
    .join(", ");
  return items.length > 2 ? `${top} +${items.length - 2} more` : top;
}

function paymentIcon(method: string) {
  if (method === "cash") return <Wallet className="h-3 w-3 inline mr-1" />;
  if (method === "card") return <CreditCard className="h-3 w-3 inline mr-1" />;
  return <span className="mr-1 text-[10px] font-bold">G</span>;
}

// ─── Print Function ───────────────────────────────────────────────────────────

function printReport(shift: ShiftWithStats, sales: SaleRecord[]) {
  const completed = sales.filter((s) => s.status === "completed" || !s.status);
  const voided = sales.filter((s) => s.status === "void");
  const cancelled = sales.filter((s) => s.status === "cancelled");
  const completedTotal = completed.reduce((a, s) => a + s.grand_total, 0);
  const voidedTotal = voided.reduce((a, s) => a + s.grand_total, 0);
  // Live cash sales from actual completed orders (not the stale shift snapshot)
  const liveCashSales = completed
    .filter((s) => s.payment_method === "cash")
    .reduce((a, s) => a + s.grand_total, 0);
  const liveExpectedCash = shift.start_balance + liveCashSales;
  const disc = shift.discrepancy ?? 0;
  const discColor = disc < 0 ? "#dc2626" : disc > 0 ? "#16a34a" : "#555";
  const discLabel = disc < 0 ? "SHORT" : disc > 0 ? "OVER" : "BALANCED";
  const generatedAt = new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const rowsHtml = sales
    .map((s, i) => {
      const statusClass =
        s.status === "void"
          ? "color:#dc2626;font-weight:600"
          : s.status === "cancelled"
            ? "color:#d97706;font-weight:600"
            : "color:#16a34a;font-weight:600";
      const statusLabel =
        s.status === "void"
          ? "VOID"
          : s.status === "cancelled"
            ? "CANCELLED"
            : "COMPLETED";
      const itemsText = Array.isArray(s.items)
        ? s.items.map((it) => `${it.quantity}× ${it.name}`).join(", ")
        : "—";
      const voidNote = s.void_reason
        ? `<br><span style="color:#888;font-size:8pt">Reason: ${s.void_reason}</span>`
        : "";
      return `
      <tr style="${i % 2 === 0 ? "" : "background:#f9f9f9"}">
        <td style="text-align:center">${i + 1}</td>
        <td>${fmtTime(s.created_at)}</td>
        <td style="font-weight:600">${s.order_number}</td>
        <td style="font-size:8.5pt">${itemsText}${voidNote}</td>
        <td style="text-transform:capitalize">${s.payment_method}</td>
        <td style="text-align:right">${fmt(s.subtotal)}</td>
        <td style="text-align:right">${(s.discount_percent ?? 0) > 0 ? `-${fmt(s.service_charge)}` : fmt(s.service_charge)}</td>
        <td style="text-align:right;font-weight:600">${fmt(s.grand_total)}</td>
        <td style="${statusClass};text-align:center">${statusLabel}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Shift Sales Report — ${shift.cashier_name}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size:10.5pt; color:#1a1a1a; padding:18mm 20mm; }
.header { text-align:center; padding-bottom:12px; margin-bottom:14px; border-bottom:2.5px solid #1a1a1a; }
.header h1 { font-size:17pt; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; }
.header .addr { font-size:9pt; color:#555; margin-top:3px; }
.header .sys  { font-size:9pt; color:#888; margin-top:2px; font-style:italic; }
.report-title { font-size:13pt; font-weight:bold; text-align:center; text-transform:uppercase; letter-spacing:2px; margin:12px 0 6px; }
.report-ref { display:flex; justify-content:space-between; font-size:8.5pt; color:#666; margin-bottom:14px; padding-bottom:6px; border-bottom:1px dashed #ccc; }
.section-title { font-size:9pt; font-weight:bold; text-transform:uppercase; letter-spacing:1px; background:#1a1a1a; color:#fff; padding:4px 10px; margin:14px 0 8px; }
.info-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 16px; margin-bottom:12px; }
.info-item label { font-size:8pt; color:#777; font-weight:bold; text-transform:uppercase; display:block; margin-bottom:1px; }
.info-item span  { font-size:10pt; }
.summary-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:14px; }
.box { border-radius:4px; padding:10px; text-align:center; border:1px solid; }
.box .lbl { font-size:7.5pt; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold; margin-bottom:4px; }
.box .num { font-size:18pt; font-weight:900; line-height:1; }
.box .sub { font-size:8.5pt; margin-top:3px; }
.box.ok  { border-color:#16a34a; background:#f0fdf4; color:#15803d; }
.box.vd  { border-color:#dc2626; background:#fef2f2; color:#b91c1c; }
.box.cx  { border-color:#d97706; background:#fffbeb; color:#b45309; }
.box.tot { border-color:#1d4ed8; background:#eff6ff; color:#1d4ed8; }
table { width:100%; border-collapse:collapse; font-size:8.5pt; margin-bottom:14px; }
th { background:#1a1a1a; color:#fff; padding:5px 7px; text-align:left; font-size:8pt; white-space:nowrap; }
td { padding:4px 7px; border-bottom:1px solid #eee; vertical-align:top; }
.total-row td { background:#f0f0f0 !important; font-weight:bold; border-top:2px solid #1a1a1a; border-bottom:2px solid #1a1a1a; }
.cash-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 40px; margin-bottom:14px; }
.cash-row { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #eee; font-size:10pt; }
.cash-row.big { font-weight:bold; font-size:11pt; border-bottom:2px solid #1a1a1a; margin-top:4px; }
.notes-box { background:#fffbeb; border:1px solid #fde68a; border-radius:4px; padding:8px 12px; font-size:10pt; margin-bottom:14px; }
.sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:36px; }
.sig-box { text-align:center; }
.sig-line { border-top:1px solid #1a1a1a; padding-top:6px; margin-top:48px; font-size:9pt; color:#555; }
.sig-name { font-weight:bold; font-size:10pt; margin-top:2px; }
.footer { text-align:center; font-size:7.5pt; color:#aaa; margin-top:20px; padding-top:8px; border-top:1px solid #ddd; }
@media print {
  body { padding:10mm 14mm; }
  @page { size:A4 portrait; margin:0; }
}
</style>
</head>
<body>
<div class="header">
  <h1>Coron Grill Diners</h1>
  <div class="addr">Beside Panda House, 1 Don Pedro St, Barangay Poblacion, Coron, Palawan</div>
  <div class="sys">CDG POS System — Cashier Shift Sales Report</div>
</div>

<div class="report-title">Cashier Shift Sales Report</div>

<div class="report-ref">
  <span><b>Reference No.:</b> SHIFT-${String(shift.id).padStart(6, "0")}</span>
  <span><b>Report Date:</b> ${generatedAt}</span>
  <span><b>Status:</b> ${shift.status === "open" ? "ONGOING SHIFT" : "CLOSED SHIFT"}</span>
</div>

<div class="section-title">Cashier Information</div>
<div class="info-grid">
  <div class="info-item"><label>Cashier Name</label><span>${shift.cashier_name}</span></div>
  <div class="info-item"><label>Username</label><span>@${shift.cashier_username}</span></div>
  <div class="info-item"><label>Shift Date</label><span>${fmtDate(shift.start_time)}</span></div>
  <div class="info-item"><label>Shift Start</label><span>${fmtTime(shift.start_time)}</span></div>
  <div class="info-item"><label>Shift End</label><span>${shift.end_time ? fmtTime(shift.end_time) : "— (Ongoing)"}</span></div>
  <div class="info-item"><label>Duration</label><span>${durationStr(shift.start_time, shift.end_time)}</span></div>
</div>

<div class="section-title">Sales Summary</div>
<div class="summary-grid">
  <div class="box ok">
    <div class="lbl">Completed Orders</div>
    <div class="num">${completed.length}</div>
    <div class="sub">${fmt(completedTotal)}</div>
  </div>
  <div class="box vd">
    <div class="lbl">Voided Orders</div>
    <div class="num">${voided.length}</div>
    <div class="sub">${fmt(voidedTotal)}</div>
  </div>
  <div class="box cx">
    <div class="lbl">Cancelled Orders</div>
    <div class="num">${cancelled.length}</div>
    <div class="sub">${fmt(cancelled.reduce((a, s) => a + s.grand_total, 0))}</div>
  </div>
  <div class="box tot">
    <div class="lbl">Total Shift Sales</div>
    <div class="num" style="font-size:14pt">${fmt(completedTotal)}</div>
    <div class="sub">${sales.length} total transaction${sales.length !== 1 ? "s" : ""}</div>
  </div>
</div>

<div class="section-title">Order Details</div>
<table>
  <thead>
    <tr>
      <th style="width:28px;text-align:center">#</th>
      <th>Time</th>
      <th>Order No.</th>
      <th>Items</th>
      <th>Payment</th>
      <th style="text-align:right">Subtotal</th>
      <th style="text-align:right">Disc/Svc</th>
      <th style="text-align:right">Total</th>
      <th style="text-align:center">Status</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:12px;color:#888">No transactions recorded for this shift.</td></tr>'}
    ${
      sales.length > 0
        ? `
    <tr class="total-row">
      <td colspan="7" style="text-align:right;padding-right:8px">TOTAL COMPLETED SALES:</td>
      <td style="text-align:right">${fmt(completedTotal)}</td>
      <td></td>
    </tr>`
        : ""
    }
  </tbody>
</table>

<div class="section-title">Cash Reconciliation</div>
<div class="cash-grid">
  <div>
    <div class="cash-row"><span>Starting Cash Balance</span><span>${fmt(shift.start_balance)}</span></div>
    <div class="cash-row"><span>Total Cash Sales</span><span>${fmt(liveCashSales)}</span></div>
    <div class="cash-row big"><span>Expected Cash on Hand</span><span>${shift.expected_cash !== null ? fmt(shift.expected_cash) : fmt(liveExpectedCash)}</span></div>
  </div>
  <div>
    <div class="cash-row"><span>Actual Cash Counted</span><span>${shift.end_balance !== null ? fmt(shift.end_balance) : "— (Shift Open)"}</span></div>
    <div class="cash-row big" style="color:${discColor}">
      <span>Discrepancy (${discLabel})</span>
      <span>${shift.discrepancy !== null ? fmt(Math.abs(disc)) : "—"}</span>
    </div>
  </div>
</div>

${shift.notes ? `<div class="section-title">Notes / Remarks</div><div class="notes-box">${shift.notes}</div>` : ""}

<div class="sig-grid">
  <div class="sig-box">
    <div class="sig-line">
      <div class="sig-name">${shift.cashier_name}</div>
      Cashier's Signature over Printed Name
    </div>
  </div>
  <div class="sig-box">
    <div class="sig-line">
      <div class="sig-name">&nbsp;</div>
      Admin / Supervisor's Signature over Printed Name
    </div>
  </div>
</div>

<div class="footer">
  This is a system-generated report. Any alterations to this document are unauthorized. &mdash;
  CDG POS System &bull; Coron Grill Diners &bull; ${generatedAt}
</div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1200,scrollbars=yes");
  if (!w) {
    alert("Please allow pop-ups to print the report.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.onafterprint = () => w.close();
  }, 600);
}

// ─── SalesSection ─────────────────────────────────────────────────────────────

export default function SalesSection() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  });
  const defaultFrom = "2026-06-03";
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [shifts, setShifts] = useState<ShiftWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [reportShift, setReportShift] = useState<ShiftWithStats | null>(null);
  const [reportSales, setReportSales] = useState<SaleRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState(false);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(
        `/api/sales/shifts?from=${dateFrom}&to=${dateTo}`,
      );
      if (!res.ok) throw new Error();
      const j = await res.json();
      setShifts(j.shifts ?? []);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const openReport = async (shift: ShiftWithStats) => {
    setReportShift(shift);
    setReportSales([]);
    setReportError(false);
    setReportLoading(true);
    setModalOpen(true);
    try {
      const res = await fetch(`/api/shifts/${shift.id}/sales`);
      if (!res.ok) throw new Error();
      const j = await res.json();
      setReportSales(j.sales ?? []);
    } catch {
      setReportError(true);
    } finally {
      setReportLoading(false);
    }
  };

  const filtered = shifts.filter(
    (s) =>
      !searchQ ||
      s.cashier_name.toLowerCase().includes(searchQ.toLowerCase()) ||
      s.cashier_username.toLowerCase().includes(searchQ.toLowerCase()),
  );

  const totalCompleted = filtered.reduce(
    (a, s) => a + (s.completed_total || 0),
    0,
  );
  const totalOrders = filtered.reduce(
    (a, s) => a + (s.completed_count || 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                if (e.target.value > dateTo) setDateTo(e.target.value);
              }}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground">
              Search Cashier
            </label>
            <input
              type="text"
              placeholder="Name or username…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchShifts}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {!loading && !fetchError && filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Shifts
            </p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Completed Orders
            </p>
            <p className="text-2xl font-bold">{totalOrders}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Total Sales
            </p>
            <p className="text-2xl font-bold text-green-700">
              {fmt(totalCompleted)}
            </p>
          </div>
        </div>
      )}

      {/* ── Shift list ── */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Shift Sales Records
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dateFrom === dateTo
                ? fmtDate(dateFrom)
                : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`}
              {" · "}
              {filtered.length} shift{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : fetchError ? (
          <div className="flex items-center justify-center py-16 text-center">
            <div>
              <AlertTriangle className="h-9 w-9 text-amber-500 mx-auto mb-3" />
              <p className="font-medium mb-1">Could not load shift records</p>
              <p className="text-sm text-muted-foreground mb-4">
                Check your connection and try again.
              </p>
              <Button variant="outline" size="sm" onClick={fetchShifts}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Calendar className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No shift records found</p>
            <p className="text-sm mt-1">
              Try a different date range or cashier name.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((shift) => {
              const isOpen = shift.status === "open";
              const disc = shift.discrepancy ?? 0;
              const isExpanded = expandedId === shift.id;
              const completed = shift.completed_count || 0;
              const voided = shift.void_count || 0;
              const cancelled = shift.cancelled_count || 0;

              return (
                <div
                  key={shift.id}
                  className={shift.archived ? "opacity-60" : ""}
                >
                  <div className="p-4 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* Left — cashier & time info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold">
                            {shift.cashier_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            @{shift.cashier_username}
                          </span>
                          {isOpen ? (
                            <Badge className="text-[10px] h-4 px-1.5 bg-green-100 text-green-700 border-0">
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5"
                            >
                              Closed
                            </Badge>
                          )}
                          {shift.archived && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1.5"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {fmtDate(shift.start_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtTime(shift.start_time)} –{" "}
                            {shift.end_time
                              ? fmtTime(shift.end_time)
                              : "Ongoing"}
                          </span>
                          <span>
                            ({durationStr(shift.start_time, shift.end_time)})
                          </span>
                        </div>

                        {/* Order stats */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {completed} completed
                          </span>
                          {voided > 0 && (
                            <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                              <XCircle className="h-3.5 w-3.5" />
                              {voided} voided
                            </span>
                          )}
                          {cancelled > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                              <Ban className="h-3.5 w-3.5" />
                              {cancelled} cancelled
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right — total + action */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            Total Sales
                          </p>
                          <p className="text-lg font-bold text-green-700">
                            {fmt(shift.completed_total)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : shift.id)
                            }
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 mr-1" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 mr-1" />
                            )}
                            Details
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs bg-gray-900 hover:bg-gray-700"
                            onClick={() => openReport(shift)}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            View Report
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded quick stats */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">
                            Starting Cash
                          </p>
                          <p className="font-semibold">
                            {fmt(shift.start_balance)}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">
                            Expected Cash
                          </p>
                          <p className="font-semibold">
                            {shift.expected_cash !== null
                              ? fmt(shift.expected_cash)
                              : "—"}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground">
                            Actual Cash
                          </p>
                          <p className="font-semibold">
                            {shift.end_balance !== null
                              ? fmt(shift.end_balance)
                              : "—"}
                          </p>
                        </div>
                        <div
                          className={`rounded-lg p-3 ${
                            disc < 0
                              ? "bg-red-50"
                              : disc > 0
                                ? "bg-green-50"
                                : "bg-gray-50"
                          }`}
                        >
                          <p className="text-xs text-muted-foreground">
                            Discrepancy
                          </p>
                          <p
                            className={`font-semibold ${disc < 0 ? "text-red-600" : disc > 0 ? "text-green-700" : ""}`}
                          >
                            {shift.discrepancy !== null
                              ? `${disc < 0 ? "-" : disc > 0 ? "+" : ""}${fmt(Math.abs(disc))}`
                              : "—"}
                          </p>
                        </div>
                        {shift.notes && (
                          <div className="col-span-full bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-amber-800 mb-1">
                              Notes
                            </p>
                            <p className="text-sm text-amber-900">
                              {shift.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Report Modal ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Shift Sales Report
              {reportShift && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  — {reportShift.cashier_name} ·{" "}
                  {fmtDate(reportShift.start_time)}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {reportLoading ? (
            <div className="flex items-center justify-center py-24">
              <RefreshCw className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : reportError ? (
            <div className="flex items-center justify-center py-16 text-center px-6">
              <div>
                <AlertTriangle className="h-9 w-9 text-amber-500 mx-auto mb-3" />
                <p className="font-medium mb-1">Failed to load sales data</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reportShift && openReport(reportShift)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          ) : reportShift ? (
            <>
              {/* Scrollable report body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {/* Header info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">
                      Cashier
                    </p>
                    <p className="font-semibold">{reportShift.cashier_name}</p>
                    <p className="text-xs text-muted-foreground">
                      @{reportShift.cashier_username}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">
                      Shift Period
                    </p>
                    <p className="font-semibold">
                      {fmtDate(reportShift.start_time)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtTime(reportShift.start_time)} –{" "}
                      {reportShift.end_time
                        ? fmtTime(reportShift.end_time)
                        : "Ongoing"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">
                      Duration
                    </p>
                    <p className="font-semibold">
                      {durationStr(
                        reportShift.start_time,
                        reportShift.end_time,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reportShift.status === "open"
                        ? "Shift still active"
                        : "Shift closed"}
                    </p>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Completed",
                      icon: CheckCircle,
                      count: reportSales.filter(
                        (s) => !s.status || s.status === "completed",
                      ).length,
                      total: reportSales
                        .filter((s) => !s.status || s.status === "completed")
                        .reduce((a, s) => a + s.grand_total, 0),
                      cls: "border-green-200 bg-green-50 text-green-800",
                    },
                    {
                      label: "Voided",
                      icon: XCircle,
                      count: reportSales.filter((s) => s.status === "void")
                        .length,
                      total: reportSales
                        .filter((s) => s.status === "void")
                        .reduce((a, s) => a + s.grand_total, 0),
                      cls: "border-red-200 bg-red-50 text-red-800",
                    },
                    {
                      label: "Cancelled",
                      icon: Ban,
                      count: reportSales.filter((s) => s.status === "cancelled")
                        .length,
                      total: 0,
                      cls: "border-amber-200 bg-amber-50 text-amber-800",
                    },
                    {
                      label: "Total Sales",
                      icon: Receipt,
                      count: reportSales.filter(
                        (s) => !s.status || s.status === "completed",
                      ).length,
                      total: reportSales
                        .filter((s) => !s.status || s.status === "completed")
                        .reduce((a, s) => a + s.grand_total, 0),
                      cls: "border-blue-200 bg-blue-50 text-blue-800",
                      big: true,
                    },
                  ].map(({ label, icon: Icon, count, total, cls, big }) => (
                    <div
                      key={label}
                      className={`rounded-xl border p-4 text-center ${cls}`}
                    >
                      <Icon className="h-4 w-4 mx-auto mb-1 opacity-70" />
                      <p className="text-xs font-medium uppercase tracking-wide opacity-80">
                        {label}
                      </p>
                      <p
                        className={`font-bold mt-1 ${big ? "text-xl" : "text-2xl"}`}
                      >
                        {count}
                      </p>
                      <p className="text-xs mt-0.5 opacity-80">{fmt(total)}</p>
                    </div>
                  ))}
                </div>

                {/* Orders table */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Order Details
                    <span className="text-xs font-normal text-muted-foreground">
                      ({reportSales.length} transaction
                      {reportSales.length !== 1 ? "s" : ""})
                    </span>
                  </h3>
                  {reportSales.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm border rounded-xl">
                      No transactions recorded for this shift.
                    </div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-900 text-white">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium w-8">
                              #
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium">
                              Time
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium">
                              Order No.
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium">
                              Items
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-medium">
                              Payment
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-medium">
                              Total
                            </th>
                            <th className="px-3 py-2 text-center text-xs font-medium">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reportSales.map((s, i) => (
                            <tr
                              key={s.id}
                              className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50/40`}
                            >
                              <td className="px-3 py-2 text-muted-foreground text-xs text-center">
                                {i + 1}
                              </td>
                              <td className="px-3 py-2 text-xs whitespace-nowrap">
                                {fmtTime(s.created_at)}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs font-semibold flex items-center gap-1">
                                {s.order_number}
                                {(s.discount_percent ?? 0) > 0 && (
                                  <Badge className="text-[8px] bg-blue-100 text-blue-700 h-3 px-1 py-0">
                                    {s.discount_percent}%
                                  </Badge>
                                )}
                                {s.isOvernightShiftOrder &&
                                  s.overnightShiftLabel && (
                                    <Badge className="text-[8px] bg-orange-100 text-orange-700 h-3 px-1 py-0">
                                      {s.overnightShiftLabel}
                                    </Badge>
                                  )}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px]">
                                {itemsSummary(s.items)}
                                {s.void_reason && (
                                  <span className="block text-red-500 text-[10px] mt-0.5">
                                    ↳ {s.void_reason}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs capitalize">
                                {paymentIcon(s.payment_method)}
                                {s.payment_method}
                              </td>
                              <td className="px-3 py-2 text-xs font-semibold text-right">
                                {fmt(s.grand_total)}
                                {(s.discount_percent ?? 0) > 0 && (
                                  <span className="block text-[9px] text-orange-500">
                                    - {fmt(s.service_charge)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge
                                  className={`text-[10px] h-4 px-1.5 border-0 ${
                                    s.status === "void"
                                      ? "bg-red-100 text-red-700"
                                      : s.status === "cancelled"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-green-100 text-green-700"
                                  }`}
                                >
                                  {s.status === "void"
                                    ? "Void"
                                    : s.status === "cancelled"
                                      ? "Cancelled"
                                      : "Completed"}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-100 border-t-2 border-gray-900">
                            <td
                              colSpan={5}
                              className="px-3 py-2 text-sm font-bold text-right"
                            >
                              Total Completed Sales:
                            </td>
                            <td className="px-3 py-2 text-sm font-bold text-right text-green-700">
                              {fmt(
                                reportSales
                                  .filter(
                                    (s) =>
                                      !s.status || s.status === "completed",
                                  )
                                  .reduce((a, s) => a + s.grand_total, 0),
                              )}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {/* Cash reconciliation */}
                <div>
                  <h3 className="font-semibold text-sm mb-2">
                    Cash Reconciliation
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        label: "Starting Cash Balance",
                        val: fmt(reportShift.start_balance),
                      },
                      {
                        label: "Total Cash Sales",
                        val: fmt(reportShift.total_cash_sales),
                      },
                      {
                        label: "Expected Cash on Hand",
                        val:
                          reportShift.expected_cash !== null
                            ? fmt(reportShift.expected_cash)
                            : "—",
                      },
                      {
                        label: "Actual Cash Counted",
                        val:
                          reportShift.end_balance !== null
                            ? fmt(reportShift.end_balance)
                            : "— (Shift Open)",
                      },
                    ].map(({ label, val }) => (
                      <div
                        key={label}
                        className="bg-gray-50 rounded-lg border p-3 flex justify-between items-center"
                      >
                        <span className="text-sm text-muted-foreground">
                          {label}
                        </span>
                        <span className="font-semibold">{val}</span>
                      </div>
                    ))}
                    <div
                      className={`col-span-full rounded-lg border p-3 flex justify-between items-center font-semibold ${
                        (reportShift.discrepancy ?? 0) < 0
                          ? "bg-red-50 border-red-200 text-red-700"
                          : (reportShift.discrepancy ?? 0) > 0
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-gray-50"
                      }`}
                    >
                      <span>
                        Discrepancy
                        {reportShift.discrepancy !== null && (
                          <span className="ml-2 text-xs font-medium opacity-80">
                            {(reportShift.discrepancy ?? 0) < 0
                              ? "SHORT"
                              : (reportShift.discrepancy ?? 0) > 0
                                ? "OVER"
                                : "BALANCED"}
                          </span>
                        )}
                      </span>
                      <span>
                        {reportShift.discrepancy !== null
                          ? `${(reportShift.discrepancy ?? 0) < 0 ? "-" : (reportShift.discrepancy ?? 0) > 0 ? "+" : ""}${fmt(Math.abs(reportShift.discrepancy ?? 0))}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {reportShift.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-1">
                      Notes / Remarks
                    </p>
                    <p className="text-sm text-amber-900">
                      {reportShift.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="px-6 py-4 border-t shrink-0 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Ref: SHIFT-{String(reportShift.id).padStart(6, "0")} &bull;
                  Generated {fmtDateTime(new Date().toISOString())}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setModalOpen(false)}>
                    Close
                  </Button>
                  <Button
                    className="bg-gray-900 hover:bg-gray-700 gap-2"
                    onClick={() => printReport(reportShift, reportSales)}
                  >
                    <Printer className="h-4 w-4" />
                    Print / Save as PDF
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
