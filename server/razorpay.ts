/**
 * A4 — the Razorpay wire.
 *
 * Everything in here is transport and signatures: creating a gateway order,
 * reading a payment back, and proving that a string the browser or a webhook
 * handed us was really produced by Razorpay. Nothing here touches the
 * database and nothing here decides policy — `paymentsDb.ts` records money,
 * `routes/payments.ts` decides who may ask.
 *
 * Plain `fetch` rather than the `razorpay` SDK, matching how `itd.ts` already
 * talks to an external API: the surface we need is three calls and two HMACs,
 * and the SDK would add a dependency to the esbuild CJS bundle for that.
 *
 * Money is in paise everywhere on Razorpay's side and in rupees everywhere on
 * ours. The conversion happens once, here, in `toPaise`/`toRupees` — every
 * other file in the lane deals in rupees only.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

/** Rounded, not truncated: 1234.565 must not become ₹1234.56 in a receipt. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  /** Set separately in the Razorpay dashboard — not the API secret. */
  webhookSecret: string | null;
};

/**
 * Read config at call time, not at import time. The server boots without
 * Razorpay keys in every environment that does not take payments, and an
 * import-time throw would take the whole app down with it.
 */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;

  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isRazorpayConfigured(): boolean {
  return getRazorpayConfig() !== null;
}

function authHeader(config: RazorpayConfig): string {
  const token = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Constant-time compare that tolerates a length mismatch.
 *
 * `timingSafeEqual` throws on unequal lengths, and that throw is itself a
 * length oracle — cheap to avoid, so avoided.
 */
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ── Gateway orders ────────────────────────────────────────────────────────

export type RazorpayOrder = {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
  receipt: string | null;
};

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number; // paise
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
  notes: Record<string, unknown> | null;
  error_description?: string | null;
};

async function razorpayFetch<T>(
  config: RazorpayConfig,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${RAZORPAY_API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: authHeader(config),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    // Network-level failure: no gateway order exists, so the caller can retry
    // freely without risking a duplicate.
    return { ok: false, status: 502, message: (err as Error).message };
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const message =
      (parsed as { error?: { description?: string } } | null)?.error?.description ??
      text ??
      res.statusText;
    console.error("[razorpay] API error:", { path, status: res.status, message });
    return { ok: false, status: res.status, message };
  }

  return { ok: true, data: parsed as T };
}

/**
 * Create the gateway order the checkout modal opens against.
 *
 * `notes` is how the webhook finds its way home: Razorpay echoes it back on
 * the payment entity, and the webhook has no session to tell it whose order
 * this is. Keep `order_id` in there — the webhook path depends on it.
 */
export async function createRazorpayOrder(input: {
  amountRupees: number;
  currency?: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ ok: true; order: RazorpayOrder } | { ok: false; status: number; message: string }> {
  const config = getRazorpayConfig();
  if (!config) return { ok: false, status: 503, message: "Razorpay is not configured" };

  const result = await razorpayFetch<RazorpayOrder>(config, "/orders", {
    method: "POST",
    body: {
      amount: toPaise(input.amountRupees),
      currency: input.currency ?? "INR",
      // Max 40 chars at Razorpay; our order numbers are far shorter, but a
      // silent 400 here would be a confusing way to find that out.
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    },
  });

  if (!result.ok) return result;
  return { ok: true, order: result.data };
}

export async function fetchRazorpayPayment(
  paymentId: string
): Promise<{ ok: true; payment: RazorpayPayment } | { ok: false; status: number; message: string }> {
  const config = getRazorpayConfig();
  if (!config) return { ok: false, status: 503, message: "Razorpay is not configured" };

  const result = await razorpayFetch<RazorpayPayment>(config, `/payments/${paymentId}`);
  if (!result.ok) return result;
  return { ok: true, payment: result.data };
}

/**
 * Capture an authorised-but-uncaptured payment.
 *
 * Most accounts are set to auto-capture and never reach this. The ones that
 * are not would otherwise leave the customer charged, us unpaid, and the
 * authorisation expiring silently after a few days — so the verify path
 * captures rather than assuming.
 */
export async function captureRazorpayPayment(
  paymentId: string,
  amountRupees: number,
  currency = "INR"
): Promise<{ ok: true; payment: RazorpayPayment } | { ok: false; status: number; message: string }> {
  const config = getRazorpayConfig();
  if (!config) return { ok: false, status: 503, message: "Razorpay is not configured" };

  const result = await razorpayFetch<RazorpayPayment>(config, `/payments/${paymentId}/capture`, {
    method: "POST",
    body: { amount: toPaise(amountRupees), currency },
  });

  if (!result.ok) return result;
  return { ok: true, payment: result.data };
}

// ── Signatures ────────────────────────────────────────────────────────────

/**
 * The handshake the checkout modal returns.
 *
 * Proves the browser is quoting a real payment against a real order, and not
 * a payment id it made up. It does NOT prove the payment was captured, or
 * that the amount is right — the verify route re-reads the payment from the
 * API for that, because the signature covers the ids only.
 */
export function verifyCheckoutSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const config = getRazorpayConfig();
  if (!config) return false;

  const expected = createHmac("sha256", config.keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  return safeEqualHex(expected, input.signature);
}

/**
 * Webhook authenticity, over the exact bytes Razorpay sent.
 *
 * Must be the raw body, not a re-serialised object: key order and whitespace
 * are part of what was signed. `server/index.ts` stashes the buffer on
 * `req.rawBody` in the `express.json` verify hook for this.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  const config = getRazorpayConfig();
  if (!config?.webhookSecret) return false;

  const expected = createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex");

  return safeEqualHex(expected, signature);
}
