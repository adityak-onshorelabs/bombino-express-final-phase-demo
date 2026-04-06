-- Run once on Postgres/Supabase if KYC upload returns "Failed to save KYC document."
-- (Drizzle expects this table; it was missing from the initial Supabase schema.)

CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  document_no text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes integer NOT NULL,
  file_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kyc_documents IS 'KYC uploads for shipment booking; file_data is base64.';
