/**
 * Read-only: report whether the onboarding, OCR and guest-booking migrations
 * are actually in the database, whether what is there matches what the code
 * expects, and whether the optional-KYC schema has been reverted.
 *
 *   npx tsx --env-file=.env scripts/check-migrations.ts
 *
 * Touches nothing. Written because "additive, IF NOT EXISTS" makes a migration
 * safe to re-run but says nothing about whether it ever ran, and the server
 * fails at the first INSERT if it did not.
 */

import pg from "pg";
import { getPgPoolConfig } from "../server/pgPoolConfig.js";

// Mirrors scripts/apply-migration.ts — same stale-pooler fallback.
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

const ITD_USER_COLUMNS = [
  "company_category",
  "contract_head",
  "group_code",
  "contact_person",
  "lut_no",
  "iec_branch_code",
  "bank_account_no",
  "bank_ad_code",
  "contract_signed_name",
  "contract_version",
  "contract_accepted_at",
  "contract_accepted_ip",
];

const OCR_COLUMNS = [
  "ocr_status",
  "ocr_verification_id",
  "ocr_reference_id",
  "ocr_document_fields",
  "ocr_quality_checks",
  "ocr_fraud_checks",
  "ocr_checked_at",
];

/**
 * add_guest_orders.sql — the tables that may be owned by a guest instead of an
 * account, and the column each one gains.
 */
const GUEST_OWNED_TABLES: Record<string, string[]> = {
  orders: ["guest_ref", "guest_name", "guest_email", "guest_phone"],
  addresses: ["guest_ref"],
  payments: ["guest_ref"],
  kyc_documents: ["guest_ref"],
};

const ACCOUNT_DOC_COLUMNS = [
  "id",
  "user_id",
  "signup_ref",
  "doc_slot",
  "document_no",
  "capability_id",
  "original_filename",
  "mime_type",
  "file_size_bytes",
  "file_data",
  "created_at",
  "updated_at",
];

const { pool, client } = await connect();
let problems = 0;

function report(label: string, ok: boolean, detail = ""): void {
  if (!ok) problems++;
  console.log(`${ok ? "  ok  " : " MISS "} ${label}${detail ? `  ${detail}` : ""}`);
}

