-- ============================================================
-- Coron Grill Diners POS — DB Fix Script
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Disable RLS on public.users so auth queries always work
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Drop TO-postgres-only policy on users
DROP POLICY IF EXISTS allow_postgres ON public.users;

-- 3. Fix RLS policies on other tables (replace "TO postgres" with universal)
DROP POLICY IF EXISTS allow_postgres ON public.categories;
DROP POLICY IF EXISTS allow_postgres ON public.products;
DROP POLICY IF EXISTS allow_postgres ON public.sales;
DROP POLICY IF EXISTS allow_postgres ON public.shifts;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='categories' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON public.categories USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON public.products USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON public.sales USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shifts' AND policyname='allow_all') THEN
    CREATE POLICY allow_all ON public.shifts USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- 4. Update role constraint: 'staff' → 'cashier'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE public.users SET role = 'cashier' WHERE role = 'staff';
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY['cashier'::text, 'admin'::text]));

-- 5. Reseed passwords with fresh bcrypt hashes
--    admin → admin123   |   cashier1-4 → cashier123
UPDATE public.users
SET password_hash = '$2b$12$zXki6Ggi8CKIUufeh6ylcuUD5RfroVsLYf86k1hFpqGDaD1QunnEe'
WHERE role = 'admin';

UPDATE public.users
SET password_hash = '$2b$12$C1P39hgXTs5ELNXOtb8xk.lSWa7x7vUJZ347X/9ye1Kd.m7g3V7HG'
WHERE role = 'cashier';

-- 6. Verify
SELECT id, username, name, role, LENGTH(password_hash) AS hash_len
FROM public.users
ORDER BY role DESC, username;
