import { Link } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slotLabel, todayInIst } from '@shared/pickupSlots';
import { bandForDate, toneForBand } from '@/lib/agentGrouping';
import type { AgentPickup } from '@/hooks/useAgentPickups';

/**
 * One job, readable at arm's length in direct sunlight.
 *
 * Two forms, because the agent surface asks two different questions of a job:
 *
 *   JobEntry — the job you are deciding about or acting on. Name at 20px,
 *              address, mono meta.
 *   JobRow   — the job you are only accounting for. One line of name, one line
 *              of mono meta, a chevron to the sheet.
 *
 * Neither draws its own border. Both live inside a panel and are separated
 * from their neighbours by a single hairline, because a bordered card inside a
 * bordered panel is a border inside a border.
 *
 * Design commitments, per PRODUCT.md and the docket grammar:
 * - Status is set in size, weight and case — never a coloured chip.
 * - Amber means money and nothing else. If a job shows amber, the agent is
 *   collecting cash at that door.
 * - Red means late and nothing else, and comes from the job's band.
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

export function shortAddress(pickup: AgentPickup): string {
  const a = pickup.origin_address;
  if (!a) return 'Address unavailable';
  // Pincode hangs off the city rather than taking a comma of its own — it is
  // part of the same place, and a third comma makes the line read as a list.
  const place = [a.city, a.pincode].filter(Boolean).join(' ');
  return [a.address_line_1, place].filter(Boolean).join(', ');
}

/** The street line only — the sheet and the compact rows both want it short. */
export function streetLine(pickup: AgentPickup): string {
  const a = pickup.origin_address;
  if (!a) return 'Address unavailable';
  return [a.address_line_1, a.city].filter(Boolean).join(', ');
}

/** Every rupee figure on this surface, grouped the Indian way. */
export function money(amount: number): string {
  return amount.toLocaleString('en-IN');
}

/** `12 AUG` — mono data, so month never renders as a word longer than three. */
function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    .toUpperCase();
}

/**
 * The appointment, as mono data rather than a chip.
 *
 * It was a coloured chip; the colour law leaves colour to money and to late, so
 * the window earns its emphasis from weight and from being first in the meta
 * row instead.
 */
export function windowLabel(pickup: AgentPickup, withDate = false): string {
  // `9 – 11 AM` → `9–11 AM`. The shared label is set for prose; mono data wants
  // the range closed up so the whole window reads as one token.
  const slot = pickup.pickup_slot
    ? slotLabel(pickup.pickup_slot).toUpperCase().replace(/\s*–\s*/g, '–')
    : null;
  const date = pickup.pickup_date && withDate ? shortDate(pickup.pickup_date) : null;
  if (!slot && !date) return 'NO WINDOW SET';
  return [date, slot].filter(Boolean).join(' · ');
}

