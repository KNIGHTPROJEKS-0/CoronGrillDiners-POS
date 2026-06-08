import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🔑 Seeding default staff accounts...');

    // Create Admin account
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO public.users (username, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ['admin', 'Administrator', adminPasswordHash, 'admin']
    );
    console.log('✅ Admin account created (username: admin, password: admin123)');

    // Create Cashier account
    const cashierPasswordHash = await bcrypt.hash('cashier123', 10);
    await client.query(
      `INSERT INTO public.users (username, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ['cashier', 'Cashier', cashierPasswordHash, 'staff']
    );
    console.log('✅ Cashier account created (username: cashier, password: cashier123)');

    console.log('\n🎉 Default accounts seeded successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('❌ Error seeding database:', err);
  process.exit(1);
});
