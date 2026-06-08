import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool, { hasColumn, makeDeletedFilter } from "@/lib/db"

// Helper to compute overnight flags and labels
function addOvernightFields(sale: any) {
  let isOvernightShiftOrder = false
  let overnightShiftLabel = null
  if (sale.shift_start_time) {
    const shiftDate = new Date(sale.shift_start_time)
    const saleDate = new Date(sale.created_at)
    // Convert both to Asia/Manila dates for comparison
    const shiftCalendarDate = shiftDate.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
    const saleCalendarDate = saleDate.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
    isOvernightShiftOrder = shiftCalendarDate < saleCalendarDate
    if (isOvernightShiftOrder) {
      // Format shift date as "June 8"
      overnightShiftLabel = shiftDate.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric" })
    }
  }
  const { shift_start_time, ...rest } = sale
  return { ...rest, isOvernightShiftOrder, overnightShiftLabel }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const shiftResult = await pool.query(
      `SELECT
         id, cashier_name, cashier_username, start_time, end_time, status
       FROM public.shifts
       WHERE id = $1`,
      [id]
    )

    if (shiftResult.rows.length === 0) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    const shift = shiftResult.rows[0]
    const endTime = shift.end_time ?? new Date().toISOString()
    const hasIsDeleted = await hasColumn("sales", "is_deleted")
    const deletedFilter = makeDeletedFilter(hasIsDeleted, false)

    const salesResult = await pool.query(
      `SELECT
         id, order_number, items,
         subtotal::float, service_charge::float, grand_total::float,
         COALESCE(discount_percent, 0)::int AS discount_percent,
         payment_method, server_name, created_by,
         status, void_reason, created_at,
         $3 AS shift_start_time
       FROM public.sales
       WHERE (created_by = $1 OR created_by = $2 OR server_name = $1 OR server_name = $2)
         AND created_at >= $3
         AND created_at <= $4
         ${deletedFilter}
       ORDER BY created_at ASC`,
      [shift.cashier_name, shift.cashier_username, shift.start_time, endTime]
    )

    return NextResponse.json({
      shift,
      sales: salesResult.rows.map(addOvernightFields),
    })
  } catch (error) {
    console.error("Failed to fetch shift sales:", error)
    return NextResponse.json({ error: "Failed to fetch shift sales" }, { status: 500 })
  }
}
