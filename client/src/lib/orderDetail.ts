/**
 * Client view of `GET /api/orders/:orderNo`.
 *
 * The booking blob (`order.items`) is the ITD docket payload verbatim — see
 * `CreateShipmentPayload` in CreateShipment.tsx. It is stored as free-form
 * jsonb, so nothing here may assume a field is present: every read goes
 * through a narrowing helper and yields null rather than throwing on an older
 * order booked before a field existed.
 *
 * Units are not uniform across the record and must never be inferred:
 *   - `order.booked_weight`      kilograms  (what the customer typed, normalised)
 *   - `items.actual_weight`      pounds     (what ITD is quoted in)
 *   - `docket_items[].l/w/h`     inches     (converted from cm at booking)
 *   - `order.quoted_amount`      INR        (freight charged by Bombino)
 *   - `items.shipment_value`     `shipment_value_currency` (declared customs
 *                                value of the goods — a different currency and
 *                                a different thing entirely)
 */

import type {
  CancellationState,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@shared/orderContract';

// ── Wire types ────────────────────────────────────────────────────────────

export interface OrderAddress {
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
}

/** The `consignee` jsonb column — written by the booking flow, stable shape. */
export interface OrderConsignee {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line_1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country_code?: string | null;
  country_name?: string | null;
}

export interface OrderDetailOrder {
  id: string;
  order_no: string;
  status: OrderStatus;
  pickup_request: 1 | 2;
  pickup_date: string | null;
  pickup_slot: string | null;
  consignee: OrderConsignee | null;
  items: Record<string, unknown> | null;
  booked_weight: number | null;
  quoted_amount: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  is_cod: boolean;
  agent_id: string | null;
  actual_weight: number | null;
  final_amount: number | null;
  awb_no: string | null;
  created_at: string;
  updated_at: string;
  origin_address: OrderAddress | null;
}

/** One entry in the customer-facing lifecycle log. */
export interface OrderDetailEvent {
  id: string;
  at: string;
  status: string;
  /** Customer-facing phrase, derived server-side so it matches the badge. */
  label: string;
  note: string | null;
  action: string | null;
  actorName: string | null;
  actorKind: 'agent' | 'ops' | 'you' | 'system';
  amount: number | null;
}

export interface OrderDetailPayment {
  id: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  collectedAt: string;
  collectedByName: string | null;
}

/**
 * A cancellation the customer has asked for.
 *
 * `pending` is the whole point: a request does not cancel anything. Ops decides,
 * and until they do the order carries on — the agent still comes, and the page
 * must say that rather than implying the parcel is off.
 */
export interface OrderDetailCancellationRequest {
  state: CancellationState;
  requestedAt: string;
  reason: string | null;
  decidedAt: string | null;
  /** Ops' words when they declined. Null on an approval. */
  decisionNote: string | null;
  pending: boolean;
}

/**
 * The customer's handover code for this order.
 *
 * `pickup` is read out to the agent at the door; `dropoff` is read out at the
 * hub counter. The agent's own `hub` code never appears here — the customer has
 * no part in that handover.
 *
 * `code` may be null while `kind` is set: the handover is due but no code is on
 * file, which is the one moment the page must offer to generate one rather than
 * silently showing nothing.
 */
export interface OrderDetailHandover {
  kind: 'pickup' | 'dropoff';
  code: string | null;
  /** Too many wrong attempts. A fresh code is the only way forward. */
  locked: boolean;
}

export interface OrderDetailResponse {
  order: OrderDetailOrder;
  customerStatus: string;
  agent: { name: string | null; phone: string | null } | null;
  events: OrderDetailEvent[];
  payments: OrderDetailPayment[];
  availableActions: { action: string; label: string; requiresPayload?: boolean }[];
  cancellationRequest: OrderDetailCancellationRequest | null;
  handover: OrderDetailHandover | null;
  warning?: string;
}

export async function fetchOrderDetail(orderNo: string): Promise<OrderDetailResponse> {
  const res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Could not load this order');
  }
  return (await res.json()) as OrderDetailResponse;
}

// ── Reading the booking blob ──────────────────────────────────────────────

/** A jsonb string field, trimmed, or null when absent/blank/not a string. */
export function itemStr(items: Record<string, unknown> | null, key: string): string | null {
  const raw = items?.[key];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** The single docket line — the flow writes exactly one, but never assume it. */
export function docketItem(
  items: Record<string, unknown> | null
): { length?: string; width?: string; height?: string; number_of_boxes?: string } | null {
  const list = items?.docket_items;
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return first && typeof first === 'object' ? (first as Record<string, string>) : null;
}

/**
 * `L × W × H in` — null unless all three are present and at least one is
 * non-zero. The booking flow writes '0' for dimensions the customer skipped,
 * and "0 × 0 × 0 in" is worse than showing nothing.
 */
export function formatDimensions(items: Record<string, unknown> | null): string | null {
  const d = docketItem(items);
  if (!d) return null;
  const nums = [d.length, d.width, d.height].map((v) => (v == null ? NaN : parseFloat(v)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (nums.every((n) => n === 0)) return null;
  const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${nums.map(round).join(' × ')} in`;
}

/**
 * The HS code, which lives on the invoice line rather than at the top level —
 * the booking flow writes it into `free_form_line_items[0].hscode` and nowhere
 * else. Only CSB V shipments collect one, so this is null on most orders.
 */
export function hsCode(items: Record<string, unknown> | null): string | null {
  const list = items?.free_form_line_items;
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0] as Record<string, unknown> | null;
  const code = first?.hscode;
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  return trimmed === '' ? null : trimmed;
}

/** Declared customs value of the goods, in its own currency. Not the freight. */
export function formatDeclaredValue(items: Record<string, unknown> | null): string | null {
  const value = itemStr(items, 'shipment_value');
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const currency = itemStr(items, 'shipment_value_currency') ?? 'USD';
  return `${currency} ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** Rupee freight amount. Everything the customer pays Bombino is in INR. */
export function formatInr(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// ── Labels ────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pay_now: 'Paid online',
  pay_at_pickup: 'Pay at pickup',
  pay_at_dropoff: 'Pay at drop-off',
  cod: 'Cash on delivery',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  partially_paid: 'Partially paid',
  refund_due: 'Refund due',
  failed: 'Failed',
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

/** `'09:00-11:00'` → `'9:00 AM – 11:00 AM'`. Falls back to the raw value. */
export function formatSlot(slot: string | null): string | null {
  if (!slot) return null;
  const parts = slot.split('-');
  if (parts.length !== 2) return slot;
  const to12h = (hhmm: string): string | null => {
    const [h, m] = hhmm.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  };
  const from = to12h(parts[0]);
  const till = to12h(parts[1]);
  return from && till ? `${from} – ${till}` : slot;
}
