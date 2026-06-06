"use client"

import { forwardRef } from "react"

interface KitchenItem {
  id: number
  name: string
  price: number
  quantity: number
}

interface KitchenTicketProps {
  items: KitchenItem[]
  orderNumber: string
  serverName: string
  dateTime: string
}

const KitchenTicket = forwardRef<HTMLDivElement, KitchenTicketProps>(
  ({ items, orderNumber, serverName, dateTime }, ref) => {
    const timePart = dateTime.includes(",")
      ? dateTime.split(",").pop()?.trim() ?? dateTime
      : dateTime

    return (
      <div
        ref={ref}
        className="kitchen-ticket mx-auto bg-white p-3 font-mono"
        style={{ width: "58mm", maxWidth: "100%" }}
      >
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-xl font-black tracking-widest">** KITCHEN **</h1>
          <div className="border-t-2 border-b-2 border-black my-1 py-0.5">
            <span className="text-xs font-bold">ORDER TICKET</span>
          </div>
        </div>

        {/* Order info */}
        <div className="text-[11px] space-y-0.5 mb-2">
          <div className="flex justify-between">
            <span className="font-bold">Order #:</span>
            <span className="font-bold">{orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Time:</span>
            <span>{timePart}</span>
          </div>
          <div className="flex justify-between">
            <span>Server:</span>
            <span>{serverName}</span>
          </div>
        </div>

        <div className="border-t-2 border-black my-1" />

        {/* Items — large, bold, no prices */}
        <div className="space-y-1.5 py-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-baseline gap-2">
              <span className="text-2xl font-black leading-none w-8 text-center flex-shrink-0">
                {item.quantity}
              </span>
              <span className="text-sm font-bold leading-tight">
                x&nbsp;{item.name}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t-2 border-black my-1" />

        {/* Footer */}
        <div className="text-center text-[10px] font-bold">
          <p>** END OF ORDER **</p>
        </div>
      </div>
    )
  }
)

KitchenTicket.displayName = "KitchenTicket"
export default KitchenTicket
