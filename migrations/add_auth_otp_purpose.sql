-- Phone-first auth: the unified entry point (/api/auth/phone/continue) issues
-- one code that may go on to sign in, create an account, or link an ITD
-- credential. Its own purpose rather than a reuse of 'login', because
-- hasRecentVerification(phone, purpose, …) is the security boundary those
-- three paths share — overloading 'login' would let a sign-in code authorise
-- credential linking, which is not the same act.
--
-- Additive-only, same shape as add_otp_login_purpose.sql.

ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN ('signup_personal', 'signup_company', 'login', 'auth'));
