# Schema state — what has actually been applied

Verified against the **live Supabase database on 10 Aug 2026**, not read off the
migration folder. Every ✅ below is backed by a column, a table, or a stored
value that exists right now.

**How it was checked:** Supabase REST with the service-role key — the OpenAPI
root (`GET /rest/v1/`) for the table and column list, plus per-column probes and
distinct-value reads for the CHECK-constraint widenings. Direct `psql`/`pg`
verification was **not possible**: `DATABASE_URL` currently fails auth against
the pooler with `FATAL: tenant/user postgres.<ref> not found`. That is a
separate problem worth fixing — see §5.

**Consequence of that limitation:** REST exposes tables and columns, never
`pg_indexes` or `pg_constraint`. So **index-only and FK-only migrations cannot
be confirmed from here** and are marked ⚠️ rather than ✅ or ❌.

**Later the same day:** `payments_gateway_reference.sql` was applied by Aditya,
after the probe above ran. It is index-only, so it falls squarely into the gap
just described — it is marked applied on his word, not on a reading. Run the
query in §5 once `DATABASE_URL` works to close that out.

---

## 1. The Supabase table editor, annotated

All 17 tables in `public`, in the order the table editor lists them. "This
phase" means the final-phase work (orders / agent / payments / KYC / auth),
not the original Phase-1 app.

| Table | Status | What this phase did to it | Rows (10 Aug) |
|---|---|---|---|
| `addresses` | untouched | Pre-existing. Orders reference it via `origin_address_id`; no DDL change | 55 |
| `agent_availability` | 🆕 **new**, then **dead** | Created for per-date agent slots, then superseded by `agent_weekly_availability`. **Nothing reads it.** Safe to drop after the phase — the 13 rows are stale | 13 |
| `agent_weekly_availability` | 🆕 **new** | Recurring weekly agent pattern (`day_of_week` + `slot`). Drives which pickup windows customers are offered. Emptied and re-seeded when slots moved to 2-hour windows | 42 |
| `audit_log` | untouched | Pre-existing | — |
| `documents` | untouched | Pre-existing shipment documents. **Not** the KYC table | — |
| `itd_users` | ✏️ **modified** | += `phone`, `account_type`, `company_name`, `gstin`, `metadata`. Unique index on `phone`. Now also the agent/admin identity table via `role` | 25 |
| `kyc_documents` | 🆕 **new**, then ✏️ **modified** | Created for booking KYC (base64 in `file_data`), then bound to a user: += `user_id` (FK, NOT NULL), `capability_id` (NOT NULL), `updated_at`, one document per user | 4 |
| `notifications` | untouched | Pre-existing. Written by the order-status fan-out, no DDL change | — |
| `order_events` | 🆕 **new** | Insert-only lifecycle log. Every module writes it; nobody owns it | 59 |
| `orders` | 🆕 **new** | The centre of the phase. 23 columns, column-partitioned between booking (A3) and fulfilment (M2/M3/M5/A5). `pickup_slot` CHECK later widened to accept both 2-hour and legacy 3-hour windows | 12 |
| `otp_codes` | 🆕 **new** | Phone-first auth. `purpose` CHECK widened twice — `login`, then `auth` | 137 |
| `payments` | 🆕 **new**, then ✏️ **modified** ×2 | Money collected against an order. Later += `collection_mode` (upi/cash) and `txn_id` (`TXN-YYYYMMDD-NNNN`, IST, global counter). Then, for Razorpay: a partial unique index on `reference` for `pay_now` rows, making the verify call and the webhook idempotent against each other. **COD never produces a row here** — it is a flag on the order, so an empty list is not the same as unpaid | 6 |
| `rate_searches` | untouched | Pre-existing | — |
| `session` | untouched | `connect-pg-simple` store. Not ours | — |
| `shipments` | ✏️ **modified** | Pre-existing post-docket shipment. += `last_tracked_at` only | 48 |
| `support_sessions` | untouched | Pre-existing | — |
| `tracking_events` | ✏️ **modified** | **Pre-existed** (it carries `shipment_id`, which our migration never declared — the `CREATE TABLE IF NOT EXISTS` was a no-op). What the migration actually contributed is the unique `(awb_number, event_at)` index that makes tracking upserts idempotent | 34,089 |

Quick read for the table editor: **7 tables are new this phase** —
`orders`, `order_events`, `payments`, `otp_codes`, `kyc_documents`,
`agent_weekly_availability`, `agent_availability` (dead). **3 were modified** —
`itd_users`, `shipments`, `tracking_events`. The remaining 7 are untouched
Phase-1 tables.

