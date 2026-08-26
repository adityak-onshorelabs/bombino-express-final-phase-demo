/**
 * Cashfree VRS number verification — proves an Aadhaar and a PAN are real,
 * and belong to the person signing up, before any document is uploaded.
 *
 *   POST {base}/verification/digilocker                  { verification_id, document_requested, redirect_url? }
 *   GET  {base}/verification/digilocker                  ?verification_id=
 *   GET  {base}/verification/digilocker/document/AADHAAR ?verification_id=
 *   POST {base}/verification/pan                         { pan, name? }
 *   headers: x-client-id, x-client-secret, (x-api-version on /pan)
 *
 * This is the step ahead of Smart OCR (server/cashfreeOcr.ts), and the two
 * are halves of one check:
 *
 *   identity  the number is real, and UIDAI/the Income Tax Department say
 *             whose it is. Aadhaar comes back from the customer's own
 *             DigiLocker, under their consent; PAN proves the name on file.
 *   OCR       the *document* uploaded afterwards carries that same number.
 *
 * Neither is sufficient alone. A verified number with no document is a claim
 * with no paper behind it; a document OCR agrees with, whose number was never
 * checked against the issuer, is a well-photographed invention. Verifying the
 * number first also means the OCR comparison is against a value the issuer
 * has already confirmed — which is why routes.ts overrides whatever
 * `document_no` the upload carries with the verified one.
 *
 * All of it runs on the same VRS credentials and the same balance as OCR, so
 * `CASHFREE_VRS_*` configures every call in this file and that one.
 *
 * WHY DIGILOCKER AND NOT AN AADHAAR OTP. Cashfree's Offline Aadhaar
 * Verification is a separately provisioned product and is not enabled on this
 * account — every OTP request came back "Offline Aadhaar Verification is not
 * enabled for this account" — and their own KYC-stack guide marks the OTP
 * method discontinued in favour of DigiLocker. So Aadhaar is a consent
 * journey now, not a code:
 *
 *   1. create a consent URL, valid ten minutes
 *   2. the customer opens it in a second tab and signs in to DigiLocker
 *   3. the signup tab polls the status until AUTHENTICATED
 *   4. we read the Aadhaar DigiLocker was authorised to share
 *
 * The customer never types an Aadhaar number, so there is no "wrong number"
 * rejection in this flow at all — only consent given or not given.
 *
 * The failure policy differs from OCR's on purpose. An OCR miss is often the
 * camera and costs the customer a retake; an identity miss is a statement by
 * an authority, and there is nothing to retake. So:
 *
 *   • Consent refused, an Aadhaar not present in DigiLocker, a PAN registered
 *     to an unrelated name — refused. There is no "unverified but stored"
 *     state for a number, because unlike a file there is nothing to store.
 *   • An outage, no credentials, an empty balance — the customer is told to
 *     try again shortly. Nothing is recorded, so nothing is claimed.
 */

import crypto from "crypto";

const SANDBOX_BASE = "https://sandbox.cashfree.com";
const PRODUCTION_BASE = "https://api.cashfree.com";
/** Only /pan reads it; the DigiLocker endpoints are unversioned. Any date
 *  after 2022-09-12 returns the Aadhaar-seeding status, which we record. */
const DEFAULT_API_VERSION = "2024-12-01";
/** DigiLocker is slower than OCR and the round trip is worth waiting on. */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * How long a DigiLocker journey is worth polling.
 *
 * Cashfree's consent URL is valid for ten minutes. We stop a little sooner so
 * that "this expired, start again" is our sentence rather than a 400 from
 * them arriving mid-poll.
 */
export const DIGILOCKER_TTL_MS = 9 * 60 * 1000;

export type IdentityKind = "aadhaar" | "pan";

/**
 * Why a check did not succeed.
 *
 *   rejected     the authority answered, and the answer was no. Terminal for
 *                these inputs — the customer must correct what they typed.
 *   expired      the consent window closed. Recoverable by starting a new
 *                DigiLocker journey.
 *   unavailable  we never got an answer: not configured, timed out, out of
 *                balance, 5xx. Ours, not theirs — retryable as-is.
 */
