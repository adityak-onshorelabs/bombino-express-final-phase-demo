/**
 * One-off: clear KYC documents left unowned by the claim bug.
 *
 * Before the fix in server/ordersDb.ts §claimGuestKycDocument, claiming a
 * guest's orders tried to move their kyc_documents row onto the new account
 * with a plain UPDATE. kyc_documents holds one row per user
 * (kyc_documents_user_id_key), and signup had already written one, so the
 * update lost to a unique violation, was logged, and the guest's row stayed
 * behind with user_id NULL — an encrypted Aadhaar owned by nobody.
 *
 * This finds those rows and only those: a guest KYC row whose orders have all
 * been claimed AND whose claiming account already holds its own KYC row, so
 * what is deleted is provably a duplicate. A row whose order is still
 * unclaimed belongs to a live guest booking and is left alone, as is one with
 * no order at all (an abandoned upload — a retention question, not this bug).
 *
 * Read-only unless --apply is passed.
 *
 *   npx tsx --env-file=.env scripts/cleanup-orphaned-guest-kyc.ts
 *   npx tsx --env-file=.env scripts/cleanup-orphaned-guest-kyc.ts --apply
 */
import pg from "pg";
import { getPgPoolConfig } from "../server/pgPoolConfig.js";

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

// A guest KYC row is orphaned when every order sharing its ref has been
// claimed. EXISTS/NOT EXISTS rather than a join, so a ref with several orders
// is judged as a whole.
const FIND = `
  SELECT k.id, k.guest_ref, k.created_at
    FROM public.kyc_documents k
   WHERE k.user_id IS NULL
     AND k.guest_ref IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.orders o WHERE o.guest_ref = k.guest_ref
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.orders o
        WHERE o.guest_ref = k.guest_ref AND o.user_id IS NULL
     )
     -- Never the only copy. The account that claimed these orders must already
     -- hold its own KYC row before this one is treated as a duplicate; without
     -- this clause a claim that failed for some other reason would look
     -- identical and the customer's only identity document would be deleted.
     AND EXISTS (
       SELECT 1
         FROM public.orders o
         JOIN public.kyc_documents k2 ON k2.user_id = o.user_id
        WHERE o.guest_ref = k.guest_ref
          AND o.user_id IS NOT NULL
     )
`;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const { pool, client } = await connect();

  try {
    const { rows } = await client.query<{ id: string; guest_ref: string; created_at: string }>(FIND);

    if (rows.length === 0) {
      console.log("\nNo orphaned guest KYC documents. Nothing to do.\n");
      return;
    }

    console.log(`\n${rows.length} orphaned guest KYC document(s):`);
    for (const r of rows) {
      console.log(`  id=${r.id}  guest_ref=${r.guest_ref}  uploaded=${r.created_at}`);
    }

    if (!apply) {
      console.log("\nDry run. Re-run with --apply to delete these rows.\n");
      return;
    }

    const { rowCount } = await client.query(
      `DELETE FROM public.kyc_documents WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)]
    );
    console.log(`\nDeleted ${rowCount} row(s).\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
