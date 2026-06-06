-- Migration: add admin_audit_log table for tracking account management actions
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              SERIAL PRIMARY KEY,
  action          VARCHAR(50)  NOT NULL,
  actor_id        INTEGER      NOT NULL,
  actor_username  VARCHAR(100) NOT NULL,
  target_user_id  INTEGER,
  target_username VARCHAR(100),
  details         TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log (created_at DESC);
