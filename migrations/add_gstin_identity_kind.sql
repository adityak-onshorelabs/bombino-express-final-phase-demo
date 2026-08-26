-- GSTIN joins Aadhaar and PAN as a verified identity number.
--
-- Additive only. Run AFTER add_identity_verifications.sql.
--
-- The GST portal lookup (server/cashfreeIdentity.ts, verifyGstin) confirms the
-- number and returns the registered business, exactly as the PAN lookup does.
-- The certificate uploaded afterwards is then read for the same number — by
-- server/gstCertificate.ts rather than by Cashfree Smart OCR, which has no GST
-- document type at all. The verdicts and the account gate are the same either
-- way, so the row shape does not change: only the set of allowed kinds does.

ALTER TABLE public.identity_verifications
  DROP CONSTRAINT IF EXISTS identity_verifications_kind_check;

ALTER TABLE public.identity_verifications
  ADD CONSTRAINT identity_verifications_kind_check
  CHECK (kind IN ('aadhaar', 'pan', 'gstin'));

COMMENT ON COLUMN public.identity_verifications.name_submitted IS
  'PAN and GSTIN only. The name the number was verified against - the account name as it stood at that moment. Account creation refuses to write an account whose name is not this one, so a number cannot be proved under one name and registered under another.';
COMMENT ON COLUMN public.identity_verifications.verified_name IS
  'The name the authority holds against the number: UIDAI''s for Aadhaar, the registered name for PAN, the legal name of the business for GSTIN. This is the authoritative spelling - the name typed on the signup form is not.';
