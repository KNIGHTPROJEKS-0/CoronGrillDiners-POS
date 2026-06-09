"use client";

import { toast } from "sonner";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  Loader2,
  ChefHat,
  Receipt,
  Save,
  PrinterCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart } from "../context/cart-context";
import { useProducts } from "../context/product-context";
import ThermalReceipt from "../components/thermal-receipt";
import { savePendingSale } from "@/hooks/use-offline-sync";
import { type PrintData } from "@/lib/escpos";
import {
  buildCashierReceiptText,
  buildKitchenTicketText,
  getMappedPrinter,
} from "@/lib/rawbt-service";
import { usePrinterStatus } from "@/app/hooks/use-printer-status";
import { useShift } from "@/hooks/use-shift";

function storeReceiptData(
  d: PrintData,
  returnPath: string,
  withKitchen = false,
): void {
  const receiptText = buildCashierReceiptText(d);
  const kitchenText = buildKitchenTicketText(d);
  try {
    localStorage.setItem(
      "cgd_active_receipt",
      JSON.stringify({
        receiptText,
        kitchenText,
        autoPrintKitchen: withKitchen,
        orderNumber: d.orderNumber,
        printDataJson: JSON.stringify(d),
        returnPath,
        ts: Date.now(),
      }),
    );
  } catch {
    /* Safari private mode may block localStorage writes */
  }
}

function generateOrderNumber() {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `#CGD-${random}`;
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
  });
}

