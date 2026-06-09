import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import pool, {
  hasColumn,
  makeDeletedColumns,
  makeDeletedFilter,
} from "@/lib/db";
import { logEvent } from "@/lib/audit";

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

const shiftSalesCache = new Map<
  string,
  {
    data: { dailyStats: any; paymentBreakdown: any; recentOrders: any };
    expiresAt: number;
  }
>();
const ACTIVE_SHIFT_CACHE_MS = 25 * 1000;

async function fetchShiftWindow(shiftId: number) {
  const shiftRes = await pool.query(
    `SELECT start_time, end_time, cashier_name, cashier_username
     FROM public.shifts
     WHERE id = $1::int`,
    [shiftId],
  );
  return shiftRes.rows[0] ?? null;
}

function getShiftSalesCacheKey(shiftId: number, deleted: boolean) {
  return `${shiftId}:${deleted ? "deleted" : "live"}`;
}

async function queryShiftSalesForWindow(
  shiftWindow: { start: string; end: string | null },
  deleted: boolean,
  cashierLookup = "",
) {
  const hasIsDeleted = await hasColumn("sales", "is_deleted");
  const hasDeletedAt = await hasColumn("sales", "deleted_at");
  const hasDeletedBy = await hasColumn("sales", "deleted_by");
  const deletedFilter = makeDeletedFilter(hasIsDeleted, deleted);
  const deletedFilterS = makeDeletedFilter(hasIsDeleted, deleted, "s");
  const deletedColumns = makeDeletedColumns(hasDeletedAt, hasDeletedBy, "s");
  const deletedSelect = deletedColumns ? `, ${deletedColumns}` : "";
  const start = shiftWindow.start;
  const endParam = shiftWindow.end ?? null;
  const safeCashierLookup =
    typeof cashierLookup === "string" ? cashierLookup.trim() : "";
  const cashierFilter = safeCashierLookup
    ? `AND (
         COALESCE(created_by, '') = $3::text
         OR COALESCE(server_name, '') = $3::text
       )`
    : "";
  const [dailyStats, paymentBreakdown, recentOrders] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE COALESCE(status, 'completed') = 'completed')::int AS completed_orders,
         COALESCE(SUM(grand_total) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_sales,
         COALESCE(SUM(subtotal) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_subtotal,
         COALESCE(SUM(service_charge) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_service_charge
       FROM public.sales
       WHERE created_at >= $1::timestamptz
         AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz)
         ${cashierFilter}
         ${deletedFilter}`,
      [start, endParam, safeCashierLookup],
    ),
    pool.query(
      `SELECT
         payment_method,
         COUNT(*)::int AS count,
         COALESCE(SUM(grand_total), 0)::float AS total
       FROM public.sales
       WHERE created_at >= $1::timestamptz
         AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz)
         AND COALESCE(status, 'completed') = 'completed'
         ${cashierFilter}
         ${deletedFilter}
       GROUP BY payment_method
       ORDER BY total DESC`,
      [start, endParam, safeCashierLookup],
    ),
    pool.query(
      `SELECT
         s.id, s.order_number, s.items,
         s.subtotal::float, s.service_charge::float, s.grand_total::float,
         COALESCE(s.discount_percent, 0)::int AS discount_percent,
         s.payment_method, s.server_name, s.created_by,
         COALESCE(s.status, 'completed') AS status,
         s.void_reason, s.created_at,
         sh.start_time AS shift_start_time${deletedSelect}
       FROM public.sales s
       LEFT JOIN public.shifts sh ON s.shift_id = sh.id
       WHERE s.created_at >= $1::timestamptz
         AND ($2::timestamptz IS NULL OR s.created_at <= $2::timestamptz)
         ${
           safeCashierLookup
             ? `AND (
         COALESCE(s.created_by, '') = $3::text
         OR COALESCE(s.server_name, '') = $3::text
       )`
             : ""
         }
         ${deletedFilterS}
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [start, endParam, safeCashierLookup],
    ),
  ]);

  return {
    dailyStats: dailyStats.rows[0],
    paymentBreakdown: paymentBreakdown.rows,
    recentOrders: recentOrders.rows.map(addOvernightFields),
  };
}

