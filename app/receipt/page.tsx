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

type Selection = "cashier" | "kitchen" | "both";

interface ReceiptEntry {
  receiptText: string;
  kitchenText?: string;
  autoPrintKitchen?: boolean;
  orderNumber: string;
  printDataJson: string;
  returnPath: string;
  ts: number;
}

// Print selected receipts via Chrome Print Preview (like shift summary)
function printThermalReceipt(
  selected: Selection,
  receiptText: string,
  kitchenText?: string,
  orderNumber?: string
) {
  const W = 32;
  const receiptTitle = orderNumber ? `Receipt ${orderNumber}` : "Receipt";

  let content = "";
  if (selected === "cashier" || selected === "both") {
    content += receiptText + "\n\n\n";
  }
  if ((selected === "kitchen" || selected === "both") && kitchenText) {
    content += kitchenText;
  }

  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) {
    alert("Allow pop-ups to print the receipt.");
    return;
  }

  w.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>${receiptTitle}</title>
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
      <div class="receipt"><pre>${content.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre></div>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
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
      // Set default selection to "both" if there's a kitchen receipt
      if (parsed.kitchenText) {
        setSelected("both");
      }
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

    if (selected === "kitchen") {
      const data = getPrintData();
      const kitchenText =
        entry.kitchenText ?? (data ? buildKitchenTicketText(data) : "");
      shareTxt(kitchenText, `kitchen-${sanitize(entry.orderNumber)}.txt`);
      return;
    }

    // Save both
    const data = getPrintData();
    const kitchenText =
      entry.kitchenText ?? (data ? buildKitchenTicketText(data) : "");
    const bothText = `${entry.receiptText}\n\n\n${kitchenText}`;
    shareTxt(bothText, `both-${sanitize(entry.orderNumber)}.txt`);
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
  const bothSelected = selected === "both";

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

        {/* Universal Chrome Print Preview Button */}
        <button
          onClick={() => printThermalReceipt(selected, entry.receiptText, entry.kitchenText, entry.orderNumber)}
          style={{
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            whiteSpace: "nowrap",
            background: "#1d4ed8",
            color: "#fff",
            boxShadow: "0 2px 8px rgba(30, 64, 175, .4)",
            fontSize: 13,
            padding: "10px 16px",
            fontWeight: 700,
          }}
        >
          🖨 Print Preview
        </button>

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
              : "🖨 Print Receipt (BLE)"}
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
                : "🍳 Print to Kitchen (BLE)"}
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
          title={`Save ${selected === "cashier" ? "cashier receipt" : selected === "kitchen" ? "kitchen ticket" : "both receipts"} as .txt`}
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
          💾 Save {selected === "cashier" ? "Cashier" : selected === "kitchen" ? "Kitchen" : "Both"} .txt
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

        {hasKitchen && (
          <div
            onClick={() => setSelected("both")}
            style={{
              ...cardBase,
              outline: bothSelected
                ? "3px solid #1d4ed8"
                : "2px solid rgba(0,0,0,.08)",
              boxShadow: bothSelected
                ? "0 0 0 4px rgba(37, 99, 235,.18), 0 4px 16px rgba(0,0,0,.18)"
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
                background: bothSelected ? "#dbeafe" : "#f1f5f9",
              }}
            >
              <span style={{ fontSize: 16 }}>📋</span>
              <span
                style={{
                  fontFamily: "sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  color: bothSelected ? "#1e40af" : "#475569",
                }}
              >
                Both Receipts
              </span>
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
              {`${entry.receiptText}\n\n---\n\n${entry.kitchenText}`}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
