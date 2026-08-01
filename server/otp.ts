import crypto from "crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_REQUESTS_PER_HOUR = 5;
export const OTP_VERIFICATION_WINDOW_MINUTES = 10;

export function generateOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// TODO(A2): wire a real SMS provider here — blocked per
// docs/final-phase/markdowns/final-phase-modules.md §8 ("OTP/SMS provider +
// credentials", D3). Until then, the code is logged server-side so the
// signup flow is fully testable without one.
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  console.log(`[otp] (dev stub) OTP for ${phone}: ${code}`);
}
