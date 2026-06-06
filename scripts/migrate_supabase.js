const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("=== Supabase Migration ===\n");

    console.log("Creating public.users table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'admin')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    console.log("Creating public.shifts table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.shifts (
        id SERIAL PRIMARY KEY,
        cashier_id INTEGER NOT NULL REFERENCES public.users(id),
        cashier_name TEXT NOT NULL,
        cashier_username TEXT NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        end_time TIMESTAMP WITH TIME ZONE,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        start_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
        end_balance DECIMAL(10, 2),
        total_cash_sales DECIMAL(10, 2) DEFAULT 0,
        total_sales DECIMAL(10, 2) DEFAULT 0,
        expected_cash DECIMAL(10, 2),
        discrepancy DECIMAL(10, 2)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shifts_cashier_id ON public.shifts(cashier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON public.shifts(start_time DESC)`);

    console.log("Aligning sales table columns...");
    await client.query(`ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS items JSONB`);
    await client.query(`ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS grand_total DECIMAL(10, 2)`);
    await client.query(`ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_by TEXT`);
    await client.query(`
      UPDATE public.sales
      SET items = items_json::jsonb, grand_total = total_paid
      WHERE grand_total IS NULL OR items IS NULL
    `);

    console.log("Adding 'available' column to products...");
    await client.query(`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT true`);

    console.log("\nSeeding users...");
    const cashierHash = bcrypt.hashSync("cashier123", 10);
    const adminHash   = bcrypt.hashSync("admin123",   10);
    const usersToSeed = [
      { username: "admin",    name: "Admin",     hash: adminHash,   role: "admin"  },
      { username: "cashier1", name: "Cashier 1", hash: cashierHash, role: "staff"  },
      { username: "cashier2", name: "Cashier 2", hash: cashierHash, role: "staff"  },
      { username: "cashier3", name: "Cashier 3", hash: cashierHash, role: "staff"  },
      { username: "cashier4", name: "Cashier 4", hash: cashierHash, role: "staff"  },
    ];
    for (const u of usersToSeed) {
      await client.query(
        `INSERT INTO public.users (username, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role`,
        [u.username, u.name, u.hash, u.role]
      );
      console.log(`  ✓ ${u.username} (${u.role})`);
    }

    console.log("Creating public.admin_audit_log table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.admin_audit_log (
        id              SERIAL PRIMARY KEY,
        action          VARCHAR(50)  NOT NULL,
        actor_id        INTEGER      NOT NULL,
        actor_username  VARCHAR(100) NOT NULL,
        target_user_id  INTEGER,
        target_username VARCHAR(100),
        details         TEXT,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC)`);

    const userCount = await client.query("SELECT COUNT(*) FROM public.users");
    console.log(`\nDone. Users in DB: ${userCount.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
