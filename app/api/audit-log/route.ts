import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const actorId = searchParams.get("actor_id")
  const action = searchParams.get("action")
  const category = searchParams.get("category") // "account", "order", "shift", "menu", "system"
  const includeArchived = searchParams.get("includeArchived") === "true"
  const limit = Math.min(parseInt(searchParams.get("limit") || "10000"), 50000)

  const conditions: string[] = []
  const values: unknown[] = []

  // Filter archived entries by default
  if (!includeArchived) {
    conditions.push("archived = false")
  }

  if (actorId) {
    const parsed = Number(actorId)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Invalid actor_id" }, { status: 400 })
    }
    values.push(parsed)
    conditions.push(`actor_id = $${values.length}`)
  }

  if (action) {
    values.push(action)
    conditions.push(`action = $${values.length}`)
  }

  // Category filters group related actions
  if (category === "account") {
    conditions.push(`action IN ('login','create_account','update_account','reset_password','delete_account','change_own_password')`)
  } else if (category === "order") {
    conditions.push(`action IN ('order_placed','order_voided','order_restored','order_restored_from_trash','order_deleted','order_permanently_deleted')`)
  } else if (category === "shift") {
    conditions.push(`action IN ('shift_started','shift_closed')`)
  } else if (category === "menu") {
    conditions.push(`action IN ('product_added','product_updated','product_deleted','product_availability','category_added','category_updated','category_deleted')`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  try {
    values.push(limit)
    const result = await pool.query(
      `SELECT id, action, actor_id, actor_username, target_user_id, target_username, details, created_at, archived
       FROM public.admin_audit_log
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values
    )
    return NextResponse.json({ entries: result.rows })
  } catch (err) {
    console.error("Failed to fetch audit log:", err)
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { id } = body
  if (!id || !Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid audit log ID" }, { status: 400 })
  }

  try {
    const result = await pool.query(
      `UPDATE public.admin_audit_log
       SET archived = true
       WHERE id = $1
       RETURNING id`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Audit log entry not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    console.error("Failed to archive audit log entry:", err)
    return NextResponse.json({ error: "Failed to archive audit log entry" }, { status: 500 })
  }
}

