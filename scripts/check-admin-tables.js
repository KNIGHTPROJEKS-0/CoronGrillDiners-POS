const pg = require('pg');

const { Client } = pg;

const OLD_DB_URL = "postgresql://neondb_owner:npg_iMBFpn4lw1zc@ep-crimson-glitter-aq09rf2o.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function checkAdminTables() {
  const client = new Client({ connectionString: OLD_DB_URL });
  
  try {
    await client.connect();
    console.log('Connected to old database');
    console.log('');

    // Get all tables in public schema
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    
    const tablesResult = await client.query(tablesQuery);
    console.log('All tables in public schema:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    console.log('');
    
    // Check for activity log related tables
    const activityTables = tablesResult.rows
      .filter(row => row.table_name.toLowerCase().includes('activity') || 
                      row.table_name.toLowerCase().includes('log') ||
                      row.table_name.toLowerCase().includes('audit'))
      .map(row => row.table_name);
    
    if (activityTables.length > 0) {
      console.log('Activity/Audit log related tables:');
      for (const table of activityTables) {
        console.log(`  Table: ${table}`);
        const columns = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        columns.rows.forEach(col => {
          console.log(`    ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        const count = await client.query(`SELECT COUNT(*) as count FROM public.${table}`);
        console.log(`    Row count: ${count.rows[0].count}`);
        console.log('');
      }
    }

    // Check for security related tables
    const securityTables = tablesResult.rows
      .filter(row => row.table_name.toLowerCase().includes('security') ||
                      row.table_name.toLowerCase().includes('history'))
      .map(row => row.table_name);
    
    if (securityTables.length > 0) {
      console.log('Security/History related tables:');
      for (const table of securityTables) {
        console.log(`  Table: ${table}`);
        const columns = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        columns.rows.forEach(col => {
          console.log(`    ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        const count = await client.query(`SELECT COUNT(*) as count FROM public.${table}`);
        console.log(`    Row count: ${count.rows[0].count}`);
        console.log('');
      }
    }

    // Check for void code related tables
    const voidTables = tablesResult.rows
      .filter(row => row.table_name.toLowerCase().includes('void'))
      .map(row => row.table_name);
    
    if (voidTables.length > 0) {
      console.log('Void code related tables:');
      for (const table of voidTables) {
        console.log(`  Table: ${table}`);
        const columns = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        columns.rows.forEach(col => {
          console.log(`    ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        const count = await client.query(`SELECT COUNT(*) as count FROM public.${table}`);
        console.log(`    Row count: ${count.rows[0].count}`);
        console.log('');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkAdminTables();
