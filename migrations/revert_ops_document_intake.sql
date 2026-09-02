-- Revert add_ops_document_intake.sql — the optional-KYC schema.
--
-- ⚠ DESTRUCTIVE. This DROPS columns. Unlike every other file in this folder it
-- is not additive and not idempotent in the "safe to re-run blindly" sense —
-- re-running is harmless only because IF EXISTS makes the drops no-ops.
--
-- ── Why ────────────────────────────────────────────────────────────────────
--
-- add_ops_document_intake.sql was applied alongside KYC_OPTIONAL, the flag
-- that let a personal signup skip its documents. That feature has been removed
-- from the code (commit "revert(kyc): drop optional KYC"): signup compels the
-- full, OCR-checked document set again, and a guest booking compels the same
-- set before an order can be placed. Nothing skips KYC anywhere.
--
-- These columns were the record-keeping for the skip. With the skip gone they
-- describe a state the application can no longer produce.
--
-- ── What this drops, and what it costs ─────────────────────────────────────
--
-- Verified against the database before writing this file:
--
--   itd_users.kyc_deferred_at        30 rows non-null
--   itd_users.kyc_verified_at         0 rows non-null
--   account_documents.uploaded_channel   every row still 'customer' (default)
--   account_documents.uploaded_by         0 rows non-null
--   account_documents.manual_review       0 rows non-null
--   account_documents.reviewed_by         0 rows non-null
--   account_documents.reviewed_at         0 rows non-null
--   account_documents.review_note         0 rows non-null
--
-- So the only populated column is kyc_deferred_at, and those 30 values were
-- not observed — they were written by that migration's own backfill, which
-- INFERRED deferral from "personal account holding no documents". No customer
-- action produced them and nothing has ever read them. Losing them loses no
-- fact anybody recorded.
--
-- No application code reads or writes any of these columns. Confirmed by
-- grep across client/, server/, shared/ and scripts/ — the only references
-- were in scripts/check-migrations.ts, which this change removes.
--
-- ── Order ──────────────────────────────────────────────────────────────────
--
-- Indexes and CHECK constraints are dropped by DROP COLUMN on their own; they
-- are named explicitly first so that a partially-applied original migration
-- still reverts cleanly, and so this file reads as the exact inverse.

-- ── account_documents ──────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.account_documents_awaiting_review_idx;
DROP INDEX IF EXISTS public.account_documents_uploaded_channel_idx;

ALTER TABLE public.account_documents
  DROP COLUMN IF EXISTS uploaded_channel,
  DROP COLUMN IF EXISTS uploaded_by,
  DROP COLUMN IF EXISTS manual_review,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS review_note;

-- ── itd_users ──────────────────────────────────────────────────────────────
ALTER TABLE public.itd_users
  DROP COLUMN IF EXISTS kyc_deferred_at,
  DROP COLUMN IF EXISTS kyc_verified_at;

-- ── Not touched ────────────────────────────────────────────────────────────
--
-- add_guest_orders.sql is a separate migration and stays. Guest booking is not
-- the skip: a guest verifies their phone and produces the same complete,
-- OCR-checked document set signup demands. What they skip is the account.
--
-- Everything the encryption and retention work added (add_document_access_log,
-- the ocr_* columns, field encryption) also stays — none of it belonged to
-- KYC_OPTIONAL.
