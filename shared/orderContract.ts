/**
 * M0 item 3 — the shared order vocabulary.
 *
 * Imported by both server and client. Nothing in here may import from
 * `server/` or `client/`, and nothing here may touch the database or the
 * network: it is types plus pure functions, so both lanes can compile against
 * it independently.
 *
 * The status vocabulary is frozen. No additions without both developers
 * agreeing — see docs/final-phase/markdowns/final-phase-modules.md §3.
 */

// ── Status ────────────────────────────────────────────────────────────────

/**
 * Pickup path:   pickup_requested → agent_accepted → out_for_pickup
 *                  → picked_up → received_at_hub
 * Drop-off path: awaiting_dropoff → received_at_hub
 * Both, at hub:  received_at_hub → weighed → settled → ready_for_docket
 *                  → dispatched
 * Plus `cancelled` from most states.
 */
export type OrderStatus =
  | 'pickup_requested'
  | 'agent_accepted'
  | 'out_for_pickup'
  | 'picked_up'
  | 'awaiting_dropoff'
  | 'received_at_hub'
  | 'weighed'
  | 'settled'
  | 'ready_for_docket'
  | 'dispatched'
  | 'cancelled';

/** Runtime companion to `OrderStatus` — mirrors the DB CHECK constraint. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pickup_requested',
  'agent_accepted',
  'out_for_pickup',
  'picked_up',
  'awaiting_dropoff',
  'received_at_hub',
  'weighed',
  'settled',
  'ready_for_docket',
  'dispatched',
  'cancelled',
] as const;

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

// ── Roles ─────────────────────────────────────────────────────────────────

export type Role = 'customer' | 'agent' | 'admin' | 'super_admin';

export const ROLES: readonly Role[] = ['customer', 'agent', 'admin', 'super_admin'] as const;

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Anything ops can do, super_admin can do. Kept as a helper rather than
 * baked into each transition row so M7 landing (or not landing) changes one
 * place. Note this is *not* a general hierarchy — an admin is not an agent,
 * because ops must never claim a pickup on an agent's behalf (§1).
 */
export function roleSatisfies(callerRole: Role, requiredRole: Role): boolean {
  if (callerRole === requiredRole) return true;
  return callerRole === 'super_admin' && requiredRole === 'admin';
}

// ── Payment ───────────────────────────────────────────────────────────────

export type PaymentMethod = 'pay_now' | 'pay_at_pickup' | 'pay_at_dropoff' | 'cod';

export type PaymentStatus = 'pending' | 'paid' | 'partially_paid' | 'refund_due' | 'failed';

// ── Order ─────────────────────────────────────────────────────────────────

/**
 * The order as both lanes see it. Field names match the `orders` columns
 * one-for-one so a row can be handed across without a mapping layer.
 *
 * Fulfilment columns are nullable because A3 never writes them — see the
 * column-partition table in §4.
 */
export interface Order {
  id: string;
  order_no: string;
  user_id: string;
  status: OrderStatus;

  // [A3] booking
  /** ITD's convention: 1 = pickup, 2 = drop-off. */
  pickup_request: 1 | 2;
  pickup_date: string | null;
  pickup_slot: string | null;
  origin_address_id: string | null;
  consignee: unknown;
  items: unknown;
  booked_weight: number | null;
  quoted_amount: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  is_cod: boolean;

  // [fulfilment] M2/M3/M5/A5
  agent_id: string | null;
  actual_weight: number | null;
  final_amount: number | null;
  awb_no: string | null;

  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * Every lifecycle verb, for every role and surface. One endpoint consumes
 * these: POST /api/orders/:id/actions.
 */
export type Action =
  // agent (A5)
  | 'claim'
  | 'start_pickup'
  | 'mark_picked_up'
  | 'mark_received_at_hub'
  // collection — agent at the door (A5), ops at the counter (M3)
  | 'collect_payment'
  // ops (M2/M3/M5)
  | 'mark_received_dropoff'
  | 'weigh'
  | 'settle'
  | 'generate_docket'
  // both
  | 'cancel';

/**
 * One entry per button the caller may legally press right now. The server
 * computes these; the UI renders one control per entry and holds no copy of
 * the state machine itself. That is what lets either developer add or rename
 * a transition without touching the other's code.
 */
export interface AvailableAction {
  action: Action;
  label: string;
  /** True when the action needs input (a weight, an amount) before it fires. */
  requiresPayload?: boolean;
}

// ── Customer-facing derivation (M6 owns the fan-out; this is the mapping) ──

/**
 * Internal status → the phrase the customer reads. The customer never sees
 * `weighed`, `settled` or `ready_for_docket`: between arriving at the hub and
 * being dispatched their view deliberately sits still, so all three resolve
 * to the same "Arrived at Bombino hub" the parcel already showed.
 */
const CUSTOMER_STATUS: Record<OrderStatus, string> = {
  pickup_requested: 'Pickup requested',
  awaiting_dropoff: 'Awaiting drop-off',
  agent_accepted: 'Pickup confirmed',
  out_for_pickup: 'Agent on the way',
  picked_up: 'Parcel picked up',
  received_at_hub: 'Arrived at Bombino hub',
  // Internal — no visible change. Not a bug: see §2 of roles-and-flows.
  weighed: 'Arrived at Bombino hub',
  settled: 'Arrived at Bombino hub',
  ready_for_docket: 'Arrived at Bombino hub',
  dispatched: 'In transit',
  cancelled: 'Cancelled',
};

export function deriveCustomerStatus(order: Order): string {
  return CUSTOMER_STATUS[order.status] ?? 'Processing';
}

/**
 * Statuses that produce no customer-visible change and must fire no
 * notification. M6 reads this to stay silent.
 */
export const INTERNAL_ONLY_STATUSES: readonly OrderStatus[] = [
  'weighed',
  'settled',
  'ready_for_docket',
] as const;

export function isInternalOnlyStatus(status: OrderStatus): boolean {
  return (INTERNAL_ONLY_STATUSES as readonly string[]).includes(status);
}

// ── Payment gate ──────────────────────────────────────────────────────────

/**
 * The single helper both lanes use to answer "may this order advance toward a
 * docket?".
 *
 * STUB — M3 owns the real implementation (reconciliation against `payments`
 * rows and the reprice delta). The signature is fixed here so A5 and M3 can be
 * written against it in parallel.
 *
 * Returns false for everything except COD, which passes by design and must
 * never block a docket (§4, Flow C). Erring closed means a premature caller
 * gets a refusal rather than a wrongly-dispatched parcel.
 */
export function isPaymentSatisfied(order: Order): boolean {
  if (order.is_cod || order.payment_method === 'cod') return true;
  return false;
}
