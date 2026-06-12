import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool, { hasColumn, makeDeletedFilter } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const today = new Date().toLocaleDateString("en-CA");
  const from = searchParams.get("from") || today;
  const to = searchParams.get("to") || from;

  try {
    const hasIsDeleted = await hasColumn("sales", "is_deleted");
    const hasShiftIdCol = await hasColumn("sales", "shift_id");
    const deletedFilter = makeDeletedFilter(hasIsDeleted, false, "sa");
    const joinCondition = hasShiftIdCol
      ? `(
           sa.shift_id = s.id
           OR (
             sa.shift_id IS NULL
             AND (
               sa.created_by = s.cashier_username
               OR sa.created_by = s.cashier_name
               OR sa.server_name = s.cashier_username
               OR sa.server_name = s.cashier_name
             )
             AND sa.created_at >= s.start_time
             AND sa.created_at <= COALESCE(s.end_time, NOW())
           )
         )`
      : `(
           (
             sa.created_by = s.cashier_username
             OR sa.created_by = s.cashier_name
             OR sa.server_name = s.cashier_username
             OR sa.server_name = s.cashier_name
           )
           AND sa.created_at >= s.start_time
           AND sa.created_at <= COALESCE(s.end_time, NOW())
         )`;

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
         ON ${joinCondition}
         ${deletedFilter}
       WHERE DATE(s.start_time AT TIME ZONE 'Asia/Manila') BETWEEN $1::date AND $2::date
       GROUP BY s.id
       ORDER BY s.start_time DESC`,
      [from, to],
    );

    return NextResponse.json({ shifts: result.rows, from, to }, {
      status: 200,
      headers: {
        'Cache-Control': 's-maxage=15, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error("Failed to fetch sales shifts:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales shifts" },
      { status: 500 },
    );
  }
}
