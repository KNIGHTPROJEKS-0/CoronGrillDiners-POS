import { Pool, type PoolConfig } from "pg"

function buildPoolConfig(): PoolConfig {
  const pgHost = process.env.PGHOST
  const pgUser = process.env.PGUSER
  const pgPassword = process.env.PGPASSWORD
  const pgDatabase = process.env.PGDATABASE
  const pgPort = process.env.PGPORT

  // If Replit's individual PG* vars are present and point to the internal
  // Helium host, use them directly. This avoids any stale DATABASE_URL
  // that may still be set in the process environment from a previous session.
  if (pgHost && pgHost !== "localhost" && pgUser && pgPassword && pgDatabase) {
    // "helium" is Replit's internal dev-environment host — no SSL.
    // Any external hostname (Neon, etc.) requires SSL in deployed environments.
    const noSslHosts = ["helium", "127.0.0.1"]
    const needsSsl = !noSslHosts.includes(pgHost) && !pgHost.endsWith(".local")
    return {
      host: pgHost,
      port: pgPort ? parseInt(pgPort, 10) : 5432,
      user: pgUser,
      password: pgPassword,
      database: pgDatabase,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }
  }

  const raw = process.env.DATABASE_URL ?? ""
  if (!raw) throw new Error("DATABASE_URL is not set and PG* vars are unavailable")

  // Supabase pooler URLs use usernames with dots (postgres.PROJECT_REF) which
  // pg v8 misreads as hostnames. Parse explicitly when targeting Supabase.
  if (raw.includes("supabase.com") || raw.includes("pooler.supabase.com")) {
    try {
      const url = new URL(raw)
      return {
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 5432,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ""),
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      }
    } catch {
      return { connectionString: raw, ssl: { rejectUnauthorized: false } }
    }
  }

  // Neon / standard Postgres via connection string.
  // Strip sslmode so pg honors our explicit ssl config instead of libpq verify-full.
  try {
    const url = new URL(raw)
    const sslmode = url.searchParams.get("sslmode")
    const needsSsl =
      raw.includes("neon.tech") ||
      sslmode === "require" ||
      sslmode === "prefer"
    url.searchParams.delete("sslmode")
    return {
      connectionString: url.toString(),
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }
  } catch {
    return { connectionString: raw, ssl: { rejectUnauthorized: false } }
  }
}

const pool = new Pool(buildPoolConfig())

export default pool
