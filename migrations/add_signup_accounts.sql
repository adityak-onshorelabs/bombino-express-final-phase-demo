-- A2 (real signup: personal + company). Additive-only.
-- itd_users gains local-account fields; local (non-ITD-login) accounts get a
-- synthetic itd_customer_id ('local-' || uuid) so the existing NOT NULL
-- UNIQUE constraint on that column needs no change.

ALTER TABLE public.itd_users
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'personal'
    CHECK (account_type IN ('personal', 'company')),
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS gstin text;

CREATE UNIQUE INDEX IF NOT EXISTS itd_users_phone_key
  ON public.itd_users (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup_personal', 'signup_company')),
  attempts smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_phone_purpose_idx
  ON public.otp_codes (phone, purpose, created_at DESC);

COMMENT ON TABLE public.otp_codes IS
  'Signup OTP codes. code_hash is sha256, never the raw code. SMS transport is a dev-mode stub until a provider is chosen (doc §8 blocker).';
