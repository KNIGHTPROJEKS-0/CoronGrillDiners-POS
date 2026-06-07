-- Create void_codes table for cashier void authorization
CREATE TABLE IF NOT EXISTS void_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  used_by VARCHAR(255),
  used_at TIMESTAMPTZ,
  sale_id INTEGER REFERENCES public.sales(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on code for faster lookups
CREATE INDEX IF NOT EXISTS idx_void_codes_code ON void_codes(code);
CREATE INDEX IF NOT EXISTS idx_void_codes_used_at ON void_codes(used_at);
