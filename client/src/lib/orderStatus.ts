import type { AwbStatusTone } from '@/lib/awbStatus';

/** Frozen status vocabulary from docs/final-phase/markdowns/final-phase-modules.md §3.
 *  M6 owns the real customer-facing label derivation; this is a stand-in until that lands. */
const ORDER_STATUS_MAP: Record<string, { label: string; tone: AwbStatusTone }> = {
  pickup_requested: { label: 'Pickup Requested', tone: 'gray' },
  agent_accepted: { label: 'Agent Assigned', tone: 'blue' },
  out_for_pickup: { label: 'Agent on the Way', tone: 'blue' },
  picked_up: { label: 'Picked Up', tone: 'blue' },
  awaiting_dropoff: { label: 'Awaiting Drop-off', tone: 'gray' },
  received_at_hub: { label: 'At Hub', tone: 'amber' },
  weighed: { label: 'Weighed', tone: 'amber' },
  settled: { label: 'Settled', tone: 'amber' },
  ready_for_docket: { label: 'Preparing Docket', tone: 'amber' },
  dispatched: { label: 'Dispatched', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_MAP[status]?.label ?? status;
}

export function getOrderStatusTone(status: string): AwbStatusTone {
  return ORDER_STATUS_MAP[status]?.tone ?? 'gray';
}
