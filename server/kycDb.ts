import { supabase } from "./supabaseClient.js";

export type KycDocumentRow = {
  id: string;
  user_id: string;
  capability_id: string;
  document_type: string;
  document_no: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  file_data: string;
  created_at: string;
  updated_at: string;
};

export type KycDocumentMeta = Omit<KycDocumentRow, "file_data">;

function getClient() {
  if (!supabase) {
    console.error("[kycDb] supabase client is not configured");
    return null;
  }
  return supabase;
}

function logError(operation: string, error: { message?: string; code?: string } | null): void {
  console.error("[kycDb] operation failed:", {
    operation,
    message: error?.message,
    code: error?.code,
  });
}

export async function getKycByUserId(userId: string): Promise<KycDocumentRow | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from("kyc_documents")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logError("getKycByUserId", error);
    return null;
  }
  return data as KycDocumentRow | null;
}

export async function getKycByCapabilityId(capabilityId: string): Promise<KycDocumentRow | null> {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client
    .from("kyc_documents")
    .select("*")
    .eq("capability_id", capabilityId)
    .maybeSingle();

  if (error) {
    logError("getKycByCapabilityId", error);
    return null;
  }
  return data as KycDocumentRow | null;
}

export type UpsertKycInput = {
  user_id: string;
  capability_id: string;
  document_type: string;
  document_no: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  file_data: string;
};

export async function upsertKycDocument(input: UpsertKycInput): Promise<KycDocumentMeta | null> {
  const client = getClient();
  if (!client) return null;

  const now = new Date().toISOString();
  const { data: existing } = await client
    .from("kyc_documents")
    .select("id, capability_id, created_at")
    .eq("user_id", input.user_id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await client
      .from("kyc_documents")
      .update({
        document_type: input.document_type,
        document_no: input.document_no,
        original_filename: input.original_filename,
        mime_type: input.mime_type,
        file_size_bytes: input.file_size_bytes,
        file_data: input.file_data,
        updated_at: now,
      })
      .eq("user_id", input.user_id)
      .select(
        "id, user_id, capability_id, document_type, document_no, original_filename, mime_type, file_size_bytes, created_at, updated_at"
      )
      .single();

    if (error) {
      logError("upsertKycDocument:update", error);
      return null;
    }
    return data as KycDocumentMeta;
  }

  const { data, error } = await client
    .from("kyc_documents")
    .insert({
      user_id: input.user_id,
      capability_id: input.capability_id,
      document_type: input.document_type,
      document_no: input.document_no,
      original_filename: input.original_filename,
      mime_type: input.mime_type,
      file_size_bytes: input.file_size_bytes,
      file_data: input.file_data,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id, user_id, capability_id, document_type, document_no, original_filename, mime_type, file_size_bytes, created_at, updated_at"
    )
    .single();

  if (error) {
    logError("upsertKycDocument:insert", error);
    return null;
  }
  return data as KycDocumentMeta;
}
