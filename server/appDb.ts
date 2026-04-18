import type { CreateShipmentResponse } from "./itd.js";
import { supabase } from "./supabaseClient.js";
import type { ChatMessage } from "./supportTypes.js";

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
      "awb_number, consignee_name, consignee_city, consignee_country, service_name, total_amount, currency, current_status, booking_date, created_at, consignee_phone, origin_city, shipment_content, weight, dimensions, declared_value"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("listShipmentsByUserId", error);
    return null;
  }
  return data ?? [];
}

/** Last 5 shipments for BIA support; plain text for AI. null on DB error. */
export async function getRecentShipmentsByUserId(
  userId: string
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("shipments")
    .select(
      "awb_number, consignee_name, consignee_city, consignee_country, current_status, booking_date, service_name"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    logSupabaseError("getRecentShipmentsByUserId", error);
    return null;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return "No shipments found.";
  }

  const formatBooked = (d: string | null | undefined): string => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return rows
    .map((row: Record<string, unknown>) => {
      const awb = String(row.awb_number ?? "—");
      const city = String(row.consignee_city ?? "").trim();
      const country = String(row.consignee_country ?? "").trim();
      const to = [city, country].filter(Boolean).join(", ") || "—";
      const status = String(row.current_status ?? "—");
      const booked = formatBooked(row.booking_date as string | undefined);
      const svc = String(row.service_name ?? "—");
      return `AWB: ${awb} | To: ${to} | Status: ${status} | Booked: ${booked} | Service: ${svc}`;
    })
    .join("\n");
}

// ─── BIA support_sessions ───────────────────────────────────────────────────

function parseMessagesJson(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const role = m.role;
    const content = m.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    out.push({ role, content });
  }
  return out;
}

export function generateSessionTitle(firstUserMessage: string): string {
  const t = firstUserMessage.trim().replace(/\s+/g, " ");
  if (!t) return "Support chat";
  if (t.length <= 50) return t;
  const slice = t.slice(0, 50);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= 20) return slice.slice(0, lastSpace).trimEnd();
  return slice.trimEnd();
}

