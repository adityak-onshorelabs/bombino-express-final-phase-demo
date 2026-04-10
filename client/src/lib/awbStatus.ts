export type AwbStatusTone = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'orange';

export type AwbStatusEntry = { label: string; color: AwbStatusTone };

/** Keys are normalized: trim, collapse whitespace, uppercase */
export const AWB_STATUS_MAP: Record<string, AwbStatusEntry> = {
  ENTRY: { label: 'Booked', color: 'gray' },
  'PICK UP SCAN': { label: 'Picked Up', color: 'blue' },
  'IN SCAN': { label: 'In Transit', color: 'blue' },
  'IN-COMING MANIFEST': { label: 'In Transit', color: 'blue' },
  'INCOMING TRANSFER MANIFEST': { label: 'In Transit', color: 'blue' },
  'BRANCH MANIFEST': { label: 'In Transit', color: 'blue' },
  'TRANSFER MANIFEST': { label: 'In Transit', color: 'blue' },
  MANIFEST: { label: 'In Transit', color: 'blue' },
  REMANIFEST: { label: 'In Transit', color: 'blue' },
  'AWAITING CONNECTION': { label: 'In Transit', color: 'blue' },
  INTRANSIT: { label: 'In Transit', color: 'blue' },
  'SHIPMENT UNHOLD': { label: 'In Transit', color: 'blue' },
  DRS: { label: 'Out for Delivery', color: 'amber' },
  REDRS: { label: 'Out for Delivery', color: 'amber' },
  OFFLOADED: { label: 'Offloaded', color: 'amber' },
  HOLD: { label: 'On Hold', color: 'amber' },
  'SHIPMENT HOLD': { label: 'On Hold', color: 'amber' },
  DELIVERED: { label: 'Delivered', color: 'green' },
  UNDELIVERED: { label: 'Delivery Failed', color: 'red' },
  'UNDELIVERED/INTRANSIT-RTO': { label: 'Returning', color: 'orange' },
  RTO: { label: 'Returned', color: 'red' },
  'PART RTO': { label: 'Partially Returned', color: 'red' },
  CANCELLED: { label: 'Cancelled', color: 'red' },
  ABANDONED: { label: 'Abandoned', color: 'red' },
  LOST: { label: 'Lost', color: 'red' },
  MISSPLACED: { label: 'Misplaced', color: 'red' },
  MISPLACED: { label: 'Misplaced', color: 'red' },
};

function normalizeStateKey(state: string): string {
  return state.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function getStatusLabel(state: string): string {
  const trimmed = state.trim();
  if (!trimmed) return '';
  const key = normalizeStateKey(trimmed);
  return AWB_STATUS_MAP[key]?.label ?? trimmed;
}

export function getStatusColor(state: string): AwbStatusTone {
  const trimmed = state.trim();
  if (!trimmed) return 'gray';
  const key = normalizeStateKey(trimmed);
  return AWB_STATUS_MAP[key]?.color ?? 'gray';
}