async function columnsOf(table: string): Promise<Map<string, string>> {
  const { rows } = await client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

/** null when the column is not there at all, which the caller reports separately. */
async function isNullable(table: string, column: string): Promise<boolean | null> {
  const { rows } = await client.query<{ is_nullable: string }>(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  if (rows.length === 0) return null;
  return rows[0].is_nullable === "YES";
}

async function constraintExists(table: string, name: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = $1 AND con.conname = $2`,
    [table, name]
  );
  return rows.length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return rows.length > 0;
}

async function indexesOf(table: string): Promise<Set<string>> {
  const { rows } = await client.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.indexname));
}

try {
  console.log("\n── add_account_categories_and_documents.sql ──────────────────\n");

  const itdUsers = await columnsOf("itd_users");
  if (itdUsers.size === 0) {
    console.log("  itd_users does not exist — nothing else here can be right.");
    problems++;
  } else {
    for (const col of ITD_USER_COLUMNS) {
      report(`itd_users.${col}`, itdUsers.has(col), itdUsers.get(col) ?? "");
    }
  }

  const hasAccountDocs = await tableExists("account_documents");
  report("table account_documents", hasAccountDocs);

  if (hasAccountDocs) {
    const cols = await columnsOf("account_documents");
    for (const col of ACCOUNT_DOC_COLUMNS) {
      report(`account_documents.${col}`, cols.has(col), cols.get(col) ?? "");
    }

    // The FK only holds if both sides are the same type.
    const idType = itdUsers.get("id");
    const userIdType = cols.get("user_id");
    report(
      "account_documents.user_id type matches itd_users.id",
      !!idType && idType === userIdType,
      `${userIdType ?? "?"} vs ${idType ?? "?"}`
    );

    const idx = await indexesOf("account_documents");
    for (const name of [
      "account_documents_user_slot_key",
      "account_documents_signup_slot_key",
      "account_documents_capability_id_key",
      "account_documents_signup_ref_created_idx",
    ]) {
      report(`index ${name}`, idx.has(name));
    }
  }

  console.log("\n── add_kyc_ocr_verification.sql ──────────────────────────────\n");

  for (const table of ["account_documents", "kyc_documents"]) {
    if (!(await tableExists(table))) {
      report(`table ${table}`, false, "(cannot check its OCR columns)");
      continue;
    }
    const cols = await columnsOf(table);
    for (const col of OCR_COLUMNS) {
      report(`${table}.${col}`, cols.has(col), cols.get(col) ?? "");
    }
    const idx = await indexesOf(table);
    report(`index ${table}_ocr_unverified_idx`, idx.has(`${table}_ocr_unverified_idx`));
  }

  // The CHECK on ocr_status must admit exactly the non-blocking statuses the
  // server can write. A narrower list turns a legitimate upload into a 500.
  const { rows: checks } = await client.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'public.account_documents'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%ocr_status%'`
  );
  console.log("");
  if (checks.length === 0) {
    report("ocr_status CHECK constraint", false);
  } else {
    for (const c of checks) {
      // "bypassed" comes from add_kyc_ocr_verification.sql, which now creates
      // the CHECK with all five values. A database built before that was
      // widened by add_ocr_bypassed_status.sql, since removed. Without the
      // value, every upload made while OCR_BYPASS=1 fails the CHECK and 500s.
      const admitted = ["match", "unreadable", "unavailable", "skipped", "bypassed"];
      const ok = admitted.every((v) => c.def.includes(`'${v}'`));
      report("ocr_status CHECK admits every non-blocking status", ok, c.def);
    }
  }

  console.log("\n── revert_ops_document_intake.sql ─────────────────\n");

  // The optional-KYC schema, which must be GONE. KYC_OPTIONAL was removed
  // from the code and these columns were its record-keeping; one still here
  // means revert_ops_document_intake.sql has not been run, and the schema
  // still describes a state the application can no longer produce.
  if (itdUsers.size > 0) {
    for (const col of ["kyc_deferred_at", "kyc_verified_at"]) {
      report(`itd_users.${col} is gone`, !itdUsers.has(col));
    }
  }

  if (hasAccountDocs) {
    const docCols = await columnsOf("account_documents");
    for (const col of [
      "uploaded_channel",
      "uploaded_by",
      "manual_review",
      "reviewed_by",
      "reviewed_at",
      "review_note",
    ]) {
      report(`account_documents.${col} is gone`, !docCols.has(col));
    }
  }

  console.log("\n── add_guest_orders.sql ─────────────────────────────\n");

  for (const [table, guestCols] of Object.entries(GUEST_OWNED_TABLES)) {
    if (!(await tableExists(table))) {
      report(`table ${table}`, false, "(cannot check its guest columns)");
      continue;
    }
    const cols = await columnsOf(table);
    for (const col of guestCols) {
      report(`${table}.${col}`, cols.has(col), cols.get(col) ?? "");
    }

    // The whole point of the migration: an order, address, payment or KYC row
    // can exist without an account behind it. A user_id still marked NOT NULL
    // means every guest booking fails at the insert.
    const nullable = await isNullable(table, "user_id");
    report(`${table}.user_id is nullable`, nullable === true, nullable === null ? "(no such column)" : "");
  }

  // Nullable on both sides would let a row exist owned by nobody — no
  // consignor for a docket, and nobody to contact about a held parcel.
  for (const [table, name] of [
    ["orders", "orders_owner_present"],
    ["orders", "orders_guest_contact_present"],
    ["addresses", "addresses_owner_present"],
    ["payments", "payments_owner_present"],
    ["kyc_documents", "kyc_documents_owner_present"],
  ] as const) {
    report(`constraint ${name}`, await constraintExists(table, name));
  }

  for (const [table, name] of [
    ["orders", "orders_guest_phone_unclaimed_idx"],
    ["orders", "orders_guest_ref_idx"],
    ["addresses", "addresses_guest_ref_idx"],
    ["payments", "payments_guest_ref_idx"],
    ["kyc_documents", "kyc_documents_guest_ref_key"],
  ] as const) {
    const idx = await indexesOf(table);
    report(`index ${name}`, idx.has(name));
  }

  console.log(
    problems === 0
      ? "\nSchema matches the code: compulsory-KYC migrations applied, optional-KYC schema reverted.\n"
      : `\n${problems} item(s) wrong — a migration has not been applied, or revert_ops_document_intake.sql has not been run.\n`
  );
  process.exitCode = problems === 0 ? 0 : 1;
} finally {
  client.release();
  await pool.end();
}
