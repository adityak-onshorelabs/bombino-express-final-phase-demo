import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

function assertDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }
  // Matches the template in .env.example — "host" is not a real DNS name and causes getaddrinfo ENOTFOUND host
  if (parsed.hostname === "host") {
    throw new Error(
      'DATABASE_URL still uses the placeholder hostname "host". Set it to your real Postgres host (e.g. Neon, Supabase, or 127.0.0.1 for local Postgres), then restart the server.',
    );
  }
  return raw;
}

const pool = new Pool({ connectionString: assertDatabaseUrl() });

export const db = drizzle(pool, { schema });
