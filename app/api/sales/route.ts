import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  console.log("[SALES API] Session check:", { hasSession: !!session, hasUser: !!session?.user, userId: session?.user?.id, userRole: (session?.user as any)?.role })
  
  if (!session?.user) {
    console.error("[SALES API] Unauthorized - no session or user")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    console.log("[SALES API] Attempting to parse request body")
    let body
    try {
      body = await request.json()
      console.log("[SALES API] Request body parsed successfully")
    } catch (jsonErr) {
      console.error("[SALES API] Failed to parse request body:", jsonErr)
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }
    const {
      orderNumber,
      items,
      subtotal,
      serviceCharge,
      discountPercent,
      grandTotal,
      paymentMethod,
      amountTendered,
      changeAmount,
      serverName,
      createdBy,
      shiftId,
    } = body

    console.log("[SALES API] Received order:", { orderNumber, grandTotal, paymentMethod, shiftId, createdBy })

    const sessionUsername = createdBy ?? (session.user as any).username ?? session.user.name ?? serverName

    /* Transaction: insert the sale without stock validation.
       The products table does not have a stock column, so stock tracking
       is not implemented. Products use 'available' boolean instead. */
    const client = await pool.connect()
    console.log("[SALES API] Database connected successfully")
    let sale: any
    let alreadySaved = false
    try {
      await client.query("BEGIN")
      console.log("[SALES API] Transaction started")

      console.log("[SALES API] Skipping stock validation (products table has no stock column)")
      console.log("[SALES API] Attempting to insert sale into database")
      console.log("[SALES API] INSERT values:", {
        orderNumber,
        itemCount: Array.isArray(items) ? items.length : 0,
        subtotal,
        serviceCharge,
        grandTotal,
        paymentMethod,
        amountTendered,
        changeAmount,
        serverName,
        sessionUsername,
        discountPercent,
        shiftId,
      })
      const result = await client.query(
        `INSERT INTO public.sales
          (order_number, items, subtotal, service_charge, grand_total, payment_method, amount_tendered, change_amount, server_name, created_by, status, discount_percent, shift_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11, $12)
         RETURNING id, order_number, grand_total, status, created_at`,
        [
          orderNumber,
          JSON.stringify(items),
          subtotal,
          serviceCharge ?? 0,
          grandTotal,
          paymentMethod,
          amountTendered,
          changeAmount,
          serverName,
          sessionUsername,
          discountPercent ?? 0,
          shiftId || null,
        ]
      )
      sale = result.rows[0]
      console.log("[SALES API] Sale inserted successfully:", { id: sale.id, orderNumber: sale.order_number })

      // Update shift metrics if shift_id is provided
      if (shiftId && paymentMethod === 'cash') {
        console.log("[SALES API] Updating shift metrics for cash sale:", { shiftId, grandTotal })
        await client.query(
          `UPDATE public.shifts
           SET total_cash_sales = COALESCE(total_cash_sales, 0) + $1,
               total_sales = COALESCE(total_sales, 0) + $1
           WHERE id = $2`,
          [grandTotal, shiftId]
        )
      } else if (shiftId) {
        console.log("[SALES API] Updating shift metrics for non-cash sale:", { shiftId, grandTotal })
        await client.query(
          `UPDATE public.shifts
           SET total_sales = COALESCE(total_sales, 0) + $1
           WHERE id = $2`,
          [grandTotal, shiftId]
        )
      }

      await client.query("COMMIT")
      console.log("[SALES API] Transaction committed successfully")
    } catch (txErr) {
      await client.query("ROLLBACK")
      // Re-throw non-23505 errors so the outer catch can return a 500.
      // For unique_violation (23505) we fall through to the alreadySaved
      // return below — after finally releases the client.
      if ((txErr as any)?.code !== "23505") throw txErr
      alreadySaved = true
    } finally {
      client.release()
    }

    // PostgreSQL unique_violation (23505) on order_number — the sale was
    // already saved (e.g. the POST succeeded but the response was lost on a
    // flaky mobile network). Return alreadySaved so the client discards its
    // offline-pending copy instead of retrying indefinitely.
    if (alreadySaved) {
      return NextResponse.json({ alreadySaved: true }, { status: 200 })
    }
    const itemSummary = Array.isArray(items)
      ? items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.name}`).join(", ") +
        (items.length > 3 ? ` +${items.length - 3} more` : "")
      : ""

    logEvent(
      "order_placed",
      { id: session.user.id!, username: sessionUsername },
      `Order ${orderNumber} placed — ₱${Number(grandTotal).toFixed(2)} via ${paymentMethod}. Items: ${itemSummary}`
    )

    return NextResponse.json({ success: true, sale })
  } catch (error) {
    console.error("[SALES API] Failed to record sale:", error)
    console.error("[SALES API] Error details:", {
      message: (error as any)?.message,
      code: (error as any)?.code,
      detail: (error as any)?.detail,
      stack: (error as any)?.stack,
    })
    return NextResponse.json({ error: "Failed to record sale" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  console.log("[SALES/GET] Admin session check:", { hasSession: !!session, hasUser: !!session?.user, userId: session?.user?.id, userRole: (session.user as any)?.role })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
    console.log("[SALES/GET] Admin fetching sales for date:", date)

    const [dailyStats, paymentBreakdown, recentOrders] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_orders,
           COUNT(*) FILTER (WHERE COALESCE(status, 'completed') = 'completed')::int AS completed_orders,
           COALESCE(SUM(grand_total) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_sales,
           COALESCE(SUM(subtotal) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_subtotal,
           COALESCE(SUM(service_charge) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_service_charge
         FROM public.sales
         WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = $1`,
        [date]
      ),
      pool.query(
        `SELECT
           payment_method,
           COUNT(*)::int AS count,
           COALESCE(SUM(grand_total), 0)::float AS total
         FROM public.sales
         WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = $1
           AND COALESCE(status, 'completed') = 'completed'
         GROUP BY payment_method
         ORDER BY total DESC`,
        [date]
      ),
      pool.query(
        `SELECT
           id, order_number, items,
           subtotal::float, service_charge::float, grand_total::float,
           COALESCE(discount_percent, 0)::int AS discount_percent,
           payment_method, server_name, created_by,
           COALESCE(status, 'completed') AS status,
           void_reason, created_at
         FROM public.sales
         WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [date]
      ),
    ])
    console.log("[SALES/GET] Admin query results:", { 
      totalOrders: dailyStats.rows[0]?.total_orders,
      completedOrders: dailyStats.rows[0]?.completed_orders,
      recentOrdersCount: recentOrders.rows.length,
      recentOrders: recentOrders.rows.map(o => ({ id: o.id, order_number: o.order_number, created_by: o.created_by, server_name: o.server_name }))
    })

    return NextResponse.json({
      date,
      stats: dailyStats.rows[0],
      paymentBreakdown: paymentBreakdown.rows,
      recentOrders: recentOrders.rows,
    })
  } catch (error) {
    console.error("Failed to fetch sales:", error)
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 })
  }
}
