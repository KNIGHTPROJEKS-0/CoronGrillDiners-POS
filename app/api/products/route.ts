import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool, { hasColumn } from "@/lib/db"
import { logEvent } from "@/lib/audit"

export async function GET() {
  try {
    // Add missing columns
    const client = await pool.connect()
    try {
      await client.query(`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by TEXT;
      `)
    } finally {
      client.release()
    }

    // Check if stock column exists
    const hasStock = await hasColumn("products", "stock")
    const hasIsDeleted = await hasColumn("products", "is_deleted")

    // Build SELECT clause dynamically
    const selectColumns = [
      "id", "name", "price::float", "category", "image_url AS image", "description", "available"
    ]
    if (hasStock) selectColumns.push("stock")

    const whereClause = hasIsDeleted ? "WHERE is_deleted = false OR is_deleted IS NULL" : ""

    const result = await pool.query(
      `SELECT ${selectColumns.join(", ")}
       FROM public.products
       ${whereClause}
       ORDER BY category, name ASC`
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error("Failed to fetch products:", error)
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { name, price, category, image, description, available, stock } = await request.json()
    
    const hasStock = await hasColumn("products", "stock")
    
    // Build INSERT columns and values dynamically
    const columns = ["name", "price", "category", "image_url", "description", "available"]
    const values = [name, price, category, image || null, description || null, available ?? true]
    
    if (hasStock) {
      columns.push("stock")
      values.push(stock ?? null)
    }
    
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ")
    
    const returningColumns = ["id", "name", "price::float", "category", "image_url AS image", "description", "available"]
    if (hasStock) returningColumns.push("stock")
    
    const result = await pool.query(
      `INSERT INTO public.products (${columns.join(", ")})
       VALUES (${placeholders})
       RETURNING ${returningColumns.join(", ")}`,
      values
    )

    const product = result.rows[0]
    const username = (session.user as any).username ?? session.user.name
    logEvent(
      "product_added",
      { id: session.user.id!, username },
      `Added product "${name}" (₱${Number(price).toFixed(2)}) in category "${category}"`
    )

    return NextResponse.json({ product })
  } catch (error) {
    console.error("Failed to create product:", error)
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { id, name, price, category, image, description, available, stock } = await request.json()
    const hasStock = await hasColumn("products", "stock")

    // Fetch current values BEFORE the update so we can diff exactly what changed
    const selectOldColumns = ["name", "price::float", "category", "image_url", "description", "available"]
    if (hasStock) selectOldColumns.push("stock")
    
    const before = await pool.query(
      `SELECT ${selectOldColumns.join(", ")}
       FROM public.products WHERE id = $1`,
      [id]
    )
    if (before.rows.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    const old = before.rows[0]

    // Build UPDATE query dynamically
    const updates = ["name = $1", "price = $2", "category = $3", "image_url = $4", "description = $5", "available = $6", "updated_at = NOW()"]
    const values = [name, price, category, image || null, description || null, available ?? true]
    
    if (hasStock) {
      updates.push("stock = $7")
      values.push(stock ?? null)
      values.push(id) // id becomes $8
    } else {
      values.push(id) // id becomes $7
    }
    
    const returningColumns = ["id", "name", "price::float", "category", "image_url AS image", "description", "available"]
    if (hasStock) returningColumns.push("stock")

    const result = await pool.query(
      `UPDATE public.products
       SET ${updates.join(", ")}
       WHERE id = $${values.length}
       RETURNING ${returningColumns.join(", ")}`,
      values
    )

    const product = result.rows[0]
    const username = (session.user as any).username ?? session.user.name

    // Build a precise diff of every field that actually changed
    const changes: string[] = []
    if (old.name !== name)
      changes.push(`name: "${old.name}" → "${name}"`)
    if (Number(old.price) !== Number(price))
      changes.push(`price: ₱${Number(old.price).toFixed(2)} → ₱${Number(price).toFixed(2)}`)
    if (old.category !== category)
      changes.push(`category: "${old.category}" → "${category}"`)
    if ((old.image_url ?? null) !== (image || null))
      changes.push(`image updated`)
    if ((old.description ?? null) !== (description || null))
      changes.push(`description updated`)
    if (Boolean(old.available) !== Boolean(available))
      changes.push(`availability: ${old.available ? "available" : "unavailable"} → ${available ? "available" : "unavailable"}`)
    if (hasStock && (old.stock ?? null) !== (stock ?? null))
      changes.push(`stock: ${old.stock ?? "unlimited"} → ${stock ?? "unlimited"}`)

    // Choose action type and detail based on what actually changed
    const onlyAvailabilityChanged =
      changes.length === 1 && changes[0].startsWith("availability:")

    const action = onlyAvailabilityChanged ? "product_availability" : "product_updated"
    const detail = changes.length === 0
      ? `Viewed/saved "${name}" with no changes`
      : `Updated "${name}": ${changes.join("; ")}`

    logEvent(action, { id: session.user.id!, username }, detail)

    return NextResponse.json({ product })
  } catch (error) {
    console.error("Failed to update product:", error)
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { id } = await request.json()
    const hasIsDeleted = await hasColumn("products", "is_deleted")
    const hasDeletedAt = await hasColumn("products", "deleted_at")

    // Get name before deleting
    const check = await pool.query("SELECT name FROM public.products WHERE id = $1", [id])
    const productName = check.rows[0]?.name ?? `ID ${id}`

    if (hasIsDeleted) {
      // Soft delete if column exists
      const updates = ["is_deleted = true"]
      const values = [id]
      if (hasDeletedAt) updates.push("deleted_at = NOW()")
      
      await pool.query(
        `UPDATE public.products SET ${updates.join(", ")} WHERE id = $1`,
        values
      )
    } else {
      // Hard delete if no soft delete columns
      await pool.query("DELETE FROM public.products WHERE id = $1", [id])
    }

    const username = (session.user as any).username ?? session.user.name
    logEvent(
      "product_deleted",
      { id: session.user.id!, username },
      `Deleted product "${productName}"`
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete product:", error)
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 })
  }
}
