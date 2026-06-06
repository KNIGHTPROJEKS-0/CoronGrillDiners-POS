"use client"

import { useEffect, useState } from "react"
import KitchenTicket from "@/app/components/kitchen-ticket"

interface OrderData {
  orderNumber: string
  dateTime: string
  serverName: string
  items: { id: number; name: string; price: number; quantity: number }[]
}

export default function KitchenTicketPage() {
  const [data, setData] = useState<OrderData | null>(null)
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cgd_kitchen_ticket")
      if (raw) setData(JSON.parse(raw))
    } catch {
      // no data
    }
  }, [])

  useEffect(() => {
    if (data && !printed) {
      const t = setTimeout(() => {
        window.print()
        setPrinted(true)
      }, 400)
      return () => clearTimeout(t)
    }
  }, [data, printed])

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center font-mono text-sm print:hidden">
        No order data found.
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 print:hidden">
        <p className="text-sm text-gray-600 mb-4">Sending to kitchen printer…</p>
        <KitchenTicket
          items={data.items}
          orderNumber={data.orderNumber}
          serverName={data.serverName}
          dateTime={data.dateTime}
        />
      </div>

      <div className="hidden print:block">
        <KitchenTicket
          items={data.items}
          orderNumber={data.orderNumber}
          serverName={data.serverName}
          dateTime={data.dateTime}
        />
      </div>
    </>
  )
}
