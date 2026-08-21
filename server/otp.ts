import crypto from "crypto";
import { sendTemplate } from "./whatsapp.js";
import { loginOtpMessage } from "./whatsappTemplates.js";
import { getMessageStatusByDedupeKey } from "./whatsappDb.js";
import { sendOtpBySms } from "./sms.js";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
/**
 * Per-phone request ceiling, per rolling hour.
 *
 * Higher in development because a single manual test of the login flow costs a
 * request and five is spent in one sitting. This is an anti-abuse control on an
 * endpoint that sends SMS at our expense, so production stays at 5 — never
 * raise the non-dev value without a reason to.
 */
export const OTP_MAX_REQUESTS_PER_HOUR =
  process.env.NODE_ENV === "development" ? 20 : 5;
export const OTP_VERIFICATION_WINDOW_MINUTES = 10;

export function generateOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * How long to wait for WhatsApp to admit it could not deliver, before falling
 * back to SMS.
 *
 * There is no way to shorten this honestly. Meta ACCEPTS a message to a number
 * that is not on WhatsApp — returns 200 and a message id — and only reports
 * `failed` on the status webhook a second or two later. So "is this number on
 * WhatsApp?" cannot be answered at send time, and the receipt is the answer.
 *
 * Twelve seconds is comfortably past a normal receipt and comfortably inside
 * the five-minute code lifetime, so a customer who ends up on the SMS path
 * still has four and a half minutes to type it.
 */
const WHATSAPP_RECEIPT_GRACE_MS = 12_000;

/**
 * Deliver a login code, over whichever channel can carry it.
 *
 * WhatsApp first, SMS if WhatsApp cannot deliver. Phone is the only credential
 * in this app, so a code that does not arrive is not an inconvenience — it is a
 * person who cannot log in and cannot sign up. The most common cause is not
 * "no WhatsApp" at all; it is a dual-SIM customer whose WhatsApp lives on their
 * other number.
 *
 * Three paths out of here:
 *
 *   refused at send   WhatsApp rejected it outright → SMS immediately
 *   accepted, failed  Meta took it and the receipt says undeliverable → SMS
 *                     after the grace period
 *   accepted, fine    nothing further happens
 *
 * A PRE-CHECK WOULD NOT REPLACE THIS. Meta's Cloud API has no contact-check
 * endpoint — the On-Premises `/contacts` call was removed deliberately, since
 * it enables number enumeration. If Tata expose one of their own it belongs in
 * front of this as a fast path, saving the twelve seconds; the receipt fallback
 * still has to stay, because a number can check out as valid and still fail to
 * receive.
 *
 * The code is logged in DEVELOPMENT ONLY. It was briefly logged on any failed
 * send, to keep the flow testable — but that wrote plaintext login codes into
 * production logs for exactly the numbers having delivery trouble, which is a
 * credential sitting in a log file. Use `OTP_DEV_BYPASS` instead.
 *
 * @returns whether WhatsApp accepted it. Not whether the customer received it,
 *          and not whether the SMS fallback worked — both are decided later.
 */
export async function deliverOtp(phone: string, code: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development") {
    console.log(`[otp] OTP for ${phone}: ${code}`);
  }

  const message = loginOtpMessage(code);
  // The code never appears in the key. `otp_codes` stores only a hash of it,
  // and a dedupe key is a plain column — putting the code there would undo
  // that hashing for every code ever sent.
  const dedupeKey = `otp:${phone}:${hashOtp(code).slice(0, 16)}`;

  const result = await sendTemplate({
    to: phone,
    template: message.template,
    variables: message.variables,
    otpButtonCode: message.otpButtonCode,
    dedupeKey,
    // The login code is a credential. Store a placeholder, send the real thing.
    redactVariables: true,
  });

  if (result.ok) {
    scheduleSmsFallback(phone, code, dedupeKey);
    return true;
  }

  // A skipped send is a configuration state, not a delivery failure — dry run,
  // or no token. Falling back to SMS there would send a real message from a
  // developer's laptop.
  if (result.reason === "skipped") return false;

  // A duplicate means this exact code was already sent and its own fallback is
  // already pending. Sending again would deliver the same code twice.
  if (result.reason === "duplicate") return false;

  console.error("[otp] WhatsApp refused the login code, trying SMS", {
    phone,
    reason: result.reason,
  });
  await sendOtpBySms(phone, code);
  return false;
}

/**
 * Wait out the grace period, then check whether the receipt came back failed.
 *
 * Deliberately in-process rather than driven from the webhook. The webhook
 * cannot do it: the code is redacted out of `whatsapp_messages` on purpose, so
 * by the time a receipt arrives there is nothing left to resend. Here the code
 * is held in a closure for twelve seconds and never written down.
 *
 * The cost is that a restart inside those twelve seconds loses the fallback,
 * and that customer sees nothing. Acceptable against the alternative, which is
 * persisting live login codes so a restart can recover them.
 *
 * `unref()` so a pending timer cannot hold the process open during a shutdown.
 */
function scheduleSmsFallback(phone: string, code: string, dedupeKey: string): void {
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const status = await getMessageStatusByDedupeKey(dedupeKey);
        if (status !== "failed") return;

        console.warn("[otp] WhatsApp could not deliver the code, falling back to SMS", {
          phone,
        });
        await sendOtpBySms(phone, code);
      } catch (error) {
        // Nobody is awaiting this. An unhandled rejection here would be an
        // unexplained process-level warning minutes after the request ended.
        console.error("[otp] SMS fallback failed", {
          phone,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, WHATSAPP_RECEIPT_GRACE_MS);

  timer.unref?.();
}
