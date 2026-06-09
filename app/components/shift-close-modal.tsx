"use client";

import { useEffect, useState } from "react";

import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  LogOut,
  Printer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Shift } from "@/hooks/use-shift";

interface ShiftCloseModalProps {
  open: boolean;
  shift: Shift;
  onClose: (endBalance: number) => Promise<Shift | null>;
  onOpenChange: (open: boolean) => void;
}

function fmt(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const RECEIPT_WIDTH = 32;
const RECEIPT_STYLE = {
  width: "58mm",
  maxWidth: "100%",
  padding: "6px 4px",
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "9px",
  lineHeight: "1.35",
  color: "#000",
  letterSpacing: "0",
} as const;

function receiptLeftRight(left: string, right: string) {
  const gap = RECEIPT_WIDTH - left.length - right.length;
  if (gap <= 0)
    return (
      left.substring(0, RECEIPT_WIDTH - right.length - 1) +
      " " +
      right
    ).substring(0, RECEIPT_WIDTH);
  return left + " ".repeat(gap) + right;
}

function receiptCenter(text: string) {
  const s = text.substring(0, RECEIPT_WIDTH);
  const pad = Math.max(0, Math.floor((RECEIPT_WIDTH - s.length) / 2));
  return " ".repeat(pad) + s;
}

function receiptDivider(ch = "-") {
  return ch.repeat(RECEIPT_WIDTH);
}

function formatReceiptAmount(n: number) {
  return `P${(n || 0).toFixed(2)}`;
}

function formatReceiptDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function buildShiftReceiptText(shift: Shift, orders: any[] = []) {
  const completed = orders.filter((o) => o.status === "completed");
  const voided = orders.filter((o) => o.status === "void");
  const cancelled = orders.filter((o) => o.status === "cancelled");
  const disc = shift.discrepancy ?? 0;
  const lines: string[] = [];

  lines.push(receiptCenter("CORON GRILL DINERS"));
  lines.push(receiptCenter("Beside Panda House,"));
  lines.push(receiptCenter("1 Don Pedro St, Brgy. Poblacion"));
  lines.push(receiptCenter("Coron, Palawan"));
  lines.push(receiptDivider());
  lines.push(receiptCenter("SHIFT SUMMARY"));
  lines.push(receiptDivider());
  lines.push(receiptLeftRight("Cashier:", shift.cashier_name));
  lines.push(
    receiptLeftRight("Start:", formatReceiptDateTime(shift.start_time)),
  );
  if (shift.end_time)
    lines.push(receiptLeftRight("End:", formatReceiptDateTime(shift.end_time)));
  lines.push(receiptDivider());

  lines.push(
    receiptLeftRight(
      "Starting Cash:",
      formatReceiptAmount(shift.start_balance),
    ),
  );
  lines.push(
    receiptLeftRight(
      "Cash Sales:",
      `+${formatReceiptAmount(shift.total_cash_sales)}`,
    ),
  );
  lines.push(receiptDivider("-"));
  lines.push(
    receiptLeftRight(
      "Expected Cash:",
      formatReceiptAmount(shift.expected_cash ?? 0),
    ),
  );
  lines.push(
    receiptLeftRight(
      "Actual Cash:",
      formatReceiptAmount(shift.end_balance ?? 0),
    ),
  );
  lines.push(receiptDivider("-"));
  const discLabel =
    disc === 0 ? "BALANCED" : disc > 0 ? "EXTRA CASH" : "MISSING CASH";
  const discVal = `${disc >= 0 ? "+" : "-"}${formatReceiptAmount(Math.abs(disc))}`;
  lines.push(receiptLeftRight(discLabel, discVal));
  lines.push(receiptDivider());

  lines.push(receiptLeftRight("Completed:", `${completed.length} orders`));
  lines.push(
    receiptLeftRight(
      "  Revenue:",
      formatReceiptAmount(
        completed.reduce((s, o) => s + Number(o.grand_total || 0), 0),
      ),
    ),
  );
  if (voided.length > 0) {
    lines.push(receiptLeftRight("Void:", `${voided.length} orders`));
    lines.push(
      receiptLeftRight(
        "  Forfeited:",
        formatReceiptAmount(
          voided.reduce((s, o) => s + Number(o.grand_total || 0), 0),
        ),
      ),
    );
  }
  if (cancelled.length > 0) {
    lines.push(receiptLeftRight("Cancelled:", `${cancelled.length} orders`));
  }
  lines.push(receiptDivider());
  lines.push(
    receiptLeftRight(
      "TOTAL SALES:",
      formatReceiptAmount(Number(shift.total_sales || 0)),
    ),
  );
  lines.push(receiptDivider());

  if (completed.length > 0) {
    lines.push(receiptCenter("COMPLETED ORDERS"));
    lines.push(receiptDivider());
    for (const order of completed) {
      const time = new Date(order.created_at).toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      lines.push(
        receiptLeftRight(
          `#${order.order_number}`,
          formatReceiptAmount(Number(order.grand_total || 0)),
        ),
      );
      const itemStr = Array.isArray(order.items)
        ? order.items.map((it: any) => `${it.quantity}x${it.name}`).join(", ")
        : "";
      lines.push(`  ${time} ${itemStr}`.substring(0, RECEIPT_WIDTH));
    }
    lines.push(receiptDivider());
  }

  if (voided.length > 0) {
    lines.push(receiptCenter("VOID ORDERS"));
    lines.push(receiptDivider());
    for (const order of voided) {
      const time = new Date(order.created_at).toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      lines.push(
        receiptLeftRight(
          `#${order.order_number}`,
          formatReceiptAmount(Number(order.grand_total || 0)),
        ),
      );
      lines.push(
        `  ${time} ${order.void_reason ?? ""}`.substring(0, RECEIPT_WIDTH),
      );
    }
    lines.push(receiptDivider());
  }

  lines.push(receiptCenter("Thank you for your service!"));
  lines.push(receiptCenter("--- END OF SHIFT ---"));
  return lines.join("\n");
}

const AUTO_LOGOUT_SECONDS = 8;

export default function ShiftCloseModal({
  open,
  shift,
  onClose,
  onOpenChange,
}: ShiftCloseModalProps) {
  const [actualCash, setActualCash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [closedShift, setClosedShift] = useState<Shift | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(AUTO_LOGOUT_SECONDS);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const amount = parseFloat(actualCash) || 0;
  const estimatedExpected = shift.start_balance + (shift.total_cash_sales || 0);
  // Discrepancy preview only shown AFTER shift is actually closed (blind close)
  const estimatedDiscrepancy =
    isSubmitted && actualCash !== "" && closedShift
      ? amount - estimatedExpected
      : null;

  // Auto-logout countdown after shift is closed
  useEffect(() => {
    if (!closedShift) return;
    setCountdown(AUTO_LOGOUT_SECONDS);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsSigningOut(true);
          localStorage.removeItem("cart");
          signOut({ redirect: false }).then(() => {
            window.location.href = "/login";
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [closedShift]);

  const handleVerifyCount = () => {
    if (isNaN(amount) || amount < 0) {
      setError("Please enter a valid cash amount.");
      return false;
    }
    setError("");
    setIsSubmitted(true);
    return true;
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleVerifyCount()) return;

    setIsLoading(true);
    const result = await onClose(amount);
    setIsLoading(false);
    if (result) {
      setClosedShift(result);
    } else {
      setError("Failed to close shift. Please try again.");
    }
  };

  const handlePrint = async () => {
    if (!closedShift) return;
    /* Fetch this cashier's orders for the shift day, then filter to the
       shift window so multi-shift days don't bleed into each other. */
    let orders: any[] = [];
    try {
      const shiftDate = new Date(closedShift.start_time).toLocaleDateString(
        "en-CA",
      );
      const res = await fetch(`/api/sales/my?date=${shiftDate}`);
      if (res.ok) {
        const data = await res.json();
        const all: any[] = data.orders ?? [];
        const start = new Date(closedShift.start_time).getTime();
        const end = closedShift.end_time
          ? new Date(closedShift.end_time).getTime()
          : Date.now();
        orders = all.filter((o) => {
          const t = new Date(o.created_at).getTime();
          return t >= start && t <= end;
        });
      }
    } catch {
      /* non-fatal — print without order detail */
    }

    const receiptText = buildShiftReceiptText(closedShift, orders);

    const html = `<!DOCTYPE html><html><head>
      <title>Shift Summary — ${closedShift.cashier_name}</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 9px; line-height: 1.35; color: #000; }
        .receipt { width: 58mm; max-width: 100%; margin: 0 auto; padding: 6px 4px; letter-spacing: 0; }
        pre { white-space: pre-wrap; word-break: break-all; font-family: inherit; font-size: inherit; line-height: inherit; margin: 0; padding: 0; }
        .no-print { position: fixed; top: 12px; right: 16px; z-index: 1000; }
        @media print { .no-print { display: none !important; } }
      </style>
    </head><body>
      <div class="no-print">
        <button onclick="window.close()" style="background:#1a1a2e;color:#fff;border:none;padding:9px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif">&#8592; Close Window</button>
      </div>
      <div class="receipt"><pre>${receiptText}</pre></div>
    </body></html>`;

    const w = window.open("", "_blank", "width=400,height=700");
    if (!w) {
      alert("Allow pop-ups to print the shift summary.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  const handleSignOutNow = () => {
    setIsSigningOut(true);
    localStorage.removeItem("cart");
    signOut({ redirect: false }).then(() => {
      window.location.href = "/login";
    });
  };

  if (closedShift) {
    const disc = closedShift.discrepancy ?? 0;
    const isOver = disc > 0;
    const isShort = disc < 0;
    const isExact = disc === 0;

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
              <div
                className={`h-14 w-14 rounded-full flex items-center justify-center ${isExact ? "bg-green-100" : isOver ? "bg-blue-100" : "bg-red-100"}`}
              >
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
              {closedShift.cashier_name} · {formatTime(closedShift.start_time)}{" "}
              –{" "}
              {closedShift.end_time ? formatTime(closedShift.end_time) : "now"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm mt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Starting Cash</span>
              <span className="font-mono">
                {fmt(closedShift.start_balance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash Sales</span>
              <span className="font-mono text-green-600">
                +{fmt(closedShift.total_cash_sales)}
              </span>
            </div>
            <div className="flex justify-between font-medium border-t pt-2">
              <span>Expected Cash</span>
              <span className="font-mono">
                {fmt(closedShift.expected_cash ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actual Cash</span>
              <span className="font-mono">
                {fmt(closedShift.end_balance ?? 0)}
              </span>
            </div>
            <Separator />
            <div
              className={`flex justify-between font-bold text-base rounded-lg px-3 py-2 ${isExact ? "bg-green-50 text-green-700" : isOver ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}
            >
              <span>
                {isOver ? "Extra Cash" : isShort ? "Missing Cash" : "Balanced"}
              </span>
              <span className="font-mono">
                {isOver ? "+" : isShort ? "-" : ""}
                {fmt(Math.abs(disc))}
              </span>
            </div>
            {(isOver || isShort) && (
              <p className="text-[11px] text-muted-foreground italic text-center -mt-0.5">
                {isOver
                  ? "Drawer had more cash than expected."
                  : "Drawer had less cash than expected."}
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
              <span className="font-bold text-orange-800 text-sm">
                {countdown}s
              </span>
            </p>
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handlePrint}
              disabled={isSigningOut}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700 gap-2"
              onClick={handleSignOutNow}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isSigningOut ? "Signing out…" : "Sign Out Now"}
            </Button>
          </div>

          {/* Print-only version */}
          <div className="hidden print:block">
            <ShiftPrintReceipt shift={closedShift} />
          </div>
        </DialogContent>
      </Dialog>
    );
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
            Started at {formatTime(shift.start_time)} · Count your drawer and
            enter the actual cash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 text-sm bg-muted/40 rounded-lg p-3 mt-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Starting Cash</span>
            <span className="font-mono">{fmt(shift.start_balance)}</span>
          </div>
          {isSubmitted ? (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground text-sm">
                Counted cash submitted
              </span>
              <span className="font-mono font-semibold text-sm">
                {fmt(amount)}
              </span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleClose} className="space-y-3 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="actualCash">Actual Cash in Drawer (₱)</Label>
            <Input
              id="actualCash"
              type="number"
              value={actualCash}
              onChange={(e) => {
                setActualCash(e.target.value);
                setIsSubmitted(false);
              }}
              placeholder="0.00"
              min="0"
              step="0.01"
              autoFocus
              required
              disabled={isLoading}
              className="text-lg font-mono"
            />
          </div>

          {actualCash !== "" &&
            estimatedDiscrepancy !== null &&
            closedShift && (
              <div
                className={`flex justify-between rounded-lg px-3 py-2 text-sm font-semibold ${estimatedDiscrepancy === 0 ? "bg-green-50 text-green-700" : estimatedDiscrepancy > 0 ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}
              >
                <span>
                  {estimatedDiscrepancy > 0
                    ? "Extra Cash"
                    : estimatedDiscrepancy < 0
                      ? "Missing Cash"
                      : "Balanced \u2713"}
                </span>
                <span className="font-mono">
                  {estimatedDiscrepancy >= 0 ? "+" : "-"}
                  {fmt(Math.abs(estimatedDiscrepancy))}
                </span>
              </div>
            )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleVerifyCount}
              disabled={isLoading || actualCash === ""}
            >
              Verify & Tally Count
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              disabled={isLoading || !isSubmitted}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isLoading ? "Closing..." : "Submit & Close"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShiftPrintReceipt({ shift }: { shift: Shift }) {
  return (
    <div style={{ ...RECEIPT_STYLE, margin: "0 auto" }}>
      <pre
        style={{
          margin: 0,
          padding: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontFamily: "inherit",
          fontSize: "inherit",
          lineHeight: "inherit",
        }}
      >
        {buildShiftReceiptText(shift)}
      </pre>
    </div>
  );
}
