-- Add order status tracking to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'void', 'cancelled'));

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Add archive and notes support to shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON public.sales (created_by);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales (status);
CREATE INDEX IF NOT EXISTS idx_shifts_archived ON public.shifts (archived);
