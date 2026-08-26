import { supabase } from "./supabaseClient.js";

/**
 * Persistence for identity_verifications — the Aadhaar and PAN numbers an
 * authority has confirmed. See migrations/add_identity_verifications.sql.
 *
 * Deliberately shaped like accountDocsDb.ts: same signup_ref → user_id
 * ownership handover, same "list by signup", same claim-at-creation. The two
 * halves of onboarding move together, and a reader of one should recognise
 * the other.
 */

export type IdentityKind = "aadhaar" | "pan";
export type IdentityStatus = "verified" | "bypassed";

export type IdentityVerificationRow = {
  id: string;
  user_id: string | null;
  signup_ref: string | null;
  kind: IdentityKind;
  document_no: string;
  status: IdentityStatus;
  reference_id: string | null;
  verified_name: string | null;
  /** PAN only: the name the check was run against. See the migration. */
  name_submitted: string | null;
  name_match_result: string | null;
  name_match_score: number | null;
  details: Record<string, unknown> | null;
  verified_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * Everything but `details`, for the same reason accountDocsDb leaves out the
 * OCR blobs: nothing that lists verifications needs the vendor payload.
 */
export type IdentityVerificationMeta = Omit<IdentityVerificationRow, "details">;

const META_COLUMNS =
  "id, user_id, signup_ref, kind, document_no, status, reference_id, verified_name, name_submitted, name_match_result, name_match_score, verified_at, created_at, updated_at";

function getClient() {
  if (!supabase) {
    console.error("[identityDb] supabase client is not configured");
    return null;
  }
  return supabase;
}

function logError(operation: string, error: { message?: string; code?: string } | null): void {
  console.error("[identityDb] operation failed:", {
    operation,
    message: error?.message,
    code: error?.code,
  });
}

export type UpsertIdentityVerificationInput = {
  /** Exactly one of these two identifies the owner. */
  signup_ref?: string;
  user_id?: string;
  kind: IdentityKind;
  document_no: string;
  status: IdentityStatus;
  reference_id: string | null;
  verified_name: string | null;
  name_submitted?: string | null;
  name_match_result?: string | null;
  name_match_score?: number | null;
  details: Record<string, unknown> | null;
};

/**
 * Record one confirmed number, replacing whatever was there.
 *
 * Replacing matters: a customer who mistypes their Aadhaar, gets it refused,
 * then verifies a second one must leave exactly one row behind — otherwise
 * the documents step would prefill from a number that is no longer the one
 * that was proved.
 */
export async function upsertIdentityVerification(
  input: UpsertIdentityVerificationInput
): Promise<IdentityVerificationMeta | null> {
  const client = getClient();
  if (!client) return null;

  const owner: { column: "signup_ref" | "user_id"; value: string } = input.signup_ref
    ? { column: "signup_ref", value: input.signup_ref }
    : { column: "user_id", value: input.user_id! };

  const now = new Date().toISOString();
  const payload = {
    document_no: input.document_no,
    status: input.status,
    reference_id: input.reference_id,
    verified_name: input.verified_name,
    name_submitted: input.name_submitted ?? null,
    name_match_result: input.name_match_result ?? null,
    name_match_score: input.name_match_score ?? null,
    details: input.details,
    verified_at: now,
    updated_at: now,
  };

  const { data: existing } = await client
    .from("identity_verifications")
    .select("id")
    .eq(owner.column, owner.value)
    .eq("kind", input.kind)
    .maybeSingle();

  if (existing) {
    const { data, error } = await client
      .from("identity_verifications")
      .update(payload)
      .eq("id", existing.id)
      .select(META_COLUMNS)
      .single();

    if (error) {
      logError("upsertIdentityVerification:update", error);
      return null;
    }
    return data as IdentityVerificationMeta;
  }

  const { data, error } = await client
    .from("identity_verifications")
    .insert({
      [owner.column]: owner.value,
      kind: input.kind,
      ...payload,
      created_at: now,
    })
    .select(META_COLUMNS)
    .single();

  if (error) {
    logError("upsertIdentityVerification:insert", error);
    return null;
  }
  return data as IdentityVerificationMeta;
}

export async function listIdentityVerificationsBySignupRef(
  signupRef: string
): Promise<IdentityVerificationMeta[]> {
  const client = getClient();
  if (!client) return [];

  const { data, error } = await client
    .from("identity_verifications")
    .select(META_COLUMNS)
    .eq("signup_ref", signupRef)
    .order("created_at", { ascending: true });

  if (error) {
    logError("listIdentityVerificationsBySignupRef", error);
    return [];
  }
  return (data ?? []) as IdentityVerificationMeta[];
}

export async function listIdentityVerificationsByUserId(
  userId: string
): Promise<IdentityVerificationMeta[]> {
  const client = getClient();
  if (!client) return [];

  const { data, error } = await client
    .from("identity_verifications")
    .select(META_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    logError("listIdentityVerificationsByUserId", error);
    return [];
  }
  return (data ?? []) as IdentityVerificationMeta[];
}

/**
 * Hand the staged verifications to the account that was just created.
 *
 * Same contract as claimSignupDocuments: runs after the itd_users row exists,
 * and a failure leaves the rows on the signup_ref side rather than losing the
 * account.
 */
export async function claimSignupIdentityVerifications(
  signupRef: string,
  userId: string
): Promise<number> {
  const client = getClient();
  if (!client) return 0;

  const { data, error } = await client
    .from("identity_verifications")
    .update({ user_id: userId, signup_ref: null, updated_at: new Date().toISOString() })
    .eq("signup_ref", signupRef)
    .select("id");

  if (error) {
    logError("claimSignupIdentityVerifications", error);
    return 0;
  }
  return data?.length ?? 0;
}
