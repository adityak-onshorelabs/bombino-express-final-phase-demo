import { Link } from 'wouter';
import { MapPin, Weight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayInIst } from '@shared/pickupSlots';
import { bandForDate, toneForBand } from '@/lib/agentGrouping';
import { SlotChip } from '@/components/agent/SlotChip';
import type { AgentPickup } from '@/hooks/useAgentPickups';

/**
 * One job, readable at arm's length in direct sunlight.
 *
 * Design commitments, per PRODUCT.md:
 * - Status is set in size and weight, not colour. No coloured status chips —
 *   a palette of them would compete with the one thing colour means here.
 * - Amber means money and nothing else. If the card has an amber block, the
 *   agent is carrying or collecting cash.
 * - Address is the largest thing after the status, because it is what the
 *   agent actually acts on. The order number is reference data and recedes.
 */

/** Internal status → the short imperative the agent reads. */
const AGENT_STATUS_LABEL: Record<string, string> = {
  pickup_requested: 'Unclaimed',
  agent_accepted: 'Accepted',
  out_for_pickup: 'On the way',
  picked_up: 'In your bag',
  received_at_hub: 'At hub',
  cancelled: 'Cancelled',
};

export function agentStatusLabel(status: string): string {
  return AGENT_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

export function formatSlot(date: string | null, slot: string | null): string {
  if (!date && !slot) return 'No window set';
  const when = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';
  return [when, slot].filter(Boolean).join(' · ');
}

export function shortAddress(pickup: AgentPickup): string {
  const a = pickup.origin_address;
  if (!a) return 'Address unavailable';
  return [a.address_line_1, a.city, a.pincode].filter(Boolean).join(', ');
}

/**
 * Why a claimed job has no next step, when the reason is the calendar rather
 * than the state machine.
 *
 * The server refuses `start_pickup` before the pickup date (see
 * `pickupDateArrived` in server/orderLifecycle.ts) and simply omits it from
 * `availableActions`. Without this the agent is told "Nothing to do here" on a
 * job they hold and are expecting to work, which reads as a bug.
 *
 * Mirrors the server rule; it does not enforce it. The refusal is server-side
 * and stands whatever this returns.
 */
export function notDueYetReason(pickup: AgentPickup): string | null {
  if (pickup.status !== 'agent_accepted') return null;
  if (!pickup.pickup_date) return null;

  const today = todayInIst();
  if (pickup.pickup_date <= today) return null;

  const days = Math.round(
    (new Date(`${pickup.pickup_date}T00:00:00Z`).getTime() -
      new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days === 1) return 'Starts tomorrow';

  const when = new Date(`${pickup.pickup_date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  return `Starts ${when} · in ${days} days`;
}

/** Money the agent must physically collect. Nothing else is their problem. */
export function amountOwedAtDoor(pickup: AgentPickup): number | null {
  if (pickup.payment_method !== 'pay_at_pickup') return null;
  if (pickup.payment_status === 'paid') return null;
  return pickup.quoted_amount ?? null;
}

export function PickupCard({
  pickup,
  href,
  children,
}: {
  pickup: AgentPickup;
  href?: string;
  children?: React.ReactNode;
}) {
  const owed = amountOwedAtDoor(pickup);
  const address = pickup.origin_address;
  const band = bandForDate(pickup.pickup_date);
  const tone = toneForBand(band);

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={cn(
            'text-[11px] uppercase tracking-[0.14em] font-bold',
            tone.eyebrow,
          )}
        >
          {/* An overdue job says so before it says what state it is in — the
              status is what the agent already knows, the slipped date is not. */}
          {band === 'overdue' ? `Overdue · ${agentStatusLabel(pickup.status)}` : agentStatusLabel(pickup.status)}
        </p>
        <p className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0">
          {pickup.order_no}
        </p>
      </div>

      <p className="text-xl font-extrabold tracking-tight text-foreground leading-tight mt-1.5">
        {address?.full_name ?? 'Unknown sender'}
      </p>

      <div className="flex items-start gap-2 mt-2">
        <MapPin className="w-4 h-4 text-foreground/70 shrink-0 mt-0.5" strokeWidth={2.5} />
        <p className="text-sm font-medium text-foreground/80 leading-snug">
          {shortAddress(pickup)}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-2.5">
        <SlotChip pickupDate={pickup.pickup_date} pickupSlot={pickup.pickup_slot} />
        <span className="flex items-center gap-1.5">
          <Weight className="w-3.5 h-3.5 text-foreground/60" strokeWidth={2.5} />
          <span className="text-xs font-semibold text-foreground/70 tabular-nums">
            {pickup.booked_weight ? `${pickup.booked_weight} kg est.` : 'No weight'}
          </span>
        </span>
      </div>

      {owed !== null && (
        <div
          className="flex items-baseline gap-2 mt-3 rounded-lg bg-[#F2A123] px-3 py-2"
          data-testid="badge-collect-cash"
        >
          <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#1B2A41]">
            Collect
          </span>
          <span className="text-lg font-extrabold text-[#1B2A41] tabular-nums leading-none">
            ₹{owed}
          </span>
        </div>
      )}

      {children && <div className="mt-3">{children}</div>}
    </>
  );

  const shell = cn('block rounded-xl border-2 p-4', tone.shell);

  if (!href) {
    return (
      <div className={shell} data-testid={`pickup-card-${pickup.order_no}`}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(shell, 'active:scale-[0.99] transition-transform')}
      data-testid={`pickup-card-${pickup.order_no}`}
    >
      {body}
    </Link>
  );
}
