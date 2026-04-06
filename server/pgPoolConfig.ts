import type { PoolConfig } from "pg";

/**
 * Validates DATABASE_URL and returns trimmed connection string.
 * Rejects the template hostname "host" from .env.example.
 */
export function assertDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }
  if (parsed.hostname === "host") {
    throw new Error(
      'DATABASE_URL still uses the placeholder hostname "host". Set it to your real Postgres host (e.g. Neon, Supabase, or 127.0.0.1 for local Postgres), then restart the server.',
    );
  }
  return raw;
}

function isSupabaseDbHost(connectionString: string): boolean {
  try {
    const h = new URL(connectionString).hostname;
    return h.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/** Parse postgres:// URL into discrete fields (avoids pg + connectionString ssl merge bugs). */
function parsePostgresUrl(connectionString: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const u = new URL(connectionString);
  const database = u.pathname.replace(/^\//, "") || "postgres";
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
  };
}

/**
 * Shared pg Pool options for session store, Drizzle, and appDb.
 * - Trims DATABASE_URL (avoids hidden newline/space bugs).
 * - Supabase `db.*.supabase.co` often resolves only to IPv6 (AAAA). Node + some
 *   networks then fail with getaddrinfo ENOTFOUND unless we prefer IPv4 (A records).
 *   Default: use IPv4 for *.supabase.co unless PG_USE_IPV4=0.
 * - PG_SSL_ALLOW_UNSAFE=1: use discrete host/user/password + ssl (node-pg applies
 *   `ssl` incorrectly when mixed with `connectionString` on some setups).
 */
export function getPgPoolConfig(overrides?: Partial<PoolConfig>): PoolConfig {
  const connectionString = assertDatabaseUrl();
  const preferIpv4 =
    process.env.PG_USE_IPV4 === "1" ||
    (process.env.PG_USE_IPV4 !== "0" && isSupabaseDbHost(connectionString));
  const sslUnsafe = process.env.PG_SSL_ALLOW_UNSAFE === "1";

  const common = {
    ...overrides,
    ...(preferIpv4 ? { family: 4 } : {}),
  } as PoolConfig;

  if (sslUnsafe) {
    const p = parsePostgresUrl(connectionString);
    return {
      ...p,
      ssl: { rejectUnauthorized: false },
      ...common,
    } as PoolConfig;
  }

  return {
    connectionString,
    ...common,
  } as PoolConfig;
}
