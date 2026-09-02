-- Ops document intake: documents that reach Bombino through the hub rather
-- than the app.
--
-- NOTE: this migration has been applied. The optional-KYC feature it was
-- written alongside (KYC_OPTIONAL, server/kycOptional.ts) has since been
-- removed — signup compels the full document set again — so itd_users
-- kyc_deferred_at and kyc_verified_at are vestigial: nothing writes them and
-- nothing reads them. They are left in place because dropping a column from
-- a live table buys nothing here. The account_documents intake columns below
-- are unaffected and still describe how a document arrives.
--
-- Additive only. No column is dropped, no existing row changes meaning, and
-- every statement is idempotent — safe to re-run.
--
-- Run AFTER add_account_categories_and_documents.sql and
-- add_kyc_ocr_verification.sql. Both tables and the ocr_* columns must exist.
--
-- Two things arrive together, because neither is useful alone:
--
--   1. itd_users records that an account opened under KYC_OPTIONAL with no
--      documents, and when it later finished. "Verified" itself stays DERIVED
--      from account_documents (shared/accountSpec.ts §verificationState) — a
--      stored copy would drift from the docket guard, and the two disagreeing
--      is a held parcel nobody can explain. These are dates, not a status.
--
--   2. account_documents learns who put a row there and who accepted it. Ops
--      uploading on a customer's behalf is a different act from a customer
--      uploading their own, and a document handed over at the hub is often one
--      OCR cannot read — a staff member looking at the physical Aadhaar is the
--      only thing that can clear it.

-- ── itd_users ──────────────────────────────────────────────────────────────
ALTER TABLE public.itd_users
  ADD COLUMN IF NOT EXISTS kyc_deferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_verified_at timestamptz;

COMMENT ON COLUMN public.itd_users.kyc_deferred_at IS
  'Set when a personal account is created under KYC_OPTIONAL=1 with no documents staged. NULL means the account produced its documents at signup, the way every account did before the flag. Not cleared when the documents later arrive — kyc_verified_at is what says they did.';
COMMENT ON COLUMN public.itd_users.kyc_verified_at IS
  'First moment the account satisfied verificationState(). Written once, by whichever upload completed the set — customer or ops — and never rewritten by a later replacement. Audit and queue ordering only: nothing gates on this column, because the documents remain the source of truth.';

-- ── account_documents ──────────────────────────────────────────────────────
ALTER TABLE public.account_documents
  ADD COLUMN IF NOT EXISTS uploaded_channel text NOT NULL DEFAULT 'customer'
    CHECK (uploaded_channel IN ('customer', 'ops', 'hub')),
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.itd_users(id),
  ADD COLUMN IF NOT EXISTS manual_review text
    CHECK (manual_review IN ('approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.itd_users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.account_documents.uploaded_channel IS
  'Where this row came from. customer — signup, the profile document centre, or the inline upload at booking. ops — a staff member acting for the customer from the ops console. hub — collected against a parcel that had already been picked up. Defaults to customer, which is what every pre-existing row is.';
COMMENT ON COLUMN public.account_documents.uploaded_by IS
  'The staff itd_users.id that uploaded on the customer''s behalf. NULL when the customer uploaded it themselves — the owner is already user_id.';
COMMENT ON COLUMN public.account_documents.manual_review IS
  'A human verdict on a document OCR could not clear. approved counts as verified alongside ocr_status = ''match''; rejected holds the account no matter what OCR said. NULL means no human has looked, which is the normal state of a clean automated pass.';
COMMENT ON COLUMN public.account_documents.reviewed_by IS
  'The staff itd_users.id that recorded manual_review. Set with reviewed_at, never on its own.';
COMMENT ON COLUMN public.account_documents.review_note IS
  'Why. Free text, shown in the ops console beside the verdict — a rejection the customer will be chased over needs a reason a second person can read.';

-- The ops review queue: documents that went in without a clean OCR read and
-- that no human has ruled on yet. Deliberately narrower than the existing
-- account_documents_ocr_unverified_idx, which still answers "what is
-- unverified"; this one answers "what is waiting for me".
CREATE INDEX IF NOT EXISTS account_documents_awaiting_review_idx
  ON public.account_documents (created_at DESC)
  WHERE ocr_status IS DISTINCT FROM 'match' AND manual_review IS NULL;

-- Everything that arrived through staff, newest first — the other half of the
-- console's view, and how an intake is traced back to who took it.
CREATE INDEX IF NOT EXISTS account_documents_uploaded_channel_idx
  ON public.account_documents (uploaded_channel, created_at DESC)
  WHERE uploaded_channel <> 'customer';

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Accounts that already exist owing every one of their documents can only be
-- accounts that skipped: nothing else could have been created without them.
-- created_at is the honest timestamp — it is when the deferral happened.
--
-- Only the all-or-nothing case is inferred. An account holding some of its
-- documents may have had an upload refused rather than skipped the step, and
-- guessing between those writes a fact into the audit trail that nobody
-- observed. Those stay NULL.
UPDATE public.itd_users u
   SET kyc_deferred_at = u.created_at
 WHERE u.kyc_deferred_at IS NULL
   AND u.role = 'customer'
   AND COALESCE(u.account_type, 'personal') = 'personal'
   AND NOT EXISTS (
     SELECT 1 FROM public.account_documents d WHERE d.user_id = u.id
   );

-- kyc_verified_at is NOT backfilled. Deciding it means evaluating the document
-- matrix — two slots for a personal account, up to six by category for a
-- company one — and that predicate lives in shared/accountSpec.ts, in one
-- place, on purpose. A second copy of it in SQL is the thing this schema is
-- trying not to have. Existing verified accounts keep NULL, which reads as
-- "verified before this column existed", not as "unverified".
