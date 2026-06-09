import type { PrintData } from "@/lib/escpos";

export type PrinterRole = "cashier" | "kitchen";

export interface PrinterMapping {
  id: string;
  name: string;
  mac: string;
  label: string;
}

export const RAWBT_LOCAL_SERVICE_ORIGIN = "http://127.0.0.1:9100";
export const RAWBT_LOCAL_SERVICE_URL = `${RAWBT_LOCAL_SERVICE_ORIGIN}/print`;
export const RAWBT_CODEPAGE = "WCP1252";

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

type Alignment = "left" | "center" | "right";

interface RawBTAttributesString {
  alignment: Alignment;
  bold: boolean;
  doubleHeight: boolean;
  doubleWidth: boolean;
  fontsCpi: number;
  internationalChars: number;
  lang: string;
  printerFont: number;
  truetypeFontSize: number;
  underline: boolean;
}

interface RawBTPrintCommand {
  command: "print";
  text: string;
  attributesString: RawBTAttributesString;
}

interface RawBTLeftRightCommand {
  command: "leftRightText";
  leftText: string;
  rightText: string;
  leftIndent: number;
  rightIndent: number;
  leftAttr: RawBTAttributesString;
  rightAttr: RawBTAttributesString;
}

interface RawBTLineCommand {
  command: "line";
  ch: string;
  attributesString: RawBTAttributesString;
}

interface RawBTNewLineCommand {
  command: "ln";
  count: number;
}

interface RawBTCutCommand {
  command: "cut";
}

interface RawBTSendBytesCommand {
  command: "sendBytes";
  base64: string;
}

type RawBTCommand =
  | RawBTPrintCommand
  | RawBTLeftRightCommand
  | RawBTLineCommand
  | RawBTNewLineCommand
  | RawBTCutCommand
  | RawBTSendBytesCommand;

interface RawBTPrintJob {
  copies: number;
  printer: string;
  template: "default" | "none";
  bt_address: string;
  codepage: string;
  encoding: string;
  charset: string;
  silent: boolean;
  preview: boolean;
  showPreview: boolean;
  showLogoDialog: boolean;
  logo: boolean;
  commands: RawBTCommand[];
}

export interface RawBTServiceHealth {
  reachable: boolean;
  detail: string;
  checkedAt: number;
}

const WIDTH = 32;
const ESC = 0x1b;
const XPRINTER_WCP1252_CODEPAGE = 17;

function textAttr(
  overrides: Partial<RawBTAttributesString> = {},
): RawBTAttributesString {
  return {
    alignment: "left",
    bold: false,
    doubleHeight: false,
    doubleWidth: false,
    fontsCpi: 0,
    internationalChars: 0,
    lang: RAWBT_CODEPAGE,
    printerFont: 1,
    truetypeFontSize: 21,
    underline: false,
    ...overrides,
  };
}

function print(
  text: string,
  attr: Partial<RawBTAttributesString> = {},
): RawBTPrintCommand {
  return {
    command: "print",
    text,
    attributesString: textAttr(attr),
  };
}

function leftRight(
  leftText: string,
  rightText: string,
  leftOverrides: Partial<RawBTAttributesString> = {},
  rightOverrides: Partial<RawBTAttributesString> = leftOverrides,
): RawBTLeftRightCommand {
  return {
    command: "leftRightText",
    leftText,
    rightText,
    leftIndent: 0,
    rightIndent: 0,
    leftAttr: textAttr(leftOverrides),
    rightAttr: textAttr(rightOverrides),
  };
}

function line(ch = "-"): RawBTLineCommand {
  return {
    command: "line",
    ch,
    attributesString: textAttr(),
  };
}

function ln(count = 1): RawBTNewLineCommand {
  return { command: "ln", count };
}

function cut(): RawBTCutCommand {
  return { command: "cut" };
}

function bytesToBase64(bytes: number[]): string {
  const binary = String.fromCharCode(...bytes);

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  return Buffer.from(Uint8Array.from(bytes)).toString("base64");
}

function sendBytes(bytes: number[]): RawBTSendBytesCommand {
  return {
    command: "sendBytes",
    base64: bytesToBase64(bytes),
  };
}

function declareCodePage(): RawBTSendBytesCommand {
  return sendBytes([ESC, 0x40, ESC, 0x74, XPRINTER_WCP1252_CODEPAGE]);
}

