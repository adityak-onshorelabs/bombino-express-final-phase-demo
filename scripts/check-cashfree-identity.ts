/**
 * Confirm the Cashfree VRS identity integration is wired up and the
 * credentials work, using the sandbox's own test data.
 *
 *   npx tsx --env-file=.env scripts/check-cashfree-identity.ts pan
 *   npx tsx --env-file=.env scripts/check-cashfree-identity.ts pan AZJPG7110R "JOHN SNOW"
 *   npx tsx --env-file=.env scripts/check-cashfree-identity.ts digilocker
 *   npx tsx --env-file=.env scripts/check-cashfree-identity.ts digilocker <verification_id>
 *
 * The digilocker mode with no argument creates a consent URL and prints it —
 * that alone proves the credentials and that the product is provisioned.
 * Open the URL, finish the journey, then re-run with the verification_id it
 * printed to poll the status and read the Aadhaar back.
 *
 * Sandbox test data (docs.cashfree.com — "VRS Sandbox Test Data"):
 *
 *   PAN   ABCPV1234D, XYZPP4321W, AZJPG7110R      valid, individual
 *         ABCCD8000T, XYZHP2000L, AAAHU4383C      valid, business
 *         DEFPV0126D, TUVPP5678W, LMNCD8010T      invalid
 *
 *   DigiLocker runs its own sandbox journey; there is no canned Aadhaar to
 *   pass in, because the number is never typed — it comes back from the
 *   consent flow.
 *
 * Every call is billed against the VRS balance of whichever environment
 * CASHFREE_VRS_ENV names. It defaults to sandbox. Point the PAN mode at your
 * own PAN if you run it against production, never a customer's.
 */

import crypto from "node:crypto";
import {
  createDigiLockerUrl,
  fetchDigiLockerAadhaar,
  getDigiLockerStatus,
  isIdentityBypassed,
  isIdentityConfigured,
  verifyPan,
} from "../server/cashfreeIdentity.js";

const SANDBOX_PAN = "AZJPG7110R";
const SANDBOX_PAN_NAME = "JOHN SNOW";

async function main(): Promise<void> {
  if (!isIdentityConfigured()) {
    console.error(
      "CASHFREE_VRS_CLIENT_ID / CASHFREE_VRS_CLIENT_SECRET are not set.\n" +
        "Identity verification is disabled in this state, and no account can be created."
    );
    process.exit(1);
  }

  const [mode, ...args] = process.argv.slice(2);
  const env = process.env.CASHFREE_VRS_ENV === "production" ? "PRODUCTION" : "sandbox";
  console.log(`environment : ${env}\n`);

  if (mode === "pan") {
    // With this check bypassed the app never reaches Cashfree either, so a
    // green run here would prove nothing about the credentials.
    if (isIdentityBypassed("pan")) {
      console.error(
        'IDENTITY_BYPASS includes "pan": PAN numbers are accepted WITHOUT being checked\n' +
          "and no call is made. Drop pan from the flag to exercise the real path."
      );
      process.exit(1);
    }
    const pan = args[0] ?? SANDBOX_PAN;
    const name = args[1] ?? SANDBOX_PAN_NAME;
    console.log(`PAN  : ${pan}`);
    console.log(`name : ${name}`);
    console.log("calling /verification/pan…\n");

    const result = await verifyPan(pan, name);
    console.log(JSON.stringify(result, null, 2));
    console.log(
      `\nverdict: ${result.ok ? "VERIFIED" : `${result.failure.toUpperCase()} — would refuse`}`
    );
    return;
  }

  if (mode === "digilocker") {
    if (isIdentityBypassed("aadhaar")) {
      console.error(
        'IDENTITY_BYPASS includes "aadhaar": no DigiLocker journey is started and any\n' +
          "12 digits are accepted. Drop aadhaar from the flag to exercise the real path."
      );
      process.exit(1);
    }

    const existing = args[0];
    if (!existing) {
      const verificationId = `bmb-dl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      console.log(`verification_id : ${verificationId}`);
      console.log("calling POST /verification/digilocker…\n");

      const created = await createDigiLockerUrl(verificationId);
      console.log(JSON.stringify(created, null, 2));
      if (!created.ok) {
        console.log(`\nverdict: ${created.failure.toUpperCase()} — no journey started`);
        return;
      }
      console.log(
        `\nOpen this URL, finish the DigiLocker journey, then re-run:\n\n` +
          `  ${created.url}\n\n` +
          `  npx tsx --env-file=.env scripts/check-cashfree-identity.ts digilocker ${created.verificationId}\n`
      );
      return;
    }

    console.log(`verification_id : ${existing}`);
    console.log("calling GET /verification/digilocker…\n");
    const status = await getDigiLockerStatus(existing);
    console.log(JSON.stringify(status, null, 2));
    if (!status.ok) {
      console.log(`\nverdict: ${status.failure.toUpperCase()}`);
      return;
    }
    if (status.state !== "AUTHENTICATED") {
      console.log(`\nverdict: ${status.state} — nothing to read yet`);
      return;
    }

    console.log("\ncalling GET /verification/digilocker/document/AADHAAR…\n");
    const document = await fetchDigiLockerAadhaar(existing);
    console.log(JSON.stringify(document, null, 2));
    console.log(
      `\nverdict: ${
        !document.ok
          ? `${document.failure.toUpperCase()} — would refuse`
          : document.pending
            ? "still fetching — poll again"
            : "VERIFIED"
      }`
    );
    return;
  }

  console.error(
    "Usage:\n" +
      "  check-cashfree-identity.ts pan [pan] [name]\n" +
      "  check-cashfree-identity.ts digilocker [verification_id]"
  );
  process.exit(1);
}

void main();
