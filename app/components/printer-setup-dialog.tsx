"use client";

import { useCallback, useEffect, useState } from "react";
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
  Activity,
  Bluetooth,
  ChefHat,
  Loader2,
  Printer,
  Receipt,
  Route,
} from "lucide-react";
import {
  RAWBT_CODEPAGE,
  RAWBT_LOCAL_SERVICE_ORIGIN,
  RAWBT_LOCAL_SERVICE_URL,
  checkRawBTServiceConnection,
  getMappedPrinter,
  printRoleDemoLayout,
  printRoleRoutingTest,
  type RawBTServiceHealth,
  type PrinterRole,
} from "@/lib/rawbt-service";

interface PrinterSetupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function formatCheckedAt(checkedAt: number) {
  return new Date(checkedAt).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function StatusDot({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        live ? "bg-emerald-500" : "bg-red-500"
      }`}
      aria-hidden="true"
    />
  );
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
  const printer = getMappedPrinter(role);
  const [busyAction, setBusyAction] = useState<
    "connection" | "routing" | "demo" | null
  >(null);
  const [health, setHealth] = useState<RawBTServiceHealth | null>(null);

  const runConnectionCheck = async () => {
    setBusyAction("connection");
    try {
      const result = await checkRawBTServiceConnection();
      setHealth(result);

      if (result.reachable) {
        toast.success(`${title}: RawBT service reachable`, {
          description: result.detail,
        });
      } else {
        toast.error(`${title}: RawBT service unreachable`, {
          description: result.detail,
        });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const runRoutingTest = async () => {
    setBusyAction("routing");
    try {
      await printRoleRoutingTest(role);
      toast.success(`${title}: routing test sent`, {
        description: `${printer.mac} via ${RAWBT_LOCAL_SERVICE_URL}`,
      });
    } catch (error) {
      toast.error(`${title}: routing test failed`, {
        description:
          error instanceof Error
            ? error.message
            : `Could not reach ${RAWBT_LOCAL_SERVICE_URL}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const runDemoLayout = async () => {
    setBusyAction("demo");
    try {
      await printRoleDemoLayout(role);
      toast.success(`${title}: demo layout sent`, {
        description: `Full ${role} layout sent to ${printer.name}`,
      });
    } catch (error) {
      toast.error(`${title}: demo layout failed`, {
        description:
          error instanceof Error
            ? error.message
            : `Could not reach ${RAWBT_LOCAL_SERVICE_URL}`,
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-sm">{title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fixed RawBT routing by mapped MAC address.
          </p>
        </div>
        <Badge variant="secondary">Mapped</Badge>
      </div>

      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2 text-slate-700">
          <Bluetooth className="h-3.5 w-3.5 text-blue-500" />
          <span className="font-mono font-semibold">{printer.name}</span>
        </div>
        <div>
          <span className="text-muted-foreground">ID:</span>{" "}
          <span className="font-mono">{printer.id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">MAC:</span>{" "}
          <span className="font-mono">{printer.mac}</span>
        </div>
      </div>

      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          !health
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : health.reachable
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
        }`}
      >
        <div className="font-semibold">
          {health
            ? health.reachable
              ? "Service Reachable"
              : "Service Unreachable"
            : "Service status not checked yet"}
        </div>
        <div className="mt-1">
          {health
            ? health.detail
            : `Use Check Connection to probe ${RAWBT_LOCAL_SERVICE_ORIGIN}`}
        </div>
        {health && (
          <div className="mt-1 text-[11px] opacity-80">
            Last checked: {formatCheckedAt(health.checkedAt)}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Button
          className="w-full gap-2"
          variant="outline"
          onClick={runConnectionCheck}
          disabled={!!busyAction}
        >
          {busyAction === "connection" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
          Check Connection
        </Button>

        <Button
          className="w-full gap-2"
          variant="outline"
          onClick={runRoutingTest}
          disabled={!!busyAction}
        >
          {busyAction === "routing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Route className="h-4 w-4" />
          )}
          Test Routing
        </Button>

        <Button
          className="w-full gap-2"
          variant="outline"
          onClick={runDemoLayout}
          disabled={!!busyAction}
        >
          {busyAction === "demo" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
          Print Demo Layout
        </Button>
      </div>
    </div>
  );
}

export default function PrinterSetupDialog({
  open,
  onOpenChange,
}: PrinterSetupDialogProps) {
  const [serviceHealth, setServiceHealth] = useState<RawBTServiceHealth | null>(
    null,
  );
  const [checkingService, setCheckingService] = useState(false);

  const runGlobalConnectionCheck = useCallback(async () => {
    setCheckingService(true);
    try {
      const result = await checkRawBTServiceConnection();
      setServiceHealth((previous) => {
        if (previous?.reachable !== false && result.reachable === false) {
          toast.error(
            "Printer Service Disconnected. Please tap the RawBT app to wake it up.",
          );
        }
        return result;
      });
      return result;
    } finally {
      setCheckingService(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setServiceHealth(null);
      return;
    }

    runGlobalConnectionCheck().catch(() => {});
    const interval = setInterval(() => {
      runGlobalConnectionCheck().catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [open, runGlobalConnectionCheck]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Printer Setup — RawBT Silent Print Service
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
          <p className="font-semibold">
            No manual Bluetooth or USB selection is required.
          </p>
          <p>
            The POS posts jobs directly to
            <span className="font-mono"> {RAWBT_LOCAL_SERVICE_URL}</span>,
            routes by
            <span className="font-mono"> bt_address</span>, and declares
            <span className="font-mono"> {RAWBT_CODEPAGE}</span> in the job
            payload.
          </p>
          <p>
            Each printer card now separates <strong>Check Connection</strong>,{" "}
            <strong>Test Routing</strong>, and
            <strong> Print Demo Layout</strong> so staff can avoid confusing a
            live route test with a full receipt.
          </p>
        </div>

        <div className="rounded-lg border bg-slate-50 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-slate-900">
                RawBT Service Reachability
              </div>
              <div className="text-slate-600 mt-0.5">
                {serviceHealth
                  ? serviceHealth.detail
                  : `Checking whether ${RAWBT_LOCAL_SERVICE_ORIGIN} is reachable from Chrome.`}
              </div>
            </div>
            <Badge
              variant="secondary"
              className={
                serviceHealth
                  ? serviceHealth.reachable
                    ? "bg-emerald-100 text-emerald-800 gap-2"
                    : "bg-red-100 text-red-800 gap-2"
                  : "gap-2"
              }
            >
              <StatusDot live={serviceHealth?.reachable ?? false} />
              {checkingService
                ? "Checking…"
                : serviceHealth
                  ? serviceHealth.reachable
                    ? "Live"
                    : "Disconnected"
                  : "Unknown"}
            </Badge>
          </div>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={runGlobalConnectionCheck}
            disabled={checkingService}
          >
            {checkingService ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            Check RawBT Service
          </Button>
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
          <p className="font-semibold text-slate-900">Operational notes</p>
          <p>
            • Connection checks only verify that the RawBT local service is
            reachable.
          </p>
          <p>
            • Routing tests print a tiny unmistakable marker to the assigned
            printer.
          </p>
          <p>
            • Demo layout prints the full sample receipt/ticket format for
            visual QA.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
