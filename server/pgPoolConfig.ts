import type { ConnectionOptions } from "tls";
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

function isCloudPostgresHost(connectionString: string): boolean {
  try {
    const h = new URL(connectionString).hostname;
    return (
      h.endsWith(".supabase.co") ||
      h.endsWith(".pooler.supabase.com") ||
      h.endsWith(".neon.tech")
    );
  } catch {
    return false;
  }
}

/** Parse postgres:// URL into discrete fields (avoids pg ignoring `family` when using connectionString). */
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

function sslOptionsFromUrl(
  connectionString: string
): boolean | ConnectionOptions {
  if (process.env.PG_SSL_ALLOW_UNSAFE === "1") {
    return { rejectUnauthorized: false };
  }
  try {
    const u = new URL(connectionString);
    const mode = u.searchParams.get("sslmode")?.toLowerCase();
    if (mode === "disable") {
      return false;
    }
    // Supabase pooler uses a certificate chain that Node does not
    // trust by default. Always disable rejectUnauthorized for
    // known Supabase hosts — the connection is still encrypted.
    if (
      u.hostname.endsWith(".supabase.co") ||
      u.hostname.endsWith(".pooler.supabase.com")
    ) {
      return { rejectUnauthorized: false };
    }
  } catch {
    /* fall through */
  }
  return { rejectUnauthorized: true };
}

/**
 * Shared pg Pool options for session store, Drizzle, and appDb.
 *
 * **IPv6 ETIMEDOUT (Supabase / Neon):** `pg` often ignores `family` when `connectionString`
 * is used, so Node still connects via IPv6. For cloud hosts we use discrete
 * `host` / `port` / credentials plus `family: 4` so the TCP stack resolves A records only.
 * The hostname is preserved (not replaced by an IP) so TLS servername verification still works.
 *
 * - `PG_USE_IPV4=0` disables `family: 4` for cloud hosts (rare).
 * - `PG_SSL_ALLOW_UNSAFE=1` sets `ssl: { rejectUnauthorized: false }` (dev only).
 */
export function getPgPoolConfig(overrides?: Partial<PoolConfig>): PoolConfig {
  const connectionString = assertDatabaseUrl();
  const cloud = isCloudPostgresHost(connectionString);
  const preferIpv4 =
    process.env.PG_USE_IPV4 === "1" ||
    (process.env.PG_USE_IPV4 !== "0" && cloud);

  const base = { ...overrides } as PoolConfig;

  const sslUnsafe = process.env.PG_SSL_ALLOW_UNSAFE === "1";
  const ssl = sslOptionsFromUrl(connectionString);

  // Discrete config: required so `family: 4` is honored (fixes ETIMEDOUT to IPv6).
  if (cloud && preferIpv4) {
    const p = parsePostgresUrl(connectionString);
    return {
      host: p.host,
      port: p.port,
      user: p.user,
      password: p.password,
      database: p.database,
      ssl,
      family: 4,
      ...base,
    } as PoolConfig;
  }

  if (sslUnsafe) {
    const p = parsePostgresUrl(connectionString);
    return {
      ...p,
      ssl: { rejectUnauthorized: false },
      ...(preferIpv4 ? { family: 4 } : {}),
      ...base,
    } as PoolConfig;
  }

  return {
    connectionString,
    ...(preferIpv4 ? { family: 4 } : {}),
    ...base,
  } as PoolConfig;
}
