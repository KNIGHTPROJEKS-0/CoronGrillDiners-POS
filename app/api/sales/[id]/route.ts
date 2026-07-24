import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool, { hasColumn } from "@/lib/db"
import { logEvent } from "@/lib/audit"

// Helper function to add missing columns to sales table
async function ensureSalesTableColumns() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT;
    `);
  } finally {
    client.release();
  }
}

// Helper function for batch stock updates (avoids N+1 queries)
async function batchUpdateStock(
  client: any,
  items: Array<{ id?: number; quantity: number }>,
  operation: 'add' | 'subtract'
) {
  // Filter valid items
  const validItems = items.filter(
    (item: any) => item.id && Number(item.quantity) > 0
  )
  
  if (validItems.length === 0) return
  
  // Build CASE expression for batch update
  const caseExpressions = validItems.map((item: any) => {
    const quantity = Number(item.quantity)
    const delta = operation === 'add' ? `+ ${quantity}` : `- ${quantity}`
    return `WHEN ${item.id} THEN stock ${delta}`
  }).join(" ")
  
  const productIds = validItems.map((item: any) => item.id).join(", ")
  
  // Build WHERE clause conditions
  const whereConditions = [`id IN (${productIds})`, "stock IS NOT NULL"]
  if (operation === 'subtract') {
    // For subtract, ensure each product has enough stock
    validItems.forEach((item: any) => {
      whereConditions.push(`(id != ${item.id} OR stock >= ${Number(item.quantity)})`)
    })
  }
  
  const whereClause = whereConditions.join(" AND ")
  
  // Execute single batch update
  await client.query(
    `UPDATE public.products
     SET stock = CASE id ${caseExpressions} ELSE stock END
     WHERE ${whereClause}`
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Ensure sales table has status and void_reason columns
  await ensureSalesTableColumns();

  try {
    const { status, voidReason, isDeleted } = await request.json()
    const isAdmin = session.user.role === "admin"
    const username = (session.user as any).username ?? session.user.name

    if (isDeleted !== undefined) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const saleMeta = await pool.query(
        `SELECT status, payment_method, grand_total, shift_id
         FROM public.sales
         WHERE id = $1`,
        [id]
      )
      if (saleMeta.rows.length === 0) {
        return NextResponse.json({ error: "Sale not found" }, { status: 404 })
      }
      const hasIsDeleted = await hasColumn("sales", "is_deleted")
      const hasDeletedAt = await hasColumn("sales", "deleted_at")
      const hasDeletedBy = await hasColumn("sales", "deleted_by")

      if (!hasIsDeleted) {
        return NextResponse.json(
          { error: "Soft delete support is not available in the current database schema" },
          { status: 501 }
        )
      }

      const prevStatus = saleMeta.rows[0].status ?? "completed"
      const paymentMethod = saleMeta.rows[0].payment_method
      const grandTotal = Number(saleMeta.rows[0].grand_total || 0)
      const shiftId = saleMeta.rows[0].shift_id

      const updateClauses = ["is_deleted = $1"]
      const returningColumns = ["id", "order_number", "is_deleted"]
      const queryValues = [isDeleted]
      let paramIndex = 2

      if (hasDeletedAt) {
        updateClauses.push("deleted_at = CASE WHEN $1 THEN NOW() ELSE NULL END")
        returningColumns.push("deleted_at")
      }
      if (hasDeletedBy) {
        updateClauses.push(`deleted_by = CASE WHEN $1 THEN $${paramIndex} ELSE NULL END`)
        returningColumns.push("deleted_by")
        queryValues.push(username)
        paramIndex += 1
      }

      queryValues.push(id)
      const result = await pool.query(
        `UPDATE public.sales
         SET ${updateClauses.join(",\n             ")}
         WHERE id = $${paramIndex}
         RETURNING ${returningColumns.join(", ")}`,
        queryValues
      )
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Sale not found" }, { status: 404 })
      }
      if (shiftId && prevStatus === "completed") {
        const totalDelta = isDeleted ? -grandTotal : grandTotal
        const cashDelta = paymentMethod === "cash" ? totalDelta : 0
        await pool.query(
          `UPDATE public.shifts
           SET total_sales = COALESCE(total_sales, 0) + $1,
               total_cash_sales = COALESCE(total_cash_sales, 0) + $2,
               expected_cash = CASE
                 WHEN $2 <> 0 THEN COALESCE(expected_cash, 0) + $2
                 ELSE expected_cash
               END
           WHERE id = $3`,
          [totalDelta, cashDelta, shiftId]
        )
      }
      const sale = result.rows[0]
      if (isDeleted) {
        logEvent(
          "order_deleted",
          { id: session.user.id!, username },
          `Order ${sale.order_number} moved to trash by ${username}`
        )
      } else {
        logEvent(
          "order_restored_from_trash",
          { id: session.user.id!, username },
          `Order ${sale.order_number} restored from trash by ${username}`
        )
      }
      return NextResponse.json({ sale })
    }

    if (!["completed", "void", "cancelled"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

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

      // Ensure void_log exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS void_log (
          id SERIAL PRIMARY KEY,
          sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
          voided_by VARCHAR(255) NOT NULL,
          voided_by_role VARCHAR(20) NOT NULL CHECK (voided_by_role IN ('admin', 'cashier')),
          void_code_used VARCHAR(20),
          reason TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Ensure indexes exist
      try {
        await client.query(`CREATE INDEX IF NOT EXISTS idx_void_log_sale_id ON void_log(sale_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_void_log_created_at ON void_log(created_at DESC)`);
      } catch { /* ignore if indexes already exist */ }

      /* Fetch current status + items before updating (needed for stock logic) */
      const saleCheck = await client.query(
        `SELECT status, items, payment_method, grand_total, shift_id
         FROM public.sales WHERE id = $1 FOR UPDATE`,
        [id]
      )
      if (saleCheck.rows.length === 0) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Sale not found" }, { status: 404 })
      }
      const prevStatus = saleCheck.rows[0].status
      const saleItems: Array<{ id?: number; quantity: number }> = saleCheck.rows[0].items ?? []
      const salePaymentMethod = saleCheck.rows[0].payment_method
      const saleTotal = Number(saleCheck.rows[0].grand_total || 0)
      const saleShiftId = saleCheck.rows[0].shift_id

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
        // Log to void_log if it's an admin void
        if (isAdmin) {
          try {
            await client.query(
              `INSERT INTO void_log (sale_id, voided_by, voided_by_role, reason)
               VALUES ($1, $2, $3, $4)`,
              [
                id,
                username,
                "admin",
                voidReason
              ]
            )
          } catch (e) {
            console.error("Failed to insert into void_log:", e);
            // Don't fail the whole transaction if this fails
          }
        }
        
        // Batch update: restore stock (avoids N+1 queries)
        try {
          await batchUpdateStock(client, saleItems, 'add')
        } catch (stockError) {
          console.error("Failed to batch restore stock:", stockError)
          throw new Error("Failed to restore stock for voided order")
        }
      } else if (status === "completed" && prevStatus === "void") {
        // Batch update: deduct stock (avoids N+1 queries)
        try {
          await batchUpdateStock(client, saleItems, 'subtract')
        } catch (stockError) {
          console.error("Failed to batch deduct stock:", stockError)
          throw new Error("Failed to deduct stock for restored order")
        }
      }
      if (saleShiftId) {
        const wasCompleted = prevStatus === "completed"
        const isNowCompleted = status === "completed"
        const totalDelta = (isNowCompleted ? saleTotal : 0) - (wasCompleted ? saleTotal : 0)
        const cashDelta = salePaymentMethod === "cash" ? totalDelta : 0

        if (totalDelta !== 0 || cashDelta !== 0) {
          await client.query(
            `UPDATE public.shifts
             SET total_sales = COALESCE(total_sales, 0) + $1,
                 total_cash_sales = COALESCE(total_cash_sales, 0) + $2,
                 expected_cash = CASE
                   WHEN $2 <> 0 THEN COALESCE(expected_cash, 0) + $2
                   ELSE expected_cash
                 END
             WHERE id = $3`,
            [totalDelta, cashDelta, saleShiftId]
          )
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
      console.error("Transaction error while updating sale:", err)
      await client.query("ROLLBACK")
      throw err
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Failed to update sale status:", error)
    const message = error instanceof Error ? error.message : "Failed to update sale status"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const forceDelete = searchParams.get("force") === "true"

    if (forceDelete) {
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
        "order_permanently_deleted",
        { id: session.user.id!, username },
        `Order ${sale.order_number} permanently deleted (₱${Number(sale.grand_total).toFixed(2)})`
      )

      return NextResponse.json({ success: true, deleted: sale })
    }

    const hasIsDeleted = await hasColumn("sales", "is_deleted")
    const hasDeletedAt = await hasColumn("sales", "deleted_at")
    const hasDeletedBy = await hasColumn("sales", "deleted_by")

    if (!hasIsDeleted) {
      return NextResponse.json(
        { error: "Soft delete support is not available in the current database schema" },
        { status: 501 }
      )
    }

    const deleteClauses = ["is_deleted = true"]
    const returningColumns = ["id", "order_number", "grand_total"]
    const queryValues = [id]
    let paramIndex = 2

    if (hasDeletedAt) {
      deleteClauses.push("deleted_at = NOW()")
      returningColumns.push("deleted_at")
    }
    if (hasDeletedBy) {
      deleteClauses.push(`deleted_by = $${paramIndex}`)
      returningColumns.push("deleted_by")
      queryValues.push((session.user as any).username ?? session.user.name)
      paramIndex += 1
    }

    const result = await pool.query(
      `UPDATE public.sales
       SET ${deleteClauses.join(",\n           ")}
       WHERE id = $1
       RETURNING ${returningColumns.join(", ")}`,
      queryValues
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 })
    }

    const sale = result.rows[0]
    const username = (session.user as any).username ?? session.user.name
    logEvent(
      "order_deleted",
      { id: session.user.id!, username },
      `Order ${sale.order_number} moved to trash by ${username}`
    )

    return NextResponse.json({ success: true, deleted: sale })
  } catch (error) {
    console.error("Failed to delete sale:", error)
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 })
  }
}
