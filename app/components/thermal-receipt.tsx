"use client"

import { forwardRef } from "react"

interface ReceiptItem {
  id: number
  name: string
  price: number
  quantity: number
}

interface ThermalReceiptProps {
  items: ReceiptItem[]
  subtotal: number
  /** Senior citizen discount percentage (0 = none, 10, or 20) */
  discountPercent: number
  discountAmount: number
  grandTotal: number
  amountTendered: number
  change: number
  orderNumber: string
  serverName: string
  tableNumber?: string
  dateTime: string
  paymentMethod?: string
}

const W = 32 // characters per line on 58mm paper

function pad(str: string, len: number, align: "left" | "right" = "left"): string {
  const s = String(str).substring(0, len)
  return align === "right" ? s.padStart(len) : s.padEnd(len)
}

function leftRight(left: string, right: string): string {
  const gap = W - left.length - right.length
  if (gap <= 0) return (left.substring(0, W - right.length - 1) + " " + right).substring(0, W)
  return left + " ".repeat(gap) + right
}

function center(text: string): string {
  const s = text.substring(0, W)
  const pad = Math.max(0, Math.floor((W - s.length) / 2))
  return " ".repeat(pad) + s
}

function divider(ch = "-"): string {
  return ch.repeat(W)
}

const ThermalReceipt = forwardRef<HTMLDivElement, ThermalReceiptProps>(
  (
    {
      items,
      subtotal,
      discountPercent,
      discountAmount,
      grandTotal,
      amountTendered,
      change,
      orderNumber,
      serverName,
      tableNumber,
      dateTime,
      paymentMethod = "cash",
    },
    ref
  ) => {
    const lines: string[] = []

    // Header
    lines.push(center("CORON GRILL DINERS"))
    lines.push(center("Beside Panda House,"))
    lines.push(center("1 Don Pedro St, Brgy. Poblacion"))
    lines.push(center("Coron, Palawan"))
    lines.push(divider())

    // Order info
    lines.push(leftRight("Date:", dateTime.substring(0, 20)))
    lines.push(leftRight("Order #:", orderNumber))
    lines.push(leftRight("Server:", serverName))
    if (tableNumber) lines.push(leftRight("Table #:", tableNumber))
    lines.push(leftRight("Payment:", paymentMethod.toUpperCase()))
    lines.push(divider())

    // Items header
    lines.push(leftRight("QTY  ITEM", "PRICE"))
    lines.push(divider())

    // Items
    for (const item of items) {
      const qty = `${item.quantity}x`.padEnd(5)
      const price = `P${(item.price * item.quantity).toFixed(2)}`
      const nameLen = W - qty.length - price.length - 1
      const name = item.name.substring(0, nameLen).padEnd(nameLen)
      lines.push(`${qty}${name} ${price}`)

      // If item name is long, wrap remainder
      if (item.name.length > nameLen) {
        const rest = item.name.substring(nameLen)
        for (let i = 0; i < rest.length; i += nameLen) {
          lines.push("     " + rest.substring(i, i + nameLen))
        }
      }
    }

    lines.push(divider())

    // Totals
    lines.push(leftRight("Subtotal:", `P${subtotal.toFixed(2)}`))
    if (discountPercent > 0) {
      lines.push(leftRight(`Sr. Citizen Disc.(${discountPercent}%):`, `-P${discountAmount.toFixed(2)}`))
    }
    lines.push(divider("-"))
    lines.push(leftRight("GRAND TOTAL:", `P${grandTotal.toFixed(2)}`))
    lines.push(divider("-"))

    if (paymentMethod === "cash") {
      lines.push(leftRight("Tendered:", `P${amountTendered.toFixed(2)}`))
      lines.push(leftRight("Change:", `P${change.toFixed(2)}`))
    }

    lines.push(divider())

    // Footer
    lines.push(center("Thank you for dining!"))
    lines.push(center("Visit us again in Coron!"))
    lines.push(center("--- END OF RECEIPT ---"))

    return (
      <div
        ref={ref}
        className="thermal-receipt mx-auto bg-white"
        style={{
          width: "58mm",
          maxWidth: "100%",
          padding: "6px 4px",
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: "9px",
          lineHeight: "1.35",
          color: "#000",
          letterSpacing: "0",
        }}
      >
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
          {lines.join("\n")}
        </pre>
      </div>
    )
  }
)

ThermalReceipt.displayName = "ThermalReceipt"

export default ThermalReceipt
