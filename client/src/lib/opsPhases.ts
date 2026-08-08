/**
 * Ops board phases — derived from the frozen OrderStatus ladder in
 * shared/orderContract.ts. Grouping is display-only; the API returns a flat list.
 */

import type { OrderStatus } from '@shared/orderContract';

export type OpsPhaseId =
  | 'inbound'
  | 'hub'
  | 'settled'
  | 'dispatched'
  | 'cancelled';

export type OpsPhase = {
  id: OpsPhaseId;
  label: string;
  /** When true, the board collapses this phase by default. */
  collapsedByDefault: boolean;
  /** Shown as a desktop column (cancelled is listed separately). */
  showAsColumn: boolean;
  statuses: readonly OrderStatus[];
};

export const OPS_PHASES: readonly OpsPhase[] = [
  {
    id: 'inbound',
    label: 'Pickup / inbound',
    collapsedByDefault: false,
    showAsColumn: true,
    statuses: [
      'pickup_requested',
      'agent_accepted',
      'out_for_pickup',
      'picked_up',
      'awaiting_dropoff',
    ],
  },
  {
    id: 'hub',
    label: 'At hub',
    collapsedByDefault: false,
    showAsColumn: true,
    statuses: ['received_at_hub', 'weighed'],
  },
  {
    id: 'settled',
    label: 'Settled',
    collapsedByDefault: false,
    showAsColumn: true,
    statuses: ['settled', 'ready_for_docket'],
  },
  {
    id: 'dispatched',
    label: 'Dispatched',
    collapsedByDefault: false,
    showAsColumn: true,
    statuses: ['dispatched'],
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    collapsedByDefault: true,
    showAsColumn: false,
    statuses: ['cancelled'],
  },
] as const;

const STATUS_TO_PHASE = new Map<string, OpsPhaseId>();
for (const phase of OPS_PHASES) {
  for (const status of phase.statuses) {
    STATUS_TO_PHASE.set(status, phase.id);
  }
}

export function phaseIdForStatus(status: string): OpsPhaseId {
  return STATUS_TO_PHASE.get(status) ?? 'inbound';
}

export function groupOrdersByPhase<T extends { status: string }>(
  orders: T[]
): Record<OpsPhaseId, T[]> {
  const out: Record<OpsPhaseId, T[]> = {
    inbound: [],
    hub: [],
    settled: [],
    dispatched: [],
    cancelled: [],
  };
  for (const order of orders) {
    out[phaseIdForStatus(order.status)].push(order);
  }
  return out;
}
