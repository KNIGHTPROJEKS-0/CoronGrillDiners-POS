import pool from "@/lib/db"

export interface AuditActor {
  id: number | string
  username: string
}

export interface AuditTarget {
  id?: number | string | null
  username?: string | null
}

/**
 * logEvent — fire-and-forget audit log writer.
 * Never throws — a logging failure must not break the main request.
 */
export async function logEvent(
  action: string,
  actor: AuditActor,
  details: string,
  target?: AuditTarget
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.admin_audit_log
         (action, actor_id, actor_username, target_user_id, target_username, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        action,
        Number(actor.id),
        actor.username,
        target?.id != null ? Number(target.id) : null,
        target?.username ?? null,
        details,
      ]
    )
  } catch (err) {
    console.error("[audit] Failed to write log:", err)
  }
}
