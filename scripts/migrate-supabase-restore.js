#!/usr/bin/env node
/**
 * Data Recovery Migration Script
 * Migrates backup data from Neon (migration-data/*.json) → Supabase (public schema)
 *
 * Import order (respects FK constraints):
 *   1. categories       (no deps)
 *   2. users            (public.users — no deps)
 *   3. products         (depends on categories)
 *   4. shifts           (depends on users)
 *   5. sales            (depends on shifts)
 *   6. void_codes       (no active FK deps)
 *   7. admin_audit_log  (no formal FK deps)
 *   8. Reset sequences  (prevent future ID collisions)
 *
 * Uses a single transaction — if ANY step fails, everything rolls back.
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// ── Configuration ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "migration-data");

// Use direct (non-pooling) connection to avoid PgBouncer transaction issues
const DIRECT_URL =
  process.env.POSTGRES_URL_NON_POOLING ||
  (() => {
    // Fallback: parse .env.local manually
    const envPath = path.join(__dirname, "..", ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const match = envContent.match(
        /POSTGRES_URL_NON_POOLING="([^"]+)"/
      );
      if (match) return match[1];
    }
    throw new Error(
      "POSTGRES_URL_NON_POOLING not set and .env.local not found"
    );
  })();

// ── Helpers ────────────────────────────────────────────────────────────────
function loadJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(raw);
}

function log(msg) {
  console.log(`[MIGRATE] ${new Date().toISOString()} — ${msg}`);
}

function logError(msg, err) {
  console.error(`[MIGRATE ERROR] ${new Date().toISOString()} — ${msg}`, err?.message || err);
}

// ── Table Importers ────────────────────────────────────────────────────────

async function importCategories(client) {
  const data = loadJSON("categories.json");
  log(`Importing ${data.length} categories...`);

  for (const cat of data) {
    await client.query(
      `INSERT INTO public.categories (id, name, display_order, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, created_at = EXCLUDED.created_at`,
      [cat.id, cat.name, cat.display_order, cat.created_at]
    );
  }
  log(`  ✓ ${data.length} categories imported`);
  return data.length;
}

async function importUsers(client) {
  const data = loadJSON("users.json");
  log(`Importing ${data.length} users (public.users)...`);

  for (const u of data) {
    await client.query(
      `INSERT INTO public.users (id, username, name, password_hash, role, created_at)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username, name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, created_at = EXCLUDED.created_at`,
      [u.id, u.username, u.name, u.password_hash, u.role, u.created_at]
    );
  }
  log(`  ✓ ${data.length} users imported`);
  return data.length;
}

async function importProducts(client) {
  const data = loadJSON("products.json");
  log(`Importing ${data.length} products...`);

  for (const p of data) {
    await client.query(
      `INSERT INTO public.products (id, name, price, category, image_url, description, created_at, updated_at, available)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, price = EXCLUDED.price, category = EXCLUDED.category,
         image_url = EXCLUDED.image_url, description = EXCLUDED.description,
         created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at,
         available = EXCLUDED.available`,
      [
        p.id,
        p.name,
        p.price,
        p.category,
        p.image_url,
        p.description,
        p.created_at,
        p.updated_at,
        p.available,
      ]
    );
  }
  log(`  ✓ ${data.length} products imported`);
  return data.length;
}

async function importShifts(client) {
  const data = loadJSON("shifts.json");
  log(`Importing ${data.length} shifts...`);

  for (const s of data) {
    await client.query(
      `INSERT INTO public.shifts (id, cashier_id, cashier_name, cashier_username, start_time, end_time, status, start_balance, end_balance, total_cash_sales, total_sales, expected_cash, discrepancy, archived, notes)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         cashier_id = EXCLUDED.cashier_id, cashier_name = EXCLUDED.cashier_name,
         cashier_username = EXCLUDED.cashier_username, start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time, status = EXCLUDED.status,
         start_balance = EXCLUDED.start_balance, end_balance = EXCLUDED.end_balance,
         total_cash_sales = EXCLUDED.total_cash_sales, total_sales = EXCLUDED.total_sales,
         expected_cash = EXCLUDED.expected_cash, discrepancy = EXCLUDED.discrepancy,
         archived = EXCLUDED.archived, notes = EXCLUDED.notes`,
      [
        s.id, s.cashier_id, s.cashier_name, s.cashier_username,
        s.start_time, s.end_time, s.status, s.start_balance,
        s.end_balance, s.total_cash_sales, s.total_sales,
        s.expected_cash, s.discrepancy, s.archived, s.notes,
      ]
    );
  }
  log(`  ✓ ${data.length} shifts imported`);
  return data.length;
}

async function importSales(client) {
  const data = loadJSON("sales.json");
  log(`Importing ${data.length} sales...`);

  // Process in chunks of 50 to avoid memory pressure with large items JSON
  const CHUNK = 50;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    for (const s of chunk) {
      await client.query(
        `INSERT INTO public.sales (id, order_number, items, subtotal, service_charge, grand_total, payment_method, amount_tendered, change_amount, server_name, created_by, created_at, status, void_reason, discount_percent, shift_id, is_deleted, deleted_at, deleted_by)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, NULL, NULL)
         ON CONFLICT (id) DO UPDATE SET
           order_number = EXCLUDED.order_number, items = EXCLUDED.items,
           subtotal = EXCLUDED.subtotal, service_charge = EXCLUDED.service_charge,
           grand_total = EXCLUDED.grand_total, payment_method = EXCLUDED.payment_method,
           amount_tendered = EXCLUDED.amount_tendered, change_amount = EXCLUDED.change_amount,
           server_name = EXCLUDED.server_name, created_by = EXCLUDED.created_by,
           created_at = EXCLUDED.created_at, status = EXCLUDED.status,
           void_reason = EXCLUDED.void_reason, discount_percent = EXCLUDED.discount_percent,
           shift_id = EXCLUDED.shift_id`,
        [
          s.id, s.order_number, JSON.stringify(s.items),
          s.subtotal, s.service_charge, s.grand_total,
          s.payment_method, s.amount_tendered, s.change_amount,
          s.server_name, s.created_by, s.created_at,
          s.status, s.void_reason, s.discount_percent, s.shift_id,
        ]
      );
    }
    if ((i + CHUNK) % 200 === 0 || i + CHUNK >= data.length) {
      log(`  ... ${Math.min(i + CHUNK, data.length)}/${data.length} sales processed`);
    }
  }
  log(`  ✓ ${data.length} sales imported`);
  return data.length;
}

async function importVoidCodes(client) {
  const data = loadJSON("void_codes.json");
  log(`Importing ${data.length} void codes...`);

  for (const v of data) {
    await client.query(
      `INSERT INTO public.void_codes (id, code, used_by, used_at, sale_id, created_at)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code, used_by = EXCLUDED.used_by,
         used_at = EXCLUDED.used_at, sale_id = EXCLUDED.sale_id,
         created_at = EXCLUDED.created_at`,
      [v.id, v.code, v.used_by, v.used_at, v.sale_id, v.created_at]
    );
  }
  log(`  ✓ ${data.length} void codes imported`);
  return data.length;
}

async function importAdminAuditLog(client) {
  const data = loadJSON("admin_audit_log.json");
  log(`Importing ${data.length} admin audit log entries...`);

  const CHUNK = 100;
  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    for (const a of chunk) {
      await client.query(
        `INSERT INTO public.admin_audit_log (id, action, actor_id, actor_username, target_user_id, target_username, details, created_at, archived)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         ON CONFLICT (id) DO UPDATE SET
           action = EXCLUDED.action, actor_id = EXCLUDED.actor_id,
           actor_username = EXCLUDED.actor_username, target_user_id = EXCLUDED.target_user_id,
           target_username = EXCLUDED.target_username, details = EXCLUDED.details,
           created_at = EXCLUDED.created_at`,
        [
          a.id, a.action, a.actor_id, a.actor_username,
          a.target_user_id, a.target_username, a.details, a.created_at,
        ]
      );
    }
  }
  log(`  ✓ ${data.length} audit log entries imported`);
  return data.length;
}

async function resetSequences(client) {
  log("Resetting auto-increment sequences...");

  const tables = [
    { table: "users", schema: "public" },
    { table: "products", schema: "public" },
    { table: "shifts", schema: "public" },
    { table: "void_codes", schema: "public" },
    { table: "admin_audit_log", schema: "public" },
  ];

  for (const { table, schema } of tables) {
    const result = await client.query(
      `SELECT setval(
         pg_get_serial_sequence('${schema}.${table}', 'id'),
         COALESCE((SELECT MAX(id) FROM ${schema}.${table}), 0) + 1,
         false
       )`
    );
    log(`  ✓ ${schema}.${table} sequence reset to ${result.rows[0].setval}`);
  }
}

// ── Verification ───────────────────────────────────────────────────────────

async function verifyCounts(client) {
  log("Verifying row counts...");
  const tables = [
    { name: "categories", expected: loadJSON("categories.json").length },
    { name: "users", expected: loadJSON("users.json").length },
    { name: "products", expected: loadJSON("products.json").length },
    { name: "shifts", expected: loadJSON("shifts.json").length },
    { name: "sales", expected: loadJSON("sales.json").length },
    { name: "void_codes", expected: loadJSON("void_codes.json").length },
    { name: "admin_audit_log", expected: loadJSON("admin_audit_log.json").length },
  ];

  let allMatch = true;
  for (const { name, expected } of tables) {
    const res = await client.query(
      `SELECT COUNT(*)::int AS count FROM public.${name}`
    );
    const actual = res.rows[0].count;
    const match = actual === expected ? "✓" : "✗ MISMATCH";
    if (actual !== expected) allMatch = false;
    log(`  ${match} ${name}: expected=${expected}, actual=${actual}`);
  }
  return allMatch;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log("=== Coron Grill Diners POS — Data Recovery Migration ===");
  log(`Target: ${DIRECT_URL.replace(/\/\/.*@/, "//***@")}`);

  // Strip sslmode from URL — we set SSL config explicitly via pg options
  const cleanUrl = DIRECT_URL.replace(/[&?]sslmode=[^&]*/g, "");
  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    max: 1, // Single connection for transactional integrity
    statement_timeout: 300_000, // 5 min timeout per statement
    query_timeout: 300_000,
  });

  const client = await pool.connect();

  try {
    // Pre-flight: verify we can reach the database and tables exist
    log("Pre-flight check: verifying target tables exist...");
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('categories','users','products','shifts','sales','void_codes','admin_audit_log')
      ORDER BY table_name
    `);
    const existingTables = tableCheck.rows.map((r) => r.table_name);
    const required = ["admin_audit_log", "categories", "products", "sales", "shifts", "users", "void_codes"];
    const missing = required.filter((t) => !existingTables.includes(t));
    if (missing.length > 0) {
      throw new Error(`Missing tables in Supabase: ${missing.join(", ")}. Run schema migration first.`);
    }
    log(`  ✓ All ${required.length} target tables exist`);

    // Check if tables already have data
    for (const t of required) {
      const res = await client.query(`SELECT COUNT(*)::int AS c FROM public.${t}`);
      if (res.rows[0].c > 0) {
        log(`  ⚠ WARNING: public.${t} already has ${res.rows[0].c} rows. ON CONFLICT will upsert.`);
      }
    }

    // Begin single transaction
    log("BEGIN transaction...");
    await client.query("BEGIN");

    // Temporarily defer FK constraint checks within the transaction
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    const counts = {};

    // 1. Categories
    counts.categories = await importCategories(client);

    // 2. Users (public.users)
    counts.users = await importUsers(client);

    // 3. Products (depends on categories)
    counts.products = await importProducts(client);

    // 4. Shifts (depends on users)
    counts.shifts = await importShifts(client);

    // 5. Sales (depends on shifts)
    counts.sales = await importSales(client);

    // 6. Void Codes
    counts.void_codes = await importVoidCodes(client);

    // 7. Admin Audit Log
    counts.admin_audit_log = await importAdminAuditLog(client);

    // 8. Reset sequences
    await resetSequences(client);

    // Commit
    await client.query("COMMIT");
    log("COMMIT — transaction committed successfully!");

    // Post-commit verification
    const verified = await verifyCounts(client);
    if (!verified) {
      logError("⚠ Some row counts did not match! Review above.");
      process.exit(1);
    }

    log("=== Migration completed successfully! ===");
    log(`Summary: ${JSON.stringify(counts)}`);
  } catch (err) {
    logError("Migration FAILED — rolling back...", err);
    try {
      await client.query("ROLLBACK");
      log("ROLLBACK complete — no partial data was committed.");
    } catch (rbErr) {
      logError("ROLLBACK also failed!", rbErr);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  logError("Unhandled error:", err);
  process.exit(1);
});
