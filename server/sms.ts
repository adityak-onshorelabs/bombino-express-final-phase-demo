/**
 * SMS — the fallback channel for a login code when WhatsApp cannot deliver it.
 *
 * NO VENDOR IS WIRED YET. `send()` below has one gap in it, marked, where the
 * provider call goes. Until that lands every SMS is logged and skipped, exactly
 * as the WhatsApp transport behaves without a token — so the app runs, the
 * WhatsApp path works normally, and the only thing missing is the tail of users
 * WhatsApp could not reach.
 *
 * ── Before this can send anything ────────────────────────────────────────
 * Indian transactional SMS is gated on TRAI's DLT regime, and none of it is
 * code:
 *
 *   1. Bombino registered as a Principal Entity on a DLT portal
 *   2. A 6-character sender ID registered and approved  (e.g. BMBNOX)
 *   3. The OTP message template registered and approved, separately from the
 *      WhatsApp one — same text, different regulator
 *
 * Step 3 is the one that surprises people: an unregistered template is not
 * "delivered late", it is dropped by the operator with no receipt. So the SMS
 * body here must match the DLT-approved template character for character,
 * variables included.
 *
 * ── The contract, same as the WhatsApp transport ─────────────────────────
 * Nothing here throws. A failure to send an SMS must never fail the request
 * that triggered it — the caller has already decided the customer is having a
 * bad time, and an exception on top of that helps nobody.
 */

const TIMEOUT_MS = 8_000;

/**
 * The DLT-approved template, once it exists.
 *
 * Kept here rather than inlined so the string that must match the registration
 * has exactly one home. `{{code}}` is substituted; nothing else varies.
 */
export const SMS_OTP_TEMPLATE = "{{code}} is your Bombino verification code. It expires in 5 minutes. Do not share it with anyone.";

export type SmsOutcome =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "no_number" | "failed" };

function isConfigured(): boolean {
  return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER_ID);
}

/**
 * A stored phone number in the form Indian SMS providers want: 10 digits, or
 * 91-prefixed. Deliberately its own function rather than a reuse of
 * `toWaMsisdn` — the two channels have disagreed about the country prefix at
 * every vendor I have seen, and one shared helper is how a working WhatsApp
 * number becomes an undeliverable SMS.
 */
export function toSmsNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^0[6-9]\d{9}$/.test(digits)) return digits.slice(1);
  return null;
}

let missingConfigLogged = false;

/**
 * Send one OTP by SMS.
 *
 * Takes the code rather than a rendered body, so the DLT template stays the
 * only place the wording lives and a caller cannot accidentally send text the
 * operator will drop.
 *
 * NEVER LOGS THE CODE. This function exists precisely for the case where
 * something has already gone wrong, which is when logs get read.
 */
export async function sendOtpBySms(phone: string, code: string): Promise<SmsOutcome> {
  const to = toSmsNumber(phone);
  if (!to) {
    console.warn("[sms] no usable number");
    return { ok: false, reason: "no_number" };
  }

  if (!isConfigured()) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      console.warn(
        "[sms] SMS_API_KEY / SMS_SENDER_ID are not set — the WhatsApp fallback " +
          "cannot deliver. A customer WhatsApp could not reach has no way in."
      );
    }
    // Logged every time, not once: each occurrence is a real person locked out,
    // and the count is the argument for procuring a provider.
    console.error("[sms] (unconfigured) OTP fallback not delivered", { phone });
    return { ok: false, reason: "unconfigured" };
  }

  try {
    // ── VENDOR GAP ────────────────────────────────────────────────────────
    // Replace with the provider's send call once one is chosen. It needs:
    //   - the DLT sender ID from SMS_SENDER_ID
    //   - the DLT template id, most vendors require it as a separate field
    //   - the body from SMS_OTP_TEMPLATE with {{code}} substituted
    // Keep the timeout, keep the try/catch, and do not log `code`.
    const body = SMS_OTP_TEMPLATE.replace("{{code}}", code);
    void body;
    void TIMEOUT_MS;

    console.error(
      "[sms] no provider implementation — see the VENDOR GAP in server/sms.ts",
      { phone }
    );
    return { ok: false, reason: "failed" };
  } catch (error) {
    console.error("[sms] send failed", {
      phone,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "failed" };
  }
}
