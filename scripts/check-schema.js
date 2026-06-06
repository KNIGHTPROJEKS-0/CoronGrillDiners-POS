const pg = require('pg');

const { Client } = pg;

const OLD_DB_URL = "postgresql://neondb_owner:npg_iMBFpn4lw1zc@ep-crimson-glitter-aq09rf2o.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function checkSchema() {
  const client = new Client({ connectionString: OLD_DB_URL });
  
  try {
    await client.connect();
    console.log('Connected to old database');
    console.log('');

    // Check sales table structure
    const salesColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'sales'
      ORDER BY ordinal_position
    `);
    
    console.log('Sales table columns in old database:');
    salesColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });

    console.log('');
    
    // Check shifts table structure
    const shiftsColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'shifts'
      ORDER BY ordinal_position
    `);
    
    console.log('Shifts table columns in old database:');
    shiftsColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });

    console.log('');
    
    // Check users table structure
    const usersColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('Users table columns in old database:');
    usersColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkSchema();
