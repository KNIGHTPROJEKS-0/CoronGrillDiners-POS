import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import pool, { hasColumn, makeDeletedFilter } from "@/lib/db";

// Helper to compute overnight flags and labels
function addOvernightFields(sale: any) {
  let isOvernightShiftOrder = false;
  let overnightShiftLabel = null;
  if (sale.shift_start_time) {
    const shiftDate = new Date(sale.shift_start_time);
    const saleDate = new Date(sale.created_at);
    const shiftCalendarDate = shiftDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
    const saleCalendarDate = saleDate.toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
    isOvernightShiftOrder = shiftCalendarDate < saleCalendarDate;
    if (isOvernightShiftOrder) {
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

const SELECT_COLUMNS = `
  id, order_number, items,
  subtotal::float, service_charge::float, grand_total::float,
  COALESCE(discount_percent, 0)::int AS discount_percent,
  payment_method, server_name, created_by,
  status, void_reason, created_at`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shiftId = Number.parseInt(id, 10);
  if (!Number.isInteger(shiftId)) {
    return NextResponse.json({ error: "Invalid shift id" }, { status: 400 });
  }

  try {
    const shiftResult = await pool.query(
      `SELECT id, cashier_name, cashier_username, start_time, end_time, status
       FROM public.shifts WHERE id = $1::int`,
      [shiftId],
    );

    if (shiftResult.rows.length === 0) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    const shift = shiftResult.rows[0];
    const endTime = shift.end_time ?? new Date().toISOString();
    const cashierLookup = String(
      shift.cashier_username ?? shift.cashier_name ?? "",
    );
    const hasIsDeleted = await hasColumn("sales", "is_deleted");
    const deletedFilter = makeDeletedFilter(hasIsDeleted, false);
    const hasShiftIdCol = await hasColumn("sales", "shift_id");
    const queryParams = [shiftId, cashierLookup, shift.start_time, endTime];

    // Stable parameter mapping for all queries:
    // $1 = shift_id::int, $2 = cashier lookup::text,
    // $3 = start_time::timestamptz, $4 = end_time::timestamptz
    let salesResult: { rows: any[] } = { rows: [] };
    let matchMethod = "none";

    if (hasShiftIdCol) {
      const q = `SELECT ${SELECT_COLUMNS}, $3::timestamptz AS shift_start_time
        FROM public.sales
        WHERE shift_id = $1::int ${deletedFilter}
        ORDER BY created_at ASC`;
      salesResult = await pool.query(q, queryParams);
      if (salesResult.rows.length > 0) matchMethod = "shift_id";
    }

    if (salesResult.rows.length === 0) {
      const nameQ = `SELECT ${SELECT_COLUMNS}, $3::timestamptz AS shift_start_time
        FROM public.sales
        WHERE (created_by = $2::text OR server_name = $2::text OR shift_id = $1::int)
          AND created_at >= $3::timestamptz
          AND created_at <= $4::timestamptz
          ${deletedFilter}
        ORDER BY created_at ASC`;
      salesResult = await pool.query(nameQ, queryParams);
      if (salesResult.rows.length > 0) matchMethod = "name+time";
    }

    // ── Diagnostic logging (temporary) ──────────────────────────────────────
    console.log(
      "[shift-sales] shift_id:",
      shift.id,
      "cashier_name:",
      JSON.stringify(shift.cashier_name),
      "cashier_username:",
      JSON.stringify(shift.cashier_username),
      "start_time:",
      shift.start_time,
      "end_time:",
      endTime,
      "hasShiftIdCol:",
      hasShiftIdCol,
      "matchMethod:",
      matchMethod,
      "rows:",
      salesResult.rows.length,
    );

    return NextResponse.json({
      shift,
      sales: salesResult.rows.map(addOvernightFields),
      _debug: { matchMethod, hasShiftIdCol, rowCount: salesResult.rows.length },
    });
  } catch (error: any) {
    console.error(
      "[shift-sales] SQL error for shift",
      id,
      ":",
      error?.message,
      error?.detail,
    );
    return NextResponse.json(
      { error: "Failed to fetch shift sales", detail: error?.message },
      { status: 500 },
    );
  }
}
