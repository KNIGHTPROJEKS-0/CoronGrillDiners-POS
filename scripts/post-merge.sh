#!/bin/bash
set -e

pnpm install --frozen-lockfile

# Run DB migration 005 — sales order status + shift archive/notes
node -e "
const { Pool } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL;
if (!url) { console.log('DATABASE_URL not set, skipping migration.'); process.exit(0); }

const urlObj = new URL(url);
const pool = new Pool({
  host: urlObj.hostname,
  database: urlObj.pathname.slice(1),
  user: decodeURIComponent(urlObj.username),
  password: decodeURIComponent(urlObj.password),
  port: parseInt(urlObj.port || '5432'),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  const sql = fs.readFileSync('scripts/005_shift_order_status.sql', 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Migration 005 applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('Migration 005 failed:', err.message); });
"