export async function getOrCreateSupportSession(userId: string): Promise<{
  id: string;
  messages: ChatMessage[];
  title: string | null;
} | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: existing, error: findError } = await client
    .from("support_sessions")
    .select("id, messages, title")
    .eq("user_id", userId)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    logSupabaseError("getOrCreateSupportSession_select", findError);
    return null;
  }

  if (existing?.id) {
    return {
      id: String(existing.id),
      messages: parseMessagesJson(existing.messages),
      title: existing.title != null ? String(existing.title) : null,
    };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await client
    .from("support_sessions")
    .insert({
      user_id: userId,
      messages: [],
      resolved: false,
      escalated: false,
      session_started_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertError) {
    logSupabaseError("getOrCreateSupportSession_insert", insertError);
    return null;
  }

  return {
    id: String(inserted.id),
    messages: [],
    title: null,
  };
}

export async function updateSupportSessionMessages(
  sessionId: string,
  messages: ChatMessage[],
  title?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const now = new Date().toISOString();

  const { error: msgErr } = await client
    .from("support_sessions")
    .update({ messages, updated_at: now })
    .eq("id", sessionId);

  if (msgErr) {
    logSupabaseError("updateSupportSessionMessages_messages", msgErr);
    return;
  }

  if (title !== undefined && title.length > 0) {
    const { data: row, error: selErr } = await client
      .from("support_sessions")
      .select("title")
      .eq("id", sessionId)
      .maybeSingle();

    if (selErr) {
      logSupabaseError("updateSupportSessionMessages_select_title", selErr);
      return;
    }

    if (row?.title == null || String(row.title).trim() === "") {
      const { error: titleErr } = await client
        .from("support_sessions")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (titleErr) {
        logSupabaseError("updateSupportSessionMessages_title", titleErr);
      }
    }
  }
}

export async function resolveSupportSession(sessionId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const now = new Date().toISOString();
  const { error } = await client
    .from("support_sessions")
    .update({
      resolved: true,
      session_ended_at: now,
      updated_at: now,
    })
    .eq("id", sessionId);

  if (error) {
    logSupabaseError("resolveSupportSession", error);
    return false;
  }
  return true;
}

export async function createNewSupportSession(
  userId: string
): Promise<{ id: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const now = new Date().toISOString();

  const { error: resolveErr } = await client
    .from("support_sessions")
    .update({
      resolved: true,
      session_ended_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq("resolved", false);

  if (resolveErr) {
    logSupabaseError("createNewSupportSession_resolve_open", resolveErr);
    return null;
  }

  const { data: inserted, error: insertError } = await client
    .from("support_sessions")
    .insert({
      user_id: userId,
      messages: [],
      resolved: false,
      escalated: false,
      session_started_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertError) {
    logSupabaseError("createNewSupportSession_insert", insertError);
    return null;
  }

  return { id: String(inserted.id) };
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

export async function listAddressesByUserIdAndType(
  userId: string,
  type: "sender" | "recipient"
): Promise<
  {
    id: string;
    full_name: string;
    company: string | null;
    phone: string;
    address_line_1: string;
    city: string;
    state: string | null;
    pincode: string | null;
    type: "sender" | "recipient";
  }[] | null
> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("addresses")
    .select("id, full_name, company, phone, address_line_1, city, state, pincode, type")
    .eq("user_id", userId)
    .eq("type", type)
    .order("use_count", { ascending: false })
    .order("last_used_at", { ascending: false });

  if (error) {
    logSupabaseError("listAddressesByUserIdAndType", error);
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

export async function upsertTrackingEvents(awbNumber: string, events: unknown[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !Array.isArray(events) || events.length === 0) {
    return;
  }

  const rows: {
    awb_number: string;
    event_at: string;
    event_type: string | null;
    event_description: string | null;
    event_location: string | null;
    raw_event: Json;
  }[] = [];

  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const e = ev as Record<string, unknown>;
    const eventAt = typeof e.event_at === "string" ? e.event_at.trim() : "";
    if (!eventAt) continue;
    rows.push({
      awb_number: awbNumber,
      event_at: eventAt,
      event_type: typeof e.event_type === "string" ? e.event_type : null,
      event_description: typeof e.event_description === "string" ? e.event_description : null,
      event_location: typeof e.event_location === "string" ? e.event_location : null,
      raw_event: ev as Json,
    });
  }

  if (rows.length === 0) return;

  try {
    const { error } = await client.from("tracking_events").upsert(rows, {
      onConflict: "awb_number,event_at",
      ignoreDuplicates: true,
    });
    if (error) {
      logSupabaseError("upsertTrackingEvents", error);
    }
  } catch (err) {
    console.error("[appDb] upsertTrackingEvents failed:", err);
  }
}

export async function updateShipmentTrackingStatus(
  awbNumber: string,
  currentStatus: string,
  lastTrackedAt: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client
      .from("shipments")
      .update({
        current_status: currentStatus,
        last_tracked_at: lastTrackedAt,
      })
      .eq("awb_number", awbNumber);

    if (error) {
      logSupabaseError("updateShipmentTrackingStatus", error);
    }
  } catch (err) {
    console.error("[appDb] updateShipmentTrackingStatus failed:", err);
  }
}

export type LastKnownTrackingRow = {
  currentStatus: string;
  lastTrackedAt: string;
};

export async function getLastKnownTracking(awbNumber: string): Promise<LastKnownTrackingRow | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("shipments")
      .select("current_status, last_tracked_at")
      .eq("awb_number", awbNumber)
      .maybeSingle();

    if (error) {
      logSupabaseError("getLastKnownTracking", error);
      return null;
    }
    if (!data) return null;

    const lastTrackedAt =
      data.last_tracked_at != null ? String(data.last_tracked_at) : "";
    if (!lastTrackedAt) return null;

    return {
      currentStatus:
        data.current_status != null && String(data.current_status).trim() !== ""
          ? String(data.current_status)
          : "INTRANSIT",
      lastTrackedAt,
    };
  } catch (err) {
    console.error("[appDb] getLastKnownTracking failed:", err);
    return null;
  }
}
