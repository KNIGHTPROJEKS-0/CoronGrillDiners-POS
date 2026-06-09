"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import KitchenTicket from "@/app/components/kitchen-ticket";
import type { PrintData } from "@/lib/escpos";
import { printKitchenTicket } from "@/lib/rawbt-service";

interface OrderData {
  orderNumber: string;
  dateTime: string;
  serverName: string;
  items: { id: number; name: string; price: number; quantity: number }[];
}

export default function KitchenTicketPage() {
  const [data, setData] = useState<OrderData | null>(null);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cgd_kitchen_ticket");
      if (raw) setData(JSON.parse(raw));
    } catch {
      // no data
    }
  }, []);

  useEffect(() => {
    if (!data || printed) return;

    const payload: PrintData = {
      orderNumber: data.orderNumber,
      dateTime: data.dateTime,
      serverName: data.serverName,
      tableNumber: undefined,
      paymentMethod: "cash",
      items: data.items,
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      grandTotal: 0,
      amountTendered: 0,
      change: 0,
    };

    (async () => {
      try {
        await printKitchenTicket(payload);
        setPrinted(true);
      } catch (error) {
        console.error("Kitchen ticket route print failed:", error);
        toast.error("Kitchen print failed", {
          description:
            error instanceof Error
              ? error.message
              : "Could not reach the RawBT local print service.",
        });
      }
    })();
  }, [data, printed]);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center font-mono text-sm print:hidden">
        No order data found.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <p className="text-sm text-gray-600 mb-4">
        {printed
          ? "Kitchen ticket sent to RawBT service."
          : "Sending to kitchen printer…"}
      </p>
      <KitchenTicket
        items={data.items}
        orderNumber={data.orderNumber}
        serverName={data.serverName}
        dateTime={data.dateTime}
      />
    </div>
  );
}
