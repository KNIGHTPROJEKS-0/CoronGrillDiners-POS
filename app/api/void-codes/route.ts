import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"

/* GET — admin only: list all void codes with used/available status */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await pool.query(
      `SELECT id, code, used_by, used_at, sale_id, created_at
       FROM void_codes
       ORDER BY used_at IS NULL DESC, code ASC`
    )
    return NextResponse.json({ codes: result.rows })
  } catch {
    return NextResponse.json({ error: "Failed to fetch void codes" }, { status: 500 })
  }
}

/* PUT — admin only: generate a batch of new void codes */
export async function PUT() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const generate = (): string => {
    const part = (len: number) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    return `CGD-${part(2)}-${part(6)}`
  }

  const batch: string[] = []
  while (batch.length < 5) {
    const c = generate()
    if (!batch.includes(c)) batch.push(c)
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    
    // Create void_codes table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS void_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        used_by VARCHAR(255),
        used_at TIMESTAMPTZ,
        sale_id INTEGER REFERENCES public.sales(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create indexes if they don't exist
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_void_codes_code ON void_codes(code)`)
    } catch { /* index might already exist */ }
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_void_codes_used_at ON void_codes(used_at)`)
    } catch { /* index might already exist */ }
    try {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_void_codes_code_unique ON void_codes(code)`)
    } catch { /* duplicate codes could prevent a unique index; keep going */ }

    const actor = {
      id: session.user.id ?? session.user.email ?? session.user.name ?? "unknown",
      username: (session.user as any).username ?? session.user.name ?? session.user.email ?? "unknown",
    }

    const inserted: string[] = []
    for (const code of batch) {
      const r = await client.query(
        `INSERT INTO void_codes (code)
         SELECT $1
         WHERE NOT EXISTS (SELECT 1 FROM void_codes WHERE code = $1)
         RETURNING code`,
        [code]
      )
      if (r.rows[0]) inserted.push(r.rows[0].code)
    }
    
    await client.query("COMMIT")
    try {
      logEvent(
        "void_codes_generated",
        actor,
        `Generated ${inserted.length} void codes: ${inserted.join(", ")}`
      )
    } catch (e) {
      // best-effort
    }

    return NextResponse.json({ success: true, generated: inserted })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Failed to generate codes:", error)
    return NextResponse.json({ error: "Failed to generate codes", details: String(error) }, { status: 500 })
  } finally {
    client.release()
  }
}

/* POST — cashier/admin: use a void code to void an order */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { code?: string; saleId?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { code, saleId, reason } = body
  if (!code || !saleId) {
    return NextResponse.json({ error: "code and saleId are required" }, { status: 400 })
  }

  const normalizedCode = code.trim().toUpperCase()
  const actor = {
    id: session.user.id ?? session.user.email ?? session.user.name ?? "unknown",
    username: (session.user as any).username ?? session.user.name ?? session.user.email ?? "unknown",
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const codeResult = await client.query(
      `SELECT id FROM void_codes WHERE code = $1 AND used_at IS NULL`,
      [normalizedCode]
    )

    if (codeResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "Invalid or already-used void code. Please request a new code from admin." }, { status: 400 })
    }

    const isAdmin = session.user.role === "admin"
    let saleResult
    if (isAdmin) {
      saleResult = await client.query(
        `UPDATE public.sales
         SET status = 'void', void_reason = $1
         WHERE id = $2 AND status = 'completed'
         RETURNING id, order_number`,
        [reason || "Voided with admin code", saleId]
      )
    } else {
      saleResult = await client.query(
        `UPDATE public.sales
         SET status = 'void', void_reason = $1
         WHERE id = $2
           AND (created_by = $3 OR server_name = $3)
           AND status = 'completed'
         RETURNING id, order_number`,
        [reason || "Voided with admin code", saleId, actor.username]
      )
    }

    if (saleResult.rows.length === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "Order not found, already voided, or not authorized" },
        { status: 404 }
      )
    }

    /* ── Restore stock for voided items ──────────────────────────────────────
       The order was voided — items were not served. Return stock to shelf.
       NULL stock = unlimited/untracked → skip. */
    const itemsResult = await client.query(
      `SELECT items FROM public.sales WHERE id = $1`,
      [saleId]
    )
    const saleItems: Array<{ id?: number; quantity: number }> = itemsResult.rows[0]?.items ?? []
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

      const shiftMeta = await client.query(
        `SELECT shift_id, payment_method, grand_total
         FROM public.sales
         WHERE id = $1`,
        [saleId]
      )
      const shiftId = shiftMeta.rows[0]?.shift_id
      const paymentMethod = shiftMeta.rows[0]?.payment_method
      const grandTotal = Number(shiftMeta.rows[0]?.grand_total || 0)
      if (shiftId) {
        const cashDelta = paymentMethod === "cash" ? -grandTotal : 0
        await client.query(
          `UPDATE public.shifts
           SET total_sales = COALESCE(total_sales, 0) - $1,
               total_cash_sales = COALESCE(total_cash_sales, 0) - $2,
               expected_cash = CASE
                 WHEN $2 <> 0 THEN COALESCE(expected_cash, 0) - $2
                 ELSE expected_cash
               END
           WHERE id = $3`,
          [grandTotal, cashDelta, shiftId]
        )
      }

    await client.query(
      `UPDATE void_codes SET used_by = $1, used_at = NOW(), sale_id = $2 WHERE code = $3`,
      [actor.username, saleId, normalizedCode]
    )

    await client.query("COMMIT")

    try {
      logEvent(
        "order_voided",
        actor,
        `Order ${saleResult.rows[0].order_number} voided using code ${normalizedCode}`
      )
    } catch (e) {
      // ignore
    }

    return NextResponse.json({
      success: true,
      order_number: saleResult.rows[0].order_number,
    })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Void with code failed:", error)
    return NextResponse.json({ error: "Failed to process void" }, { status: 500 })
  } finally {
    client.release()
  }
}