export type IdentityFailure = "rejected" | "expired" | "unavailable";

export interface IdentityError {
  ok: false;
  failure: IdentityFailure;
  /** Shown to the customer. Actionable, and never blames them for our outage. */
  message: string;
  /** Server log only — carries the HTTP status or the vendor's own wording. */
  detail: string | null;
}

export interface DigiLockerUrlCreated {
  ok: true;
  /** Where to send the customer. Valid for ten minutes, per Cashfree. */
  url: string;
  /** Our own id for this journey. Held in the session and polled against. */
  verificationId: string;
  referenceId: string | null;
}

/** Where the customer has got to. Only AUTHENTICATED lets us read anything. */
export type DigiLockerState = "PENDING" | "AUTHENTICATED" | "EXPIRED" | "CONSENT_DENIED";

export interface DigiLockerStatus {
  ok: true;
  state: DigiLockerState;
  /** Who DigiLocker says signed in. The document itself comes separately. */
  name: string | null;
  referenceId: string | null;
}

/** Consent is in, Cashfree is still fetching. Poll again; say nothing. */
export interface DigiLockerPending {
  ok: true;
  pending: true;
}

export interface DigiLockerAadhaar {
  ok: true;
  pending: false;
  /** As DigiLocker returns it — commonly masked, XXXXXXXX1234. */
  uid: string;
  /** Name as UIDAI holds it. */
  name: string | null;
  dob: string | null;
  gender: string | null;
  careOf: string | null;
  /** Everything the vendor returned, minus the photo. Kept for ops. */
  details: Record<string, unknown>;
  referenceId: string | null;
}

export interface PanVerified {
  ok: true;
  /** Name registered against the PAN with the Income Tax Department. */
  registeredName: string | null;
  /** "Individual" | "Company" — checked against the account shape. */
  panType: string | null;
  /** DIRECT_MATCH … NO_MATCH. Only NO_MATCH refuses; see verifyPan. */
  nameMatchResult: string | null;
  nameMatchScore: number | null;
  panStatus: string | null;
  aadhaarSeedingStatus: string | null;
  details: Record<string, unknown>;
  referenceId: string | null;
}

interface CashfreeConfig {
  clientId: string;
  clientSecret: string;
  base: string;
  apiVersion: string;
}

function getConfig(): CashfreeConfig | null {
  const clientId = process.env.CASHFREE_VRS_CLIENT_ID?.trim();
  const clientSecret = process.env.CASHFREE_VRS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    // Same fail-safe as cashfreeOcr.getConfig: anything but an explicit
    // "production" is sandbox, because getting it wrong spends real money.
    base: process.env.CASHFREE_VRS_ENV?.trim() === "production" ? PRODUCTION_BASE : SANDBOX_BASE,
    apiVersion: process.env.CASHFREE_VRS_API_VERSION?.trim() || DEFAULT_API_VERSION,
  };
}

