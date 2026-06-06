const pg = require('pg');

const { Client } = pg;

const NEW_DB_URL = "postgresql://neondb_owner:npg_FRUmZdSnk69E@ep-lucky-term-aqpyv1tm-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

async function verifyMigration() {
  const client = new Client({ connectionString: NEW_DB_URL });
  
  try {
    await client.connect();
    console.log('Connected to new Neon database');
    console.log('');

    // Verify users
    const usersResult = await client.query('SELECT COUNT(*) as count FROM public.users');
    console.log(`✓ Users: ${usersResult.rows[0].count} rows`);

    // Verify categories
    const categoriesResult = await client.query('SELECT COUNT(*) as count FROM public.categories');
    console.log(`✓ Categories: ${categoriesResult.rows[0].count} rows`);

    // Verify products
    const productsResult = await client.query('SELECT COUNT(*) as count FROM public.products');
    console.log(`✓ Products: ${productsResult.rows[0].count} rows`);

    // Verify sales
    const salesResult = await client.query('SELECT COUNT(*) as count FROM public.sales');
    console.log(`✓ Sales: ${salesResult.rows[0].count} rows`);

    // Verify shifts
    const shiftsResult = await client.query('SELECT COUNT(*) as count FROM public.shifts');
    console.log(`✓ Shifts: ${shiftsResult.rows[0].count} rows`);

    // Check for active shifts
    const activeShiftsResult = await client.query("SELECT id, cashier_name, status, start_time FROM public.shifts WHERE status = 'open'");
    console.log(`✓ Active shifts: ${activeShiftsResult.rows.length}`);
    if (activeShiftsResult.rows.length > 0) {
      activeShiftsResult.rows.forEach(shift => {
        console.log(`  - Shift #${shift.id}: ${shift.cashier_name} (started: ${shift.start_time})`);
      });
    }

    // Check recent sales
    const recentSalesResult = await client.query(`
      SELECT id, order_number, grand_total, payment_method, created_at 
      FROM public.sales 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    console.log(`✓ Recent sales (last 5):`);
    recentSalesResult.rows.forEach(sale => {
      console.log(`  - Order #${sale.order_number}: ₱${sale.grand_total} (${sale.payment_method}) at ${sale.created_at}`);
    });

    console.log('');
    console.log('✓ Migration verification completed successfully!');

  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await client.end();
  }
}

verifyMigration();
