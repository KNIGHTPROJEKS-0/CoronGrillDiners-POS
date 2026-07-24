import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"
import { revalidateTag } from "next/cache"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { archived, notes, end_balance } = body

    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (typeof archived === "boolean") {
      sets.push(`archived = $${idx++}`)
      values.push(archived)
    }
    if (typeof notes === "string") {
      sets.push(`notes = $${idx++}`)
      values.push(notes)
    }
    if (typeof end_balance === "number") {
      const balanceIdx = idx++
      sets.push(`end_balance = $${balanceIdx}`)
      values.push(end_balance)
      sets.push(`discrepancy = $${balanceIdx} - COALESCE(expected_cash, 0)`)
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    values.push(id)

    const result = await pool.query(
      `UPDATE public.shifts
       SET ${sets.join(", ")}
       WHERE id = $${idx}
       RETURNING
         id, cashier_name, cashier_username, start_time, end_time, status,
         archived, notes,
         start_balance::float, end_balance::float,
         total_cash_sales::float, total_sales::float,
         expected_cash::float, discrepancy::float`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }

    // Log admin update to this shift (best-effort)
    try {
      const username = (session.user as any).username ?? session.user.name
      const actor = { id: session.user.id!, username }
      const updatedFields = Object.keys(body).join(", ") || "(unknown)"
      logEvent(
        "shift_updated",
        actor,
        `Updated shift ${id}: ${updatedFields}`
      )
    } catch (e) {
      // ignore logging failures
    }

    return NextResponse.json({ shift: result.rows[0] })
  } catch (error) {
    console.error("Failed to update shift:", error)
    return NextResponse.json({ error: "Failed to update shift" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const shiftRes = await client.query(
      `SELECT cashier_username, start_time, end_time
       FROM public.shifts WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (shiftRes.rows.length === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Shift not found" }, { status: 404 })
    }
    const { cashier_username, start_time, end_time } = shiftRes.rows[0]

    const salesRes = await client.query(
      `DELETE FROM public.sales
       WHERE created_by = $1
         AND created_at >= $2
         AND ($3::timestamptz IS NULL OR created_at <= $3)
       RETURNING id`,
      [cashier_username, start_time, end_time]
    )

    await client.query(`DELETE FROM public.shifts WHERE id = $1`, [id])
    await client.query("COMMIT")

    // Invalidate caches to ensure Sales Summary and Dashboard reflect the deletion
    revalidateTag("sales")
    revalidateTag("dashboard-sales")
    revalidateTag("shifts")

    // Log deletion of shift
    try {
      const username = (session.user as any).username ?? session.user.name
      logEvent(
        "shift_deleted",
        { id: session.user.id!, username },
        `Deleted shift for ${cashier_username} (${start_time} → ${end_time ?? 'ongoing'}) and removed ${salesRes.rowCount} sales`
      )
    } catch (e) {
      // ignore logging failures
    }

    return NextResponse.json({ success: true, deletedSales: salesRes.rowCount })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Failed to delete shift:", error)
    return NextResponse.json({ error: "Failed to delete shift" }, { status: 500 })
  } finally {
    client.release()
  }
}
