import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Loader2, Phone, Navigation } from 'lucide-react';
import { AgentJobSheet } from '@/components/agent/AgentShell';
import { ActionBar } from '@/components/agent/ActionButtons';
import { CollectPaymentSheet } from '@/components/agent/CollectPaymentSheet';
import {
  agentStatusLabel,
  amountOwedAtDoor,
  eyebrowText,
  money,
  notDueYetReason,
  weightLabel,
  windowLabel,
} from '@/components/agent/PickupCard';
import { todayInIst } from '@shared/pickupSlots';
import { bandForDate } from '@/lib/agentGrouping';
import { docketItem, type OrderConsignee } from '@/lib/orderDetail';
import { HandoverOtpSheet } from '@/components/agent/HandoverOtpSheet';
import {
  useAvailablePickups,
  useMyPickups,
  useOrderAction,
  useRegenerateHandoverCode,
} from '@/hooks/useAgentPickups';
import type { AgentPickup } from '@/hooks/useAgentPickups';
import type { PaymentMethod, PaymentStatus } from '@shared/orderContract';

/**
 * One job, as a single sheet.
 *
 * Four stacked bordered cards became one document: the sender appears once, at
 * the top, at the size an agent reads from a doorstep; then the two things they
 * do with a phone; then the docket, which is every field ops would print. The
 * duplication the old screen carried — the card's name and address, then a
 * "Collect from" card repeating both — is gone.
 *
 * Reads from the two cached lists rather than a per-order endpoint: both are
 * already scoped by the server, and this avoids a second round trip on a phone
 * that may be on bad network.
 *
 * Both lists, not just `mine`: the dashboard and Calls link unclaimed jobs
 * straight here, so a job the agent has not taken yet must resolve too. The
 * buttons come from the server either way, so an unclaimed job simply offers
 * Accept and then carries on down the same sheet once claimed.
 *
 * A consequence worth knowing: when the agent marks `received_at_hub` the
 * server drops the job from `mine`, and it is in neither list. That is the
 * handoff working, not an error — we redirect back.
 */

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pay_now: 'PAY NOW',
  pay_at_pickup: 'PAY AT PICKUP',
  pay_at_dropoff: 'PAY AT HUB',
  cod: 'COD',
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'UNPAID',
  paid: 'PAID',
  partially_paid: 'PART PAID',
  refund_due: 'REFUND DUE',
  failed: 'FAILED',
};

/** `12 Aug` — for prose, not for the mono docket. */
function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** `ON THE WAY · TODAY` — state, then when it is owed. */
function sheetEyebrow(pickup: AgentPickup, today: string): string {
  const band = bandForDate(pickup.pickup_date, today);
  if (band === 'overdue') return eyebrowText(pickup, today);
  if (band === 'today') return `${agentStatusLabel(pickup.status)} · today`;
  if (!pickup.pickup_date) return agentStatusLabel(pickup.status);
  return `${agentStatusLabel(pickup.status)} · ${dayMonth(`${pickup.pickup_date}T00:00:00Z`)}`;
}

/** Where the parcel is going, from the booking's consignee blob. */
function destination(pickup: AgentPickup): string {
  const c = (pickup.consignee ?? null) as OrderConsignee | null;
  if (!c) return '—';
  const place = [c.city, c.state].filter(Boolean).join(', ');
  const country = c.country_name ?? c.country_code;
  return [place, country].filter(Boolean).join(' · ').toUpperCase() || '—';
}

/** One label/value line of the docket. */
function DocketRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 py-[9px] ${last ? '' : 'border-b border-[#EEF2F6]!'}`}
      data-testid={`docket-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[#64748B]">
        {label}
      </span>
      <span className="font-mono text-[13px] font-semibold text-right text-[#1B2A41]">{value}</span>
    </div>
  );
}

