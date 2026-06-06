import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const today = new Date().toLocaleDateString("en-CA")
  const from = searchParams.get("from") || today
  const to = searchParams.get("to") || from

  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.cashier_id,
         s.cashier_name,
         s.cashier_username,
         s.start_time,
         s.end_time,
         s.status,
         COALESCE(s.archived, false) AS archived,
         s.notes,
         s.start_balance::float,
         s.end_balance::float,
         s.total_cash_sales::float,
         s.total_sales::float,
         s.expected_cash::float,
         s.discrepancy::float,
         COUNT(sa.id) FILTER (WHERE COALESCE(sa.status, 'completed') = 'completed')::int  AS completed_count,
         COUNT(sa.id) FILTER (WHERE sa.status = 'void')::int                              AS void_count,
         COUNT(sa.id) FILTER (WHERE sa.status = 'cancelled')::int                         AS cancelled_count,
         COUNT(sa.id)::int                                                                 AS total_order_count,
         COALESCE(
           SUM(sa.grand_total::float) FILTER (WHERE COALESCE(sa.status, 'completed') = 'completed'),
           0
         ) AS completed_total,
         COALESCE(
           SUM(sa.grand_total::float) FILTER (WHERE sa.status = 'void'),
           0
         ) AS void_total
       FROM public.shifts s
       LEFT JOIN public.sales sa
         ON (
               sa.created_by = s.cashier_username
            OR sa.created_by = s.cashier_name
            OR sa.server_name = s.cashier_username
            OR sa.server_name = s.cashier_name
         )
         AND sa.created_at >= s.start_time
         AND sa.created_at <= COALESCE(s.end_time, NOW())
       WHERE DATE(s.start_time AT TIME ZONE 'Asia/Manila') BETWEEN $1 AND $2
       GROUP BY s.id
       ORDER BY s.start_time DESC`,
      [from, to]
    )

    return NextResponse.json({ shifts: result.rows, from, to })
  } catch (error) {
    console.error("Failed to fetch sales shifts:", error)
    return NextResponse.json({ error: "Failed to fetch sales shifts" }, { status: 500 })
  }
}