export function weightLabel(pickup: AgentPickup): string {
  return pickup.booked_weight ? `${pickup.booked_weight} KG EST.` : 'NO WEIGHT';
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

/** The same fact as `notDueYetReason`, set as mono data for a compact row. */
export function notDueYetMeta(pickup: AgentPickup): string | null {
  const reason = notDueYetReason(pickup);
  return reason ? reason.toUpperCase() : null;
}

/** Money the agent must physically collect. Nothing else is their problem. */
export function amountOwedAtDoor(pickup: AgentPickup): number | null {
  if (pickup.payment_method !== 'pay_at_pickup') return null;
  if (pickup.payment_status === 'paid') return null;
  return pickup.quoted_amount ?? null;
}

/**
 * Where this job's money stands, in the words the agent needs at the door.
 *
 * Deliberately plain mono text in the meta row, not a coloured chip: amber on
 * this surface means "you are collecting cash" and nothing else, so a green
 * PAID pill would spend the one colour signal the agent relies on.
 *
 * Returns null for the one case the job already answers louder — an unpaid
 * pay-at-pickup job, which carries the amber amount. Saying it twice in two
 * registers is how an agent starts skimming both.
 *
 * The "don't collect" wording is not a permission check. The server refuses
 * `collect_payment` on anything but pay_at_pickup and omits the button
 * entirely; this exists for the customer at the door who offers cash anyway.
 */
export function paymentNote(pickup: AgentPickup): string | null {
  const { payment_method: method, payment_status: status } = pickup;

  if (method === 'pay_at_pickup') {
    return status === 'paid' ? 'Already paid' : null;
  }

  // Collected at the destination by someone else entirely — never by us.
  if (method === 'cod') return 'COD · collect nothing';

  if (method === 'pay_now') {
    if (status === 'paid') return 'Prepaid';
    if (status === 'partially_paid') return 'Part paid · don’t collect';
    if (status === 'refund_due') return 'Refund due · don’t collect';
    return 'Unpaid online · don’t collect';
  }

  // pay_at_dropoff cannot reach a pickup job — the booking endpoint refuses
  // the pairing — but if one ever does, say so rather than showing nothing.
  if (method === 'pay_at_dropoff') return 'Pays at hub · collect nothing';

  return null;
}

/**
 * The mono meta line under a compact row's name.
 *
 * Window first, because it is the appointment. An overdue job leads with LATE
 * and carries its slipped date; everything else carries the payment note only
 * when there is something to say about it.
 */
export function rowMeta(pickup: AgentPickup, today = todayInIst()): string {
  const isOverdue = bandForDate(pickup.pickup_date, today) === 'overdue';
  if (isOverdue) return `LATE · ${windowLabel(pickup, true)}`;

  const note = paymentNote(pickup);
  const withDate = bandForDate(pickup.pickup_date, today) === 'scheduled';
  return [windowLabel(pickup, withDate), note?.toUpperCase()].filter(Boolean).join(' · ');
}

/** The status eyebrow, which says "late" before it says anything else. */
export function eyebrowText(pickup: AgentPickup, today = todayInIst()): string {
  const band = bandForDate(pickup.pickup_date, today);
  if (band === 'overdue' && pickup.pickup_date) {
    return `Late · since ${new Date(`${pickup.pickup_date}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })}`;
  }
  return agentStatusLabel(pickup.status);
}

/** How a job's owed amount is carried. `strip` means the caller renders it. */
type AmountForm = 'chip' | 'due' | 'strip' | 'none';

/**
 * A full job entry, filling a panel's width.
 *
 * `children` is a full-bleed footer — an action row or an amber money strip —
 * so it cancels the entry's own horizontal padding rather than sitting inside
 * it.
 */
export function JobEntry({
  pickup,
  amount = 'chip',
  eyebrow,
  children,
}: {
  pickup: AgentPickup;
  amount?: AmountForm;
  /** Overrides the status eyebrow, e.g. `Unclaimed · 12 min ago` on Calls. */
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  const owed = amountOwedAtDoor(pickup);
  const payment = paymentNote(pickup);
  const band = bandForDate(pickup.pickup_date);
  const tone = toneForBand(band);
  const isOverdue = band === 'overdue';

  return (
    <div data-testid={`job-entry-${pickup.order_no}`}>
      <div className={cn('px-4 pt-3.5', children ? 'pb-3' : 'pb-3.5')}>
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              'font-mono text-[10px] font-bold uppercase tracking-[0.14em]',
              tone.eyebrow,
            )}
          >
            {eyebrow ?? eyebrowText(pickup)}
          </span>
          <span className="font-mono text-[10px] font-medium text-[#64748B] shrink-0">
            {pickup.order_no}
          </span>
        </div>

        <p className="text-xl font-bold tracking-[-0.01em] leading-[1.15] text-[#1B2A41] mt-1.5">
          {pickup.origin_address?.full_name ?? 'Unknown sender'}
        </p>

        <p className="text-sm font-medium leading-[1.4] text-[#334155] mt-1">
          {shortAddress(pickup)}
        </p>

        <div className="flex items-center gap-4 mt-2.5">
          <span
            className={cn(
              'font-mono text-[11px]',
              isOverdue ? 'font-bold text-[#B91C1C]' : 'font-semibold text-[#1B2A41]',
            )}
          >
            {windowLabel(pickup, isOverdue)}
          </span>
          <span className="font-mono text-[11px] font-medium text-[#64748B]">
            {weightLabel(pickup)}
          </span>
          {payment && (
            <span
              className="font-mono text-[11px] font-medium uppercase text-[#64748B]"
              data-testid="payment-note"
            >
              {payment}
            </span>
          )}
          {owed !== null && amount === 'due' && (
            <span className="font-mono text-[11px] font-bold text-[#1B2A41]">
              ₹{money(owed)} DUE
            </span>
          )}
          {owed !== null && amount === 'chip' && (
            <span
              className="ml-auto bg-[#F2A123] px-1.5 py-[3px] font-mono text-[11px] font-bold text-[#1B2A41] tabular-nums"
              data-testid="badge-collect-cash"
            >
              ₹{money(owed)}
            </span>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

/** The full-bleed amber strip: the one place a doorstep amount shouts. */
export function CollectStrip({ amount }: { amount: number }) {
  return (
    <div
      className="flex items-center justify-between bg-[#F2A123] px-4 py-2.5"
      data-testid="strip-collect-cash"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B2A41]">
        Collect at door
      </span>
      <span className="font-mono text-lg font-bold leading-none text-[#1B2A41] tabular-nums">
        ₹{money(amount)}
      </span>
    </div>
  );
}

/**
 * The hub handover code, on a job already in the agent's bag.
 *
 * Read out at the hub counter for ops to type in. It earns a full-bleed strip
 * of its own because of where it gets used: a counter, on a bad signal, with
 * somebody waiting — the number has to be findable without opening the job
 * sheet, and legible without being read twice.
 *
 * NOT amber. On this surface amber means money and nothing else (PRODUCT.md),
 * and a code that shouted in the same colour as an amount owed would be read as
 * one. Weight and letter-spacing do the work instead: 22px mono, `0.22em`
 * tracking, so six digits come apart into six digits rather than a number.
 *
 * `code` is null when nothing has been issued — a seeded order, or a write that
 * failed at pickup. That state gets a generate control rather than a blank,
 * because a strip that shows `——————` and offers no way forward is the dead end
 * this is meant to prevent.
 */
export function HubCodeStrip({
  code,
  onGenerate,
  pending = false,
}: {
  code: string | null;
  onGenerate?: () => void;
  pending?: boolean;
}) {
  return (
    <div
      className="border-t border-[#E2E8F0]! bg-[#F1F5F9] px-4 py-3"
      data-testid="strip-hub-code"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B2A41]">
          Hub code
        </span>
        {code ? (
          <span
            className="font-mono text-[22px] font-bold leading-none tracking-[0.22em] text-[#1B2A41] tabular-nums"
            data-testid="text-hub-code"
          >
            {code}
          </span>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            disabled={pending || !onGenerate}
            className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41] underline underline-offset-4 disabled:opacity-50"
            data-testid="button-generate-hub-code"
          >
            {pending ? 'Getting code' : 'Generate code'}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] font-medium leading-[1.35] text-[#64748B]">
        {code
          ? 'Read this out at the hub counter. It is what closes this job.'
          : 'No code on this job yet. Generate one before you reach the hub.'}
      </p>
    </div>
  );
}

/**
 * A job you are only accounting for: one line of name, one line of mono meta.
 *
 * `meta` is passed in rather than derived, because what matters about a compact
 * row differs by screen — an unclaimed call shows its window and area, a
 * scheduled job of your own shows how many days off it is.
 */
export function JobRow({
  pickup,
  meta,
  address,
  showAmount = true,
}: {
  pickup: AgentPickup;
  meta: string;
  /** Second line, above the meta. Omitted where the meta already carries it. */
  address?: string;
  showAmount?: boolean;
}) {
  const owed = amountOwedAtDoor(pickup);
  const band = bandForDate(pickup.pickup_date);
  const tone = toneForBand(band);
  const isOverdue = band === 'overdue';

  return (
    <Link
      href={`/agent/pickup/${pickup.id}`}
      className={cn('flex items-center gap-3 px-4 py-3', tone.row)}
      data-testid={`job-row-${pickup.order_no}`}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold leading-[1.2] text-[#1B2A41] truncate">
          {pickup.origin_address?.full_name ?? 'Unknown sender'}
        </span>
        {address && (
          <span className="block text-[13px] font-medium text-[#475569] truncate mt-0.5">
            {address}
          </span>
        )}
        <span
          className={cn(
            'block font-mono text-[10.5px] tracking-[0.06em] mt-1',
            isOverdue ? 'font-bold' : 'font-semibold',
            tone.meta,
          )}
        >
          {meta}
        </span>
      </span>

      {showAmount && owed !== null && (
        <span className="shrink-0 bg-[#F2A123] px-[7px] py-1 font-mono text-xs font-bold text-[#1B2A41] tabular-nums">
          ₹{money(owed)}
        </span>
      )}
      <ChevronRight className="w-4 h-4 shrink-0 text-[#94A3B8]" strokeWidth={2.5} />
    </Link>
  );
}
