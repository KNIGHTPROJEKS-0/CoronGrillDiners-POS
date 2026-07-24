import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool, { hasColumn, makeDeletedFilter } from "@/lib/db";
import { unstable_cache } from "next/cache";

// Helper to compute overnight flags and labels
function addOvernightFields(sale: any) {
  let isOvernightShiftOrder = false;
  let overnightShiftLabel = null;
  if (sale.shift_start_time) {
    const shiftDate = new Date(sale.shift_start_time);
    const saleDate = new Date(sale.created_at);
    // Convert both to Asia/Manila dates for comparison
    const shiftCalendarDate = shiftDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
    const saleCalendarDate = saleDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
    isOvernightShiftOrder = shiftCalendarDate < saleCalendarDate;
    if (isOvernightShiftOrder) {
      // Format shift date as "June 8"
      overnightShiftLabel = shiftDate.toLocaleDateString("en-US", {
        timeZone: "Asia/Manila",
        month: "long",
        day: "numeric",
      });
    }
  }
  const { shift_start_time, ...rest } = sale;
  return { ...rest, isOvernightShiftOrder, overnightShiftLabel };
}

const getMySalesCached = unstable_cache(
  async (userId: number, username: string, date: string) => {
    const hasIsDeleted = await hasColumn("sales", "is_deleted");
    const hasShiftIdCol = await hasColumn("sales", "shift_id");
    const deletedFilter = makeDeletedFilter(hasIsDeleted, false);
    const deletedFilterS = makeDeletedFilter(hasIsDeleted, false, "s");

    const shiftResult = await pool.query(
      `SELECT id, start_time, end_time, status
       FROM public.shifts
       WHERE cashier_id = $1::integer
         AND DATE(start_time AT TIME ZONE 'Asia/Manila') = $2::date
       ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, start_time DESC
       LIMIT 1`,
      [userId, date],
    );

    const shift = shiftResult.rows[0] ?? null;

    let statsResult;
    let ordersResult;
    let shiftId: number | null = shift?.id ?? null;

    if (shift && hasShiftIdCol) {
      statsResult = await pool.query(
        `SELECT
           COALESCE(status, 'completed') AS status,
           COUNT(*)::int AS count,
           COALESCE(SUM(grand_total), 0)::float AS total
         FROM public.sales
         WHERE shift_id = $1::int
           ${deletedFilter}
         GROUP BY COALESCE(status, 'completed')
         ORDER BY COALESCE(status, 'completed')`,
        [shift.id],
      );

      ordersResult = await pool.query(
        `SELECT
           s.id, s.order_number, s.items,
           s.subtotal::float, s.service_charge::float, s.grand_total::float,
           COALESCE(s.discount_percent, 0)::int AS discount_percent,
           COALESCE(s.amount_tendered, s.grand_total)::float AS amount_tendered,
           COALESCE(s.change_amount, 0)::float AS change_amount,
           s.payment_method, s.server_name, s.created_by,
           COALESCE(s.status, 'completed') AS status,
           s.void_reason, s.created_at,
           $2::timestamptz AS shift_start_time
         FROM public.sales s
         WHERE s.shift_id = $1::int
           ${deletedFilterS}
         ORDER BY s.created_at DESC`,
        [shift.id, shift.start_time],
      );
    } else if (shift) {
      const shiftStart = shift.start_time;
      const shiftEnd = shift.end_time ?? null;
      statsResult = await pool.query(
        `SELECT
           COALESCE(status, 'completed') AS status,
           COUNT(*)::int AS count,
           COALESCE(SUM(grand_total), 0)::float AS total
         FROM public.sales
         WHERE (COALESCE(created_by, '') = $1::text OR COALESCE(server_name, '') = $1::text)
           AND created_at >= $2::timestamptz
           AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
           ${deletedFilter}
         GROUP BY COALESCE(status, 'completed')
         ORDER BY COALESCE(status, 'completed')`,
        [username, shiftStart, shiftEnd],
      );

      ordersResult = await pool.query(
        `SELECT
           s.id, s.order_number, s.items,
           s.subtotal::float, s.service_charge::float, s.grand_total::float,
           COALESCE(s.discount_percent, 0)::int AS discount_percent,
           COALESCE(s.amount_tendered, s.grand_total)::float AS amount_tendered,
           COALESCE(s.change_amount, 0)::float AS change_amount,
           s.payment_method, s.server_name, s.created_by,
           COALESCE(s.status, 'completed') AS status,
           s.void_reason, s.created_at,
           $2::timestamptz AS shift_start_time
         FROM public.sales s
         WHERE (COALESCE(s.created_by, '') = $1::text OR COALESCE(server_name, '') = $1::text)
           AND s.created_at >= $2::timestamptz
           AND ($3::timestamptz IS NULL OR s.created_at <= $3::timestamptz)
           ${deletedFilterS}
         ORDER BY s.created_at DESC`,
        [username, shiftStart, shiftEnd],
      );
    } else {
      shiftId = null;
      statsResult = await pool.query(
        `SELECT
           COALESCE(status, 'completed') AS status,
           COUNT(*)::int AS count,
           COALESCE(SUM(grand_total), 0)::float AS total
         FROM public.sales
         WHERE (COALESCE(created_by, '') = $1::text OR COALESCE(server_name, '') = $1::text)
           AND DATE(created_at AT TIME ZONE 'Asia/Manila') = $2::date
           ${deletedFilter}
         GROUP BY COALESCE(status, 'completed')
         ORDER BY COALESCE(status, 'completed')`,
        [username, date],
      );

      ordersResult = await pool.query(
        `SELECT
           s.id, s.order_number, s.items,
           s.subtotal::float, s.service_charge::float, s.grand_total::float,
           COALESCE(s.discount_percent, 0)::int AS discount_percent,
           COALESCE(s.amount_tendered, s.grand_total)::float AS amount_tendered,
           COALESCE(s.change_amount, 0)::float AS change_amount,
           s.payment_method, s.server_name, s.created_by,
           COALESCE(s.status, 'completed') AS status,
           s.void_reason, s.created_at,
           NULL::timestamptz AS shift_start_time
         FROM public.sales s
         WHERE (COALESCE(s.created_by, '') = $1::text OR COALESCE(server_name, '') = $1::text)
           AND DATE(s.created_at AT TIME ZONE 'Asia/Manila') = $2::date
           ${deletedFilterS}
         ORDER BY s.created_at DESC`,
        [username, date],
      );
    }

    return {
      date,
      cashier: username,
      stats: statsResult.rows,
      orders: ordersResult.rows.map(addOvernightFields),
      shiftId,
    };
  },
  ["api-sales-my"],
  { revalidate: 30, tags: ["sales", "orders"] }
);

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  console.log("[SALES/MY] Session check:", {
    hasSession: !!session,
    hasUser: !!session?.user,
    userId: session?.user?.id,
    username: session?.user ? (session.user as any)?.username : null,
    name: session?.user?.name,
  });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date =
    searchParams.get("date") ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const username = (
    (session.user as any).username ??
    session.user.name ??
    ""
  ).trim();
  console.log("[SALES/MY] Fetching sales for:", { username, date });

  try {
    const data = await getMySalesCached(Number(session.user.id), username, date);

    console.log("[SALES/MY] Query results:", {
      statsCount: data.stats.length,
      ordersCount: data.orders.length,
      shiftId: data.shiftId,
      orders: data.orders.map((o) => ({
        id: o.id,
        order_number: o.order_number,
        created_by: o.created_by,
        server_name: o.server_name,
        status: o.status,
      })),
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error("Failed to fetch my sales:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 },
    );
  }
}
