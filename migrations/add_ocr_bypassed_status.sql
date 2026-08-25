-- Allow ocr_status = 'bypassed' (server/cashfreeOcr.ts, OCR_BYPASS=1).
-- Additive only: no existing row changes and no column is dropped.
--
-- Run AFTER add_kyc_ocr_verification.sql, which created the columns and the
-- CHECK this widens.
--
-- Why a fifth value rather than reusing one of the four: a document accepted
-- while verification was switched off is not the same thing as one OCR had
-- nothing to say about ('skipped' — a GST certificate, a utility bill), nor
-- one it tried and failed to read ('unreadable'), nor one that got no answer
-- from a verifier that was asked ('unavailable'). Only 'bypassed' means the
-- number printed on the document was never compared with the number the
-- customer typed. Ops has to be able to find exactly those rows and check
-- them by hand before the account ships anything, so it gets its own value.
--
-- The existing ops indexes are WHERE ocr_status IS DISTINCT FROM 'match', so
-- they already list these rows; nothing needs reindexing.

DO $$
DECLARE
  t text;
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_documents', 'kyc_documents'] LOOP
    -- The original constraint was created inline by ADD COLUMN ... CHECK, so
    -- it carries whatever name Postgres generated. Find it by the column it
    -- constrains rather than guessing the name.
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = t
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%ocr_status%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c);
    END LOOP;

    EXECUTE format($f$
      ALTER TABLE public.%I
        ADD CONSTRAINT %I CHECK (
          ocr_status IN ('match', 'unreadable', 'unavailable', 'skipped', 'bypassed')
        )
    $f$, t, t || '_ocr_status_check');
  END LOOP;
END $$;

COMMENT ON COLUMN public.account_documents.ocr_status IS
  'Outcome of the Cashfree Smart OCR check. No row is ever stored with a mismatched, wrong-type or tampered result — those uploads are refused. ''bypassed'' means OCR_BYPASS=1 was set and the document was stored without being checked at all: the number on it was never compared with the number the customer typed. NULL on rows written before this column existed.';

COMMENT ON COLUMN public.kyc_documents.ocr_status IS
  'Outcome of the Cashfree Smart OCR check. See account_documents.ocr_status.';
