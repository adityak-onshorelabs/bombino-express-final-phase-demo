/**
 * Documents at signup become optional for PERSONAL accounts.
 *
 * The account matrix (shared/accountSpec.ts) is compelled before an account can
 * open: assertDocumentsStaged refuses creation until every required slot is
 * present and every OCR-checked slot came back `match`. That is the right
 * default — a document that reaches Indian customs wrong is expensive — but it
 * also means a personal customer cannot open an account at all until they have
 * a clear photo of both their Aadhaar and their PAN to hand, and cannot open
 * one *ever* while Cashfree is unreachable.
 *
 * With this flag set, a personal signup may skip the document step. The account
 * opens on a verified phone number and a signed contract alone, the customer is
 * warned on every screen until they finish, and the enforcement moves to the
 * last reversible moment in the order lifecycle: an order cannot be docketed
 * while the account behind it is unverified (server/orderLifecycle.ts).
 *
 * One env var, off unless it is exactly "1":
 *
 *   KYC_OPTIONAL=1
 *
 * Scope, deliberately narrow:
 *
 *   • PERSONAL accounts only. Company signup is untouched — a corporate
 *     account brings four to six documents that the accounts department
 *     compels, and none of that changes.
 *   • Documents only. The contract (contract_accepted + contract_signed_name)
 *     and the phone OTP stay mandatory in every case. They cost the customer
 *     nothing and one of them is the legal basis of the engagement.
 *   • The *upload* rules do not move. A document that reads as a different
 *     number, is the wrong kind of document, or carries a tamper signal is
 *     still refused outright (server/cashfreeOcr.ts). Skipping is permitted;
 *     storing bad data is not.
 *
 * Deliberately NOT gated on `NODE_ENV === "development"`, following
 * PAYMENTS_TEST_MODE and OTP_FIXED_CODE: the client tests on a deployed staging
 * build where NODE_ENV is production, and that is the environment this is for.
 * The trade is that the variable itself is the only thing holding the policy,
 * so it announces itself at boot.
 */

export function isKycOptionalEnabled(): boolean {
  return process.env.KYC_OPTIONAL === "1";
}

/** Called once at boot. Silent when the flag is off. */
export function warnIfKycOptionalEnabled(): void {
  if (!isKycOptionalEnabled()) return;

  const where =
    process.env.NODE_ENV === "production" ? "a PRODUCTION build" : "development";

  console.warn(
    [
      "",
      "  ############################################################",
      "  ##  KYC_OPTIONAL=1",
      "  ##  Personal accounts can be created without identity",
      "  ##  documents. Their orders cannot be docketed until the",
      "  ##  documents are verified.",
      `  ##  Running in ${where}.`,
      "  ############################################################",
      "",
    ].join("\n")
  );
}
