"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PrintData } from "@/lib/escpos";
import {
  buildKitchenTicketText,
  getMappedPrinter,
  printCashierReceipt,
  printKitchenTicket,
  PRINTER_MAPPINGS,
  type PrintOutcome,
} from "@/lib/rawbt-service";

const STORAGE_KEY = "cgd_active_receipt";
const MAX_AGE_MS = 10 * 60 * 1000;

type Selection = "cashier" | "kitchen";

interface ReceiptEntry {
  receiptText: string;
  kitchenText?: string;
  autoPrintKitchen?: boolean;
  orderNumber: string;
  printDataJson: string;
  returnPath: string;
  ts: number;
}

export default function ReceiptPage() {
  const router = useRouter();
  const [entry, setEntry] = useState<ReceiptEntry | null>(null);
  const [selected, setSelected] = useState<Selection>("cashier");
  // BLE/USB confirmed prints — controls auto-navigate and "✅" button state
  const [cashierDone, setCashierDone] = useState(false);
  const [kitchenDone, setKitchenDone] = useState(false);
  // RawBT intent fired (unconfirmed) — BLE was not available
  const [cashierViaRawbt, setCashierViaRawbt] = useState(false);
  const [kitchenViaRawbt, setKitchenViaRawbt] = useState(false);
  const autoPrintedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as ReceiptEntry;
      if (Date.now() - parsed.ts >= MAX_AGE_MS) return;

      localStorage.removeItem(STORAGE_KEY);
      setEntry(parsed);
    } catch {
      // Ignore malformed storage.
    }
  }, []);

  const getPrintData = useCallback((): PrintData | null => {
    if (!entry?.printDataJson) return null;
    try {
      return JSON.parse(entry.printDataJson) as PrintData;
    } catch {
      return null;
    }
  }, [entry]);

  function describeError(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  }

  /**
   * Attempt cashier print. Returns the outcome so callers can branch on it.
   * Only sets cashierDone=true when BLE/USB actually confirmed the print.
   */
  const doPrintCashier = useCallback(async (): Promise<PrintOutcome> => {
    const data = getPrintData();
    if (!data) return "none";
    const outcome = await printCashierReceipt(data);
    if (outcome === "bluetooth" || outcome === "usb") {
      setCashierDone(true);
      setCashierViaRawbt(false);
    } else if (outcome === "rawbt") {
      setCashierViaRawbt(true);
    }
    return outcome;
  }, [getPrintData]);

  /**
   * Attempt kitchen print. Returns the outcome so callers can branch on it.
   * Only sets kitchenDone=true when BLE/USB actually confirmed the print.
   */
  const doPrintKitchen = useCallback(async (): Promise<PrintOutcome> => {
    const data = getPrintData();
    if (!data) return "none";
    const outcome = await printKitchenTicket(data);
    if (outcome === "bluetooth" || outcome === "usb") {
      setKitchenDone(true);
      setKitchenViaRawbt(false);
    } else if (outcome === "rawbt") {
      setKitchenViaRawbt(true);
    }
    return outcome;
  }, [getPrintData]);

  async function retryAll() {
    try {
      const cashierOutcome = await doPrintCashier();
      let kitchenOutcome: PrintOutcome = "none";
      if (entry?.kitchenText) kitchenOutcome = await doPrintKitchen();

      const cashierOk =
        cashierOutcome === "bluetooth" || cashierOutcome === "usb";
      const kitchenOk =
        !entry?.kitchenText ||
        kitchenOutcome === "bluetooth" ||
        kitchenOutcome === "usb";

      if (cashierOk && kitchenOk) {
        toast.success("Printed via Bluetooth ✓");
      } else if (cashierOutcome === "rawbt" || kitchenOutcome === "rawbt") {
        toast.info("Sent to RawBT backup — verify on the physical printer");
      }
    } catch (error) {
      toast.error("Retry print failed", {
        description: describeError(
          error,
          "Printer not connected. Open Printer Setup to connect via Bluetooth.",
        ),
      });
    }
  }

  // ── Auto-print on mount ───────────────────────────────────────────────────────
  // Attempts printing once when entry data arrives. Does NOT auto-navigate —
  // the separate effect below handles navigation only after BLE is confirmed.
  useEffect(() => {
    if (!entry || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    (async () => {
      try {
        await doPrintCashier();
        if (entry.autoPrintKitchen && entry.kitchenText) {
          await doPrintKitchen();
        }
        // ⚠️  No router.push here. The auto-navigate effect below handles that
        // only when BLE printing is actually confirmed (cashierDone / kitchenDone).
      } catch (error) {
        console.error("Receipt auto-print failed:", error);
        toast.error("Printing failed", {
          description: describeError(
            error,
            "Printer not connected. Open Printer Setup to connect via Bluetooth.",
          ),
        });
      }
    })();
  }, [doPrintCashier, doPrintKitchen, entry]);

  // hasKitchen is derived here so it's available for effects below
  const hasKitchen = !!entry?.kitchenText;

  // ── Auto-navigate ONLY after confirmed BLE/USB print ───────────────────────
  // Fires a 5-second countdown that the cashier can interrupt with the
  // "Back to POS" button. Does NOT fire if only RawBT intent was used.
  const allDoneConfirmed = cashierDone && (!hasKitchen || kitchenDone);

  useEffect(() => {
    if (!allDoneConfirmed || !entry) return;
    const returnPath = entry.returnPath || "/";
    const t = setTimeout(() => router.push(returnPath), 5000);
    return () => clearTimeout(t);
  }, [allDoneConfirmed, entry, router]);

  function sanitize(s: string) {
    return s.replace(/[^a-zA-Z0-9-]/g, "");
  }

  function shareTxt(text: string, filename: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  function doSaveTxt() {
    if (!entry) return;

    if (selected === "cashier") {
      shareTxt(entry.receiptText, `receipt-${sanitize(entry.orderNumber)}.txt`);
      return;
    }

    const data = getPrintData();
    const kitchenText =
      entry.kitchenText ?? (data ? buildKitchenTicketText(data) : "");
    shareTxt(kitchenText, `kitchen-${sanitize(entry.orderNumber)}.txt`);
  }

  function doBackToPOS() {
    router.push(entry?.returnPath ?? "/");
  }

  if (!entry) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#111827",
          color: "#9ca3af",
          fontFamily: "sans-serif",
          fontSize: 15,
        }}
      >
        Loading receipt…
      </div>
    );
  }

  const cardBase: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 200,
    maxWidth: 340,
    cursor: "pointer",
    borderRadius: 10,
    padding: "12px 10px",
    background: "#fff",
    boxShadow: "0 4px 16px rgba(0,0,0,.18)",
    transition: "box-shadow .15s, outline .15s",
    userSelect: "none",
  };

  const cashierSelected = selected === "cashier";
  const kitchenSelected = selected === "kitchen";

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#111827",
          padding: "10px 14px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          borderBottom: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <span style={{ color: "#9ca3af", fontSize: 11, flex: 1, minWidth: 80 }}>
          Order {entry.orderNumber}
        </span>

        <button
          onClick={async () => {
            try {
              const outcome = await doPrintCashier();
              if (outcome === "bluetooth" || outcome === "usb") {
                toast.success("Receipt printed via Bluetooth ✓");
              } else {
                toast.info("Sent to RawBT — verify on the printer");
              }
            } catch (error) {
              toast.error("Cashier print failed", {
                description: describeError(
                  error,
                  "Cashier printer not connected. Open Printer Setup to connect via Bluetooth.",
                ),
              });
            }
          }}
          style={{
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            whiteSpace: "nowrap",
            background: cashierDone
              ? "#15803d"
              : cashierViaRawbt
                ? "#92400e"
                : "#16a34a",
            color: "#fff",
            boxShadow: cashierDone
              ? "0 2px 8px rgba(21,128,61,.4)"
              : cashierViaRawbt
                ? "0 2px 8px rgba(146,64,14,.4)"
                : "0 2px 8px rgba(22,163,74,.4)",
            fontSize: 13,
            padding: "10px 16px",
            fontWeight: 700,
          }}
        >
          {cashierDone
            ? "✅ Receipt Printed"
            : cashierViaRawbt
              ? "📲 Sent via RawBT"
              : "🖨 Print Receipt"}
        </button>

        {hasKitchen && (
          <button
            onClick={async () => {
              try {
                const outcome = await doPrintKitchen();
                if (outcome === "bluetooth" || outcome === "usb") {
                  toast.success("Kitchen ticket printed via Bluetooth ✓");
                } else {
                  toast.info("Sent to RawBT — verify on the printer");
                }
              } catch (error) {
                toast.error("Kitchen print failed", {
                  description: describeError(
                    error,
                    "Kitchen printer not connected. Open Printer Setup to connect via Bluetooth.",
                  ),
                });
              }
            }}
            style={{
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: kitchenDone
                ? "#b45309"
                : kitchenViaRawbt
                  ? "#92400e"
                  : "#d97706",
              color: "#fff",
              boxShadow: kitchenDone
                ? "0 2px 8px rgba(180,83,9,.4)"
                : kitchenViaRawbt
                  ? "0 2px 8px rgba(146,64,14,.4)"
                  : "0 2px 8px rgba(217,119,6,.4)",
              fontSize: 13,
              padding: "10px 16px",
              fontWeight: 700,
            }}
          >
            {kitchenDone
              ? "✅ Kitchen Printed"
              : kitchenViaRawbt
                ? "📲 Sent via RawBT"
                : "🍳 Print to Kitchen"}
          </button>
        )}

        <button
          onClick={retryAll}
          style={{
            border: "1.5px solid rgba(255,255,255,.2)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            background: "transparent",
            color: "#e5e7eb",
          }}
        >
          🔄 Retry Print
        </button>

        <button
          onClick={doSaveTxt}
          title={`Save ${selected === "cashier" ? "cashier receipt" : "kitchen ticket"} as .txt`}
          style={{
            border: "1.5px solid rgba(255,255,255,.2)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            background: "transparent",
            color: "#e5e7eb",
          }}
        >
          💾 Save {selected === "cashier" ? "Cashier" : "Kitchen"} .txt
        </button>

        <button
          onClick={doBackToPOS}
          style={{
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            background: "#dc2626",
            color: "#fff",
            boxShadow: "0 2px 8px rgba(220,38,38,.35)",
          }}
        >
          ← Back to POS
        </button>
      </div>

      <div
        style={{
          background: "#1e293b",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 8,
          margin: "12px 16px",
          padding: "12px 16px",
          color: "#cbd5e1",
          fontSize: 12,
          fontFamily: "sans-serif",
          lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>
          Bluetooth printer routing
        </div>
        <div>
          • Cashier →{" "}
          <span style={{ fontFamily: "monospace" }}>
            {PRINTER_MAPPINGS.cashier.name}
          </span>{" "}
          (
          <span style={{ fontFamily: "monospace" }}>
            {PRINTER_MAPPINGS.cashier.mac}
          </span>
          )
        </div>
        <div>
          • Kitchen →{" "}
          <span style={{ fontFamily: "monospace" }}>
            {PRINTER_MAPPINGS.kitchen.name}
          </span>{" "}
          (
          <span style={{ fontFamily: "monospace" }}>
            {PRINTER_MAPPINGS.kitchen.mac}
          </span>
          )
        </div>
        <div>• Transport: Web Bluetooth (BLE), direct from Chrome</div>
      </div>

      {allDoneConfirmed && (
        <div
          style={{
            background: "#052e16",
            border: "1px solid #16a34a",
            borderRadius: 8,
            margin: "12px 16px",
            padding: "12px 16px",
            color: "#4ade80",
            textAlign: "center",
            fontSize: 14,
            fontFamily: "sans-serif",
          }}
        >
          ✅ Printed via Bluetooth — returning to POS in 5 seconds…
          <br />
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            Tap “← Back to POS” above to return immediately.
          </span>
        </div>
      )}

      {(cashierViaRawbt || kitchenViaRawbt) && !allDoneConfirmed && (
        <div
          style={{
            background: "#431407",
            border: "1px solid #c2410c",
            borderRadius: 8,
            margin: "12px 16px",
            padding: "12px 16px",
            color: "#fed7aa",
            textAlign: "center",
            fontSize: 13,
            fontFamily: "sans-serif",
            lineHeight: 1.6,
          }}
        >
          📲 <strong>Sent via RawBT backup</strong> — check that the printer
          actually printed.
          <br />
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            To confirm Bluetooth routing, connect in Printer Setup and tap 🔄
            Retry Print.
          </span>
        </div>
      )}

      {!allDoneConfirmed && !cashierViaRawbt && !kitchenViaRawbt && (
        <div
          style={{
            background: "#1e293b",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 8,
            margin: "12px 16px",
            padding: "10px 16px",
            color: "#94a3b8",
            textAlign: "center",
            fontSize: 12,
            fontFamily: "sans-serif",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#e2e8f0" }}>
            Tap a receipt card to select it
          </strong>{" "}
          — the selected card determines which file is saved when you tap{" "}
          <strong style={{ color: "#e2e8f0" }}>💾 Save .txt</strong>. Print
          buttons always route to their assigned printer.
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "center",
          padding: "16px 16px 0",
        }}
      >
        <div
          onClick={() => setSelected("cashier")}
          style={{
            ...cardBase,
            outline: cashierSelected
              ? "3px solid #16a34a"
              : "2px solid rgba(0,0,0,.08)",
            boxShadow: cashierSelected
              ? "0 0 0 4px rgba(22,163,74,.18), 0 4px 16px rgba(0,0,0,.18)"
              : "0 4px 16px rgba(0,0,0,.18)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 10,
              padding: "6px 8px",
              borderRadius: 6,
              background: cashierSelected ? "#dcfce7" : "#f1f5f9",
            }}
          >
            <span style={{ fontSize: 16 }}>🖨</span>
            <span
              style={{
                fontFamily: "sans-serif",
                fontWeight: 700,
                fontSize: 13,
                color: cashierSelected ? "#15803d" : "#475569",
              }}
            >
              Cashier Receipt
            </span>
            {cashierDone && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "#15803d",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                ✅ Printed
              </span>
            )}
          </div>

          <pre
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "10px",
              lineHeight: 1.45,
              color: "#111",
              margin: 0,
              whiteSpace: "pre",
            }}
          >
            {entry.receiptText}
          </pre>
        </div>

        {hasKitchen && (
          <div
            onClick={() => setSelected("kitchen")}
            style={{
              ...cardBase,
              outline: kitchenSelected
                ? "3px solid #d97706"
                : "2px solid rgba(0,0,0,.08)",
              boxShadow: kitchenSelected
                ? "0 0 0 4px rgba(217,119,6,.18), 0 4px 16px rgba(0,0,0,.18)"
                : "0 4px 16px rgba(0,0,0,.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
                padding: "6px 8px",
                borderRadius: 6,
                background: kitchenSelected ? "#ffedd5" : "#f1f5f9",
              }}
            >
              <span style={{ fontSize: 16 }}>🍳</span>
              <span
                style={{
                  fontFamily: "sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: kitchenSelected ? "#b45309" : "#475569",
                }}
              >
                Kitchen Ticket
              </span>
              {kitchenDone && (
                <span
                  style={{
                    marginLeft: "auto",
                    color: "#b45309",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ✅ Printed
                </span>
              )}
            </div>

            <pre
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "10px",
                lineHeight: 1.45,
                color: "#111",
                margin: 0,
                whiteSpace: "pre",
              }}
            >
              {entry.kitchenText}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