export function isIdentityConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * TEMPORARY — the identity-verification bypass, per check.
 *
 *   IDENTITY_BYPASS=aadhaar        skip the DigiLocker journey only
 *   IDENTITY_BYPASS=pan            skip the PAN lookup only
 *   IDENTITY_BYPASS=aadhaar,pan    skip both
 *   IDENTITY_BYPASS=1              skip both (legacy spelling of the above)
 *
 * Per check rather than all-or-nothing because the two are not equally
 * available, and today they are not:
 *
 *   • DigiLocker is a separately provisioned VRS product, exactly like the
 *     Offline Aadhaar Verification it replaced. If it is not enabled on the
 *     account the journey cannot start and no personal account can be
 *     created, so this flag is the only way to test the rest of signup.
 *   • PAN verification works against the same credentials right now, and
 *     against real numbers.
 *
 * One switch for both would mean giving up the check that works in order to
 * get past the one that is not turned on. So: bypass Aadhaar, keep PAN.
 *
 * A bypassed number is recorded with status `bypassed` rather than `verified`,
 * so an ops query finds every account that opened on an unchecked number, and
 * the customer is told on screen that it was not checked.
 *
 * A BYPASSED NUMBER IS CHECKED AGAINST NOTHING. Any twelve digits, any ten
 * characters. Same root cause as OCR_BYPASS, and a separate flag for the same
 * reason: the sandbox can exercise identity verification with its canned test
 * numbers (PAN AZJPG7110R, and DigiLocker's own sandbox journey) while OCR cannot
 * be exercised at all, so identity on with OCR_BYPASS=1 is a real
 * configuration.
 *
 * Not gated on NODE_ENV, for the same reason PAYMENTS_TEST_MODE and OCR_BYPASS
 * are not: the client tests on a deployed staging build where NODE_ENV is
 * production, and that is the environment this is for. Unset it before this
 * environment has real customers, and delete the flag once every VRS product
 * this app uses is provisioned.
 */
function bypassedKinds(): Set<IdentityKind> {
  const raw = process.env.IDENTITY_BYPASS?.trim().toLowerCase();
  if (!raw) return new Set();
  // "1" predates the per-check spelling and still means everything, so an
  // environment already carrying it does not quietly start verifying again.
  if (raw === "1" || raw === "all" || raw === "true") {
    return new Set<IdentityKind>(["aadhaar", "pan"]);
  }

  const kinds = new Set<IdentityKind>();
  for (const token of raw.split(/[,\s]+/).filter(Boolean)) {
    if (token === "aadhaar" || token === "pan") {
      kinds.add(token);
    } else {
      // A typo'd value must not silently bypass nothing *or* everything.
      console.error(
        `[cashfreeIdentity] IDENTITY_BYPASS contains "${token}", which is not a check name. ` +
          `Expected some of: aadhaar, pan (or 1 for both). Ignoring that token.`
      );
    }
  }
  return kinds;
}

export function isIdentityBypassed(kind: IdentityKind): boolean {
  return bypassedKinds().has(kind);
}

/** Called once at boot. Silent when nothing is bypassed. */
export function warnIfIdentityBypassEnabled(): void {
  const kinds = bypassedKinds();
  if (kinds.size === 0) return;

  const where = process.env.NODE_ENV === "production" ? "a PRODUCTION build" : "development";
  const named = Array.from(kinds).map((k) => (k === "aadhaar" ? "Aadhaar" : "PAN")).join(" and ");

  console.warn(
    [
      "",
      "  ############################################################",
      `  ##  IDENTITY_BYPASS=${process.env.IDENTITY_BYPASS?.trim()}`,
      `  ##  ${named} accepted WITHOUT being checked against`,
      "  ##  UIDAI or the Income Tax Department.",
      kinds.has("aadhaar") ? "  ##  No DigiLocker consent is taken; any 12 digits pass." : null,
      kinds.has("pan") ? "  ##  No PAN lookup is made; any 10 characters pass." : null,
      `  ##  Running in ${where}.`,
      "  ##  Unset this before this environment has real customers.",
      "  ############################################################",
      "",
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
  );
}

function unavailable(detail: string): IdentityError {
  return {
    ok: false,
    failure: "unavailable",
    message: "We could not reach the verification service just now. Please try again in a moment.",
    detail,
  };
}

/**
 * VRS products are provisioned per account, and an un-provisioned one answers
 * 200 with an ordinary-looking message rather than a 4xx. Offline Aadhaar in
 * particular is not enabled by default — Cashfree has to switch it on, and on
 * newer accounts they steer to DigiLocker instead.
 *
 * That is an outage as far as the customer is concerned, so it stays
 * `unavailable`. But it is an outage nobody fixes by waiting, so it gets its
 * own log line naming the thing to go and enable.
 */
function notEnabled(product: string, message: string): IdentityError {
  console.error(
    `[cashfreeIdentity] ${product} is not enabled on this Cashfree account. ` +
      `Ask Cashfree to provision it, or set IDENTITY_BYPASS=1 to test without it. Vendor said: ${message}`
  );
  return {
    ok: false,
    failure: "unavailable",
    message: "Identity verification is not available right now. Please try again shortly.",
    detail: `product not enabled: ${message}`,
  };
}

function rejected(message: string, detail: string | null = null): IdentityError {
  return { ok: false, failure: "rejected", message, detail };
}

/** `verification_id`: max 50 chars, alphanumeric plus `.`, `-`, `_`. */
function newVerificationId(tag: string): string {
  const safeTag = tag.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 16);
  return `bmb-${safeTag}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

interface CashfreeCall {
  path: string;
  body: Record<string, unknown>;
  /** /pan wants it; the Aadhaar endpoints ignore it. */
  sendApiVersion: boolean;
}

type CashfreeAnswer =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; error: IdentityError };

/**
 * One JSON call to VRS. Never throws.
 *
 * A non-2xx is returned rather than converted, because these APIs put the
 * *verification* verdict in 4xx bodies as often as in the 200 body — a wrong
 * OTP is a 400 with a message, not an exception. Only the statuses that are
 * unambiguously ours (401/403 config, 422 balance, 429 rate, 5xx outage) are
 * turned into `unavailable` here, so each caller reads only its own verdicts.
 */
async function callCashfree(call: CashfreeCall): Promise<CashfreeAnswer> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error: {
        ok: false,
        failure: "unavailable",
        message: "Identity verification is not switched on, so this cannot be checked yet.",
        detail: "CASHFREE_VRS_CLIENT_ID/SECRET not configured",
      },
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": config.clientId,
    "x-client-secret": config.clientSecret,
  };
  if (call.sendApiVersion) headers["x-api-version"] = config.apiVersion;

  let res: Response;
  try {
    res = await fetch(`${config.base}/verification${call.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(call.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    console.error(`[cashfreeIdentity] ${call.path} request failed:`, detail);
    return { ok: false, error: unavailable(detail) };
  }

  return readAnswer(call.path, res);
}

/**
 * Turn one VRS response into an answer, or into `unavailable`.
 *
 * The status class is decided *before* the body is parsed. A gateway error
 * comes back as an HTML page, and parsing that first would report an
 * unparseable response — true, but it buries the 504 that explains it.
 *
 * Everything left is handed back with its status intact, including 4xx: these
 * APIs put the verification verdict in a 4xx body as often as in a 200 one
 * (a denied consent, an expired session), so each caller reads its own.
 */
async function readAnswer(path: string, res: Response): Promise<CashfreeAnswer> {
  const raw = await res.text().catch(() => "");

  // Our problems, in every case: bad credentials, an un-whitelisted IP, an
  // empty VRS balance, our own rate limit, their outage. None of these are
  // anything the customer did, so none of them may read as a rejection.
  const isOurs =
    res.status === 401 ||
    res.status === 403 ||
    res.status === 422 ||
    res.status === 429 ||
    res.status >= 500;

  let body: Record<string, unknown> = {};
  let parsed = true;
  if (raw) {
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = false;
    }
  }

  if (isOurs) {
    const detail = parsed ? String(body.message ?? "") : raw.replace(/\s+/g, " ").trim();
    console.error(`[cashfreeIdentity] ${path} HTTP ${res.status}:`, detail.slice(0, 300));
    return { ok: false, error: unavailable(`HTTP ${res.status}: ${detail.slice(0, 200)}`) };
  }

  if (!parsed) {
    // A 2xx/4xx we cannot read is an outage shape, not a verdict.
    console.error(`[cashfreeIdentity] ${path} unparseable body:`, raw.slice(0, 300));
    return { ok: false, error: unavailable(`unparseable response (HTTP ${res.status})`) };
  }

  return { ok: true, status: res.status, body };
}

/**
 * One GET to VRS. Same contract as callCashfree — never throws, and only the
 * statuses that are unambiguously ours become `unavailable`.
 *
 * The DigiLocker endpoints are the only GETs we make, and both of them put a
 * meaningful verdict in a 4xx body (an expired session, an unknown
 * verification_id), so those are handed back for the caller to read.
 */
async function callCashfreeGet(path: string): Promise<CashfreeAnswer> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error: {
        ok: false,
        failure: "unavailable",
        message: "Identity verification is not switched on, so this cannot be checked yet.",
        detail: "CASHFREE_VRS_CLIENT_ID/SECRET not configured",
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${config.base}/verification${path}`, {
      method: "GET",
      headers: {
        "x-client-id": config.clientId,
        "x-client-secret": config.clientSecret,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    console.error(`[cashfreeIdentity] GET ${path} failed:`, detail);
    return { ok: false, error: unavailable(detail) };
  }

  return readAnswer(`GET ${path}`, res);
}

function messageOf(body: Record<string, unknown>): string {
  return typeof body.message === "string" ? body.message : "";
}

function statusOf(body: Record<string, unknown>): string {
  return typeof body.status === "string" ? body.status.toUpperCase() : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/* ── Aadhaar, via DigiLocker ──────────────────────────────────────────────── */

export function isValidAadhaarNumber(value: string): boolean {
  return /^\d{12}$/.test(value.replace(/\s/g, ""));
}

/**
 * Ask Cashfree for a DigiLocker consent URL.
 *
 * The customer opens it, signs in to DigiLocker with their own Aadhaar and
 * PIN, and consents to sharing their Aadhaar with us. Nothing about the
 * number passes through this app — they never type it, and we read it back
 * from DigiLocker afterwards. That is why this flow has no "wrong number"
 * rejection at all: there is nothing to get wrong.
 *
 * `redirect_url` is optional and must be https when given. It is omitted when
 * PUBLIC_URL is not https — a localhost dev server — because Cashfree refuses
 * a plain-http one outright and refusing to work in development would be
 * worse than landing on DigiLocker's own completion page. The signup tab
 * polls either way, so the redirect is a convenience, not the mechanism.
 */
export async function createDigiLockerUrl(
  verificationId: string
): Promise<DigiLockerUrlCreated | IdentityError> {
  const body: Record<string, unknown> = {
    verification_id: verificationId,
    document_requested: ["AADHAAR"],
  };
  const redirectUrl = digiLockerRedirectUrl();
  if (redirectUrl) body.redirect_url = redirectUrl;

  const answer = await callCashfree({ path: "/digilocker", body, sendApiVersion: false });
  if (!answer.ok) return answer.error;

  const message = messageOf(answer.body);
  const url = stringOrNull(answer.body.url);

  if (!url) {
    if (/not enabled/i.test(message)) return notEnabled("DigiLocker", message);
    // 409 is a verification_id collision, which is ours — we mint them.
    console.error("[cashfreeIdentity] digilocker: no url returned:", answer.status, message);
    return unavailable(`no url (HTTP ${answer.status}): ${message}`);
  }

  return {
    ok: true,
    url,
    verificationId: stringOrNull(answer.body.verification_id) ?? verificationId,
    referenceId: answer.body.reference_id != null ? String(answer.body.reference_id) : null,
  };
}

/** Only https is accepted by Cashfree, so anything else is treated as absent. */
function digiLockerRedirectUrl(): string | null {
  const base = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!base || !base.startsWith("https://")) return null;
  return `${base}/signup?digilocker=done`;
}

/**
 * Where the customer has got to in the DigiLocker journey.
 *
 * PENDING is not a failure — it is the normal answer while they are still on
 * DigiLocker's site, and the signup tab polls until it changes. The other
 * three are all terminal, and only one of them means we can go and read the
 * document.
 */
export async function getDigiLockerStatus(
  verificationId: string
): Promise<DigiLockerStatus | IdentityError> {
  const answer = await callCashfreeGet(`/digilocker?verification_id=${encodeURIComponent(verificationId)}`);
  if (!answer.ok) return answer.error;

  const raw = statusOf(answer.body);
  const message = messageOf(answer.body);

  if (answer.status === 404) {
    return {
      ok: false,
      failure: "expired",
      message: "That DigiLocker session is no longer valid. Please start it again.",
      detail: message || "404 on status",
    };
  }

  // Cashfree reports the journey's state in `status`, and its own errors in
  // the same field, so an unrecognised value is an outage rather than a
  // verdict we may act on.
  const state =
    raw === "PENDING" || raw === "AUTHENTICATED" || raw === "EXPIRED" || raw === "CONSENT_DENIED"
      ? raw
      : null;

  if (!state) {
    if (/not enabled/i.test(message)) return notEnabled("DigiLocker", message);
    console.error("[cashfreeIdentity] digilocker status unrecognised:", raw, message);
    return unavailable(`unrecognised status "${raw}": ${message}`);
  }

  const userDetails =
    answer.body.user_details && typeof answer.body.user_details === "object"
      ? (answer.body.user_details as Record<string, unknown>)
      : null;

  return {
    ok: true,
    state,
    /** DigiLocker's own record of who signed in. Not yet the document. */
    name: userDetails ? stringOrNull(userDetails.name) : null,
    referenceId: answer.body.reference_id != null ? String(answer.body.reference_id) : null,
  };
}

/**
 * Read the Aadhaar DigiLocker was authorised to share.
 *
 * Only worth calling once the status is AUTHENTICATED. A 202 means Cashfree
 * has the consent but is still fetching from DigiLocker — that is `pending`,
 * not a failure, and the caller polls again rather than telling the customer
 * anything.
 *
 * `uid` comes back masked (XXXXXXXX1234) as often as not, which is the form
 * UIDAI prefers anyone to hold. It is stored exactly as returned, and the OCR
 * comparison knows how to match a masked value against a full one — see
 * compareNumbers in cashfreeOcr.ts.
 *
 * `photo_link` is dropped for the same reason as in the OTP flow: we have no
 * use for a face photograph and storing one turns a KYC record into biometric
 * data.
 */
export async function fetchDigiLockerAadhaar(
  verificationId: string
): Promise<DigiLockerAadhaar | DigiLockerPending | IdentityError> {
  const answer = await callCashfreeGet(
    `/digilocker/document/AADHAAR?verification_id=${encodeURIComponent(verificationId)}`
  );
  if (!answer.ok) return answer.error;

  const message = messageOf(answer.body);

  if (answer.status === 202) {
    return { ok: true, pending: true };
  }

  if (answer.status === 400 && /expired/i.test(message)) {
    return {
      ok: false,
      failure: "expired",
      message: "That DigiLocker session has expired. Please start it again.",
      detail: message,
    };
  }

  const uid = stringOrNull(answer.body.uid);
  if (!uid) {
    if (/not enabled/i.test(message)) return notEnabled("DigiLocker", message);
    // Consent given but nothing to read means the Aadhaar is not in their
    // DigiLocker at all, which they fix on DigiLocker's side, not ours.
    console.error("[cashfreeIdentity] digilocker document: no uid:", answer.status, message);
    return rejected(
      "We could not read your Aadhaar from DigiLocker. Please make sure it is linked in your DigiLocker account, then try again.",
      `no uid (HTTP ${answer.status}): ${message}`
    );
  }

  const { photo_link: _photoLink, ...details } = answer.body;

  return {
    ok: true,
    pending: false,
    uid,
    name: stringOrNull(answer.body.name),
    dob: stringOrNull(answer.body.dob),
    gender: stringOrNull(answer.body.gender),
    careOf: stringOrNull(answer.body.care_of),
    details,
    referenceId: answer.body.reference_id != null ? String(answer.body.reference_id) : null,
  };
}

/* ── PAN ──────────────────────────────────────────────────────────────────── */

export function isValidPanNumber(value: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.trim().toUpperCase());
}

/**
 * Name-match verdicts that are good enough to open an account on.
 *
 * The Income Tax Department's records disagree with how people type their own
 * name constantly — initials expanded or not, surname first, a middle name
 * dropped. Cashfree grades that rather than answering yes/no, and refusing
 * anything short of DIRECT_MATCH would cost far more real customers than it
 * catches false ones.
 *
 * So only NO_MATCH refuses, which is the verdict for a PAN belonging to an
 * unrelated person — the case worth catching. Everything weaker than a direct
 * match is stored with its grade, so ops can look at a POOR_PARTIAL_MATCH
 * later without it having blocked signup.
 */
const ACCEPTED_NAME_MATCHES = new Set([
  "DIRECT_MATCH",
  "GOOD_PARTIAL_MATCH",
  "MODERATE_PARTIAL_MATCH",
  "POOR_PARTIAL_MATCH",
]);

/**
 * Our own name check, for when Cashfree declines to grade one.
 *
 * `name_match_result` is documented on this endpoint but is not always
 * returned — the sandbox omits it entirely, and answers a request for
 * "JOHN SNOW" with a registered name of "VEENA CHANDNANI" and no grade at
 * all. Trusting the absence would make the whole name check decoration:
 * anyone could verify a PAN that is not theirs and the API would say yes.
 *
 * So when there is no grade, one word in common decides it. That is
 * deliberately the weakest possible test, because Indian names disagree with
 * the Income Tax Department's records constantly — initials expanded or not,
 * surname first, a middle name dropped, "PRIVATE LIMITED" against "Pvt Ltd" —
 * and a stricter rule costs real customers. What it does catch is the case
 * worth catching: a PAN belonging to an unrelated person, which shares
 * nothing.
 *
 * Tokens under three characters are ignored, so an initial cannot carry a
 * match on its own.
 */
function sharesAnyNameToken(a: string, b: string): boolean {
  const tokens = (v: string): string[] =>
    v
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3);
  const left = new Set(tokens(a));
  if (left.size === 0) return true; // Nothing to compare on; do not invent a refusal.
  return tokens(b).some((token) => left.has(token));
}

/**
 * Verify a PAN exists, and that it is registered to the name on the account.
 *
 * `name` is the account's own name — the individual's for a personal account,
 * the company's for a corporate one, which is right because a company account
 * gives its company PAN.
 *
 * Like the Aadhaar OTP generator, this answers 200 for both "VALID" and
 * "Invalid PAN", so the body decides.
 */
export async function verifyPan(pan: string, name: string): Promise<PanVerified | IdentityError> {
  const normalized = pan.trim().toUpperCase();
  if (!isValidPanNumber(normalized)) {
    return rejected("Enter a valid 10-character PAN.");
  }

  const answer = await callCashfree({
    path: "/pan",
    body: { pan: normalized, verification_id: newVerificationId("pan"), name: name.trim() },
    sendApiVersion: true,
  });
  if (!answer.ok) return answer.error;

  const { body } = answer;
  const message = messageOf(body);

  if (body.valid !== true) {
    if (/not enabled/i.test(message)) return notEnabled("PAN Verification", message);
    return rejected("This PAN was not recognised. Please check the number and try again.", message);
  }

  // A PAN that exists but has been surrendered or deactivated is not one an
  // export consignment can be filed under, so it is refused with its own
  // wording rather than folded into "not recognised".
  const panStatus = stringOrNull(body.pan_status);
  if (panStatus && panStatus.toUpperCase() !== "VALID") {
    return rejected(
      `This PAN is marked ${panStatus.toLowerCase()} with the Income Tax Department and cannot be used. Please use an active PAN.`,
      `pan_status=${panStatus}`
    );
  }

  const nameMatchResult = stringOrNull(body.name_match_result);
  const registeredName = stringOrNull(body.registered_name) ?? stringOrNull(body.name_pan_card);

  if (nameMatchResult) {
    if (!ACCEPTED_NAME_MATCHES.has(nameMatchResult.toUpperCase())) {
      return rejected(
        "This PAN is registered to a different name. Please enter the PAN that belongs to this account.",
        `name_match_result=${nameMatchResult}`
      );
    }
  } else if (registeredName && !sharesAnyNameToken(name, registeredName)) {
    // No grade came back, so we make the call ourselves. See sharesAnyNameToken.
    return rejected(
      "This PAN is registered to a different name. Please enter the PAN that belongs to this account.",
      `ungraded name mismatch: provided="${name}" registered="${registeredName}"`
    );
  }

  const rawScore = body.name_match_score;
  const score = typeof rawScore === "number" ? rawScore : Number(rawScore);

  return {
    ok: true,
    registeredName,
    panType: stringOrNull(body.type),
    nameMatchResult,
    nameMatchScore: Number.isFinite(score) ? score : null,
    panStatus,
    aadhaarSeedingStatus: stringOrNull(body.aadhaar_seeding_status),
    details: body,
    referenceId: body.reference_id != null ? String(body.reference_id) : null,
  };
}
