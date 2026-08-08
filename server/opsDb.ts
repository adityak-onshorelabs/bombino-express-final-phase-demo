/**
 * Phase 3A — Ops order reads (board + detail).
 *
 * Separate from ordersDb / agentDb so Aditya's modules stay untouched.
 * No ownership filter: admin/super_admin see every order.
 */

import { supabase } from "./supabaseClient.js";

const BOARD_COLUMNS =
  "id, order_no, status, created_at, pickup_request, pickup_date, pickup_slot, payment_method, payment_status, is_cod, quoted_amount, final_amount, consignee, agent_id, awb_no";

const DETAIL_COLUMNS =
  "id, order_no, user_id, status, pickup_request, pickup_date, pickup_slot, origin_address_id, consignee, items, booked_weight, quoted_amount, payment_method, payment_status, is_cod, agent_id, actual_weight, final_amount, awb_no, itd_docket_response, metadata, created_at, updated_at";

function getSupabaseClient() {
  return supabase;
}

function logSupabaseError(op: string, error: { message?: string; code?: string } | null): void {
  console.error(`[opsDb] ${op} failed:`, error?.code, error?.message);
}

function consigneeField(
  consignee: unknown,
  keys: string[]
): string | null {
  if (!consignee || typeof consignee !== "object" || Array.isArray(consignee)) {
    return null;
  }
  const c = consignee as Record<string, unknown>;
  for (const key of keys) {
    const v = c[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

export type OpsBoardOrder = {
  id: string;
  order_no: string;
  status: string;
  created_at: string;
  pickup_request: number;
  pickup_date: string | null;
  pickup_slot: string | null;
  payment_method: string;
  payment_status: string;
  is_cod: boolean;
  quoted_amount: number | null;
  final_amount: number | null;
  consignee_name: string | null;
  consignee_city: string | null;
  agent_id: string | null;
  awb_no: string | null;
};

export type OpsOrderDetail = {
  id: string;
  order_no: string;
  user_id: string;
  status: string;
  pickup_request: number;
  pickup_date: string | null;
  pickup_slot: string | null;
  origin_address_id: string | null;
  consignee: unknown;
  items: unknown;
  booked_weight: number | null;
  quoted_amount: number | null;
  payment_method: string;
  payment_status: string;
  is_cod: boolean;
  agent_id: string | null;
  actual_weight: number | null;
  final_amount: number | null;
  awb_no: string | null;
  itd_docket_response: unknown;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type OpsOrderEvent = {
  id: string;
  status: string;
  note: string | null;
  actor_user_id: string | null;
  metadata: unknown;
  created_at: string;
};

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapBoardRow(row: Record<string, unknown>): OpsBoardOrder {
  return {
    id: String(row.id),
    order_no: String(row.order_no),
    status: String(row.status),
    created_at: String(row.created_at),
    pickup_request: row.pickup_request === 2 ? 2 : 1,
    pickup_date: (row.pickup_date as string | null) ?? null,
    pickup_slot: (row.pickup_slot as string | null) ?? null,
    payment_method: String(row.payment_method),
    payment_status: String(row.payment_status),
    is_cod: Boolean(row.is_cod),
    quoted_amount: toNum(row.quoted_amount),
    final_amount: toNum(row.final_amount),
    consignee_name: consigneeField(row.consignee, ["name", "full_name"]),
    consignee_city: consigneeField(row.consignee, ["city", "consignee_city"]),
    agent_id: (row.agent_id as string | null) ?? null,
    awb_no: (row.awb_no as string | null) ?? null,
  };
}

function mapDetailRow(row: Record<string, unknown>): OpsOrderDetail {
  return {
    id: String(row.id),
    order_no: String(row.order_no),
    user_id: String(row.user_id),
    status: String(row.status),
    pickup_request: row.pickup_request === 2 ? 2 : 1,
    pickup_date: (row.pickup_date as string | null) ?? null,
    pickup_slot: (row.pickup_slot as string | null) ?? null,
    origin_address_id: (row.origin_address_id as string | null) ?? null,
    consignee: row.consignee ?? null,
    items: row.items ?? null,
    booked_weight: toNum(row.booked_weight),
    quoted_amount: toNum(row.quoted_amount),
    payment_method: String(row.payment_method),
    payment_status: String(row.payment_status),
    is_cod: Boolean(row.is_cod),
    agent_id: (row.agent_id as string | null) ?? null,
    actual_weight: toNum(row.actual_weight),
    final_amount: toNum(row.final_amount),
    awb_no: (row.awb_no as string | null) ?? null,
    itd_docket_response: row.itd_docket_response ?? null,
    metadata: row.metadata ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Newest-first board list. Hard cap 200. Optional exact status filter. */
export async function listAllOrdersForOps(opts: {
  status?: string;
  limit?: number;
}): Promise<OpsBoardOrder[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const limit = opts.limit ?? 200;
  let query = client
    .from("orders")
    .select(BOARD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.status) {
    query = query.eq("status", opts.status);
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError("listAllOrdersForOps", error);
    return null;
  }

  return (data ?? []).map((row) => mapBoardRow(row as Record<string, unknown>));
}

/** Full order by id — no user_id filter. */
export async function getOrderByIdForOps(id: string): Promise<OpsOrderDetail | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("orders")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logSupabaseError("getOrderByIdForOps", error);
    return null;
  }
  if (!data) return null;

  return mapDetailRow(data as Record<string, unknown>);
}

/** Timeline events for an order, oldest first. */
export async function listOrderEventsForOps(
  orderId: string
): Promise<OpsOrderEvent[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("order_events")
    .select("id, status, note, actor_user_id, metadata, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("listOrderEventsForOps", error);
    return null;
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    status: String(row.status),
    note: (row.note as string | null) ?? null,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    metadata: row.metadata ?? null,
    created_at: String(row.created_at),
  }));
}
