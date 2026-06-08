"use client"

import { toast } from "sonner"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  ArrowLeft, CreditCard, Wallet, Printer, Loader2,
  Bluetooth, Usb, ChefHat, Receipt, Save, PrinterCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCart } from "../context/cart-context"
import { useProducts } from "../context/product-context"
import ThermalReceipt from "../components/thermal-receipt"
import { savePendingSale } from "@/hooks/use-offline-sync"
import { usePrinterStatus } from "@/app/hooks/use-printer-status"
import { printTo, printToRawBT } from "@/lib/printer-connection"
import { buildCustomerReceipt, buildKitchenTicket, type PrintData } from "@/lib/escpos"
import { useShift } from "@/hooks/use-shift"

function storeReceiptData(d: import("@/lib/escpos").PrintData, returnPath: string, withKitchen = false): void {
  const W = 32

  function pad(str: string, len: number, align: "left" | "right" = "left") {
    const s = String(str).substring(0, len)
    return align === "right" ? s.padStart(len) : s.padEnd(len)
  }
  function leftRight(left: string, right: string) {
    const gap = W - left.length - right.length
    if (gap <= 0) return (left.substring(0, W - right.length - 1) + " " + right).substring(0, W)
    return left + " ".repeat(gap) + right
  }
  function center(text: string) {
    const s = text.substring(0, W)
    const p = Math.max(0, Math.floor((W - s.length) / 2))
    return " ".repeat(p) + s
  }
  function divider(ch = "-") { return ch.repeat(W) }

  const lines: string[] = []
  lines.push(center("CORON GRILL DINERS"))
  lines.push(center("Beside Panda House,"))
  lines.push(center("1 Don Pedro St, Brgy. Poblacion"))
  lines.push(center("Coron, Palawan"))
  lines.push(divider())
  lines.push(leftRight("Date:", d.dateTime.substring(0, 20)))
  lines.push(leftRight("Order #:", d.orderNumber))
  lines.push(leftRight("Server:", d.serverName))
  if (d.tableNumber) lines.push(leftRight("Table #:", d.tableNumber))
  lines.push(leftRight("Payment:", d.paymentMethod.toUpperCase()))
  lines.push(divider())
  lines.push(leftRight("QTY  ITEM", "PRICE"))
  lines.push(divider())

  for (const item of d.items) {
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
  lines.push(leftRight("Subtotal:", `P${d.subtotal.toFixed(2)}`))
  if (d.discountPercent > 0) lines.push(leftRight(`Sr. Citizen Disc.(${d.discountPercent}%):`, `-P${d.discountAmount.toFixed(2)}`))
  lines.push(divider("-"))
  lines.push(leftRight("GRAND TOTAL:", `P${d.grandTotal.toFixed(2)}`))
  lines.push(divider("-"))
  if (d.paymentMethod === "cash") {
    lines.push(leftRight("Tendered:", `P${d.amountTendered.toFixed(2)}`))
    lines.push(leftRight("Change:", `P${d.change.toFixed(2)}`))
  }
  lines.push(divider())
  lines.push(center("Thank you for dining!"))
  lines.push(center("Visit us again in Coron!"))
  lines.push(center("--- END OF RECEIPT ---"))

  const receiptText = lines.join("\n")

  // Build a plain-text kitchen ticket for the share-API fallback used in
  // /receipt when no direct BLE/USB connection is active for the kitchen printer.
  const kSep = "=".repeat(W)
  const kLines: string[] = ["** KITCHEN **", kSep, `Order #:  ${d.orderNumber}`]
  const kTimePart = d.dateTime.includes(",")
    ? d.dateTime.split(",").pop()?.trim() ?? d.dateTime
    : d.dateTime
  kLines.push(`Time:     ${kTimePart}`, `Server:   ${d.serverName}`)
  if (d.tableNumber) kLines.push(`Table #:  ${d.tableNumber}`)
  kLines.push(kSep)
  for (const kItem of d.items) kLines.push(`${kItem.quantity}x  ${kItem.name}`)
  kLines.push(kSep, "** END OF ORDER **")
  const kitchenText = kLines.join("\n")

  // Store all receipt data for the /receipt page.  The /receipt page is
  // navigated to in the SAME browser tab (router.push) so the Web Bluetooth
  // module state (btChars) is still alive and printTo() works directly.
  //
  // kitchenText is ALWAYS stored so the kitchen preview card and Print Kitchen
  // button always appear on /receipt, even when the cashier did not tick the
  // "Also print kitchen ticket" box. The separate `autoPrintKitchen` flag
  // controls whether the kitchen ticket is auto-printed on page mount.
  try {
    localStorage.setItem("cgd_active_receipt", JSON.stringify({
      receiptText,
      kitchenText,
      autoPrintKitchen: withKitchen,
      autoPrint: true,
      orderNumber: d.orderNumber,
      printDataJson: JSON.stringify(d),
      returnPath,
      ts: Date.now(),
    }))
  } catch { /* Safari private mode may block localStorage writes */ }
}


function generateOrderNumber() {
  const random = Math.floor(1000 + Math.random() * 9000)
  return `#CGD-${random}`
}

function formatDateTime() {
  return new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
}

function PrinterBadge({ role }: { role: "cashier" | "kitchen" }) {
  const st = usePrinterStatus(role)
  if (!st.connected) return null
  return (
    <Badge className="bg-green-100 text-green-700 border-0 text-[10px] gap-1 px-1.5 py-0">
      {st.type === "usb" ? <Usb className="h-2.5 w-2.5" /> : <Bluetooth className="h-2.5 w-2.5" />}
      {st.name.length > 18 ? st.name.substring(0, 18) + "…" : st.name}
    </Badge>
  )
}

export default function CheckoutPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const { cart, cartTotal, clearCart } = useCart()
  const { refreshProducts } = useProducts()
  const { shift } = useShift()

  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [seniorDiscount, setSeniorDiscount] = useState<0 | 10 | 20>(0)
  const [serverName, setServerName] = useState("Staff")
  const [tableNumber, setTableNumber] = useState("")
  const [amountTendered, setAmountTendered] = useState("")
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [withKitchenTicket, setWithKitchenTicket] = useState(false)
  const [orderNumber] = useState(generateOrderNumber())
  const [dateTime] = useState(formatDateTime())
  const [isBusy, setIsBusy] = useState(false)
  // Snapshot is captured in useEffect (client-only) to avoid SSR hydration
  // mismatch where localStorage is unavailable on the server, which caused
  // cartSnapshot to always be [] on first render → false "cart empty" screen.
  const [mounted, setMounted] = useState(false)
  const [cartSnapshot, setCartSnapshot] = useState<typeof cart>([])
  const [cartTotalSnapshot, setCartTotalSnapshot] = useState(0)
  // Ghost-click / tap-through protection: when the cashier taps "Proceed to
  // Confirmation" the modal opens instantly. The same tap-release event can
  // land on the first button inside the modal ("Print + Save to Records"),
  // silently recording a sale before the cashier consciously chose anything.
  // We block all action buttons for 350ms after the modal opens.
  const [isModalReady, setIsModalReady] = useState(false)

  // When set to true, the auto-redirect-to-POS effect is suppressed because the
  // completion handler is intentionally navigating to /receipt and will handle
  // its own routing. Without this guard, invalidateSnapshot() triggers the
  // auto-redirect useEffect which races with router.push("/receipt") and wins,
  // dumping the cashier back on POS with a "cart is empty" message.
  const completingRef = useRef(false)

  useEffect(() => {
    setCartSnapshot([...cart])
    setCartTotalSnapshot(cartTotal)
    setMounted(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — capture once on mount after hydration

  // Auto-redirect to POS whenever the cart snapshot is empty after mount.
  // Covers two scenarios:
  //   1. User navigated to /checkout with an empty cart (legit — send them back)
  //   2. Browser back-button restored the cached checkout component after an
  //      order was completed and invalidateSnapshot() was called — the stale
  //      snapshot is gone, so we redirect instead of showing a re-submittable form.
  // Skipped during intentional order completion (completingRef = true), since
  // the completion handler does its own router.push() to /receipt or POS.
  useEffect(() => {
    if (mounted && cartTotalSnapshot === 0 && !completingRef.current) {
      router.push(isAdmin ? "/pos" : "/")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, cartTotalSnapshot])

  useEffect(() => {
    if (showSummaryModal) {
      const t = setTimeout(() => setIsModalReady(true), 350)
      return () => clearTimeout(t)
    } else {
      setIsModalReady(false)
    }
  }, [showSummaryModal])

  const cashierPrinter = usePrinterStatus("cashier")
  const kitchenPrinter = usePrinterStatus("kitchen")

  const isAdmin = session?.user?.role === "admin"

  useEffect(() => {
    if (session?.user?.name) setServerName(session.user.name)
  }, [session])

  const discountAmount = Math.round(cartTotalSnapshot * seniorDiscount) / 100
  const grandTotal = cartTotalSnapshot - discountAmount
  const tenderedAmount = parseFloat(amountTendered) || 0
  const change = tenderedAmount >= grandTotal ? tenderedAmount - grandTotal : 0

  const handleCheckout = () => {
    if (paymentMethod === "cash" && tenderedAmount < grandTotal) {
      alert("Amount tendered is less than the total amount due.")
      return
    }
    setShowSummaryModal(true)
  }

  const printData: PrintData = {
    orderNumber,
    dateTime,
    serverName,
    tableNumber: tableNumber.trim() || undefined,
    paymentMethod,
    items: cartSnapshot.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
    subtotal: cartTotalSnapshot,
    discountPercent: seniorDiscount,
    discountAmount,
    grandTotal,
    amountTendered: tenderedAmount,
    change,
  }

  const recordSale = async () => {
    try {
      console.log("[CHECKOUT] Starting recordSale:", {
        orderNumber,
        grandTotal,
        paymentMethod,
        serverName,
        createdBy: session?.user?.name ?? serverName,
        shiftId: shift?.id,
        itemCount: printData.items.length,
      })

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          items: printData.items,
          subtotal: cartTotalSnapshot,
          serviceCharge: discountAmount,
          discountPercent: seniorDiscount,
          grandTotal,
          paymentMethod,
          amountTendered: tenderedAmount,
          changeAmount: change,
          serverName,
          createdBy: session?.user?.name ?? serverName,
          shiftId: shift?.id,
        }),
      })

      console.log("[CHECKOUT] Sales API response status:", res.status)
      if (res.status === 409) {
        /* Server rejected sale due to insufficient stock — surface the
           specific reason to the cashier and refresh products so the UI
           reflects current stock. Do NOT save offline (stock is depleted). */
        const j = await res.json().catch(() => ({}))
        try { await refreshProducts() } catch {}
        toast.error("Cannot complete order", {
          description: j?.error || "One or more items are out of stock.",
          duration: 8000,
        })
        throw new Error("STOCK_REJECTED")
      }
      const j = await res.json().catch(() => null)
      console.log("[CHECKOUT] Sales API response:", j)
      if (!res.ok) {
        console.error("[CHECKOUT] Sales API failed:", res.status, j)
        throw new Error("Server error")
      }
      if (j?.alreadySaved) {
        /* The order_number already exists in the DB — the previous POST
           succeeded but the response was lost (flaky network / PWA background).
           Treat as success: no offline save, no error. */
        toast.info(`Order ${orderNumber} confirmed`, {
          description: "This order was already saved to the database.",
        })
        return
      }
      /* Refresh products so cashier sees updated stock counts immediately */
      try { await refreshProducts() } catch {}
      console.log("[CHECKOUT] Order saved successfully:", orderNumber)
      // No toast notification for cashier - go straight to receipt page
    } catch (err) {
      console.error("[CHECKOUT] recordSale failed:", err)
      if (err instanceof Error && err.message === "STOCK_REJECTED") throw err
      savePendingSale({
        orderNumber,
        items: printData.items,
        subtotal: cartTotalSnapshot,
        serviceCharge: discountAmount,
        discountPercent: seniorDiscount,
        grandTotal,
        paymentMethod,
        amountTendered: tenderedAmount,
        changeAmount: change,
        serverName,
        createdBy: session?.user?.name ?? serverName,
      })
      toast.warning("Saved offline", {
        description: "No connection. Order will sync when back online.",
      })
    }
  }

  // Invalidate the cartSnapshot immediately when an order is completed.
  // This ensures the cached checkout component (kept alive by React's router
  // cache) cannot be re-submitted if the user presses the browser back button
  // from /receipt or the POS — the stale snapshot will be gone so the page
  // redirects to POS instead of showing the old cart.
  const invalidateSnapshot = () => {
    setCartSnapshot([])
    setCartTotalSnapshot(0)
  }

  const finishOrder = (delay = 400) => {
    completingRef.current = true
    invalidateSnapshot()
    setTimeout(() => {
      clearCart()
      router.push(isAdmin ? "/pos" : "/")
    }, delay)
  }

  // ── Option 1: Save Record Only (no print) ───────────────────────────────────
  const handleSaveOnly = async () => {
    setIsBusy(true)
    try {
      await recordSale()
      completingRef.current = true
      invalidateSnapshot()
      setShowSummaryModal(false)
      clearCart()
      router.push(isAdmin ? "/pos" : "/")
    } catch {
      /* recordSale already surfaced a toast (e.g. STOCK_REJECTED). Keep
         the summary modal open so the cashier can adjust quantities and
         retry, instead of silently navigating away. */
    } finally {
      setIsBusy(false)
    }
  }

  // ── Option 2: Print Only (no DB record) ─────────────────────────────────────
  const handlePrintOnly = async () => {
    setIsBusy(true)
    setShowSummaryModal(false)
    
    // Build receipts
    const cashierReceipt = buildCustomerReceipt(printData)
    const kitchenTicket = buildKitchenTicket(printData)
    
    // Prioritize Web Bluetooth/USB for dual printer support (can connect to specific devices by name)
    // Web Bluetooth supports simultaneous connections to both RPP02N (cashier) and POS58D (kitchen)
    let cashierPrinted = false
    if (cashierPrinter.connected) {
      await printTo("cashier", cashierReceipt)
      cashierPrinted = true
      if (withKitchenTicket && kitchenPrinter.connected) {
        await printTo("kitchen", kitchenTicket)
      }
    }
    
    // Fall back to RawBT only if Web Bluetooth/USB not connected
    // Note: RawBT uses the default printer set in the app, so it can only print to one printer at a time
    if (!cashierPrinted) {
      const cashierRawbtSuccess = await printToRawBT("cashier", cashierReceipt)
      if (cashierRawbtSuccess && withKitchenTicket) {
        await printToRawBT("kitchen", kitchenTicket)
      }
    }
    
    setIsBusy(false)
    finishOrder(200)
    return
  }

  // ── Option 3: Print + Save ──────────────────────────────────────────────────
  const handlePrintAndSave = async () => {
    setIsBusy(true)
    try {
      await recordSale()
      setShowSummaryModal(false)
      
      // Store receipt data and navigate to receipt page for printing
      // This ensures database save completes before any printing attempts
      completingRef.current = true
      storeReceiptData(printData, isAdmin ? "/pos" : "/", withKitchenTicket)
      invalidateSnapshot()
      setIsBusy(false)
      clearCart()
      router.push("/receipt")
    } catch {
      setIsBusy(false)
      // recordSale threw (e.g. STOCK_REJECTED — already toasted). Keep modal open.
    }
  }

  // Don't render anything until the client-side mount effect has captured the
  // real cart from localStorage — prevents the false "empty cart" flash that
  // occurs during SSR hydration when cart is temporarily [].
  if (!mounted) {
    return <div className="flex h-screen items-center justify-center print:hidden" />
  }

  if (cartSnapshot.length === 0) {
    // While a completion handler is mid-navigation to /receipt or POS, the
    // snapshot is intentionally empty. Render a blank screen instead of the
    // "Your cart is empty" message so it doesn't flash for one frame.
    if (completingRef.current) {
      return <div className="flex h-screen items-center justify-center print:hidden" />
    }
    return (
      <div className="flex h-screen items-center justify-center print:hidden">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Your cart is empty</h1>
          <p className="mt-2 text-muted-foreground">Add some items to your cart before checkout</p>
          <Button className="mt-4" onClick={() => router.push(isAdmin ? "/pos" : "/")}>
            Return to POS
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Main checkout page ───────────────────────────────────────────────── */}
      <div className="container mx-auto max-w-4xl py-8 print:hidden">
        <Button variant="ghost" className="mb-6" onClick={() => router.push(isAdmin ? "/pos" : "/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to POS
        </Button>

        <h1 className="mb-6 text-3xl font-bold">Checkout</h1>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Order summary */}
          <div>
            <h2 className="mb-4 text-xl font-semibold">Order Summary</h2>
            <div className="rounded-lg border p-4 bg-white">
              {cartSnapshot.map((item) => (
                <div key={item.id} className="mb-3 flex justify-between">
                  <div className="flex-1 pr-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">₱{item.price.toFixed(2)} × {item.quantity}</p>
                  </div>
                  <p className="font-medium flex-shrink-0">₱{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}

              <Separator className="my-4" />

              <div className="space-y-2">
                <div className="flex justify-between">
                  <p>Subtotal</p>
                  <p>₱{cartTotalSnapshot.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Senior Discount:</span>
                  {([0, 10, 20] as const).map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setSeniorDiscount(pct)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        seniorDiscount === pct
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300 text-gray-700 hover:border-blue-400"
                      }`}
                    >
                      {pct === 0 ? "None" : `${pct}%`}
                    </button>
                  ))}
                </div>
                {seniorDiscount > 0 && (
                  <div className="flex justify-between text-blue-600 text-sm">
                    <p>Senior Discount ({seniorDiscount}%)</p>
                    <p>-₱{discountAmount.toFixed(2)}</p>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <p>Grand Total</p>
                  <p>₱{grandTotal.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Payment details */}
          <div>
            <h2 className="mb-4 text-xl font-semibold">Payment Details</h2>
            <div className="rounded-lg border p-4 bg-white space-y-4">
              <div>
                <Label htmlFor="serverName" className="text-sm font-medium">Server Name</Label>
                <Input
                  id="serverName"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Enter server name"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Payment Method</Label>
                <RadioGroup value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== "cash") setAmountTendered("") }} className="mt-2">
                  <div className="flex items-center space-x-2 rounded-md border p-3">
                    <RadioGroupItem value="cash" id="cash" />
                    <Label htmlFor="cash" className="flex items-center cursor-pointer">
                      <Wallet className="mr-2 h-4 w-4" />Cash
                    </Label>
                  </div>
                  <div className="mt-2 flex items-center space-x-2 rounded-md border p-3">
                    <RadioGroupItem value="card" id="card" />
                    <Label htmlFor="card" className="flex items-center cursor-pointer">
                      <CreditCard className="mr-2 h-4 w-4" />Credit/Debit Card
                    </Label>
                  </div>
                  <div className="mt-2 flex items-center space-x-2 rounded-md border p-3">
                    <RadioGroupItem value="gcash" id="gcash" />
                    <Label htmlFor="gcash" className="flex items-center cursor-pointer">
                      <span className="mr-2 text-sm font-bold text-blue-600">G</span>
                      GCash / Maya
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {paymentMethod === "cash" && (
                <div>
                  <Label htmlFor="amountTendered" className="text-sm font-medium">Amount Tendered</Label>
                  <Input
                    id="amountTendered"
                    type="number"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    placeholder="Enter amount received"
                    className="mt-1"
                    min={0}
                  />
                  {tenderedAmount >= grandTotal && (
                    <p className="mt-2 text-sm font-medium text-green-600">
                      Change: ₱{change.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="tableNumber" className="text-sm font-medium">
                  Table Number <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="tableNumber"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="e.g. T1, Table 5"
                  className="mt-1"
                  maxLength={20}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={paymentMethod === "cash" && tenderedAmount < grandTotal}
              >
                Proceed to Confirmation
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Order Confirmation Modal ──────────────────────────────────────────── */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="max-w-md print:hidden">
          <DialogHeader>
            <DialogTitle>Order Confirmation</DialogTitle>
            <DialogDescription>
              Review the receipt, then choose how to complete this order.
            </DialogDescription>
          </DialogHeader>

          {/* Receipt preview */}
          <div className="max-h-[38vh] overflow-auto border rounded-lg bg-white">
            <ThermalReceipt
              items={cartSnapshot}
              subtotal={cartTotalSnapshot}
              discountPercent={seniorDiscount}
              discountAmount={discountAmount}
              grandTotal={grandTotal}
              amountTendered={tenderedAmount}
              change={change}
              orderNumber={orderNumber}
              serverName={serverName}
              tableNumber={tableNumber.trim() || undefined}
              dateTime={dateTime}
              paymentMethod={paymentMethod}
            />
          </div>

          {/* Printer status row */}
          <div className="flex gap-4 text-xs text-muted-foreground px-0.5">
            <span className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />Cashier:{" "}
              {cashierPrinter.connected
                ? <PrinterBadge role="cashier" />
                : <span className="text-amber-600">no printer — browser fallback</span>}
            </span>
          </div>

          {/* Kitchen ticket toggle */}
          <div className="flex items-center gap-2 px-0.5">
            <Checkbox
              id="kitchenTicket"
              checked={withKitchenTicket}
              onCheckedChange={(v) => setWithKitchenTicket(v as boolean)}
              disabled={isBusy}
            />
            <Label htmlFor="kitchenTicket" className="text-sm cursor-pointer flex items-center gap-1.5">
              <ChefHat className="h-3.5 w-3.5 text-orange-600" />
              Also print kitchen ticket
              {kitchenPrinter.connected && <PrinterBadge role="kitchen" />}
            </Label>
          </div>

          <Separator />

          {/* ── 3 Action Options ─────────────────────────────────────────────── */}
          <div className="space-y-2">

            {/* Option 3 (primary): Print + Save */}
            <Button
              className="w-full gap-2 h-11"
              onClick={handlePrintAndSave}
              disabled={isBusy || !isModalReady}
            >
              {isBusy
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <PrinterCheck className="h-4 w-4" />}
              Print + Save to Records
            </Button>

            {/* Option 2: Print Only (no save) */}
            <Button
              variant="outline"
              className="w-full gap-2 h-11"
              onClick={handlePrintOnly}
              disabled={isBusy || !isModalReady}
            >
              <Printer className="h-4 w-4" />
              Print Only
              <span className="text-xs text-muted-foreground font-normal ml-1">(no database record)</span>
            </Button>

            {/* Option 1: Save Only (no print) */}
            <Button
              variant="ghost"
              className="w-full gap-2 h-10 text-muted-foreground hover:text-foreground"
              onClick={handleSaveOnly}
              disabled={isBusy || !isModalReady}
            >
              <Save className="h-4 w-4" />
              Save Record Only
              <span className="text-xs font-normal ml-1">(no print)</span>
            </Button>

            <Separator />

            {/* Cancel — go back to checkout without saving */}
            <Button
              variant="ghost"
              className="w-full gap-2 h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 text-sm"
              onClick={() => setShowSummaryModal(false)}
              disabled={isBusy}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Checkout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  )
}
