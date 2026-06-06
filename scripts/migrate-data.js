const pg = require('pg');
const fs = require('fs');
const path = require('path');

const { Client } = pg;

// Database connection strings
const OLD_DB_URL = "postgresql://neondb_owner:npg_iMBFpn4lw1zc@ep-crimson-glitter-aq09rf2o.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";
const NEW_DB_URL = "postgresql://neondb_owner:npg_FRUmZdSnk69E@ep-lucky-term-aqpyv1tm-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

// Tables to migrate (in order to respect foreign keys)
const TABLES = [
  // Auth schema tables
  'auth.users',
  'auth.identities',
  'auth.sessions',
  'auth.refresh_tokens',
  'auth.mfa_factors',
  'auth.mfa_challenges',
  'auth.webauthn_credentials',
  'auth.webauthn_challenges',
  'auth.audit_log_entries',
  'auth.flow_state',
  'auth.one_time_tokens',
  'auth.oauth_clients',
  'auth.oauth_authorizations',
  'auth.oauth_consents',
  'auth.oauth_client_states',
  'auth.sso_providers',
  'auth.sso_domains',
  'auth.saml_providers',
  'auth.saml_relay_states',
  'auth.custom_oauth_providers',
  'auth.instances',
  'auth.mfa_amr_claims',
  // Public schema tables
  'public.users',
  'public.profiles',
  'public.categories',
  'public.products',
  'public.sales',
  'public.shifts',
];

async function migrateData() {
  console.log('Starting database migration...');
  console.log('Source: Old Neon database');
  console.log('Target: New Neon database');
  console.log('');

  const oldClient = new Client({ connectionString: OLD_DB_URL });
  const newClient = new Client({ connectionString: NEW_DB_URL });

  try {
    await oldClient.connect();
    console.log('✓ Connected to old database');
    
    await newClient.connect();
    console.log('✓ Connected to new database');
    console.log('');

    let totalRows = 0;
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
        const newColumnsResult = await newClient.query(oldColumnsQuery, [schema, tableName]);
        
        if (newColumnsResult.rows.length === 0) {
          console.log(`  ⚠ Table ${table} has no columns or doesn't exist in new database, skipping`);
          continue;
        }

        const newColumns = newColumnsResult.rows.map(row => row.column_name);
        
        // Find intersection of columns (only migrate columns that exist in both)
        const commonColumns = oldColumns.filter(col => newColumns.includes(col));
        
        if (commonColumns.length === 0) {
          console.log(`  ⚠ No common columns between old and new schema for ${table}, skipping`);
          migrationResults.push({ table, rows: 0, status: 'skipped', reason: 'no common columns' });
          continue;
        }

        const skippedColumns = oldColumns.filter(col => !newColumns.includes(col));
        if (skippedColumns.length > 0) {
          console.log(`  ℹ Skipping columns not in new schema: ${skippedColumns.join(', ')}`);
        }

        const columnList = commonColumns.join(', ');
        
        // Get all data from old database (only common columns)
        const dataQuery = `SELECT ${columnList} FROM ${table}`;
        const dataResult = await oldClient.query(dataQuery);
        
        if (dataResult.rows.length === 0) {
          console.log(`  ℹ Table ${table} is empty, skipping`);
          migrationResults.push({ table, rows: 0, status: 'skipped', reason: 'empty table' });
          continue;
        }

        // Clear existing data in new database (to avoid conflicts)
        await newClient.query(`DELETE FROM ${table}`);
        
        // Get column types once for the entire table to handle JSON properly
        const columnTypes = await newClient.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = $1 AND table_name = $2 
          AND column_name = ANY($3)
        `, [schema, tableName, commonColumns]);
        
        const typeMap = {};
        columnTypes.rows.forEach(col => {
          typeMap[col.column_name] = col.data_type;
        });
        
        // Insert data into new database using parameterized queries for safety
        let insertedCount = 0;
        for (const row of dataResult.rows) {
          // Build values array, handling JSON types specially
          const values = commonColumns.map(col => {
            const val = row[col];
            const dataType = typeMap[col];
            
            // For JSON columns, stringify objects before insertion
            if (dataType === 'json' || dataType === 'jsonb') {
              if (val === null) return null;
              // If it's an object or array, stringify it
              if (typeof val === 'object') return JSON.stringify(val);
              // If it's a string, try to parse and re-stringify to ensure valid JSON
              if (typeof val === 'string') {
                try {
                  const parsed = JSON.parse(val);
                  return JSON.stringify(parsed);
                } catch {
                  // If parsing fails, return as-is (might already be valid JSON string)
                  return val;
                }
              }
              return val;
            }
            return val;
          });

          const placeholders = commonColumns.map((col, index) => `$${index + 1}`).join(', ');
          
          const insertQuery = `
            INSERT INTO ${table} (${columnList}) 
            VALUES (${placeholders})
          `;
          
          try {
            await newClient.query(insertQuery, values);
            insertedCount++;
          } catch (err) {
            console.error(`  ✗ Failed to insert row: ${err.message}`);
            // Continue with next row
          }
        }

        console.log(`  ✓ Migrated ${insertedCount} rows from ${dataResult.rows.length} total`);
        migrationResults.push({ 
          table, 
          rows: insertedCount, 
          total: dataResult.rows.length, 
          status: 'success',
          skippedColumns: skippedColumns.length > 0 ? skippedColumns : undefined
        });
        totalRows += insertedCount;
        
      } catch (err) {
        console.error(`  ✗ Failed to migrate table ${table}: ${err.message}`);
        migrationResults.push({ table, error: err.message, status: 'failed' });
      }
    }

    console.log('');
    console.log('Migration Summary:');
    console.log(`Total rows migrated: ${totalRows}`);
    
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

    // Save migration report
    const reportPath = path.join(__dirname, '..', 'backups', `migration-report-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalRows,
      results: migrationResults
    }, null, 2));
    console.log(`Migration report saved to: ${reportPath}`);

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

migrateData()
  .then(() => {
    console.log('');
    console.log('✓ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('✗ Migration failed:', error);
    process.exit(1);
  });
