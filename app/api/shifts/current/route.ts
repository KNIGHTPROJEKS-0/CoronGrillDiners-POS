import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // ── Step 1: Auto-close any stale open shifts from PREVIOUS PH calendar days ──
    // This handles the case where a cashier's browser crashed or the close
    // request failed, leaving a shift stuck in "open" from a previous day.
    const staleResult = await pool.query(
      `SELECT id, cashier_name, cashier_username, start_time, start_balance::float
       FROM public.shifts
       WHERE cashier_id = $1::integer
         AND status = 'open'
         AND DATE(start_time AT TIME ZONE 'Asia/Manila') < DATE(NOW() AT TIME ZONE 'Asia/Manila')`,
      [session.user.id]
    )

    for (const stale of staleResult.rows) {
      // Calculate actual sales that occurred during the stale shift
      const salesRes = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0)::float AS cash_sales,
           COALESCE(SUM(grand_total), 0)::float AS total_sales
         FROM public.sales
         WHERE (created_by = $1 OR created_by = $2)
           AND created_at >= $3
           AND COALESCE(status, 'completed') = 'completed'
           AND COALESCE(is_deleted, false) = false`,
        [stale.cashier_name, stale.cashier_username, stale.start_time]
      )
      const { cash_sales, total_sales } = salesRes.rows[0]
      const expectedCash = stale.start_balance + cash_sales

      await pool.query(
        `UPDATE public.shifts SET
           end_time     = NOW(),
           total_cash_sales = $1,
           total_sales  = $2,
           expected_cash = $3,
           notes = TRIM(BOTH FROM COALESCE(notes || E'\n', '') || 'Auto-closed: shift was not closed before end of day.'),
           status = 'closed'
         WHERE id = $4`,
        [cash_sales, total_sales, expectedCash, stale.id]
      )
      // Log auto-closure so admins can see shifts closed by the system
      try {
        const username = (session.user as any).username ?? session.user.name
        logEvent(
          "shift_closed",
          { id: session.user.id!, username },
          `Auto-closed shift for ${stale.cashier_username} (start: ${stale.start_time}). Calculated expected cash: ₱${expectedCash.toFixed(2)}`
        )
      } catch (e) {
        // best-effort logging only
      }
    }

    // ── Step 2: Return today's open shift with LIVE sales totals ──
    // Uses LATERAL join so cashiers always see their real running sales total
    // in the Close Shift modal instead of 0.
    const result = await pool.query(
      `SELECT
         s.id, s.cashier_id, s.cashier_name, s.cashier_username,
         s.start_time, s.end_time, s.status,
         s.start_balance::float, s.end_balance::float,
         s.expected_cash::float, s.discrepancy::float,
         COALESCE(sal.cash_sales, 0)::float  AS total_cash_sales,
         COALESCE(sal.total_sales, 0)::float AS total_sales
       FROM public.shifts s
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0) AS cash_sales,
           COALESCE(SUM(grand_total), 0) AS total_sales
         FROM public.sales
         WHERE (created_by = s.cashier_name OR created_by = s.cashier_username)
           AND created_at >= s.start_time
           AND COALESCE(status, 'completed') = 'completed'
           AND COALESCE(is_deleted, false) = false
       ) sal ON true
       WHERE s.cashier_id = $1::integer
         AND s.status = 'open'
         AND DATE(s.start_time AT TIME ZONE 'Asia/Manila') = DATE(NOW() AT TIME ZONE 'Asia/Manila')
       ORDER BY s.start_time DESC
       LIMIT 1`,
      [session.user.id]
    )

    return NextResponse.json({
      shift: result.rows[0] ?? null,
      staleShiftsClosed: staleResult.rows.length,
    })
  } catch (error) {
    console.error("Failed to fetch current shift:", error)
    return NextResponse.json({ error: "Failed to fetch current shift" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const endBalance = parseFloat(body.endBalance) || 0

    // Only close TODAY's open shift (same PH calendar day)
    const shiftResult = await pool.query(
      `SELECT
         id, cashier_id, cashier_name, cashier_username,
         start_time, end_time, status,
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

    if (shiftResult.rows.length === 0) {
      return NextResponse.json({ error: "No open shift found" }, { status: 404 })
    }

    const shift = shiftResult.rows[0]

    const salesResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN grand_total ELSE 0 END), 0)::float AS cash_sales,
         COALESCE(SUM(grand_total), 0)::float AS total_sales
       FROM public.sales
       WHERE (created_by = $1 OR created_by = $2)
         AND created_at >= $3
         AND COALESCE(status, 'completed') = 'completed'`,
      [shift.cashier_name, shift.cashier_username, shift.start_time]
    )

    const cashSales: number = salesResult.rows[0].cash_sales
    const totalSales: number = salesResult.rows[0].total_sales
    const startBalance: number = shift.start_balance
    const expectedCash: number = startBalance + cashSales
    const discrepancy: number = endBalance - expectedCash

    const updated = await pool.query(
      `UPDATE public.shifts SET
         end_time = NOW(),
         end_balance = $1,
         total_cash_sales = $2,
         total_sales = $3,
         expected_cash = $4,
         discrepancy = $5,
         status = 'closed'
       WHERE id = $6
       RETURNING
         id, cashier_id, cashier_name, cashier_username,
         start_time, end_time, status,
         start_balance::float, end_balance::float,
         total_cash_sales::float, total_sales::float,
         expected_cash::float, discrepancy::float`,
      [endBalance, cashSales, totalSales, expectedCash, discrepancy, shift.id]
    )

    const username = (session.user as any).username ?? session.user.name
    const discStr = discrepancy >= 0
      ? `+₱${discrepancy.toFixed(2)} over`
      : `-₱${Math.abs(discrepancy).toFixed(2)} short`
    logEvent(
      "shift_closed",
      { id: session.user.id!, username },
      `Shift closed. Total sales: ₱${totalSales.toFixed(2)}, Actual cash: ₱${endBalance.toFixed(2)}, Discrepancy: ${discStr}`
    )

    return NextResponse.json({ shift: updated.rows[0] })
  } catch (error: any) {
    console.error("Failed to close shift:", error?.message ?? error)
    return NextResponse.json(
      { error: "Failed to close shift", detail: error?.message ?? "unknown" },
      { status: 500 }
    )
  }
}
