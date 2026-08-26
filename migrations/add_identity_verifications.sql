-- Aadhaar and PAN verified against the issuing authority, before any document
-- is uploaded (server/cashfreeIdentity.ts).
--
-- Additive only. Run AFTER add_account_categories_and_documents.sql — the
-- ownership model here is copied from account_documents and the FK needs
-- itd_users to exist.
--
-- A row is written only when an authority said yes. There is no "unverified
-- number" state, because unlike a document there is nothing to store: a
-- refused Aadhaar or PAN never reaches this table, and account creation
-- refuses to proceed without one row per required check.
--
-- Ownership works exactly as account_documents does: the row starts life
-- against an in-flight signup (signup_ref) and is claimed — user_id set,
-- signup_ref cleared — when the account is written.

CREATE TABLE IF NOT EXISTS public.identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.itd_users(id) ON DELETE CASCADE,
  signup_ref uuid,
  -- 'gstin' is here from the start so a fresh database needs this file alone.
  -- add_gstin_identity_kind.sql widens the same constraint for a database that
  -- already ran an earlier copy of this migration; on a fresh one it is a
  -- no-op. Either order works, and running both twice changes nothing.
  kind text NOT NULL CHECK (kind IN ('aadhaar', 'pan', 'gstin')),
  document_no text NOT NULL,
  status text NOT NULL CHECK (status IN ('verified', 'bypassed')),
  reference_id text,
  verified_name text,
  name_submitted text,
  name_match_result text,
  name_match_score numeric,
  details jsonb,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_verifications_owner_present
    CHECK (user_id IS NOT NULL OR signup_ref IS NOT NULL)
);

-- One verification per kind per owner; re-verifying replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS identity_verifications_user_kind_key
  ON public.identity_verifications (user_id, kind) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS identity_verifications_signup_kind_key
  ON public.identity_verifications (signup_ref, kind) WHERE signup_ref IS NOT NULL;

-- Sweeping abandoned signups reads this, same as the documents table.
CREATE INDEX IF NOT EXISTS identity_verifications_signup_ref_created_idx
  ON public.identity_verifications (signup_ref, created_at) WHERE signup_ref IS NOT NULL;

-- The ops queue: every account that opened on a number nobody checked.
CREATE INDEX IF NOT EXISTS identity_verifications_bypassed_idx
  ON public.identity_verifications (status, created_at DESC)
  WHERE status <> 'verified';

COMMENT ON TABLE public.identity_verifications IS
  'Aadhaar and PAN numbers confirmed with UIDAI / the Income Tax Department via Cashfree VRS, before the matching document is uploaded. Owned by user_id once the account exists; by signup_ref while the signup is in flight.';
COMMENT ON COLUMN public.identity_verifications.document_no IS
  'The number that was verified. Plaintext, consistent with account_documents.document_no and kyc_documents.document_no, which already hold the same Aadhaar. Encrypting one copy while two others sit in the clear would buy nothing — if this is ever addressed it has to be all three at once.';
COMMENT ON COLUMN public.identity_verifications.status IS
  'verified = an authority answered yes. bypassed = IDENTITY_BYPASS=1 and the check never ran; the number is unproven. Nothing else is ever written — a refused check leaves no row.';
COMMENT ON COLUMN public.identity_verifications.reference_id IS
  'Cashfree''s own id for the call (ref_id for Aadhaar, reference_id for PAN), for support tickets.';
COMMENT ON COLUMN public.identity_verifications.verified_name IS
  'The name the authority holds against the number: UIDAI''s for Aadhaar, the registered name for PAN. This is the authoritative spelling — the name typed on the signup form is not.';
COMMENT ON COLUMN public.identity_verifications.name_submitted IS
  'PAN only. The name the PAN was verified against — the account name as it stood at that moment. Account creation refuses to write an account whose name is not this one, so a PAN cannot be proved under one name and registered under another.';
COMMENT ON COLUMN public.identity_verifications.name_match_result IS
  'PAN only. DIRECT_MATCH through NO_MATCH, as graded by Cashfree against the account name. NO_MATCH is refused at signup, so only the accepted grades appear here; a POOR_PARTIAL_MATCH row is worth an ops look.';
COMMENT ON COLUMN public.identity_verifications.details IS
  'The vendor payload, minus photo_link. Holds dob/gender/address for Aadhaar and pan_status/aadhaar_seeding_status for PAN.';
