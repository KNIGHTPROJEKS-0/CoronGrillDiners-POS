const pool = require('../lib/db').default;

async function createVoidCodesTable() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create void_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS void_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        used_by VARCHAR(255),
        used_at TIMESTAMPTZ,
        sale_id INTEGER REFERENCES public.sales(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Add indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_void_codes_code ON void_codes(code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_void_codes_used_at ON void_codes(used_at)`);
    
    await client.query('COMMIT');
    console.log('✓ void_codes table created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('✗ Failed to create void_codes table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createVoidCodesTable()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
