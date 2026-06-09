/**
 * Print service — direct Web Bluetooth (BLE) transport.
 *
 * This module is the single public API for all printing in the POS.
 * Transport is handled by lib/printer-connection.ts (Web BLE / Web Serial).
 * ESC/POS byte payloads are built by lib/escpos.ts.
 *
 * The RawBT localhost HTTP service (127.0.0.1:9100) is NOT used here.
 * Printers are connected directly from the browser via Web Bluetooth.
 */

import {
  buildCustomerReceipt,
  buildKitchenTicket,
  type PrintData,
} from "@/lib/escpos";
import { printTo } from "@/lib/printer-connection";

// ─── Printer identity map ──────────────────────────────────────────────────────

export type PrinterRole = "cashier" | "kitchen";

export interface PrinterMapping {
  id: string;
  name: string;
  mac: string;
  label: string;
}

export const PRINTER_MAPPINGS: Record<PrinterRole, PrinterMapping> = {
  cashier: {
    id: "CASHIER_PRINTER",
    name: "RPP02N_1",
    mac: "03:02:A6:B9:D3:C0",
    label: "Cashier Printer",
  },
  kitchen: {
    id: "KITCHEN_PRINTER",
    name: "RPP02N_2",
    mac: "03:3D:5F:3E:AE:84",
    label: "Kitchen Printer",
  },
};

export function getMappedPrinter(role: PrinterRole): PrinterMapping {
  return PRINTER_MAPPINGS[role];
}

// ─── Plain-text receipt builders (used for .txt export and preview) ───────────

const WIDTH = 32;

function timeOnly(dateTime: string): string {
  return dateTime.includes(",")
    ? (dateTime.split(",").pop()?.trim() ?? dateTime)
    : dateTime;
}

function pesoText(amount: number): string {
  return `P${amount.toFixed(2)}`;
}

function wrapCashierItem(item: PrintData["items"][number]): string[] {
  const qty = `${item.quantity}x`.padEnd(4);
  const price = pesoText(item.price * item.quantity);
  const nameWidth = Math.max(4, WIDTH - qty.length - price.length - 1);
  const lines: string[] = [];
  const name = item.name.trim();
  lines.push(`${qty}${name.slice(0, nameWidth).padEnd(nameWidth)} ${price}`);
  let rest = name.slice(nameWidth);
  while (rest.length > 0) {
    lines.push(`    ${rest.slice(0, WIDTH - 4)}`);
    rest = rest.slice(WIDTH - 4);
  }
  return lines;
}

function wrapKitchenItem(item: PrintData["items"][number]): string[] {
  const prefix = ` ${item.quantity}x  `;
  const nameWidth = Math.max(8, WIDTH - prefix.length);
  const lines: string[] = [];
  const name = item.name.trim();
  lines.push(`${prefix}${name.slice(0, nameWidth)}`);
  let rest = name.slice(nameWidth);
  while (rest.length > 0) {
    lines.push(`     ${rest.slice(0, WIDTH - 5)}`);
    rest = rest.slice(WIDTH - 5);
  }
  return lines;
}

export function buildCashierReceiptText(data: PrintData): string {
  const lines: string[] = [
    "      CORON GRILL DINERS",
    "     Beside Panda House,",
    "1 Don Pedro St, Brgy. Poblacion",
    "        Coron, Palawan",
    "--------------------------------",
    `Date: ${data.dateTime}`,
    `Order #: ${data.orderNumber}`,
    `Server: ${data.serverName}`,
    ...(data.tableNumber ? [`Table #: ${data.tableNumber}`] : []),
    `Payment: ${data.paymentMethod.toUpperCase()}`,
    "--------------------------------",
  ];
  for (const item of data.items) lines.push(...wrapCashierItem(item));
  lines.push(
    "--------------------------------",
    `Subtotal: ${pesoText(data.subtotal)}`,
  );
  if (data.discountPercent > 0) {
    lines.push(
      `Sr. Citizen Disc.(${data.discountPercent}%): -${pesoText(data.discountAmount)}`,
    );
  }
  lines.push(
    `GRAND TOTAL: ${pesoText(data.grandTotal)}`,
    ...(data.paymentMethod === "cash"
      ? [
          `Tendered: ${pesoText(data.amountTendered)}`,
          `Change: ${pesoText(data.change)}`,
        ]
      : []),
    "--------------------------------",
    "Thank you for dining!",
    "Visit us again in Coron!",
    "--- END OF RECEIPT ---",
  );
  return lines.join("\n");
}

export function buildKitchenTicketText(data: PrintData): string {
  const lines: string[] = [
    "** KITCHEN **",
    "================================",
    `Order #:  ${data.orderNumber}`,
    `Time:     ${timeOnly(data.dateTime)}`,
    `Server:   ${data.serverName}`,
    ...(data.tableNumber ? [`Table #:  ${data.tableNumber}`] : []),
    "================================",
  ];
  for (const item of data.items) lines.push(...wrapKitchenItem(item));
  lines.push("================================", "** END OF ORDER **");
  return lines.join("\n");
}