async function queryShiftSalesByShiftId(shiftId: number, deleted: boolean) {
  const hasIsDeleted = await hasColumn("sales", "is_deleted");
  const hasDeletedAt = await hasColumn("sales", "deleted_at");
  const hasDeletedBy = await hasColumn("sales", "deleted_by");
  const deletedFilter = makeDeletedFilter(hasIsDeleted, deleted);
  const deletedFilterS = makeDeletedFilter(hasIsDeleted, deleted, "s");
  const deletedColumns = makeDeletedColumns(hasDeletedAt, hasDeletedBy, "s");
  const deletedSelect = deletedColumns ? `, ${deletedColumns}` : "";
  const [dailyStats, paymentBreakdown, recentOrders] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE COALESCE(status, 'completed') = 'completed')::int AS completed_orders,
         COALESCE(SUM(grand_total) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_sales,
         COALESCE(SUM(subtotal) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_subtotal,
         COALESCE(SUM(service_charge) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_service_charge
       FROM public.sales
       WHERE shift_id = $1::int
         ${deletedFilter}`,
      [shiftId],
    ),
    pool.query(
      `SELECT
         payment_method,
         COUNT(*)::int AS count,
         COALESCE(SUM(grand_total), 0)::float AS total
       FROM public.sales
       WHERE shift_id = $1::int
         AND COALESCE(status, 'completed') = 'completed'
         ${deletedFilter}
       GROUP BY payment_method
       ORDER BY total DESC`,
      [shiftId],
    ),
    pool.query(
      `SELECT
         s.id, s.order_number, s.items,
         s.subtotal::float, s.service_charge::float, s.grand_total::float,
         COALESCE(s.discount_percent, 0)::int AS discount_percent,
         s.payment_method, s.server_name, s.created_by,
         COALESCE(s.status, 'completed') AS status,
         s.void_reason, s.created_at,
         sh.start_time AS shift_start_time${deletedSelect}
       FROM public.sales s
       LEFT JOIN public.shifts sh ON s.shift_id = sh.id
       WHERE s.shift_id = $1::int
         ${deletedFilterS}
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [shiftId],
    ),
  ]);

  return {
    dailyStats: dailyStats.rows[0],
    paymentBreakdown: paymentBreakdown.rows,
    recentOrders: recentOrders.rows.map(addOvernightFields),
  };
}

