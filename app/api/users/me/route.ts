import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import pool from "@/lib/db"
import bcrypt from "bcryptjs"

async function logAuditEvent(
  action: string,
  actor: { id: number; username: string },
  target: { id?: number; username?: string } | null,
  details: string
) {
  try {
    await pool.query(
      `INSERT INTO public.admin_audit_log (action, actor_id, actor_username, target_user_id, target_username, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [action, actor.id, actor.username, target?.id ?? null, target?.username ?? null, details]
    )
  } catch (err) {
    console.error("Failed to write audit log:", err)
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const result = await pool.query(
      "SELECT password_hash FROM public.users WHERE id = $1",
      [session.user.id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash)
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      )
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12)
    await pool.query(
      "UPDATE public.users SET password_hash = $1 WHERE id = $2",
      [newPasswordHash, session.user.id]
    )

    const actor = { id: Number(session.user.id), username: session.user.username as string }
    await logAuditEvent(
      "change_own_password",
      actor,
      { id: Number(session.user.id), username: session.user.username as string },
      `Changed own password`
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Failed to change password:", err)
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 })
  }
}