function peso(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

function timeOnly(dateTime: string): string {
  return dateTime.includes(",")
    ? (dateTime.split(",").pop()?.trim() ?? dateTime)
    : dateTime;
}

function wrapCashierItem(item: PrintData["items"][number]): string[] {
  const qty = `${item.quantity}x`.padEnd(4);
  const price = peso(item.price * item.quantity);
  const nameWidth = Math.max(4, WIDTH - qty.length - price.length - 1);
  const lines: string[] = [];
  const name = item.name.trim();
  const head = name.slice(0, nameWidth).padEnd(nameWidth);
  lines.push(`${qty}${head} ${price}`);

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

function customerReceiptCommands(data: PrintData): RawBTCommand[] {
  const commands: RawBTCommand[] = [
    print("CORON GRILL DINERS", {
      alignment: "center",
      bold: true,
      doubleHeight: true,
    }),
    print("Beside Panda House,", { alignment: "center" }),
    print("1 Don Pedro St, Brgy. Poblacion", { alignment: "center" }),
    print("Coron, Palawan", { alignment: "center" }),
    line(),
    leftRight("Date:", data.dateTime.substring(0, 20)),
    leftRight("Order #:", data.orderNumber),
    leftRight("Server:", data.serverName),
    ...(data.tableNumber ? [leftRight("Table #:", data.tableNumber)] : []),
    leftRight("Payment:", data.paymentMethod.toUpperCase()),
    line(),
    print("QTY  ITEM               PRICE", { bold: true }),
    line(),
  ];

  for (const item of data.items) {
    for (const entry of wrapCashierItem(item)) commands.push(print(entry));
  }

  commands.push(line(), leftRight("Subtotal:", peso(data.subtotal)));

  if (data.discountPercent > 0) {
    commands.push(
      leftRight(
        `Sr. Citizen Disc.(${data.discountPercent}%):`,
        `-${peso(data.discountAmount)}`,
      ),
    );
  }

  commands.push(
    line(),
    leftRight(
      "GRAND TOTAL:",
      peso(data.grandTotal),
      { bold: true },
      { bold: true },
    ),
  );

  if (data.paymentMethod === "cash") {
    commands.push(
      leftRight("Tendered:", peso(data.amountTendered)),
      leftRight("Change:", peso(data.change), { bold: true }, { bold: true }),
    );
  }

  commands.push(
    line(),
    print("Thank you for dining!", { alignment: "center" }),
    print("Visit us again in Coron!", { alignment: "center" }),
    print("--- END OF RECEIPT ---", { alignment: "center" }),
    ln(3),
    cut(),
  );

  return commands;
}

function kitchenTicketCommands(data: PrintData): RawBTCommand[] {
  const commands: RawBTCommand[] = [
    print("** KITCHEN **", {
      alignment: "center",
      bold: true,
      doubleHeight: true,
      doubleWidth: true,
    }),
    line("="),
    leftRight("Order #:", data.orderNumber),
    leftRight("Time:", timeOnly(data.dateTime)),
    leftRight("Server:", data.serverName),
    ...(data.tableNumber
      ? [
          leftRight(
            "Table #:",
            data.tableNumber,
            { bold: true },
            { bold: true },
          ),
        ]
      : []),
    line("="),
  ];

  for (const item of data.items) {
    for (const entry of wrapKitchenItem(item)) {
      commands.push(print(entry, { bold: true, doubleHeight: true }));
    }
  }

  commands.push(
    line("="),
    print("** END OF ORDER **", { alignment: "center" }),
    ln(3),
    cut(),
  );

  return commands;
}

function buildJob(role: PrinterRole, commands: RawBTCommand[]): RawBTPrintJob {
  const printer = PRINTER_MAPPINGS[role];

  return {
    copies: 1,
    printer: printer.name,
    template: "none",
    bt_address: printer.mac,
    codepage: RAWBT_CODEPAGE,
    encoding: RAWBT_CODEPAGE,
    charset: "windows-1252",
    silent: true,
    preview: false,
    showPreview: false,
    showLogoDialog: false,
    logo: false,
    commands: [declareCodePage(), ...commands],
  };
}

async function postJob(job: RawBTPrintJob): Promise<void> {
  let response: Response;

  try {
    response = await fetch(RAWBT_LOCAL_SERVICE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(job),
    });
  } catch {
    throw new Error(
      "RawBT local service is unreachable at http://127.0.0.1:9100/print",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail || `RawBT local service returned HTTP ${response.status}`,
    );
  }
}

export function getMappedPrinter(role: PrinterRole): PrinterMapping {
  return PRINTER_MAPPINGS[role];
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
    `Subtotal: ${peso(data.subtotal)}`,
  );

  if (data.discountPercent > 0) {
    lines.push(
      `Sr. Citizen Disc.(${data.discountPercent}%): -${peso(data.discountAmount)}`,
    );
  }

  lines.push(
    `GRAND TOTAL: ${peso(data.grandTotal)}`,
    ...(data.paymentMethod === "cash"
      ? [
          `Tendered: ${peso(data.amountTendered)}`,
          `Change: ${peso(data.change)}`,
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

export async function checkRawBTServiceConnection(
  timeoutMs = 2500,
): Promise<RawBTServiceHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(RAWBT_LOCAL_SERVICE_ORIGIN, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });

    return {
      reachable: true,
      detail: `RawBT local service responded from ${RAWBT_LOCAL_SERVICE_ORIGIN}`,
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      reachable: false,
      detail:
        error instanceof Error && error.name === "AbortError"
          ? `Timed out while checking ${RAWBT_LOCAL_SERVICE_ORIGIN}`
          : `Could not reach ${RAWBT_LOCAL_SERVICE_ORIGIN}`,
      checkedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function printCashierReceipt(data: PrintData): Promise<void> {
  await postJob(buildJob("cashier", customerReceiptCommands(data)));
}

export async function printKitchenTicket(data: PrintData): Promise<void> {
  await postJob(buildJob("kitchen", kitchenTicketCommands(data)));
}

export async function printRoleRoutingTest(role: PrinterRole): Promise<void> {
  const printer = getMappedPrinter(role);
  const commands: RawBTCommand[] = [
    print("*** ROUTING TEST OK ***", {
      alignment: "center",
      bold: true,
      doubleHeight: true,
    }),
    line("="),
    print(`TARGET: ${printer.label.toUpperCase()}`),
    print(`NAME: ${printer.name}`),
    print(`MAC: ${printer.mac}`),
    print(`TIME: ${new Date().toLocaleString("en-PH")}`),
    line("="),
    print("If this prints here,"),
    print("bt_address routing works."),
    ln(2),
    cut(),
  ];

  await postJob(buildJob(role, commands));
}

export async function printRoleDemoLayout(role: PrinterRole): Promise<void> {
  const sample: PrintData = {
    orderNumber: "#CGD-TEST",
    dateTime: new Date().toLocaleString("en-PH"),
    serverName: "RawBT Service",
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

export async function printRoleTestPage(role: PrinterRole): Promise<void> {
  await printRoleDemoLayout(role);
}
