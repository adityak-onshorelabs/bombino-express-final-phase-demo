-- A2 follow-up: signup never got a matching real login. The old phone+OTP
-- tab on /login was still the client-only dummy flow (fabricates a fresh
-- fake user every time, never touches the server) — logging back in with
-- the same number silently threw away name/email/KYC instead of reusing
-- the real account. This adds 'login' as a third otp_codes purpose so
-- existing accounts can re-authenticate by phone+OTP for real.

ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN ('signup_personal', 'signup_company', 'login'));