One vocabulary change with no DDL behind it: `payments.status = 'refunded'` and
`orders.payment_status = 'refund_due'` were legal values that nothing could
produce until 10 Aug. The `refund.processed` webhook now writes both. Refunds
are still never *issued* by the app — accounts moves the money by hand and this
only records it.

---

## 2. Column-level inventory

### 2.1 New tables (7)

| Table | Columns | Rows |
|---|---|---|
| `orders` | `id`, `order_no`, `user_id`, `pickup_request`, `pickup_date`, `pickup_slot`, `origin_address_id`, `consignee`, `items`, `booked_weight`, `quoted_amount`, `payment_method`, `payment_status`, `is_cod`, `status`, `agent_id`, `actual_weight`, `final_amount`, `awb_no`, `itd_docket_response`, `metadata`, `created_at`, `updated_at` | 12 |
| `order_events` | `id`, `order_id`, `status`, `note`, `actor_user_id`, `metadata`, `created_at` | 59 |
| `payments` | `id`, `order_id`, `user_id`, `amount`, `currency`, `method`, `status`, `collected_by`, `collected_at`, `reference`, `metadata`, `created_at`, `updated_at`, `collection_mode`, `txn_id` | 6 |
| `otp_codes` | `id`, `phone`, `code_hash`, `purpose`, `attempts`, `consumed_at`, `expires_at`, `created_at` | 137 |
| `kyc_documents` | `id`, `document_type`, `document_no`, `original_filename`, `mime_type`, `file_size_bytes`, `file_data`, `created_at`, `user_id`, `capability_id`, `updated_at` | 4 |
| `agent_weekly_availability` | `id`, `agent_id`, `day_of_week`, `slot`, `created_at` | 42 |
| `agent_availability` | `id`, `agent_id`, `date`, `slot`, `created_at` — **dead, nothing reads it** | 13 |

### 2.2 Pre-existing tables, columns added (3)

**`itd_users`** — 5 columns:

| Column | Type / rule |
|---|---|
| `phone` | text · unique index `itd_users_phone_key` where not null |
| `account_type` | text · NOT NULL default `personal` · CHECK `personal`\|`company` |
| `company_name` | text |
| `gstin` | text |
| `metadata` | jsonb — escape hatch; company signup writes ITD registration data here |

**`shipments`** — 1 column:

| Column | Type / rule |
|---|---|
| `last_tracked_at` | timestamptz |

**`tracking_events`** — **0 columns.** The table pre-existed (it carries
`shipment_id`, which our migration never declared, so the `CREATE TABLE IF NOT
EXISTS` did nothing). The only real change is the unique index on
`(awb_number, event_at)`, which is what makes tracking upserts idempotent.

### 2.3 New tables that were themselves altered later (2)

Both were created and then extended inside this same phase, so the migration
folder shows two files per table:

**`payments`** — `create_payments.sql`, then
`payments_collection_mode_and_txn_id.sql`, then
`payments_gateway_reference.sql` (index only, no column):

| Column | Type / rule |
|---|---|
| `collection_mode` | text · CHECK `upi`\|`cash` · **null for gateway payments** — nobody collects those by hand |
| `txn_id` | text · DEFAULT-generated `TXN-YYYYMMDD-NNNN` (IST date, global counter) · unique where not null |

**`kyc_documents`** — `create_kyc_documents.sql`, then
`kyc_persist_foundation.sql`:

| Column | Type / rule |
|---|---|
| `user_id` | uuid · FK → `itd_users` · NOT NULL · unique (one document per user) |
| `capability_id` | uuid · NOT NULL · unique · stable id in the serve URL, never rotated |
| `updated_at` | timestamptz · NOT NULL default `now()` |

### 2.4 Changed in place — no new column (3)

| Target | Change |
|---|---|
| `orders.pickup_slot` | CHECK dropped and rebuilt to accept the 2-hour windows **plus** the legacy 3-hour ones, so bookings made before the change stay valid |
| `otp_codes.purpose` | CHECK widened twice — `+login`, then `+auth`. Now `signup_personal` \| `signup_company` \| `login` \| `auth` |
| `payments.reference` | Partial unique index `payments_gateway_reference_key` — `ON (reference) WHERE method = 'pay_now' AND reference IS NOT NULL`. Scoped that way because `reference` means two things in this table: a Razorpay payment id on a `pay_now` row, a hand-written receipt number on a cash row — and receipt books are not globally unique. Applied 10 Aug |

**Not DDL, but it lives in the same columns:** the Razorpay work writes two
JSON shapes that no migration declares, because both sit inside existing `jsonb`
escape hatches. Worth knowing before reading rows in the table editor:

