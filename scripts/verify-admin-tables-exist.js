const pg = require('pg');

const { Client } = pg;

const NEW_DB_URL = "postgresql://neondb_owner:npg_FRUmZdSnk69E@ep-lucky-term-aqpyv1tm-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

async function verifyTables() {
  const client = new Client({ connectionString: NEW_DB_URL });
  
  try {
    await client.connect();
    console.log('Connected to new Neon database');
    console.log('');

    // Check if admin_audit_log exists
    const adminAuditLogCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_audit_log'
      );
    `);
    console.log(`admin_audit_log table exists: ${adminAuditLogCheck.rows[0].exists}`);

    if (adminAuditLogCheck.rows[0].exists) {
      const count = await client.query('SELECT COUNT(*) as count FROM public.admin_audit_log');
      console.log(`admin_audit_log row count: ${count.rows[0].count}`);
    }

    // Check if void_codes exists
    const voidCodesCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'void_codes'
      );
    `);
    console.log(`void_codes table exists: ${voidCodesCheck.rows[0].exists}`);

    if (voidCodesCheck.rows[0].exists) {
      const count = await client.query('SELECT COUNT(*) as count FROM public.void_codes');
      console.log(`void_codes row count: ${count.rows[0].count}`);
    }

    // Try to insert a test record into admin_audit_log
    console.log('');
    console.log('Testing admin_audit_log insert...');
    try {
      await client.query(`
        INSERT INTO public.admin_audit_log (action, actor_id, actor_username, created_at)
        VALUES ('test_action', 1, 'test_user', NOW())
      `);
      console.log('✓ Test insert successful');
      await client.query('DELETE FROM public.admin_audit_log WHERE action = $1', ['test_action']);
      console.log('✓ Test cleanup successful');
    } catch (err) {
      console.error(`✗ Test insert failed: ${err.message}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

verifyTables();
