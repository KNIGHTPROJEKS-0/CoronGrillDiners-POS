import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"

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
    const statsResult = await pool.query(
      `SELECT
         COALESCE(status, 'completed') AS status,
         COUNT(*)::int AS count,
         COALESCE(SUM(grand_total), 0)::float AS total
       FROM public.sales
       WHERE created_by = $1
         AND DATE(created_at AT TIME ZONE 'Asia/Manila') = $2::date
       GROUP BY COALESCE(status, 'completed')
       ORDER BY COALESCE(status, 'completed')`,
      [username, date]
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
         AND DATE(created_at AT TIME ZONE 'Asia/Manila') = $2::date
       ORDER BY created_at DESC`,
      [username, date]
    )
    console.log("[SALES/MY] Query results:", { statsCount: statsResult.rows.length, ordersCount: ordersResult.rows.length, orders: ordersResult.rows.map(o => ({ id: o.id, order_number: o.order_number, created_by: o.created_by, server_name: o.server_name })) })

    return NextResponse.json({
      date,
      cashier: username,
      stats: statsResult.rows,
      orders: ordersResult.rows,
    })
  } catch (error) {
    console.error("Failed to fetch my sales:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}
