"use client"

import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Usb, Bluetooth, Wifi, WifiOff, Printer, CheckCircle,
  AlertCircle, Loader2, X, ExternalLink,
} from "lucide-react"
import {
  type PrinterRole,
  connectUSB,
  connectBluetooth,
  disconnectPrinter,
  printTo,
  isInsideIframe,
  PRINTER_NAMES,
  PRINTER_MACS,
} from "@/lib/printer-connection"
import { usePrinterStatus } from "@/app/hooks/use-printer-status"
import { buildCustomerReceipt, buildKitchenTicket, type PrintData } from "@/lib/escpos"

const TEST_DATA: PrintData = {
  orderNumber: "#CGD-TEST",
  dateTime: new Date().toLocaleString("en-PH"),
  serverName: "Test",
  tableNumber: "Table 5",
  paymentMethod: "cash",
  items: [
    { id: 1, name: "Test Item A", price: 100, quantity: 2 },
    { id: 2, name: "Test Item B", price: 75, quantity: 1 },
  ],
  subtotal: 275,
  discountPercent: 0,
  discountAmount: 0,
  grandTotal: 275,
  amountTendered: 300,
  change: 25,
}

interface PrinterSlotProps {
  role: PrinterRole
  label: string
  description: string
  disabled?: boolean
}

function PrinterSlot({ role, label, description, disabled }: PrinterSlotProps) {
  const st = usePrinterStatus(role)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [testOk, setTestOk] = useState(false)

  const run = async (fn: () => Promise<void>, action: string) => {
    setBusy(action)
    setError("")
    setTestOk(false)
    try {
      await fn()
    } catch (e: any) {
      setError(e?.message ?? "Failed")
    } finally {
      setBusy(null)
    }
  }

  const testPrint = async () => {
    const data = role === "cashier"
      ? buildCustomerReceipt(TEST_DATA)
      : buildKitchenTicket(TEST_DATA)
    const result = await printTo(role, data)
    if (result === "none") setError("No printer connected. Connect USB or Bluetooth first.")
    else setTestOk(true)
  }

  return (
    <div className={`rounded-xl border bg-white p-4 space-y-3 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">{label}</span>
            {st.connected ? (
              <Badge className="bg-green-100 text-green-700 border-0 text-xs">Connected</Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Not connected</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {st.connected && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-400 hover:text-red-600 flex-shrink-0"
            onClick={() => run(() => disconnectPrinter(role), "disconnect")}
            disabled={!!busy}
            title="Disconnect"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Target device info — always shown so cashier knows what to look for */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
        <Bluetooth className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
        <span className="font-mono font-semibold text-gray-700">{PRINTER_NAMES[role]}</span>
        <span className="text-gray-400 font-mono">{PRINTER_MACS[role]}</span>
        {st.connected ? (
          <Wifi className="h-3.5 w-3.5 text-green-500 flex-shrink-0 ml-auto" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 ml-auto" />
        )}
      </div>

      {/* Active connection name (if different from target, e.g. USB) */}
      {st.name && st.name !== PRINTER_NAMES[role] && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 rounded-lg px-3 py-2">
          {st.type === "usb" ? <Usb className="h-3.5 w-3.5 flex-shrink-0" /> : <Bluetooth className="h-3.5 w-3.5 flex-shrink-0" />}
          <span className="truncate">Connected: {st.name}</span>
        </div>
      )}

      {/* Error / success */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {testOk && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
          <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
          Test print sent successfully.
        </div>
      )}

      {/* Connect buttons */}
      {!st.connected && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => run(() => connectUSB(role), "usb")}
            disabled={!!busy || disabled}
          >
            {busy === "usb" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Usb className="h-3.5 w-3.5" />}
            USB
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => run(() => connectBluetooth(role), "bt")}
            disabled={!!busy || disabled}
          >
            {busy === "bt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
            Bluetooth
          </Button>
        </div>
      )}

      {/* Test print */}
      {st.connected && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => run(testPrint, "test")}
          disabled={!!busy}
        >
          {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          Print Test Page
        </Button>
      )}
    </div>
  )
}

interface PrinterSetupDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export default function PrinterSetupDialog({ open, onOpenChange }: PrinterSetupDialogProps) {
  const [inIframe, setInIframe] = useState(false)
  const [appUrl, setAppUrl] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setInIframe(isInsideIframe())
      setAppUrl(window.location.href)
    }
  }, [])

  const openInNewTab = () => {
    window.open(appUrl || window.location.href, "_blank", "noopener,noreferrer")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Printer Setup — XPrinter POS58D / XP-58H (58mm)
          </DialogTitle>
        </DialogHeader>

        {/* Iframe warning banner */}
        {inIframe && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900">Open in a new tab to connect printers</p>
                <p className="mt-0.5 text-blue-700">
                  USB and Bluetooth access is blocked when the app runs inside an embedded preview pane.
                  Open the app directly in your browser to use printer setup.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={openInNewTab}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open App in New Tab
            </Button>
          </div>
        )}

        <div className="space-y-3 mt-1">
          <PrinterSlot
            role="cashier"
            label="Cashier Printer"
            description="Prints customer receipts at the counter"
            disabled={inIframe}
          />
          <PrinterSlot
            role="kitchen"
            label="Kitchen Printer"
            description="Prints order tickets in the kitchen"
            disabled={inIframe}
          />
        </div>

        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">Setup tips:</p>
          <p>• <strong>Cashier printer:</strong> <span className="font-mono">RPP02N</span> — connects via Bluetooth.</p>
          <p>• <strong>Kitchen printer:</strong> <span className="font-mono">POS58D</span> — connects via Bluetooth.</p>
          <p>• <strong>Bluetooth:</strong> Pair the printer in your phone/PC Bluetooth settings first. Then click "Bluetooth" here — the picker will show only the correct device. If asked, confirm the pairing code on both devices.</p>
          <p>• <strong>USB:</strong> Connect the USB cable, click "USB", then pick the printer port from the browser dialog.</p>
          <p>• Once connected, the app remembers and auto-reconnects on your next visit (no dialog needed).</p>
          <p>• Use <strong>Chrome</strong> on Android or desktop for best compatibility (HTTPS required).</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
