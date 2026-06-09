import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create void_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS void_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        used_by VARCHAR(255),
        used_at TIMESTAMPTZ,
        sale_id UUID REFERENCES public.sales(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_void_codes_code ON void_codes(code)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_void_codes_used_at ON void_codes(used_at)`,
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "void_codes table created successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create void_codes table:", error);
    return NextResponse.json(
      { error: "Failed to create void_codes table", details: String(error) },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
