import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import { logEvent } from "@/lib/audit"

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, name, price::float, category, image_url AS image, description, available, stock
       FROM public.products ORDER BY category, name ASC`
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
    const stockVal =
      stock === undefined || stock === null || stock === "" ? null : Math.max(0, Math.floor(Number(stock)))
    const result = await pool.query(
      `INSERT INTO public.products (name, price, category, image_url, description, available, stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, price::float, category, image_url AS image, description, available, stock`,
      [name, price, category, image || null, description || null, available ?? true, stockVal]
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
    const stockVal =
      stock === undefined || stock === null || stock === "" ? null : Math.max(0, Math.floor(Number(stock)))

    // Fetch current values BEFORE the update so we can diff exactly what changed
    const before = await pool.query(
      `SELECT name, price::float, category, image_url, description, available, stock
       FROM public.products WHERE id = $1`,
      [id]
    )
    if (before.rows.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    const old = before.rows[0]

    const result = await pool.query(
      `UPDATE public.products
       SET name = $1, price = $2, category = $3, image_url = $4,
           description = $5, available = $6, stock = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING id, name, price::float, category, image_url AS image, description, available, stock`,
      [name, price, category, image || null, description || null, available ?? true, stockVal, id]
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
    if (String(old.stock ?? "null") !== String(stockVal ?? "null"))
      changes.push(`stock: ${old.stock ?? "untracked"} → ${stockVal ?? "untracked"}`)

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

    // Get name before deleting
    const check = await pool.query("SELECT name FROM public.products WHERE id = $1", [id])
    const productName = check.rows[0]?.name ?? `ID ${id}`

    await pool.query("DELETE FROM public.products WHERE id = $1", [id])

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
