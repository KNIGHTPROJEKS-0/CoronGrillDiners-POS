import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { startBalance } = await request.json()

    // Only treat a same-PH-calendar-day open shift as a duplicate.
    // Stale open shifts from previous days are handled by GET /api/shifts/current
    // (auto-closed on login) and must NOT block the cashier from starting fresh.
    const existing = await pool.query(
      `SELECT
         id, cashier_id, cashier_name, cashier_username,
         start_time, end_time, status, archived, notes,
         start_balance::float, end_balance::float,
         total_cash_sales::float, total_sales::float,
         expected_cash::float, discrepancy::float
       FROM public.shifts
       WHERE cashier_id = $1::integer
         AND status = 'open'
         AND DATE(start_time AT TIME ZONE 'Asia/Manila') = DATE(NOW() AT TIME ZONE 'Asia/Manila')
       ORDER BY start_time DESC
       LIMIT 1`,
      [session.user.id]
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ shift: existing.rows[0] })
    }

    const username = (session.user as any).username ?? session.user.name
    const result = await pool.query(
      `INSERT INTO public.shifts (cashier_id, cashier_name, cashier_username, start_balance, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING
         id, cashier_id, cashier_name, cashier_username,
         start_time, end_time, status, archived, notes,
         start_balance::float, end_balance::float,
         total_cash_sales::float, total_sales::float,
         expected_cash::float, discrepancy::float`,
      [session.user.id, session.user.name, username, startBalance]
    )

    const shift = result.rows[0]
    logEvent(
      "shift_started",
      { id: session.user.id!, username },
      `Shift started with ₱${Number(startBalance).toFixed(2)} starting cash`
    )

    return NextResponse.json({ shift })
  } catch (error) {
    console.error("Failed to start shift:", error)
    return NextResponse.json({ error: "Failed to start shift" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA")
  const includeArchived = searchParams.get("include_archived") === "true"
  const limit = parseInt(searchParams.get("limit") || "50")

  try {
    const result = await pool.query(
      `SELECT
         s.id, s.cashier_id, s.cashier_name, s.cashier_username,
         s.start_time, s.end_time, s.status,
         COALESCE(s.archived, false) AS archived,
         s.notes,
         s.start_balance::float, s.end_balance::float,
         s.total_cash_sales::float, s.total_sales::float,
         s.expected_cash::float, s.discrepancy::float
       FROM public.shifts s
       WHERE (
         DATE(s.start_time AT TIME ZONE 'Asia/Manila') = $1
         OR s.status = 'open'
       )
         AND ($2 = true OR COALESCE(s.archived, false) = false)
       ORDER BY s.start_time DESC
       LIMIT $3`,
      [date, includeArchived, limit]
    )

    return NextResponse.json({ shifts: result.rows, date })
  } catch (error) {
    console.error("Failed to fetch shifts:", error)
    return NextResponse.json({ error: "Failed to fetch shifts" }, { status: 500 })
  }
}
