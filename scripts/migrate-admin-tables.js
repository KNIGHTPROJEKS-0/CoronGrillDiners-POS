const pg = require('pg');

const { Client } = pg;

const OLD_DB_URL = "postgresql://neondb_owner:npg_iMBFpn4lw1zc@ep-crimson-glitter-aq09rf2o.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";
const NEW_DB_URL = "postgresql://neondb_owner:npg_FRUmZdSnk69E@ep-lucky-term-aqpyv1tm-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

async function migrateAdminTables() {
  console.log('Starting admin tables migration...');
  console.log('Source: Old Neon database');
  console.log('Target: New Neon database');
  console.log('');

  const oldClient = new Client({ 
    connectionString: OLD_DB_URL,
    connectionTimeoutMillis: 30000,
    query_timeout: 60000
  });
  const newClient = new Client({ 
    connectionString: NEW_DB_URL,
    connectionTimeoutMillis: 30000,
    query_timeout: 60000
  });

  try {
    await oldClient.connect();
    console.log('✓ Connected to old database');
    
    await newClient.connect();
    console.log('✓ Connected to new database');
    console.log('');

    const TABLES = [
      'public.admin_audit_log',
      'public.void_codes',
    ];

    let totalMigratedRows = 0;
    const migrationResults = [];

    for (const table of TABLES) {
      console.log(`Processing table: ${table}`);
      
      try {
        const [schema, tableName] = table.split('.');
        
        // Get column names from old database
        const oldColumnsQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = $1 AND table_name = $2 
          ORDER BY ordinal_position
        `;
        
        const oldColumnsResult = await oldClient.query(oldColumnsQuery, [schema, tableName]);
        
        if (oldColumnsResult.rows.length === 0) {
          console.log(`  ⚠ Table ${table} has no columns or doesn't exist in old database, skipping`);
          continue;
        }

        const oldColumns = oldColumnsResult.rows.map(row => row.column_name);
        
        // Get column names from new database
        // Assume schema matches since we just pushed it, use old columns directly
        const commonColumns = oldColumns;
        const columnList = commonColumns.join(', ');
        
        // Get count of rows in old database
        const countQuery = `SELECT COUNT(*) as total FROM ${table}`;
        const countResult = await oldClient.query(countQuery);
        const totalRows = parseInt(countResult.rows[0].total);
        
        // Get count of rows already in new database
        const newCountQuery = `SELECT COUNT(*) as total FROM ${table}`;
        const newCountResult = await newClient.query(newCountQuery);
        const alreadyMigrated = parseInt(newCountResult.rows[0].total);
        
        console.log(`  Old database: ${totalRows} rows`);
        console.log(`  New database: ${alreadyMigrated} rows already migrated`);
        console.log(`  Need to migrate: ${totalRows - alreadyMigrated} rows`);
        
        if (alreadyMigrated >= totalRows) {
          console.log(`  ℹ All data already migrated, skipping`);
          migrationResults.push({ table, rows: 0, status: 'skipped', reason: 'already migrated' });
          continue;
        }

        // Insert data into new database using parameterized queries for safety
        let insertedCount = 0;
        const fetchBatchSize = 50; // Fetch in batches from old database
        const delayBetweenBatches = 200; // 200ms delay between batches
        
        // Fetch and insert data in batches from old database
        for (let offset = alreadyMigrated; offset < totalRows; offset += fetchBatchSize) {
          console.log(`  Fetching batch starting at offset ${offset} (rows ${offset + 1}-${Math.min(offset + fetchBatchSize, totalRows)})`);
          
          // Fetch batch from old database with LIMIT and OFFSET
          const dataQuery = `SELECT ${columnList} FROM ${table} ORDER BY id LIMIT ${fetchBatchSize} OFFSET ${offset}`;
          const dataResult = await oldClient.query(dataQuery);
          
          if (dataResult.rows.length === 0) {
            console.log(`  ℹ No more data to fetch`);
            break;
          }
          
          console.log(`  Inserting ${dataResult.rows.length} rows`);
          
          // Insert each row
          for (const row of dataResult.rows) {
            // Build values array with proper JSON handling
            const values = commonColumns.map(col => {
              const val = row[col];
              // Handle potential JSON data
              if (val !== null && typeof val === 'object') {
                return JSON.stringify(val);
              }
              return val;
            });

            const placeholders = commonColumns.map((col, index) => `$${index + 1}`).join(', ');
            
            const insertQuery = `
              INSERT INTO ${table} (${columnList}) 
              VALUES (${placeholders})
              ON CONFLICT DO NOTHING
            `;
            
            try {
              await newClient.query(insertQuery, values);
              insertedCount++;
            } catch (err) {
              console.error(`  ✗ Failed to insert row: ${err.message}`);
              // Continue with next row
            }
          }
          
          // Add delay between batches to let the old database connection breathe
          if (offset + fetchBatchSize < totalRows) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
          }
        }

        console.log(`  ✓ Migrated ${insertedCount} rows from ${totalRows - alreadyMigrated} needed`);
        migrationResults.push({ 
          table, 
          rows: insertedCount, 
          total: totalRows, 
          alreadyMigrated: alreadyMigrated,
          status: 'success'
        });
        totalMigratedRows += insertedCount;
        
      } catch (err) {
        console.error(`  ✗ Failed to migrate table ${table}: ${err.message}`);
        migrationResults.push({ table, error: err.message, status: 'failed' });
      }
    }

    console.log('');
    console.log('Migration Summary:');
    console.log(`Total rows migrated: ${totalMigratedRows}`);
    
    const failed = migrationResults.filter(r => r.status === 'failed');
    const skipped = migrationResults.filter(r => r.status === 'skipped');
    const success = migrationResults.filter(r => r.status === 'success');
    
    console.log(`Successful tables: ${success.length}`);
    console.log(`Skipped tables: ${skipped.length}`);
    console.log(`Failed tables: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log('');
      console.log('Failed tables:');
      failed.forEach(f => console.log(`  - ${f.table}: ${f.error}`));
    }

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await oldClient.end();
    await newClient.end();
    console.log('');
    console.log('Database connections closed');
  }
}

migrateAdminTables()
  .then(() => {
    console.log('');
    console.log('✓ Admin tables migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('✗ Migration failed:', error);
    process.exit(1);
  });
