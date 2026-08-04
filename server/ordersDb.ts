import { supabase } from "./supabaseClient.js";
import type { Order } from "../shared/orderContract.js";

type Json = Record<string, unknown> | unknown[] | null;

function logSupabaseError(operation: string, error: { message?: string; code?: string } | null): void {
  console.error("[ordersDb] supabase operation failed (non-fatal):", {
    operation,
    message: error?.message,
    code: error?.code,
  });
}

function getSupabaseClient() {
  if (!supabase) {
    console.error("[ordersDb] supabase client is not configured");
    return null;
  }
  return supabase;
}

export type PickupRequest = 1 | 2;
export type PaymentMethod = "pay_now" | "pay_at_pickup" | "pay_at_dropoff" | "cod";

export type OrderInsert = {
  user_id: string;
  status: string;
  pickup_request: PickupRequest;
  pickup_date: string | null;
  pickup_slot: string | null;
  origin_address_id: string;
  consignee: Json;
  items: Json;
  booked_weight: number | null;
  quoted_amount: number | null;
  payment_method: PaymentMethod;
  is_cod: boolean;
};

export type OrderRow = {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  pickup_request: number;
  pickup_date: string | null;
  pickup_slot: string | null;
  origin_address_id: string | null;
  consignee: Json;
  items: Json;
  booked_weight: number | null;
  quoted_amount: number | null;
  payment_method: string;
  payment_status: string;
  is_cod: boolean;
  agent_id: string | null;
  actual_weight: number | null;
  final_amount: number | null;
  awb_no: string | null;
  created_at: string;
  updated_at: string;
};

export async function insertOrderAndReturnRow(input: OrderInsert): Promise<OrderRow | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("orders")
    .insert(input)
    .select(
      "id, order_no, user_id, status, pickup_request, pickup_date, pickup_slot, origin_address_id, consignee, items, booked_weight, quoted_amount, payment_method, payment_status, is_cod, agent_id, actual_weight, final_amount, awb_no, created_at, updated_at"
    )
    .single();

  if (error) {
    logSupabaseError("insertOrderAndReturnRow", error);
    return null;
  }
  return data as OrderRow;
}

export async function insertOrderEvent(input: {
  order_id: string;
  status: string;
  note?: string | null;
  actor_user_id?: string | null;
  metadata?: Json;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client.from("order_events").insert({
    order_id: input.order_id,
    status: input.status,
    note: input.note ?? null,
    actor_user_id: input.actor_user_id ?? null,
    metadata: input.metadata ?? null,
  });

  if (error) {
    logSupabaseError("insertOrderEvent", error);
    return false;
  }
  return true;
}

const ORDER_COLUMNS =
  "id, order_no, user_id, status, pickup_request, pickup_date, pickup_slot, origin_address_id, consignee, items, booked_weight, quoted_amount, payment_method, payment_status, is_cod, agent_id, actual_weight, final_amount, awb_no, metadata, created_at, updated_at";

/**
 * Narrow a DB row to the shared `Order` contract.
 *
 * The DB columns are `text`/`smallint`/`numeric`; the contract is unions. The
 * CHECK constraints already guarantee the values, so this is a re-assertion at
 * the boundary rather than validation — but an unknown status is returned as-is
 * and will simply match no transition, which fails closed.
 */
export function toOrder(row: OrderRow & { metadata?: unknown }): Order {
  return {
    ...row,
    status: row.status as Order["status"],
    pickup_request: row.pickup_request === 2 ? 2 : 1,
    payment_method: row.payment_method as Order["payment_method"],
    payment_status: row.payment_status as Order["payment_status"],
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/** Single order by id. Returns null when missing or on DB error. */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getOrderById", error);
    return null;
  }
  if (!data) return null;
  return toOrder(data as unknown as OrderRow);
}

/**
 * The pickup address, embedded via the orders → addresses FK.
 *
 * Same embed the agent uses (`agentDb.PICKUP_ADDRESS_EMBED`) — the customer
 * needs it for the mirror-image reason: to confirm the address they gave is
 * the one an agent will turn up at.
 */
const ORIGIN_ADDRESS_EMBED =
  "origin_address:addresses(id, full_name, company, phone, email, address_line_1, address_line_2, city, state, pincode, country_code, country_name)";

export type OrderAddress = {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country_code: string | null;
  country_name: string | null;
};

export type OrderWithAddress = Order & { origin_address: OrderAddress | null };

/**
 * One order, by its human-facing number, scoped to its owner.
 *
 * `user_id` is in the WHERE clause rather than checked in JS afterwards: the
 * service-role key bypasses RLS, so this predicate *is* the authorisation
 * boundary (§4.2 of open-items). A mismatched owner returns null, which the
 * route reports as 404 — an ownership failure and a missing row are
 * indistinguishable to the caller by design.
 */
export async function getOrderByNumberForUser(
  orderNo: string,
  userId: string
): Promise<OrderWithAddress | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("orders")
    .select(`${ORDER_COLUMNS}, ${ORIGIN_ADDRESS_EMBED}`)
    .eq("order_no", orderNo)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getOrderByNumberForUser", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as OrderRow & { origin_address?: OrderAddress | null };
  return { ...toOrder(row), origin_address: row.origin_address ?? null };
}

export type OrderEventRow = {
  id: string;
  order_id: string;
  status: string;
  note: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Lifecycle log for one order, oldest first — the order it happened in. */
export async function listOrderEvents(orderId: string): Promise<OrderEventRow[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("order_events")
    .select("id, order_id, status, note, actor_user_id, metadata, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("listOrderEvents", error);
    return null;
  }
  return (data ?? []) as OrderEventRow[];
}

export type OrderPaymentRow = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  collected_by: string | null;
  collected_at: string | null;
  reference: string | null;
  created_at: string;
};

/**
 * Money recorded against an order. COD never produces a row — an empty list is
 * not the same as "unpaid" (see the header of migrations/create_payments.sql).
 */
export async function listPaymentsByOrderId(orderId: string): Promise<OrderPaymentRow[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("payments")
    .select("id, amount, currency, method, status, collected_by, collected_at, reference, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("listPaymentsByOrderId", error);
    return null;
  }
  return (data ?? []) as OrderPaymentRow[];
}

export type StaffContact = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

/**
 * Names for the user ids appearing on an order's events and payments, so the
 * customer reads "Collected by Ravi" instead of a UUID. Returns a map rather
 * than a list because every caller looks up by id.
 */
export async function getUserContactsByIds(ids: string[]): Promise<Map<string, StaffContact>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const client = getSupabaseClient();
  if (!client) return new Map();

  const { data, error } = await client
    .from("itd_users")
    .select("id, full_name, phone, role")
    .in("id", unique);

  if (error) {
    logSupabaseError("getUserContactsByIds", error);
    return new Map();
  }
  return new Map((data as StaffContact[]).map((u) => [u.id, u]));
}

export async function listOrdersByUserId(userId: string): Promise<OrderRow[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("orders")
    .select(
      "id, order_no, user_id, status, pickup_request, pickup_date, pickup_slot, origin_address_id, consignee, items, booked_weight, quoted_amount, payment_method, payment_status, is_cod, agent_id, actual_weight, final_amount, awb_no, created_at, updated_at"
    )
    .eq("user_id", userId)
    // Most recently moved first — an order the agent just advanced should lead.
    .order("updated_at", { ascending: false });

  if (error) {
    logSupabaseError("listOrdersByUserId", error);
    return null;
  }
  return (data ?? []) as OrderRow[];
}
