/**
 * Apply one migration file to the database in DATABASE_URL.
 *
 * The files in migrations/ were being pasted into the Supabase SQL editor by
 * hand, which is fine until two people disagree about whether a file was
 * actually run. This runs one, inside a transaction, using the same pool
 * config the server uses — so if the app can reach the database, so can this.
 *
 * Usage:
 *   npx tsx scripts/apply-migration.ts migrations/<file>.sql
 *
 * WRITES DDL TO THE SHARED SUPABASE PROJECT. Per §4 of
 * docs/final-phase/markdowns/final-phase-modules.md: additive statements only,
 * one DDL owner per table, and announce before applying.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { getPgPoolConfig } from "../server/pgPoolConfig.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/apply-migration.ts migrations/<file>.sql");
  process.exit(1);
}

const resolved = path.resolve(file);
if (!fs.existsSync(resolved)) {
  console.error(`No such file: ${resolved}`);
  process.exit(1);
}

const sql = fs.readFileSync(resolved, "utf8");

/**
 * Connect, falling back to the project's direct host.
 *
 * DATABASE_URL currently points at `aws-0-ap-northeast-2.pooler.supabase.com`,
 * which answers `tenant/user … not found` — Supabase moved the project's
 * pooler hostname and the URL was never updated. The same credentials work
 * against `db.<ref>.supabase.co`, so rather than fail on a stale env var this
 * derives the direct host from the username (`postgres.<ref>`) and retries.
 *
 * This is a workaround, not a fix: the running server has the same stale URL
 * and silently falls back to an in-memory session store because of it.
 */
async function connect(): Promise<{ pool: pg.Pool; client: pg.PoolClient }> {
  const pool = new pg.Pool(getPgPoolConfig());
  try {
    return { pool, client: await pool.connect() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("tenant/user")) throw error;
    await pool.end().catch(() => {});

    const url = new URL(process.env.DATABASE_URL ?? "");
    const ref = url.username.split(".")[1];
    if (!ref) throw error;

    console.warn(
      `[apply-migration] pooler rejected the connection (${message.trim()});\n` +
        `  retrying against db.${ref}.supabase.co — update DATABASE_URL.`
    );
    const direct = new pg.Pool({
      host: `db.${ref}.supabase.co`,
      port: 5432,
      user: "postgres",
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, "") || "postgres",
      ssl: { rejectUnauthorized: false },
      family: 4,
    });
    return { pool: direct, client: await direct.connect() };
  }
}

const { pool, client } = await connect();

try {
  // One transaction, so a file that fails halfway leaves nothing behind.
  // Postgres is fine with DDL inside a transaction; this is not MySQL.
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`Applied ${path.basename(resolved)}`);
} catch (error) {
  await client.query("ROLLBACK");
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed, rolled back: ${message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