| Location | Shape | Written by |
|---|---|---|
| `orders.metadata.razorpay_order_id` / `.razorpay_order_ids[]` | the gateway orders opened for this order, newest last (capped at 10) | `POST /api/payments/razorpay/order` |
| `orders.metadata.last_payment_failure` / `.last_refund_failure` | `{ reason, at, … }` — latest attempt only, overwritten | webhook + verify |
| `payments.metadata.refunds[]` / `.amount_refunded` | one note per processed refund, plus a running total. `payments.amount` deliberately stays at what was collected | `refund.processed` webhook |

### 2.5 Untouched (7)

`addresses` · `audit_log` · `documents` · `notifications` · `rate_searches` ·
`session` · `support_sessions`

---

## 3. Migration ledger

In dependency order, not filename order.

| # | Migration | Change | Applied |
|---|---|---|---|
| 1 | `add_signup_accounts.sql` | `itd_users` += `phone`, `account_type` (CHECK personal/company), `company_name`, `gstin`; unique `itd_users_phone_key`; new table `otp_codes` | ✅ columns present, `otp_codes` populated |
| 2 | `add_otp_login_purpose.sql` | Widens `otp_codes.purpose` CHECK → `login` | ✅ rows with `purpose='login'` exist |
| 3 | `add_auth_otp_purpose.sql` | Widens it again → `auth` | ✅ rows with `purpose='auth'` exist |
| 4 | `add_itd_users_metadata.sql` | `itd_users.metadata jsonb` | ✅ column present |
| 5 | `create_kyc_documents.sql` | New table `kyc_documents` | ✅ 4 rows |
| 6 | `kyc_persist_foundation.sql` | `kyc_documents` += `user_id`, `capability_id`, `updated_at`; two unique indexes | ✅ all three columns present |
| 7 | `create_orders_and_order_events.sql` | Sequence `orders_order_no_seq`; new tables `orders` + `order_events`; three indexes | ✅ both tables populated |
| 8 | `create_payments.sql` | New table `payments` | ✅ 6 rows |
| 9 | `payments_collection_mode_and_txn_id.sql` | Sequence `payments_txn_seq`; `payments` += `collection_mode`, `txn_id` (DEFAULT-generated); unique `payments_txn_id_key`; index `payments_collected_by_idx` | ✅ live values `TXN-20260804-0001…0004`, modes `upi` and `cash` |
| 10 | `create_agent_availability.sql` | New table `agent_availability` | ✅ applied — then deprecated, see §1 |
| 11 | `create_agent_weekly_availability.sql` | New table `agent_weekly_availability` | ✅ 42 rows |
| 12 | `pickup_slots_two_hour_windows.sql` | Rebuilds `pickup_slot` CHECK on `orders` (2-hour **and** legacy 3-hour); deletes all weekly-availability rows; rebuilds its slot CHECK to 2-hour only | ✅ weekly slots are all 2-hour; `orders` holds a deliberate mix (`09:00-12:00` legacy alongside `11:00-13:00`) |
| 13 | `tracking_events_and_shipments_last_tracked.sql` | Unique `(awb_number, event_at)` on `tracking_events`; `shipments.last_tracked_at` | ✅ column present, 34k tracking rows. Index itself unverifiable — see §4 |
| 14 | `agent_pickup_indexes.sql` | `orders_agent_id_idx`; partial `orders_available_pickups_idx`; FK `orders_agent_id_fkey` | ❌ **not applied** |
| 15 | `payments_gateway_reference.sql` | Partial unique `payments_gateway_reference_key` on `reference WHERE method = 'pay_now'` | ✅ **applied 10 Aug** (reported by Aditya; index-level, so not re-readable over REST — see §5) |

---

## 4. Outstanding

**`agent_pickup_indexes.sql` — performance and referential integrity only.**
Nothing functional depends on it; the agent queue works without it. It touches
Arbaaz's column, which is why it has been left.

**Unverifiable from here (⚠️, not a finding):** every index and constraint in
migrations 1, 6, 7, 9, 13. The columns those migrations added are confirmed, so
the migrations clearly ran — but whether an individual `CREATE INDEX` inside
them succeeded cannot be read over REST.

---

## 5. Re-verifying this document

Fix `DATABASE_URL` first — the credentials in `.env` are rejected by the
Supabase pooler (`tenant/user postgres.<ref> not found`), which is why this
document has ⚠️ rows at all. Most likely a rotated database password or a
stale project ref; the `SUPABASE_URL` + service-role key in the same file work
fine, so it is the Postgres credential specifically.

With a working connection, one query answers everything REST could not:

```sql
SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'
UNION ALL
SELECT rel.relname, con.conname
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public' AND con.contype IN ('c', 'f')
ORDER BY 1, 2;
```

Until then, `open-items.md` §3 is the intent log and this file is the evidence
log. Where they disagree, this one was measured.
