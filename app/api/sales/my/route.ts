import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool, { hasColumn, makeDeletedFilter } from "@/lib/db"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  console.log("[SALES/MY] Session check:", { hasSession: !!session, hasUser: !!session?.user, userId: session?.user?.id, username: session?.user ? (session.user as any)?.username : null, name: session?.user?.name })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
  const username = (session.user as any).username ?? session.user.name
  console.log("[SALES/MY] Fetching sales for:", { username, date })

  try {
    // ── Step 1: Fetch current active shift for the cashier ──
    const shiftResult = await pool.query(
      `SELECT id, start_time, end_time
       FROM public.shifts
       WHERE cashier_id = $1::integer
         AND status = 'open'
         AND DATE(start_time AT TIME ZONE 'Asia/Manila') = $2::date
       ORDER BY start_time DESC
       LIMIT 1`,
      [session.user.id, date]
    )
    
    const currentShift = shiftResult.rows[0] ?? null
    
    // ── Step 2: If no active shift, return empty orders ──
    if (!currentShift) {
      console.log("[SALES/MY] No active shift found, returning empty orders")
      return NextResponse.json({
        date,
        cashier: username,
        stats: [],
        orders: [],
        shiftId: null,
      })
    }
    
    console.log("[SALES/MY] Active shift found:", { shiftId: currentShift.id, startTime: currentShift.start_time })
    
    // ── Step 3: Filter orders by current shift (created_at between shift start and end) ──
    const shiftStart = currentShift.start_time
    const shiftEnd = currentShift.end_time ?? null
    const hasIsDeleted = await hasColumn("sales", "is_deleted")
    const deletedFilter = makeDeletedFilter(hasIsDeleted, false)

    const statsResult = await pool.query(
      `SELECT
         COALESCE(status, 'completed') AS status,
         COUNT(*)::int AS count,
         COALESCE(SUM(grand_total), 0)::float AS total
       FROM public.sales
       WHERE created_by = $1
        AND created_at >= $2
        AND ($3::timestamptz IS NULL OR created_at <= $3)
        ${deletedFilter}
       GROUP BY COALESCE(status, 'completed')
       ORDER BY COALESCE(status, 'completed')`,
      [username, shiftStart, shiftEnd]
    )

    const ordersResult = await pool.query(
      `SELECT
         id, order_number, items,
         subtotal::float, service_charge::float, grand_total::float,
         COALESCE(discount_percent, 0)::int AS discount_percent,
         COALESCE(amount_tendered, grand_total)::float AS amount_tendered,
         COALESCE(change_amount, 0)::float AS change_amount,
         payment_method, server_name, created_by,
         status, void_reason, created_at
       FROM public.sales
       WHERE created_by = $1
        AND created_at >= $2
        AND ($3::timestamptz IS NULL OR created_at <= $3)
        ${deletedFilter}
       ORDER BY created_at DESC`,
      [username, shiftStart, shiftEnd]
    )
    console.log("[SALES/MY] Query results:", { statsCount: statsResult.rows.length, ordersCount: ordersResult.rows.length, orders: ordersResult.rows.map(o => ({ id: o.id, order_number: o.order_number, created_by: o.created_by, server_name: o.server_name })) })

    return NextResponse.json({
      date,
      cashier: username,
      stats: statsResult.rows,
      orders: ordersResult.rows,
      shiftId: currentShift.id,
    })
  } catch (error) {
    console.error("Failed to fetch my sales:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}
