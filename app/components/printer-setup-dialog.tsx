"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bluetooth,
  ChefHat,
  Loader2,
  Printer,
  Receipt,
  Route,
  Unplug,
} from "lucide-react";
import {
  connectBluetooth,
  disconnectPrinter,
  PRINTER_NAMES,
} from "@/lib/printer-connection";
import { usePrinterStatus } from "@/app/hooks/use-printer-status";
import {
  getMappedPrinter,
  printRoleDemoLayout,
  printRoleRoutingTest,
  type PrinterRole,
} from "@/lib/rawbt-service";

interface PrinterSetupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function PrinterCard({
  role,
  icon,
  title,
}: {
  role: PrinterRole;
  icon: React.ReactNode;
  title: string;
}) {
  const status = usePrinterStatus(role);
  const printer = getMappedPrinter(role);

  type Action = "connect" | "disconnect" | "routing" | "demo";
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action, fn: () => Promise<void>) => {
    setBusy(action);
    try {
      await fn();
    } catch (error) {
      toast.error(`${title}: ${action} failed`, {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleConnect = () =>
    run("connect", async () => {
      await connectBluetooth(role);
      toast.success(`${title} connected`, {
        description: status.name || PRINTER_NAMES[role],
      });
    });

  const handleDisconnect = () =>
    run("disconnect", async () => {
      await disconnectPrinter(role);
      toast.info(`${title} disconnected`);
    });

  const handleRoutingTest = () =>
    run("routing", async () => {
      await printRoleRoutingTest(role);
      toast.success(`${title}: routing test sent`, {
        description: "Check the printer for *** ROUTING TEST OK ***",
      });
    });

  const handleDemoLayout = () =>
    run("demo", async () => {
      await printRoleDemoLayout(role);
      toast.success(`${title}: demo layout sent`);
    });

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-sm">{title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Web Bluetooth — direct BLE connection
          </p>
        </div>
        <Badge
          variant="secondary"
          className={
            status.connected
              ? "bg-emerald-100 text-emerald-800 gap-1.5"
              : "bg-slate-100 text-slate-600 gap-1.5"
          }
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status.connected ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {status.connected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      {/* Printer identity */}
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2 text-slate-700">
          <Bluetooth className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
          <span className="font-mono font-semibold">{printer.name}</span>
          <span className="text-slate-400 font-mono text-[11px]">
            {printer.mac}
          </span>
        </div>
        {status.connected && status.name && (
          <div className="text-emerald-700 font-medium">
            Active: {status.name}{" "}
            {status.type ? (
              <span className="font-normal text-slate-500">
                via {status.type}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Connect / Disconnect */}
      {status.connected ? (
        <Button
          className="w-full gap-2"
          variant="outline"
          onClick={handleDisconnect}
          disabled={!!busy}
        >
          {busy === "disconnect" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Unplug className="h-4 w-4" />
          )}
          Disconnect
        </Button>
      ) : (
        <Button
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white border-0"
          onClick={handleConnect}
          disabled={!!busy}
        >
          {busy === "connect" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bluetooth className="h-4 w-4" />
          )}
          Connect via Bluetooth
        </Button>
      )}

      {/* Print actions — only shown when connected */}
      {status.connected && (
        <div className="grid gap-2 border-t pt-3">
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={handleRoutingTest}
            disabled={!!busy}
          >
            {busy === "routing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Route className="h-4 w-4" />
            )}
            Test Routing
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              tiny marker
            </span>
          </Button>

          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={handleDemoLayout}
            disabled={!!busy}
          >
            {busy === "demo" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print Demo Layout
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              full receipt
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function PrinterSetupDialog({
  open,
  onOpenChange,
}: PrinterSetupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bluetooth className="h-4 w-4 text-blue-500" />
            Printer Setup — Direct Bluetooth
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1.5">
          <p className="font-semibold">How to connect:</p>
          <p>
            1. Make sure each printer is <strong>powered on</strong> and within
            range.
          </p>
          <p>
            2. Tap <strong>Connect via Bluetooth</strong> on each printer card
            below.
          </p>
          <p>
            3. Pick the correct device from the Chrome browser dialog — look for{" "}
            <span className="font-mono">{PRINTER_NAMES.cashier}</span> (cashier)
            and <span className="font-mono">{PRINTER_NAMES.kitchen}</span>{" "}
            (kitchen).
          </p>
          <p>
            4. Once connected, use <strong>Test Routing</strong> to confirm each
            printer prints in the right place, then{" "}
            <strong>Print Demo Layout</strong> for a full visual check.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <PrinterCard
            role="cashier"
            title="Cashier Printer"
            icon={<Receipt className="h-4 w-4 text-green-600" />}
          />
          <PrinterCard
            role="kitchen"
            title="Kitchen Printer"
            icon={<ChefHat className="h-4 w-4 text-orange-600" />}
          />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-900">Tips</p>
          <p>
            • The browser remembers authorized devices — next time, printers
            reconnect automatically on page load (no picker dialog).
          </p>
          <p>
            • If the picker shows no printers, make sure the printer is on and
            not already connected to another device.
          </p>
          <p>
            • Use Chrome on Android for best Bluetooth compatibility. The app
            must be open in a regular browser tab, not an iframe preview.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
