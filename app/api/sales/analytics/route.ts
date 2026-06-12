import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool, { hasColumn, makeDeletedFilter } from "@/lib/db"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0]

    const hasIsDeleted = await hasColumn("sales", "is_deleted")
    const deletedFilter = makeDeletedFilter(hasIsDeleted, false)

    const [weeklyTrend, topItems] = await Promise.all([
      pool.query(
        `SELECT
           DATE(created_at AT TIME ZONE 'Asia/Manila')::text AS date,
           COUNT(*)::int AS total_orders,
           COALESCE(SUM(grand_total), 0)::float AS total_sales
         FROM public.sales
         WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') >= ($1::date - INTERVAL '6 days')
           AND DATE(created_at AT TIME ZONE 'Asia/Manila') <= $1::date
           AND COALESCE(status, 'completed') = 'completed'
           ${deletedFilter}
         GROUP BY DATE(created_at AT TIME ZONE 'Asia/Manila')
         ORDER BY date`,
        [date]
      ),
      pool.query(
        `SELECT
           item->>'name' AS name,
           SUM((item->>'quantity')::int)::int AS total_qty,
           COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::int), 0)::float AS total_revenue
         FROM public.sales, jsonb_array_elements(items) AS item
         WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = $1
           AND COALESCE(status, 'completed') = 'completed'
           ${deletedFilter}
         GROUP BY item->>'name'
         ORDER BY total_qty DESC
         LIMIT 8`,
        [date]
      ),
    ])

    return NextResponse.json({
      weeklyTrend: weeklyTrend.rows,
      topItems: topItems.rows,
    }, {
      status: 200,
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch (error) {
    console.error("Failed to fetch analytics:", error)
    // Return fallback data instead of 500
    return NextResponse.json({
      weeklyTrend: [],
      topItems: [],
    })
  }
}
