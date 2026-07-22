-- Phase 1: KYC persist foundation (Postgres file_data; no Storage bucket).
-- Safe to apply: kyc_documents is empty before migration.

ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.itd_users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS capability_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.kyc_documents
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN capability_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kyc_documents_user_id_key
  ON public.kyc_documents (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS kyc_documents_capability_id_key
  ON public.kyc_documents (capability_id);

COMMENT ON TABLE public.kyc_documents IS
  'One KYC document per user (UNIQUE user_id). File bytes stored in file_data (base64). capability_id is the stable id used in /api/kyc/documents/:id/file.';

COMMENT ON COLUMN public.kyc_documents.capability_id IS
  'Stable per-user UUID for the serve URL; generated once on first upload, never rotated.';