export default function PickupDetail() {
  const [, params] = useRoute('/agent/pickup/:id');
  const [, setLocation] = useLocation();
  const mine = useMyPickups();
  const available = useAvailablePickups();
  const action = useOrderAction();
  const regenerate = useRegenerateHandoverCode();

  const entry =
    mine.data?.find((p) => p.order.id === params?.id) ??
    available.data?.find((p) => p.order.id === params?.id);
  const order = entry?.order;

  const isLoading = mine.isLoading || available.isLoading;
  // Only fatal when we have nothing to show. One list failing while the other
  // holds the job is not worth an error screen.
  const isError = (mine.isError || available.isError) && !entry;

  // The job left both queues (handed to ops, or cancelled). Go back rather
  // than sitting on a screen with nothing on it.
  //
  // Suppressed while either list is in flight: claiming removes the job from
  // `available` and adds it to `mine`, and if those two refetches land a beat
  // apart there is a moment where neither list has it. Redirecting on that
  // would throw the agent off the job they just accepted.
  const settling = mine.isFetching || available.isFetching;
  const vanished = !isLoading && !settling && !isError && !entry;
  useEffect(() => {
    if (vanished) setLocation('/agent/mine', { replace: true });
  }, [vanished, setLocation]);

  // Where "back" goes depends on where the job actually is, not on where the
  // agent happened to tap in from.
  const isUnclaimed = !!entry && !mine.data?.some((p) => p.order.id === entry.order.id);
  const backHref = isUnclaimed ? '/agent/available' : '/agent/mine';
  const backLabel = isUnclaimed ? 'Calls' : 'My jobs';

  const [sheetOpen, setSheetOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ txnId: string | null; amount: number } | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  // Anything that failed and is not the handover code, shown above the action
  // bar. This surface has no toasts (see `SurfaceToaster` in App.tsx), so a
  // failure that is not written onto the screen is a failure nobody sees.
  const [actionError, setActionError] = useState<string | null>(null);
  // The server's verdict on the last code, held so the sheet can show it. Not
  // a toast: the agent is retyping into the field the message is about.
  const [otpError, setOtpError] = useState<string | null>(null);

  const runAction = (actionName: string, payload?: Record<string, unknown>): void => {
    if (!order) return;
    action.mutate(
      { orderId: order.id, action: actionName, payload },
      {
        onSuccess: (result) => {
          if (actionName === 'mark_picked_up') {
            setOtpOpen(false);
            setOtpError(null);
          }
          if (result.warning) {
            // The action landed but its history row did not — surfaced rather
            // than swallowed, because ops reads that history.
            console.warn('[PickupDetail]', result.warning);
          }
          if (result.receipt) {
            // Hold the sheet open and flip it to the receipt. A transaction id
            // the customer may ask to see must not disappear on a timer.
            setReceipt(result.receipt);
            return;
          }
          // Nothing announces success. The sheet re-renders with the new
          // status in its eyebrow and the next action in its bar, which is the
          // same fact told where the agent is already looking.
          setActionError(null);
        },
        onError: (err) => {
          // A rejected code belongs in the sheet, next to the field being
          // retyped — not somewhere the agent has to look away to read.
          if (actionName === 'mark_picked_up') {
            setOtpError(err.message);
            return;
          }
          setActionError(
            err.status === 409 ? 'This job has moved on. Go back and refresh.' : err.message,
          );
        },
      },
    );
  };

  // Two actions need input before they can fire: money needs an amount and a
  // mode, pickup needs the customer's code. Both open a sheet. Everything else
  // is a single decisive tap.
  const handleAction = (actionName: string): void => {
    if (actionName === 'collect_payment') {
      setReceipt(null);
      setSheetOpen(true);
      return;
    }
    if (actionName === 'mark_picked_up') {
      setOtpError(null);
      setOtpOpen(true);
      return;
    }
    runAction(actionName);
  };

  const owed = order ? amountOwedAtDoor(order) : null;
  const address = order?.origin_address;
  const fullAddress = [
    address?.address_line_1,
    address?.address_line_2,
    address?.city,
    address?.state,
    address?.pincode,
  ]
    .filter(Boolean)
    .join(', ');
  const mapsQuery = [address?.address_line_1, address?.city, address?.pincode]
    .filter(Boolean)
    .join(', ');
  const pieces = order ? docketItem(order.items as Record<string, unknown> | null) : null;
  const notDueYet = order ? notDueYetReason(order) : null;

  return (
    <AgentJobSheet
      backHref={backHref}
      backLabel={backLabel}
      orderNo={order?.order_no}
      actionBar={
        order && entry ? (
          <>
            {actionError && (
              <p
                className="px-4 py-2.5 border-b border-[#E2E8F0]! font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#B91C1C] bg-white"
                data-testid="action-error"
              >
                {actionError}
              </p>
            )}
            <ActionBar
              actions={entry.availableActions}
              owed={owed}
              pendingAction={action.isPending ? action.variables?.action ?? null : null}
              disabled={action.isPending}
              onAction={handleAction}
            />
          </>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-[#64748B]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <p className="px-4 py-8 text-sm font-medium text-[#334155]">
          Could not load this job. Check your connection and try again.
        </p>
      )}

      {order && entry && (
        <>
          <div className="px-4 pt-[18px] pb-4 border-b border-[#E2E8F0]!">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B2A41]">
              {sheetEyebrow(order, todayInIst())}
            </span>
            <p className="text-[26px] font-extrabold tracking-[-0.02em] leading-[1.1] text-[#1B2A41] mt-1.5">
              {address?.full_name ?? 'Unknown sender'}
            </p>
            <p className="text-[15px] font-medium leading-[1.45] text-[#334155] mt-1.5">
              {fullAddress || 'Address unavailable'}
            </p>
          </div>

          {/* The two things done with a phone, one hairline apart. */}
          <div className="flex border-b border-[#E2E8F0]!">
            {address?.phone ? (
              <a
                href={`tel:${address.phone}`}
                className="flex-1 h-[60px] flex items-center justify-center gap-2 border-r border-[#E2E8F0]!"
                data-testid="button-call-sender"
              >
                <Phone className="w-[18px] h-[18px] text-[#1B2A41]" strokeWidth={2} />
                <span className="text-[15px] font-semibold text-[#1B2A41]">Call sender</span>
              </a>
            ) : (
              <span
                className="flex-1 h-[60px] flex items-center justify-center border-r border-[#E2E8F0]! font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]"
                data-testid="no-phone"
              >
                No phone on file
              </span>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-[60px] flex items-center justify-center gap-2"
              data-testid="button-navigate"
            >
              <Navigation className="w-[18px] h-[18px] text-[#1B2A41]" strokeWidth={2} />
              <span className="text-[15px] font-semibold text-[#1B2A41]">Directions</span>
            </a>
          </div>

          {/* Every field ops would print, once, in the order they read it. */}
          <div className="px-4 pt-4 pb-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B] mb-2.5">
              The docket
            </p>
            <DocketRow label="Window" value={windowLabel(order, true)} />
            <DocketRow label="Booked weight" value={weightLabel(order)} />
            <DocketRow label="Pieces" value={pieces?.number_of_boxes ?? '—'} />
            <DocketRow label="Destination" value={destination(order)} />
            <DocketRow
              label="Payment"
              value={`${PAYMENT_METHOD_LABEL[order.payment_method]} · ${
                PAYMENT_STATUS_LABEL[order.payment_status]
              }`}
              last
            />
          </div>

          {owed !== null && (
            <div
              className="mx-4 mt-3 mb-4 bg-[#F2A123] px-4 py-3.5 flex items-center justify-between gap-3"
              data-testid="block-collect-cash"
            >
              <span>
                <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B2A41]">
                  Collect at door
                </span>
                <span className="block font-mono text-[11px] font-medium text-[#1B2A41]/75 mt-[3px]">
                  Booked {dayMonth(order.created_at)} · not yet paid
                </span>
              </span>
              <span className="font-mono text-[26px] font-bold leading-none text-[#1B2A41] tabular-nums">
                ₹{money(owed)}
              </span>
            </div>
          )}

          {/* The server withholds start_pickup until the pickup date and sends
              no actions, so the bar is empty. Say why — an agent holding a job
              with no button and no reason reads it as a fault. */}
          {notDueYet && (
            <div
              className="mx-4 mt-3 mb-4 border-t border-[#E2E8F0]! pt-3.5"
              data-testid="not-due-yet"
            >
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41]">
                {notDueYet}
              </p>
              <p className="text-sm font-medium text-[#334155] mt-1">
                You can start this pickup on the day.
              </p>
            </div>
          )}

          {/* The agent's own code, for the counter. This is the one handover
              number the agent is allowed to see — it tests ops, not them. The
              parcel is in their bag and there is no button left to press: the
              job moves when ops types this in. */}
          {order.status === 'picked_up' && (
            <div
              className="mx-4 mt-3 mb-4 border-2 border-[#1B2A41] px-4 py-4"
              data-testid="block-hub-code"
            >
              <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1B2A41]">
                Hand over at the hub
              </span>
              <p className="font-mono text-[34px] font-bold leading-none tracking-[0.16em] text-[#1B2A41] tabular-nums mt-2.5">
                {entry.handover?.code ?? '——————'}
              </p>
              <p className="text-[13px] font-medium leading-[1.45] text-[#334155] mt-2.5">
                {entry.handover?.code
                  ? 'Read this out at the counter. The job clears from your list once the hub enters it.'
                  : 'No code yet. Pull to refresh, or ask the counter to complete it for you.'}
              </p>
              <button
                type="button"
                onClick={() => regenerate.mutate(order.id)}
                disabled={regenerate.isPending}
                className="mt-3 h-11 w-full border border-[#CBD5E1]! bg-white text-[14px] font-semibold text-[#1B2A41] disabled:opacity-60"
                data-testid="button-regenerate-hub-code"
              >
                {regenerate.isPending ? 'Getting a new code…' : 'Get a new code'}
              </button>
            </div>
          )}

          <CollectPaymentSheet
            open={sheetOpen}
            onOpenChange={(next) => {
              setSheetOpen(next);
              if (!next) setReceipt(null);
            }}
            pickup={order}
            isPending={action.isPending}
            receipt={receipt}
            onConfirm={(payload) => runAction('collect_payment', payload)}
          />

          <HandoverOtpSheet
            open={otpOpen}
            onOpenChange={(next) => {
              setOtpOpen(next);
              if (!next) setOtpError(null);
            }}
            pickup={order}
            isPending={action.isPending}
            error={otpError}
            onConfirm={(payload) => runAction('mark_picked_up', payload)}
          />
        </>
      )}
    </AgentJobSheet>
  );
}
