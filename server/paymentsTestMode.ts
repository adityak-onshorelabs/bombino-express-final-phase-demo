/**
 * TEMPORARY — the pay-now test bypass.
 *
 * While the Razorpay account is not usable, a `pay_now` booking cannot be
 * completed end to end, which blocks testing everything downstream of it (the
 * paid order, the agent's "prepaid" job, ops settling it). This flag lets the
 * server settle such an order on request, without the gateway.
 *
 * It writes real rows: a `payments` row and `orders.payment_status = paid`.
 * That is the point — a fake that stopped short of the database would not
 * exercise anything worth testing — and it is also why the flag exists rather
 * than a client-side pretence. **Money can be marked received without any money
 * moving, so this must not be set on an environment that takes real payments.**
 *
 * One env var, off unless it is exactly "1":
 *
 *   PAYMENTS_TEST_MODE=1
 *
 * Deliberately NOT gated on `NODE_ENV === "development"`, unlike
 * `OTP_DEV_BYPASS`: the client tests on a deployed staging build where NODE_ENV
 * is production, and that is the environment this is for. The trade is that the
 * only thing standing between this and live payments is the variable itself, so
 * it announces itself loudly at boot and on every settle, and every row it
 * writes is tagged `source: "test_mode"` so reconciliation can find them.
 *
 * Delete this file, its two endpoints, and the client switch once the gateway
 * works — see docs/final-phase/markdowns/open-items.md.
 */

export function isPaymentsTestModeEnabled(): boolean {
  return process.env.PAYMENTS_TEST_MODE === "1";
}

/** Called once at boot. Silent when the flag is off. */
export function warnIfPaymentsTestModeEnabled(): void {
  if (!isPaymentsTestModeEnabled()) return;

  const where =
    process.env.NODE_ENV === "production" ? "a PRODUCTION build" : "development";

  console.warn(
    [
      "",
      "  ############################################################",
      "  ##  PAYMENTS_TEST_MODE=1",
      "  ##  Orders can be marked PAID without any money moving.",
      `  ##  Running in ${where}.`,
      "  ##  Unset this before this environment takes real payments.",
      "  ############################################################",
      "",
    ].join("\n")
  );
}
