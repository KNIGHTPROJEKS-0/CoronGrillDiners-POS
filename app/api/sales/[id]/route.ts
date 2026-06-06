import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { status, voidReason } = await request.json()
    if (!["completed", "void", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const isAdmin = session.user.role === "admin"
    const username = (session.user as any).username ?? session.user.name

    /* Cashiers may only cancel their own orders via this endpoint.
       Voiding requires /api/void-codes (code-gated). */
    if (!isAdmin && status !== "cancelled") {
      return NextResponse.json(
        { error: "Cashiers can only cancel orders. Voiding requires an admin void code." },
        { status: 403 }
      )
    }

    // When admin voids, tag the void_reason so cashier knows who voided it
    const storedVoidReason = isAdmin && status === "void"
      ? `[Admin: ${username}]${voidReason ? ' ' + voidReason : ''}`.trim()
      : voidReason ?? null

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      /* Fetch current status + items before updating (needed for stock logic) */
      const saleCheck = await client.query(
        `SELECT status, items FROM public.sales WHERE id = $1`,
        [id]
      )
      if (saleCheck.rows.length === 0) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Sale not found" }, { status: 404 })
      }
      const prevStatus = saleCheck.rows[0].status
      const saleItems: Array<{ id?: number; quantity: number }> = saleCheck.rows[0].items ?? []

      /* Update the sale record */
      let result
      if (isAdmin) {
        result = await client.query(
          `UPDATE public.sales
           SET status = $1, void_reason = $2
           WHERE id = $3
           RETURNING id, order_number, status, void_reason`,
          [status, storedVoidReason, id]
        )
      } else {
        /* Cashier can only cancel their own completed orders */
        result = await client.query(
          `UPDATE public.sales
           SET status = $1, void_reason = $2
           WHERE id = $3
             AND (created_by = $4 OR server_name = $4)
             AND status = 'completed'
           RETURNING id, order_number, status, void_reason`,
          [status, storedVoidReason, id, username]
        )
      }

      if (result.rows.length === 0) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Sale not found or not authorized" }, { status: 404 })
      }

      /* ── Stock management ──────────────────────────────────────────────────
         VOID   (from completed): restore stock — items were never served/consumed
         CANCEL (from completed): keep stock decreased — food was already prepared
         COMPLETE (from void, admin restore): re-decrement stock
      ──────────────────────────────────────────────────────────────────────── */
      if (status === "void" && prevStatus === "completed") {
        for (const item of saleItems) {
          if (item.id && Number(item.quantity) > 0) {
            await client.query(
              `UPDATE public.products
               SET stock = stock + $1
               WHERE id = $2 AND stock IS NOT NULL`,
              [Number(item.quantity), item.id]
            )
          }
        }
      } else if (status === "completed" && prevStatus === "void") {
        for (const item of saleItems) {
          if (item.id && Number(item.quantity) > 0) {
            await client.query(
              `UPDATE public.products
               SET stock = stock - $1
               WHERE id = $2 AND stock IS NOT NULL AND stock >= $1`,
              [Number(item.quantity), item.id]
            )
          }
        }
      }
      /* cancelled → no stock change (food was prepared/wasted, cost still applies) */

      await client.query("COMMIT")

      const sale = result.rows[0]
      const actor = { id: session.user.id!, username }

      if (status === "void") {
        logEvent("order_voided", actor, `Order ${sale.order_number} voided. Reason: ${storedVoidReason ?? "none"}`)
      } else if (status === "completed") {
        logEvent("order_restored", actor, `Order ${sale.order_number} restored to completed`)
      } else if (status === "cancelled") {
        logEvent("order_voided", actor, `Order ${sale.order_number} cancelled. Reason: ${storedVoidReason ?? "none"}`)
      }

      return NextResponse.json({ sale })
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Failed to update sale status:", error)
    return NextResponse.json({ error: "Failed to update sale status" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await pool.query(
      `DELETE FROM public.sales WHERE id = $1 RETURNING id, order_number, grand_total`,
      [id]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 })
    }

    const sale = result.rows[0]
    const username = (session.user as any).username ?? session.user.name
    logEvent(
      "order_deleted",
      { id: session.user.id!, username },
      `Order ${sale.order_number} permanently deleted (₱${Number(sale.grand_total).toFixed(2)})`
    )

    return NextResponse.json({ success: true, deleted: sale })
  } catch (error) {
    console.error("Failed to delete sale:", error)
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 })
  }
}