export default function CheckoutPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { cart, cartTotal, clearCart } = useCart();
  const { refreshProducts } = useProducts();
  const { shift } = useShift();

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [seniorDiscount, setSeniorDiscount] = useState<0 | 10 | 20>(0);
  const [serverName, setServerName] = useState("Staff");
  const [tableNumber, setTableNumber] = useState("");
  const [amountTendered, setAmountTendered] = useState("");
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [orderNumber] = useState(generateOrderNumber());
  const [dateTime] = useState(formatDateTime());
  const [isBusy, setIsBusy] = useState(false);
  // Snapshot is captured in useEffect (client-only) to avoid SSR hydration
  // mismatch where localStorage is unavailable on the server, which caused
  // cartSnapshot to always be [] on first render → false "cart empty" screen.
  const [mounted, setMounted] = useState(false);
  const [cartSnapshot, setCartSnapshot] = useState<typeof cart>([]);
  const [cartTotalSnapshot, setCartTotalSnapshot] = useState(0);
  // Ghost-click / tap-through protection: when the cashier taps "Proceed to
  // Confirmation" the modal opens instantly. The same tap-release event can
  // land on the first button inside the modal ("Print + Save to Records"),
  // silently recording a sale before the cashier consciously chose anything.
  // We block all action buttons for 350ms after the modal opens.
  const [isModalReady, setIsModalReady] = useState(false);

  // When set to true, the auto-redirect-to-POS effect is suppressed because the
  // completion handler is intentionally finalizing an order and will route back
  // to the POS once printing/save work is done. Without this guard,
  // invalidateSnapshot() would trigger the empty-cart redirect mid-completion.
  const completingRef = useRef(false);

  useEffect(() => {
    setCartSnapshot([...cart]);
    setCartTotalSnapshot(cartTotal);
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — capture once on mount after hydration

  // Auto-redirect to POS whenever the cart snapshot is empty after mount.
  // Covers two scenarios:
  //   1. User navigated to /checkout with an empty cart (legit — send them back)
  //   2. Browser back-button restored the cached checkout component after an
  //      order was completed and invalidateSnapshot() was called — the stale
  //      snapshot is gone, so we redirect instead of showing a re-submittable form.
  // Skipped during intentional order completion (completingRef = true), since
  // the completion handler routes explicitly after print/save work finishes.
  useEffect(() => {
    if (mounted && cartTotalSnapshot === 0 && !completingRef.current) {
      router.push(isAdmin ? "/pos" : "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, cartTotalSnapshot]);

  useEffect(() => {
    if (showSummaryModal) {
      const t = setTimeout(() => setIsModalReady(true), 350);
      return () => clearTimeout(t);
    } else {
      setIsModalReady(false);
    }
  }, [showSummaryModal]);

  const cashierMapped = getMappedPrinter("cashier");
  const kitchenMapped = getMappedPrinter("kitchen");
  const cashierStatus = usePrinterStatus("cashier");
  const kitchenStatus = usePrinterStatus("kitchen");

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (session?.user?.name) setServerName(session.user.name);
  }, [session]);

  const discountAmount = Math.round(cartTotalSnapshot * seniorDiscount) / 100;
  const grandTotal = cartTotalSnapshot - discountAmount;
  const tenderedAmount = parseFloat(amountTendered) || 0;
  const change = tenderedAmount >= grandTotal ? tenderedAmount - grandTotal : 0;

  const handleCheckout = () => {
    if (paymentMethod === "cash" && tenderedAmount < grandTotal) {
      alert("Amount tendered is less than the total amount due.");
      return;
    }
    setShowSummaryModal(true);
  };

  const printData: PrintData = {
    orderNumber,
    dateTime,
    serverName,
    tableNumber: tableNumber.trim() || undefined,
    paymentMethod,
    items: cartSnapshot.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    })),
    subtotal: cartTotalSnapshot,
    discountPercent: seniorDiscount,
    discountAmount,
    grandTotal,
    amountTendered: tenderedAmount,
    change,
  };

  type RecordSaleResult = {
    savedToDb: boolean;
    alreadySaved?: boolean;
    offlineSaved?: boolean;
  };

  const recordSale = async (): Promise<RecordSaleResult> => {
    try {
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
      });

      if (res.status === 409) {
        /* Server rejected sale due to insufficient stock — surface the
           specific reason to the cashier and refresh products so the UI
           reflects current stock. Do NOT save offline (stock is depleted). */
        const j = await res.json().catch(() => ({}));
        try {
          await refreshProducts();
        } catch {}
        toast.error("Cannot complete order", {
          description: j?.error || "One or more items are out of stock.",
          duration: 8000,
        });
        throw new Error("STOCK_REJECTED");
      }
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("[CHECKOUT] Sales API failed:", res.status, j);
        throw new Error("Server error");
      }
      if (j?.alreadySaved) {
        /* The order_number already exists in the DB — the previous POST
           succeeded but the response was lost (flaky network / PWA background).
           Treat as success: no offline save, no error. */
        toast.info(`Order ${orderNumber} confirmed`, {
          description: "This order was already saved to the database.",
        });
        return { savedToDb: true, alreadySaved: true };
      }
      /* Refresh products so cashier sees updated stock counts immediately */
      try {
        await refreshProducts();
      } catch {}
      // No toast notification for cashier - continue the checkout flow silently.
      return { savedToDb: true };
    } catch (err) {
      console.error("[CHECKOUT] recordSale failed:", err);
      if (err instanceof Error && err.message === "STOCK_REJECTED") throw err;
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
        shiftId: shift?.id,
      });
      toast.warning("Saved offline", {
        description: "No connection. Order will sync when back online.",
      });
      return { savedToDb: false, offlineSaved: true };
    }
  };

  // Invalidate the cartSnapshot immediately when an order is completed.
  // This ensures the cached checkout component (kept alive by React's router
  // cache) cannot be re-submitted if the user presses the browser back button
  // from /receipt or the POS — the stale snapshot will be gone so the page
  // redirects to POS instead of showing the old cart.
  const invalidateSnapshot = () => {
    setCartSnapshot([]);
    setCartTotalSnapshot(0);
  };

  // ── Option 1: Save Record Only (no print) ───────────────────────────────────
  const handleSaveOnly = async () => {
    setIsBusy(true);
    try {
      const result = await recordSale();
      if (!result.savedToDb && !result.offlineSaved) {
        return;
      }
      completingRef.current = true;
      invalidateSnapshot();
      setShowSummaryModal(false);
      clearCart();
      router.push(isAdmin ? "/pos" : "/");
    } catch {
      /* recordSale already surfaced a toast (e.g. STOCK_REJECTED). Keep
         the summary modal open so the cashier can adjust quantities and
         retry, instead of silently navigating away. */
    } finally {
      setIsBusy(false);
    }
  };



  // ── Option 3: Print + Save ──────────────────────────────────────────────────
  // Saves to DB then stores receipt data and navigates to the /receipt page.
  // The /receipt page auto-prints via BLE (or RawBT fallback) on mount.
  const handlePrintAndSave = async () => {
    setIsBusy(true);
    try {
      const result = await recordSale();
      if (!result.savedToDb && !result.offlineSaved) {
        return;
      }

      storeReceiptData(printData, isAdmin ? "/pos" : "/", true);
      setShowSummaryModal(false);
      completingRef.current = true;
      invalidateSnapshot();
      clearCart();
      router.push("/receipt");
    } catch {
      // recordSale threw (e.g. STOCK_REJECTED — already toasted). Keep modal open.
    } finally {
      setIsBusy(false);
    }
  };

  // Don't render anything until the client-side mount effect has captured the
  // real cart from localStorage — prevents the false "empty cart" flash that
  // occurs during SSR hydration when cart is temporarily [].
  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center print:hidden" />
    );
  }

  if (cartSnapshot.length === 0) {
    // While a completion handler is mid-navigation to /receipt or POS, the
    // snapshot is intentionally empty. Render a blank screen instead of the
    // "Your cart is empty" message so it doesn't flash for one frame.
    if (completingRef.current) {
      return (
        <div className="flex h-screen items-center justify-center print:hidden" />
      );
    }
    return (
      <div className="flex h-screen items-center justify-center print:hidden">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Your cart is empty</h1>
          <p className="mt-2 text-muted-foreground">
            Add some items to your cart before checkout
          </p>
          <Button
            className="mt-4"
            onClick={() => router.push(isAdmin ? "/pos" : "/")}
          >
            Return to POS
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Main checkout page ───────────────────────────────────────────────── */}
      <div className="container mx-auto max-w-4xl py-8 print:hidden">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => router.push(isAdmin ? "/pos" : "/")}
        >
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
                    <p className="text-sm text-muted-foreground">
                      ₱{item.price.toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <p className="font-medium flex-shrink-0">
                    ₱{(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}

              <Separator className="my-4" />

              <div className="space-y-2">
                <div className="flex justify-between">
                  <p>Subtotal</p>
                  <p>₱{cartTotalSnapshot.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    Senior Discount:
                  </span>
                  {([0, 10, 20] as const).map((pct) => (
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
                <Label htmlFor="serverName" className="text-sm font-medium">
                  Server Name
                </Label>
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
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(v) => {
                    setPaymentMethod(v);
                    if (v !== "cash") setAmountTendered("");
                  }}
                  className="mt-2"
                >
                  <div className="flex items-center space-x-2 rounded-md border p-3">
                    <RadioGroupItem value="cash" id="cash" />
                    <Label
                      htmlFor="cash"
                      className="flex items-center cursor-pointer"
                    >
                      <Wallet className="mr-2 h-4 w-4" />
                      Cash
                    </Label>
                  </div>
                  <div className="mt-2 flex items-center space-x-2 rounded-md border p-3">
                    <RadioGroupItem value="card" id="card" />
                    <Label
                      htmlFor="card"
                      className="flex items-center cursor-pointer"
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Credit/Debit Card
                    </Label>
                  </div>
                  <div className="mt-2 flex items-center space-x-2 rounded-md border p-3">
                    <RadioGroupItem value="gcash" id="gcash" />
                    <Label
                      htmlFor="gcash"
                      className="flex items-center cursor-pointer"
                    >
                      <span className="mr-2 text-sm font-bold text-blue-600">
                        G
                      </span>
                      GCash / Maya
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {paymentMethod === "cash" && (
                <div>
                  <Label
                    htmlFor="amountTendered"
                    className="text-sm font-medium"
                  >
                    Amount Tendered
                  </Label>
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
                  Table Number{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
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
                disabled={
                  paymentMethod === "cash" && tenderedAmount < grandTotal
                }
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
            <DialogTitle>Cashier Receipt Confirmation</DialogTitle>
            <DialogDescription>
              Review the cashier receipt, then use the assigned printer actions
              below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Cashier Receipt Confirmation</p>
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
          </div>

          {/* Live Bluetooth printer status row */}
          <div className="space-y-1.5 px-0.5">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge
                variant="secondary"
                className={`gap-1.5 ${
                  cashierStatus.connected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    cashierStatus.connected ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                />
                <Receipt className="h-3 w-3" />
                {cashierStatus.connected
                  ? `Cashier — ${cashierStatus.name}`
                  : `Cashier — not connected`}
              </Badge>
              <Badge
                variant="secondary"
                className={`gap-1.5 ${
                  kitchenStatus.connected
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    kitchenStatus.connected ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                />
                <ChefHat className="h-3 w-3" />
                {kitchenStatus.connected
                  ? `Kitchen — ${kitchenStatus.name}`
                  : `Kitchen — not connected`}
              </Badge>
            </div>
            {(!cashierStatus.connected || !kitchenStatus.connected) && (
              <p className="text-[11px] text-amber-600 leading-relaxed">
                One or more printers not connected — open{" "}
                <strong>Printer Setup</strong> in the sidebar to connect via
                Bluetooth.
              </p>
            )}
          </div>

          <Separator />

          {/* ── 2 Action Options ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            {/* Option 1 (primary): Print */}
            <Button
              className="w-full gap-2 h-11"
              onClick={handlePrintAndSave}
              disabled={isBusy || !isModalReady}
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PrinterCheck className="h-4 w-4" />
              )}
              Print
            </Button>

            {/* Option 2: Save Only */}
            <Button
              variant="ghost"
              className="w-full gap-2 h-10 text-muted-foreground hover:text-foreground"
              onClick={handleSaveOnly}
              disabled={isBusy || !isModalReady}
            >
              <Save className="h-4 w-4" />
              Save
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
  );
}
