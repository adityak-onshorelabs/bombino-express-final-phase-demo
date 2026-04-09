import type { CreateShipmentResponse } from "./itd.js";
import { supabase } from "./supabaseClient.js";

type Json = Record<string, unknown> | unknown[] | null;

type AddressInsert = {
  user_id: string;
  type: "sender" | "recipient";
  full_name: string;
  company: string | null;
  email: string | null;
  phone: string;
  address_line_1: string;
  city: string;
  state: string | null;
  pincode: string | null;
  country_code: string;
  country_name: string | null;
};

type ShipmentInsert = {
  user_id: string;
  awb_number: string;
  sender_address_id: string;
  recipient_address_id: string;
  sender_name: string;
  sender_company: string | null;
  sender_phone: string;
  sender_city: string;
  sender_state: string | null;
  sender_country: string | null;
  consignee_name: string;
  consignee_company: string | null;
  consignee_phone: string;
  consignee_city: string;
  consignee_state: string | null;
  consignee_country: string | null;
  service_name: string | null;
  service_code: string | null;
  product_code: string | null;
  origin_country: string;
  destination_country: string;
  weight_kg: number | null;
  pieces: number | null;
  declared_value: number | null;
  currency: string;
  invoice_number: string | null;
  contents_description: string | null;
  total_amount: number | null;
  other_charges: number | null;
  current_status: string;
  booking_date: string;
  itd_response: CreateShipmentResponse;
};

function logSupabaseError(operation: string, error: { message?: string; code?: string } | null): void {
  console.error("[appDb] supabase operation failed (non-fatal):", {
    operation,
    message: error?.message,
    code: error?.code,
  });
}

function getSupabaseClient() {
  if (!supabase) {
    console.error("[appDb] supabase client is not configured");
    return null;
  }
  return supabase;
}

export async function findItdUserIdByCustomerId(
  itdCustomerId: string
): Promise<{ id: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("itd_users")
    .select("id")
    .eq("itd_customer_id", itdCustomerId)
    .maybeSingle();

  if (error) {
    logSupabaseError("findItdUserIdByCustomerId", error);
    return null;
  }
  return data;
}

type UpsertItdUserInput = {
  itd_customer_id: string;
  itd_customer_code: string;
  email: string;
  full_name: string;
  username: string;
  role: string;
  itd_token?: string | null;
  itd_token_expires_at?: string | null;
  itd_password_encrypted?: string | null;
  encryption_iv?: string | null;
};

export async function upsertItdUserAndReturnId(
  payload: UpsertItdUserInput
): Promise<{ id: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const now = new Date().toISOString();
  const { itd_token, itd_token_expires_at, itd_password_encrypted, encryption_iv, ...rest } =
    payload;
  const optionalCols: Record<string, string | null | undefined> = {};
  if (itd_token !== undefined) optionalCols.itd_token = itd_token;
  if (itd_token_expires_at !== undefined) optionalCols.itd_token_expires_at = itd_token_expires_at;
  if (itd_password_encrypted !== undefined) {
    optionalCols.itd_password_encrypted = itd_password_encrypted;
  }
  if (encryption_iv !== undefined) optionalCols.encryption_iv = encryption_iv;

  const { data, error } = await client
    .from("itd_users")
    .upsert(
      {
        ...rest,
        ...optionalCols,
        last_login_at: now,
        updated_at: now,
      },
      { onConflict: "itd_customer_id" }
    )
    .select("id")
    .single();

  if (error) {
    logSupabaseError("upsertItdUserAndReturnId", error);
    return null;
  }
  return data;
}

export type ItdUserTokenSecretsRow = {
  itd_token_expires_at: string | null;
  itd_password_encrypted: string | null;
  encryption_iv: string | null;
};

export async function getItdUserTokenAndSecretsById(
  userId: string
): Promise<ItdUserTokenSecretsRow | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("itd_users")
    .select("itd_token_expires_at, itd_password_encrypted, encryption_iv")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getItdUserTokenAndSecretsById", error);
    return null;
  }
  return data;
}

export async function updateItdUserTokenById(
  userId: string,
  token: string,
  expiresAtIso: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client
    .from("itd_users")
    .update({
      itd_token: token,
      itd_token_expires_at: expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    logSupabaseError("updateItdUserTokenById", error);
    return false;
  }
  return true;
}

export async function insertLoginAuditLog(input: {
  user_id: string;
  metadata: Json;
  ip_address: string | null;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client.from("audit_log").insert({
    user_id: input.user_id,
    action: "login",
    metadata: input.metadata,
    ip_address: input.ip_address,
  });

  if (error) {
    logSupabaseError("insertLoginAuditLog", error);
    return false;
  }
  return true;
}

export async function getItdUserProfileById(id: string): Promise<any | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("itd_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logSupabaseError("getItdUserProfileById", error);
    return null;
  }
  return data;
}

export async function listShipmentsByUserId(userId: string): Promise<any[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("shipments")
    .select(
      "awb_number, consignee_name, consignee_city, consignee_country, service_name, total_amount, currency, current_status, booking_date, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("listShipmentsByUserId", error);
    return null;
  }
  return data ?? [];
}

export async function countUnreadNotifications(userId: string): Promise<number | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { count, error } = await client
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .or("is_read.is.null,is_read.eq.false");

  if (error) {
    logSupabaseError("countUnreadNotifications", error);
    return null;
  }
  return count ?? 0;
}

export async function listNotificationsByUserId(userId: string): Promise<any[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("listNotificationsByUserId", error);
    return null;
  }
  return data ?? [];
}

export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<{ id: string }[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    logSupabaseError("markNotificationRead", error);
    return null;
  }
  return data ?? [];
}

export async function insertAddressAndReturnId(
  input: AddressInsert
): Promise<{ id: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("addresses")
    .insert(input)
    .select("id")
    .single();

  if (error) {
    logSupabaseError("insertAddressAndReturnId", error);
    return null;
  }
  return data;
}

export async function insertShipmentAndReturnId(
  input: ShipmentInsert
): Promise<{ id: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("shipments")
    .insert(input)
    .select("id")
    .single();

  if (error) {
    logSupabaseError("insertShipmentAndReturnId", error);
    return null;
  }
  return data;
}

export async function insertShipmentCreatedNotification(input: {
  user_id: string;
  title: string;
  body: string;
  data: Json;
  shipment_id: string;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client.from("notifications").insert({
    user_id: input.user_id,
    type: "shipment_created",
    title: input.title,
    body: input.body,
    data: input.data,
    shipment_id: input.shipment_id,
  });

  if (error) {
    logSupabaseError("insertShipmentCreatedNotification", error);
    return false;
  }
  return true;
}

export async function insertShipmentCreatedAuditLog(input: {
  user_id: string;
  entity_id: string;
  metadata: Json;
  ip_address: string | null;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client.from("audit_log").insert({
    user_id: input.user_id,
    action: "shipment_created",
    entity_type: "shipment",
    entity_id: input.entity_id,
    metadata: input.metadata,
    ip_address: input.ip_address,
  });

  if (error) {
    logSupabaseError("insertShipmentCreatedAuditLog", error);
    return false;
  }
  return true;
}
