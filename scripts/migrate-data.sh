#!/bin/bash

# Database Migration Script
# Migrates data from old Neon database to new Neon database

OLD_DB_URL="postgresql://neondb_owner:npg_iMBFpn4lw1zc@ep-crimson-glitter-aq09rf2o.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"
NEW_DB_URL="postgresql://neondb_owner:npg_FRUmZdSnk69E@ep-lucky-term-aqpyv1tm-pooler.c-8.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"

echo "Starting database migration..."
echo "Source: Old Neon database"
echo "Target: New Neon database"
echo ""

# Create backup directory
mkdir -p backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backups/data_migration_${TIMESTAMP}.sql"

echo "Exporting data from old database..."
pg_dump "$OLD_DB_URL" \
  --data-only \
  --disable-triggers \
  --exclude-table-data='auth.schema_migrations' \
  --exclude-table-data='auth.instances' \
  --format=plain \
  --no-owner \
  --no-acl \
  > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Data export completed: $BACKUP_FILE"
  echo "File size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
  echo "✗ Data export failed"
  exit 1
fi

echo ""
echo "Importing data to new database..."
psql "$NEW_DB_URL" < "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Data import completed successfully"
else
  echo "✗ Data import failed"
  exit 1
fi

echo ""
echo "Migration completed successfully!"
echo "Backup file: $BACKUP_FILE"
