const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const raw = process.env.DATABASE_URL || "";
const url = new URL(raw);
const needsSsl =
  raw.includes("neon.tech") ||
  raw.includes("replit") ||
  url.searchParams.get("sslmode") === "require";
url.searchParams.delete("sslmode");
const pool = new Pool({
  connectionString: url.toString(),
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

async function setup() {
  const client = await pool.connect();
  try {
    console.log("=== Coron Grill Diners POS — Database Setup ===\n");

    // ── USERS ─────────────────────────────────────────────────────────────────
    console.log("Creating users table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('cashier', 'admin')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // ── CATEGORIES ────────────────────────────────────────────────────────────
    // id is a TEXT slug (e.g. "main-course") — must match products.category
    console.log("Creating categories table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // ── PRODUCTS ──────────────────────────────────────────────────────────────
    console.log("Creating products table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        price DECIMAL(10, 2) NOT NULL,
        category TEXT NOT NULL,
        image_url TEXT,
        description TEXT,
        available BOOLEAN DEFAULT true,
        stock INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    /* Migration: add stock column for DBs created before stock tracking.
       NULL = unlimited / not tracked. 0 = out of stock. >0 = exact count. */
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);

    // ── SALES ─────────────────────────────────────────────────────────────────
    console.log("Creating sales table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number TEXT NOT NULL UNIQUE,
        items JSONB NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        service_charge DECIMAL(10, 2) DEFAULT 0,
        grand_total DECIMAL(10, 2) NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'gcash', 'card')),
        amount_tendered DECIMAL(10, 2) DEFAULT 0,
        change_amount DECIMAL(10, 2) DEFAULT 0,
        server_name TEXT,
        created_by TEXT,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'void', 'cancelled')),
        void_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'`);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS void_reason TEXT`);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_percent SMALLINT DEFAULT 0`);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE`);
    await client.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_by TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_is_deleted ON sales(is_deleted)`);

    // ── SHIFTS ────────────────────────────────────────────────────────────────
    console.log("Creating shifts table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        cashier_id INTEGER NOT NULL REFERENCES users(id),
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
        discrepancy DECIMAL(10, 2),
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT
      )
    `);
    await client.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS notes TEXT`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shifts_cashier_id ON shifts(cashier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_shifts_archived ON shifts(archived)`);

    // ── ADMIN AUDIT LOG ───────────────────────────────────────────────────────
    console.log("Creating admin_audit_log table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
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
    await client.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC)`);

    // ── VOID CODES ────────────────────────────────────────────────────────────
    console.log("Creating void_codes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS void_codes (
        id         SERIAL PRIMARY KEY,
        code       VARCHAR(20) UNIQUE NOT NULL,
        used_by    VARCHAR(100),
        used_at    TIMESTAMPTZ,
        sale_id    VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log("Seeding void codes...");
    const voidCodes = [
      'CGD-V1-K7M2X1',
      'CGD-V2-P9N4Q8',
      'CGD-V3-R3F6Y5',
      'CGD-V4-H8J1V3',
      'CGD-V5-W5L9D7',
      'CGD-V6-B2T4E6',
      'CGD-V7-Z0C8G1',
      'CGD-V8-U6A3S9',
      'CGD-V9-M1X7N2',
      'CGD-V0-Q4R0H5',
    ];
    for (const code of voidCodes) {
      await client.query(
        `INSERT INTO void_codes (code) VALUES ($1) ON CONFLICT (code) DO NOTHING`,
        [code]
      );
    }
    console.log(`  ✓ ${voidCodes.length} void codes seeded`);

    console.log("All tables created.\n");

    // ── SEED USERS ────────────────────────────────────────────────────────────
    console.log("Seeding users...");
    const cashierHash = bcrypt.hashSync("cashier123", 10);
    const adminHash   = bcrypt.hashSync("admin123",   10);

    const users = [
      { username: "admin",    name: "Admin",     hash: adminHash,   role: "admin"   },
      { username: "cashier1", name: "Cashier 1", hash: cashierHash, role: "cashier" },
      { username: "cashier2", name: "Cashier 2", hash: cashierHash, role: "cashier" },
      { username: "cashier3", name: "Cashier 3", hash: cashierHash, role: "cashier" },
      { username: "cashier4", name: "Cashier 4", hash: cashierHash, role: "cashier" },
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (username, name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role`,
        [u.username, u.name, u.hash, u.role]
      );
      console.log(`  ✓ ${u.username} (${u.role})`);
    }

    // ── SEED CATEGORIES ───────────────────────────────────────────────────────
    // id = slug (must match product.category field for filtering to work)
    console.log("\nSeeding categories...");
    const categories = [
      { id: "main-course",              name: "Main Course",              order: 1  },
      { id: "appetizer",                name: "Appetizer",                order: 2  },
      { id: "pasta-noodles",            name: "Pasta & Noodles",          order: 3  },
      { id: "grill-diners-budget",      name: "Grill Diners Budget",      order: 4  },
      { id: "all-day-breakfast-silog",  name: "All Day Breakfast Silog",  order: 5  },
      { id: "combo-meals",              name: "Combo Meals",              order: 6  },
      { id: "special-set",              name: "Special Set",              order: 7  },
      { id: "snacks-burger-sub",        name: "Snacks, Burger & Sub",     order: 8  },
      { id: "american-breakfast",       name: "American Breakfast",       order: 9  },
      { id: "continental-breakfast",    name: "Continental Breakfast",    order: 10 },
      { id: "side-order",               name: "Side Order",               order: 11 },
      { id: "sizzlers",                 name: "Sizzlers",                 order: 12 },
      { id: "salads",                   name: "Salads",                   order: 13 },
      { id: "desserts",                 name: "Desserts",                 order: 14 },
      { id: "shakes",                   name: "Shakes",                   order: 15 },
      { id: "beers",                    name: "Beers",                    order: 16 },
      { id: "drinks",                   name: "Drinks",                   order: 17 },
      { id: "beer-buckets",             name: "Beer Buckets",             order: 18 },
    ];

    for (const c of categories) {
      await client.query(
        `INSERT INTO categories (id, name, display_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order`,
        [c.id, c.name, c.order]
      );
      console.log(`  ✓ ${c.name}`);
    }

    // ── SEED PRODUCTS (all 99 from app/data/products.tsx) ─────────────────────
    console.log("\nSeeding products...");
    const products = [
      // Main Course
      { name: "Beef Bulalo",             price: 390, category: "main-course",             image: "https://images.unsplash.com/photo-1623689048105-a17b1e1936b8?w=400&h=400&fit=crop" },
      { name: "Beef Caldereta",          price: 380, category: "main-course",             image: "https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=400&h=400&fit=crop" },
      { name: "Pork Pata Humba",         price: 365, category: "main-course",             image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop" },
      { name: "Pork Adobo",              price: 380, category: "main-course",             image: "https://images.unsplash.com/photo-1626509653291-18d9a934b9db?w=400&h=400&fit=crop" },
      { name: "Chicken Cordon Bleu",     price: 365, category: "main-course",             image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=400&fit=crop" },
      { name: "Crispy Chicken Curry",    price: 325, category: "main-course",             image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=400&fit=crop" },
      { name: "Shrimp Tempura",          price: 325, category: "main-course",             image: "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=400&h=400&fit=crop" },
      { name: "Chopsuey",                price: 310, category: "main-course",             image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=400&fit=crop" },
      { name: "Stir Fry Vegetable",      price: 280, category: "main-course",             image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop" },
      // Appetizer
      { name: "Sausage & Fries",                     price: 265, category: "appetizer",               image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop" },
      { name: "Pork Spring Roll (Lumpia Shanghai)",  price: 265, category: "appetizer",               image: "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&h=400&fit=crop" },
      { name: "Chicharon Bulaklak",                  price: 220, category: "appetizer",               image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop" },
      { name: "Chicken Dumplings Potsticker",        price: 225, category: "appetizer",               image: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400&h=400&fit=crop" },
      { name: "Calamares Frito",                     price: 260, category: "appetizer",               image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop" },
      { name: "Fish & Fries",                        price: 245, category: "appetizer",               image: "https://images.unsplash.com/photo-1579208030886-b1c5a7c1b59a?w=400&h=400&fit=crop" },
      { name: "French Fries",                        price: 180, category: "appetizer",               image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=400&fit=crop" },
      { name: "Bopis",                               price: 220, category: "appetizer",               image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop" },
      // Pasta & Noodles
      { name: "Bihon Guisado",           price: 250, category: "pasta-noodles",           image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400&h=400&fit=crop" },
      { name: "Pancit Bam-i",            price: 260, category: "pasta-noodles",           image: "https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=400&h=400&fit=crop" },
      { name: "Lomi (Good for 2-3 person)", price: 280, category: "pasta-noodles",        image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=400&fit=crop" },
      { name: "Seafood Marinara",        price: 385, category: "pasta-noodles",           image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400&h=400&fit=crop" },
      { name: "Chicken Alfredo",         price: 345, category: "pasta-noodles",           image: "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=400&h=400&fit=crop" },
      { name: "Spaghetti Meatballs",     price: 365, category: "pasta-noodles",           image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop" },
      // Grill Diners Budget
      { name: "Chicken Diners Inasal",   price: 149, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=400&fit=crop",  description: "Includes Rice, Soup & Drinks" },
      { name: "Spare Ribs Diners",       price: 169, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop",     description: "Includes Rice, Soup & Drinks" },
      { name: "Grilled Pork Liempo",     price: 179, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=400&fit=crop",  description: "Includes Rice, Soup & Drinks" },
      { name: "Salisbury Steak",         price: 189, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop",  description: "Includes Rice, Soup & Drinks" },
      { name: "Classic Chicken Wings",   price: 179, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1608039829572-9b5e13089a21?w=400&h=400&fit=crop",  description: "Includes Rice, Soup & Drinks" },
      { name: "Garlic Parmesan Wings",   price: 199, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400&h=400&fit=crop",  description: "Includes Rice, Soup & Drinks" },
      { name: "Buffalo Wings",           price: 199, category: "grill-diners-budget",     image: "https://images.unsplash.com/photo-1608039858788-667850f129f6?w=400&h=400&fit=crop",  description: "Includes Rice, Soup & Drinks" },
      // All Day Breakfast Silog
      { name: "Danggit Silog",           price: 159, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=400&h=400&fit=crop" },
      { name: "Bangus Silog",            price: 159, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop" },
      { name: "Crispy Chicken Silog",    price: 169, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop" },
      { name: "Chicken Ham Silog",       price: 159, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop" },
      { name: "Hotdog Silog",            price: 149, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1587536849024-daaa4a417b16?w=400&h=400&fit=crop" },
      { name: "Tocino Silog",            price: 169, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1432139509613-5c4255815697?w=400&h=400&fit=crop" },
      { name: "Longganisa Silog",        price: 169, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1528607929212-2636ec44253e?w=400&h=400&fit=crop" },
      { name: "Sisig Silog",             price: 179, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop" },
      { name: "Tapa Silog",              price: 179, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=400&fit=crop" },
      // Combo Meals
      { name: "Fried Chicken & Calamares",      price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=400&fit=crop",     description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Fried Chicken & Lumpia",         price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=400&fit=crop",   description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Fried Chicken & Sisig",          price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop",   description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Fried Chicken & Stir Fry Veggies", price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=400&fit=crop", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Pork Sisig & Lumpia",            price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop",   description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Pork Sisig & Calamares",         price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop",   description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Pork Sisig & Stir Fry Veggies",  price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop",   description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      // Special Set
      { name: "Set A: Salisbury & Fried Chicken", price: 265, category: "special-set", image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop" },
      { name: "Set B: Salisbury & Pork Sisig",    price: 265, category: "special-set", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop" },
      { name: "Set C: Salisbury & Spring Roll",   price: 265, category: "special-set", image: "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&h=400&fit=crop" },
      // Snacks, Burger & Sub
      { name: "Classic Cheese Burger",  price: 345, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop" },
      { name: "Crispy Chicken Burger",  price: 325, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&h=400&fit=crop" },
      { name: "Vegetable Burger",       price: 325, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&h=400&fit=crop" },
      { name: "Chicken Sandwich",       price: 285, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=400&fit=crop" },
      { name: "Tuna Melt Sandwich",     price: 295, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=400&fit=crop" },
      { name: "Grilled Cheese Sandwich",price: 320, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1528736235302-52922df5c122?w=400&h=400&fit=crop" },
      // American Breakfast
      { name: "American Breakfast",     price: 380, category: "american-breakfast",    image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&h=400&fit=crop", description: "Egg, Sausage or Bacon, Hashbrown, Pancake or Waffle, Butter & Syrup" },
      // Continental Breakfast
      { name: "Continental Breakfast",  price: 380, category: "continental-breakfast", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop", description: "Egg, Toast Bread or Waffle, Baked Beans, Sausage, Butter, Syrup or Jam" },
      // Side Order
      { name: "Seafood Fried Rice Platter", price: 230, category: "side-order", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop" },
      { name: "Java Rice",              price: 45,  category: "side-order", image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&h=400&fit=crop" },
      { name: "Java Rice Platter",      price: 180, category: "side-order", image: "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=400&h=400&fit=crop" },
      { name: "Plain Rice",             price: 25,  category: "side-order", image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop" },
      { name: "Plain Rice Platter",     price: 110, category: "side-order", image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&h=400&fit=crop" },
      { name: "Garlic Rice",            price: 35,  category: "side-order", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop" },
      { name: "Add on Egg",             price: 35,  category: "side-order", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop" },
      // Sizzlers
      { name: "Sizzling Mixed Seafood", price: 385, category: "sizzlers", image: "https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=400&h=400&fit=crop" },
      { name: "Sizzling Pork Sisig",    price: 290, category: "sizzlers", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop" },
      // Salads
      { name: "Chicken Caesar Salad",   price: 380, category: "salads", image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=400&fit=crop" },
      { name: "Grill Diners Salad",     price: 380, category: "salads", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop" },
      // Desserts
      { name: "Churros",                price: 180, category: "desserts", image: "https://images.unsplash.com/photo-1624371414361-e670edf4898a?w=400&h=400&fit=crop" },
      { name: "Leche Flan",             price: 160, category: "desserts", image: "https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?w=400&h=400&fit=crop" },
      { name: "Mais Con Yelo",          price: 220, category: "desserts", image: "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400&h=400&fit=crop" },
      // Shakes
      { name: "Mango Shake",                    price: 225, category: "shakes", image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&h=400&fit=crop" },
      { name: "Pineapple Shake",                price: 225, category: "shakes", image: "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop" },
      { name: "Watermelon Shake",               price: 225, category: "shakes", image: "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&h=400&fit=crop" },
      { name: "Banana Shake",                   price: 200, category: "shakes", image: "https://images.unsplash.com/photo-1553787499-6f9133242796?w=400&h=400&fit=crop" },
      { name: "Cucumber & Pineapple Shake",     price: 230, category: "shakes", image: "https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&h=400&fit=crop" },
      { name: "Oreo Shake",                     price: 230, category: "shakes", image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop" },
      { name: "Matcha Shake",                   price: 220, category: "shakes", image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=400&h=400&fit=crop" },
      { name: "Chocolate Shake",                price: 200, category: "shakes", image: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=400&h=400&fit=crop" },
      { name: "Strawberry Shake",               price: 200, category: "shakes", image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400&h=400&fit=crop" },
      { name: "Buko Juice",                     price: 100, category: "shakes", image: "https://images.unsplash.com/photo-1536657464919-892534f60d6e?w=400&h=400&fit=crop" },
      // Beers
      { name: "San Mig Light",          price: 120, category: "beers", image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop" },
      { name: "San Mig Pilsen",         price: 120, category: "beers", image: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop" },
      { name: "San Mig Apple",          price: 120, category: "beers", image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400&h=400&fit=crop" },
      { name: "Red Horse Stallion",     price: 120, category: "beers", image: "https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=400&h=400&fit=crop" },
      { name: "Smirnoff Mule",          price: 120, category: "beers", image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop" },
      { name: "Red Horse Litro",        price: 160, category: "beers", image: "https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=400&h=400&fit=crop" },
      // Drinks
      { name: "Mineral Water (500ml)",  price: 35,  category: "drinks", image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop" },
      { name: "Mineral Water (1 Liter)",price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1560023907-5f339617ea30?w=400&h=400&fit=crop" },
      { name: "Coke Zero",              price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop" },
      { name: "Sprite",                 price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&h=400&fit=crop" },
      { name: "Royal",                  price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=400&h=400&fit=crop" },
      { name: "Regular Coke",           price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=400&fit=crop" },
      { name: "Chilled Mango Juice",    price: 120, category: "drinks", image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&h=400&fit=crop" },
      { name: "Chilled Pineapple Juice",price: 120, category: "drinks", image: "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop" },
      // Beer Buckets
      { name: "San Mig Light Bucket",        price: 700, category: "beer-buckets", image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop", description: "w/ free Sizzling Bopis" },
      { name: "San Mig Pilsen Bucket",       price: 700, category: "beer-buckets", image: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop", description: "w/ free Sizzling Bopis" },
      { name: "San Mig Apple Bucket",        price: 700, category: "beer-buckets", image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400&h=400&fit=crop", description: "w/ free Sizzling Bopis" },
      { name: "Red Horse Stallion Bucket",   price: 700, category: "beer-buckets", image: "https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=400&h=400&fit=crop", description: "w/ free Sizzling Bopis" },
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO products (name, price, category, image_url, description, available)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (name) DO UPDATE
           SET price = EXCLUDED.price,
               category = EXCLUDED.category,
               image_url = EXCLUDED.image_url,
               description = EXCLUDED.description`,
        [p.name, p.price, p.category, p.image || null, p.description || null]
      );
    }
    console.log(`  ✓ ${products.length} products seeded`);

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    const [u, c, p] = await Promise.all([
      client.query("SELECT COUNT(*) FROM users"),
      client.query("SELECT COUNT(*) FROM categories"),
      client.query("SELECT COUNT(*) FROM products"),
    ]);
    console.log(`\nDatabase ready:`);
    console.log(`  Users:      ${u.rows[0].count}`);
    console.log(`  Categories: ${c.rows[0].count}`);
    console.log(`  Products:   ${p.rows[0].count}`);
    console.log("\n=== Setup complete ===");

  } catch (err) {
    console.error("Setup error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
