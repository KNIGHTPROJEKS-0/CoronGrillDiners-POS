import { NextResponse } from "next/server"
import pool, { hasColumn } from "@/lib/db"
import { unstable_cache } from "next/cache"

const getMenuCached = unstable_cache(
  async () => {
    const hasProductIsDeleted = await hasColumn("products", "is_deleted")
    const whereClause = hasProductIsDeleted
      ? "WHERE is_deleted = false OR is_deleted IS NULL"
      : ""

    const [categories, products] = await Promise.all([
      pool.query(
        `SELECT id, name, display_order
         FROM public.categories
         ORDER BY display_order ASC, name ASC`
      ),
      pool.query(
        `SELECT id, name, price::float, category, image_url AS image, description, available
         FROM public.products
         ${whereClause}
         ORDER BY category, name ASC`
      ),
    ])

    return { categories: categories.rows, products: products.rows }
  },
  ["api-menu"],
  { revalidate: 300, tags: ["menu"] }
)

export async function GET() {
  try {
    const menu = await getMenuCached()
    return NextResponse.json(menu, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
      },
      status: 200,
    })
  } catch (error) {
    console.error("Failed to fetch menu:", error)
    return NextResponse.json({ error: "Failed to fetch menu" }, { status: 500 })
  }
}