async function getCachedShiftSales(
  shiftId: number,
  deleted: boolean,
  isPermanent: boolean,
  shiftWindow: { start: string; end: string | null },
  cashierLookup = "",
) {
  const cacheKey = getShiftSalesCacheKey(shiftId, deleted);
  const now = Date.now();
  const cached = shiftSalesCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    console.log("[SALES/GET] Returning cached shift sales for", cacheKey);
    return cached.data;
  }

  const hasShiftIdCol = await hasColumn("sales", "shift_id");
  let data = hasShiftIdCol
    ? await queryShiftSalesByShiftId(shiftId, deleted)
    : await queryShiftSalesForWindow(shiftWindow, deleted, cashierLookup);

  if ((data.dailyStats?.total_orders ?? 0) === 0) {
    data = await queryShiftSalesForWindow(shiftWindow, deleted, cashierLookup);
  }
  shiftSalesCache.set(cacheKey, {
    data,
    expiresAt: isPermanent
      ? Number.MAX_SAFE_INTEGER
      : now + ACTIVE_SHIFT_CACHE_MS,
  });
  return data;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  console.log("[SALES API] Session check:", {
    hasSession: !!session,
    hasUser: !!session?.user,
    userId: session?.user?.id,
    userRole: (session?.user as any)?.role,
  });

  if (!session?.user) {
    console.error("[SALES API] Unauthorized - no session or user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[SALES API] Attempting to parse request body");
    let body;
    try {
      body = await request.json();
      console.log("[SALES API] Request body parsed successfully");
    } catch (jsonErr) {
      console.error("[SALES API] Failed to parse request body:", jsonErr);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
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
    } = body;

    console.log("[SALES API] Received order:", {
      orderNumber,
      grandTotal,
      paymentMethod,
      shiftId,
      createdBy,
    });

    // Use username for created_by to match the filter in sales/my API
    const sessionUsername =
      (session.user as any).username ??
      createdBy ??
      session.user.name ??
      serverName;

    /* Transaction: insert the sale without stock validation.
       The products table does not have a stock column, so stock tracking
       is not implemented. Products use 'available' boolean instead. */
    const client = await pool.connect();
    console.log("[SALES API] Database connected successfully");
    let sale: any;
    let alreadySaved = false;
    try {
      await client.query("BEGIN");
      console.log("[SALES API] Transaction started");

      console.log(
        "[SALES API] Skipping stock validation (products table has no stock column)",
      );
      console.log("[SALES API] Attempting to insert sale into database");
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
      });
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
        ],
      );
      sale = result.rows[0];
      console.log("[SALES API] Sale inserted successfully:", {
        id: sale.id,
        orderNumber: sale.order_number,
      });

      // Update shift metrics if shift_id is provided
      if (shiftId && paymentMethod === "cash") {
        console.log("[SALES API] Updating shift metrics for cash sale:", {
          shiftId,
          grandTotal,
        });
        await client.query(
          `UPDATE public.shifts
           SET total_cash_sales = COALESCE(total_cash_sales, 0) + $1,
               total_sales = COALESCE(total_sales, 0) + $1
           WHERE id = $2`,
          [grandTotal, shiftId],
        );
      } else if (shiftId) {
        console.log("[SALES API] Updating shift metrics for non-cash sale:", {
          shiftId,
          grandTotal,
        });
        await client.query(
          `UPDATE public.shifts
           SET total_sales = COALESCE(total_sales, 0) + $1
           WHERE id = $2`,
          [grandTotal, shiftId],
        );
      }

      await client.query("COMMIT");
      console.log("[SALES API] Transaction committed successfully");
    } catch (txErr) {
      await client.query("ROLLBACK");
      // Re-throw non-23505 errors so the outer catch can return a 500.
      // For unique_violation (23505) we fall through to the alreadySaved
      // return below — after finally releases the client.
      if ((txErr as any)?.code !== "23505") throw txErr;
      alreadySaved = true;
    } finally {
      client.release();
    }

    // PostgreSQL unique_violation (23505) on order_number — the sale was
    // already saved (e.g. the POST succeeded but the response was lost on a
    // flaky mobile network). Return alreadySaved so the client discards its
    // offline-pending copy instead of retrying indefinitely.
    if (alreadySaved) {
      return NextResponse.json({ alreadySaved: true }, { status: 200 });
    }
    const itemSummary = Array.isArray(items)
      ? items
          .slice(0, 3)
          .map((i: any) => `${i.quantity}× ${i.name}`)
          .join(", ") + (items.length > 3 ? ` +${items.length - 3} more` : "")
      : "";

    logEvent(
      "order_placed",
      { id: session.user.id!, username: sessionUsername },
      `Order ${orderNumber} placed — ₱${Number(grandTotal).toFixed(2)} via ${paymentMethod}. Items: ${itemSummary}`,
    );

    return NextResponse.json({ success: true, sale });
  } catch (error) {
    console.error("[SALES API] Failed to record sale:", error);
    console.error("[SALES API] Error details:", {
      message: (error as any)?.message,
      code: (error as any)?.code,
      detail: (error as any)?.detail,
      stack: (error as any)?.stack,
    });
    return NextResponse.json(
      { error: "Failed to record sale" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  console.log("[SALES/GET] Admin session check:", {
    hasSession: !!session,
    hasUser: !!session?.user,
    userId: session?.user?.id,
    userRole: session?.user ? (session.user as any)?.role : null,
  });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get("date") ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const shiftIdParam = searchParams.get("shiftId");
    const shiftId = shiftIdParam ? Number.parseInt(shiftIdParam, 10) : null;
    if (shiftIdParam && !Number.isInteger(shiftId)) {
      return NextResponse.json({ error: "Invalid shiftId" }, { status: 400 });
    }
    const deleted = searchParams.get("deleted") === "true";
    const hasIsDeleted = await hasColumn("sales", "is_deleted");
    const hasDeletedAt = await hasColumn("sales", "deleted_at");
    const hasDeletedBy = await hasColumn("sales", "deleted_by");
    const deletedFilter = makeDeletedFilter(hasIsDeleted, deleted);
    const deletedFilterS = makeDeletedFilter(hasIsDeleted, deleted, "s");
    const deletedColumns = makeDeletedColumns(hasDeletedAt, hasDeletedBy, "s");
    const deletedSelect = deletedColumns ? `, ${deletedColumns}` : "";
    console.log("[SALES/GET] Admin fetching sales for date:", date, {
      deleted,
      shiftId,
    });

    let dailyStats: { rows: any[] } | undefined;
    let paymentBreakdown: { rows: any[] } | undefined;
    let recentOrders: { rows: any[] } | undefined;
    if (shiftId) {
      const shiftRow = await fetchShiftWindow(shiftId);
      if (shiftRow) {
        const shiftWindow = {
          start: shiftRow.start_time,
          end: shiftRow.end_time ?? null,
        };
        const cashierLookup =
          shiftRow.cashier_username ?? shiftRow.cashier_name ?? "";
        const isPermanent = !!shiftRow.end_time;
        const cached = await getCachedShiftSales(
          shiftId,
          deleted,
          isPermanent,
          shiftWindow,
          cashierLookup,
        );
        dailyStats = { rows: [cached.dailyStats] };
        paymentBreakdown = { rows: cached.paymentBreakdown };
        recentOrders = { rows: cached.recentOrders };
      }
    }

    if (!dailyStats) {
      [dailyStats, paymentBreakdown, recentOrders] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*)::int AS total_orders,
             COUNT(*) FILTER (WHERE COALESCE(status, 'completed') = 'completed')::int AS completed_orders,
             COALESCE(SUM(grand_total) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_sales,
             COALESCE(SUM(subtotal) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_subtotal,
             COALESCE(SUM(service_charge) FILTER (WHERE COALESCE(status, 'completed') = 'completed'), 0)::float AS total_service_charge
           FROM public.sales
           WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = $1::date
             ${deletedFilter}`,
          [date],
        ),
        pool.query(
          `SELECT
             payment_method,
             COUNT(*)::int AS count,
             COALESCE(SUM(grand_total), 0)::float AS total
           FROM public.sales
           WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = $1::date
             AND COALESCE(status, 'completed') = 'completed'
             ${deletedFilter}
           GROUP BY payment_method
           ORDER BY total DESC`,
          [date],
        ),
        pool.query(
          `SELECT
             s.id, s.order_number, s.items,
             s.subtotal::float, s.service_charge::float, s.grand_total::float,
             COALESCE(s.discount_percent, 0)::int AS discount_percent,
             s.payment_method, s.server_name, s.created_by,
             COALESCE(s.status, 'completed') AS status,
             s.void_reason, s.created_at,
             sh.start_time AS shift_start_time${deletedSelect}
           FROM public.sales s
           LEFT JOIN public.shifts sh ON s.shift_id = sh.id
           WHERE DATE(s.created_at AT TIME ZONE 'Asia/Manila') = $1::date
             ${deletedFilterS}
           ORDER BY s.created_at DESC
           LIMIT 50`,
          [date],
        ),
      ]);
      // Map recentOrders to add overnight fields
      if (recentOrders) {
        recentOrders = { rows: recentOrders.rows.map(addOvernightFields) };
      }
    }
    const safeDailyStats = dailyStats ?? {
      rows: [
        {
          total_orders: 0,
          completed_orders: 0,
          total_sales: 0,
          total_subtotal: 0,
          total_service_charge: 0,
        },
      ],
    };
    const safePaymentBreakdown = paymentBreakdown ?? { rows: [] };
    const safeRecentOrders = recentOrders ?? { rows: [] };

    console.log("[SALES/GET] Admin query results:", {
      totalOrders: safeDailyStats.rows[0]?.total_orders,
      completedOrders: safeDailyStats.rows[0]?.completed_orders,
      recentOrdersCount: safeRecentOrders.rows.length,
      recentOrders: safeRecentOrders.rows.map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        created_by: o.created_by,
        server_name: o.server_name,
      })),
    });

    return NextResponse.json({
      date,
      stats: safeDailyStats.rows[0],
      paymentBreakdown: safePaymentBreakdown.rows,
      recentOrders: safeRecentOrders.rows,
    });
  } catch (error) {
    console.error("Failed to fetch sales:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales" },
      { status: 500 },
    );
  }
}