// ─── Bluetooth transport + RawBT intent-URL fallback ──────────────────────────

/**
 * Fires the rawbt:// intent URL as a silent backup when Bluetooth is unavailable.
 * Works on Android Chrome when the RawBT app is installed and running.
 * Uses whatever printer RawBT currently has selected as its default.
 * Always returns true (fire-and-forget — we cannot detect success from a PWA).
 */
async function triggerRawBTIntent(data: Uint8Array): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    // latin1 preserves every byte value 0-255 without mangling binary sequences
    const text = new TextDecoder("latin1").decode(data);
    const urlEncoded = encodeURIComponent(text);
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `rawbt://print?text=${urlEncoded}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 200);
  } catch {
    /* ignore */
  }
}

/**
 * Outcome of a print attempt:
 *   "bluetooth" — printed directly via Web Bluetooth (confirmed)
 *   "usb"       — printed directly via Web Serial/USB (confirmed)
 *   "rawbt"     — BLE unavailable; rawbt:// intent fired as backup (unconfirmed)
 *   "none"      — nothing happened (should not occur with RawBT fallback)
 */
export type PrintOutcome = "bluetooth" | "usb" | "rawbt" | "none";

export async function printCashierReceipt(
  data: PrintData,
): Promise<PrintOutcome> {
  const bytes = buildCustomerReceipt(data);
  // 1. Try direct Web Bluetooth / USB (confirmed print)
  const result = await printTo("cashier", bytes);
  if (result !== "none") return result as "bluetooth" | "usb";
  // 2. BLE not connected — fire RawBT intent URL as Android backup
  await triggerRawBTIntent(bytes);
  return "rawbt";
}

export async function printKitchenTicket(
  data: PrintData,
): Promise<PrintOutcome> {
  const bytes = buildKitchenTicket(data);
  // 1. Try direct Web Bluetooth / USB (confirmed print)
  const result = await printTo("kitchen", bytes);
  if (result !== "none") return result as "bluetooth" | "usb";
  // 2. BLE not connected — fire RawBT intent URL as Android backup
  await triggerRawBTIntent(bytes);
  return "rawbt";
}

export async function printRoleRoutingTest(role: PrinterRole): Promise<void> {
  const ESC = 0x1b;
  const GS = 0x1d;
  const LF = 0x0a;
  const printer = PRINTER_MAPPINGS[role];

  const textLines = [
    "*** ROUTING TEST OK ***",
    "========================",
    `TARGET: ${printer.label.toUpperCase()}`,
    `NAME:   ${printer.name}`,
    `MAC:    ${printer.mac}`,
    `TIME:   ${new Date().toLocaleString("en-PH")}`,
    "========================",
    "If this prints here,",
    "Bluetooth routing works.",
  ];

  const bytes: number[] = [
    ESC,
    0x40, // ESC @ — INIT
    ESC,
    0x61,
    0x01, // ESC a 1 — ALIGN CENTER
  ];

  for (const text of textLines) {
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      bytes.push(code < 128 ? code : 0x3f);
    }
    bytes.push(LF);
  }

  bytes.push(ESC, 0x64, 0x03); // ESC d 3 — FEED 3 lines
  bytes.push(GS, 0x56, 0x01); // GS V 1  — PARTIAL CUT

  const result = await printTo(role, new Uint8Array(bytes));
  if (result === "none") {
    const label = PRINTER_MAPPINGS[role].label;
    throw new Error(
      `${label} is not connected. Open Printer Setup and tap "Connect via Bluetooth" first.`,
    );
  }
}

export async function printRoleDemoLayout(role: PrinterRole): Promise<void> {
  const sample: PrintData = {
    orderNumber: "#CGD-TEST",
    dateTime: new Date().toLocaleString("en-PH"),
    serverName: "Bluetooth Test",
    tableNumber: role === "kitchen" ? "KITCHEN" : "COUNTER",
    paymentMethod: "cash",
    items: [
      {
        id: 1,
        name: role === "cashier" ? "Test Burger Meal" : "Test Order A",
        price: 125,
        quantity: 2,
      },
      {
        id: 2,
        name: role === "cashier" ? "Iced Tea" : "Test Order B",
        price: 45,
        quantity: 1,
      },
    ],
    subtotal: 295,
    discountPercent: 0,
    discountAmount: 0,
    grandTotal: 295,
    amountTendered: 300,
    change: 5,
  };

  if (role === "cashier") {
    await printCashierReceipt(sample);
    return;
  }
  await printKitchenTicket(sample);
}

/** Alias kept for backward compatibility. */
export async function printRoleTestPage(role: PrinterRole): Promise<void> {
  await printRoleDemoLayout(role);
}
