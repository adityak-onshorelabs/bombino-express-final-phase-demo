/**
 * Single implementation of "is this the code we sent?".
 *
 * Lives outside routes.ts because two endpoints consume a code now —
 * /api/auth/otp/verify (signup) and /api/auth/phone/continue (the unified
 * entry) — and a second copy of this logic is exactly where a check gets
 * dropped. Callers map the returned status/message straight onto the response.
 */
import { hashOtp, OTP_MAX_ATTEMPTS } from "./otp.js";
import {
  getLatestOtpForVerify,
  incrementAttempts,
  markConsumed,
  type OtpPurpose,
} from "./otpDb.js";

export type OtpConsumeResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Dev-only escape hatch for the missing SMS provider (otp.ts §sendOtpSms).
 *
 * Two conditions, not one: NODE_ENV alone is a single misconfigured deploy
 * variable away from accepting any code in production, and this gate is the
 * whole of phone authentication now that phone is the primary credential.
 * The opt-in must be explicit and must never be set outside local dev.
 */
function devBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" && process.env.OTP_DEV_BYPASS === "1"
  );
}

export async function consumeOtp(
  phone: string,
  purpose: OtpPurpose,
  code: string
): Promise<OtpConsumeResult> {
  const row = await getLatestOtpForVerify(phone, purpose);
  if (!row) {
    return {
      ok: false,
      status: 400,
      message: "No pending OTP for this number. Request a new one.",
    };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, message: "This OTP has expired. Request a new one." };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      status: 429,
      message: "Too many incorrect attempts. Request a new OTP.",
    };
  }

  if (!devBypassEnabled() && hashOtp(code) !== row.code_hash) {
    // Without this the ceiling checked above is unreachable — `attempts` stayed
    // at 0 for the life of every row, so the lockout never fired.
    await incrementAttempts(row.id, row.attempts);
    return { ok: false, status: 400, message: "Incorrect code" };
  }

  await markConsumed(row.id);
  return { ok: true };
}
