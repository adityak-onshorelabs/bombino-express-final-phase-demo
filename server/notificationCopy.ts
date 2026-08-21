/**
 * What a status change is called when we say it out loud.
 *
 * Lifted out of `routes.ts`, where it sat inside `registerRoutes` and could
 * only be read by the one block that used it. Both notification channels now
 * import it, which is the point: the in-app row and the WhatsApp message must
 * say the same thing about the same event, and two copies of this table would
 * drift apart within a sprint.
 *
 * The titles come from `deriveCustomerStatus` in the shared contract. This is
 * the second line — what the status means for the person reading it.
 *
 * Nothing here may name an internal status. The customer never sees the words
 * `weighed`, `settled` or `ready_for_docket` (roles-and-flows.md §1), and the
 * absence of those three keys is deliberate rather than an oversight.
 */

export const CUSTOMER_STATUS_DETAIL: Record<string, string> = {
  agent_accepted: "An agent has accepted your pickup.",
  out_for_pickup: "Your agent is on the way to collect your parcel.",
  picked_up: "Your parcel has been collected.",
  received_at_hub: "Your parcel has arrived at the Bombino hub.",
  dispatched: "Your parcel is on its way. You can now track it.",
  cancelled: "Your order has been cancelled.",
};

/** The fallback the fan-out used inline before this file existed. */
export const CUSTOMER_STATUS_DETAIL_FALLBACK = "Your order has been updated.";

export function customerStatusDetail(status: string): string {
  return CUSTOMER_STATUS_DETAIL[status] ?? CUSTOMER_STATUS_DETAIL_FALLBACK;
}
