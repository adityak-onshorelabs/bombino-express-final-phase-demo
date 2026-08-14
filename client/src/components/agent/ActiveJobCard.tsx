import { Link } from 'wouter';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PanelAction } from '@/components/agent/ActionButtons';
import {
  CollectStrip,
  HubCodeStrip,
  JobEntry,
  agentStatusLabel,
  amountOwedAtDoor,
  notDueYetMeta,
} from '@/components/agent/PickupCard';
import {
  useOrderAction,
  useRegenerateHandoverCode,
  type PickupEntry,
} from '@/hooks/useAgentPickups';

/**
 * A job the agent can work right now, with the next move on the row it belongs
 * to.
 *
 * The full entry — status, name, address, window — then the amber amount if
 * money is owed at the door, then a full-bleed action row split `112px | 1fr`:
 * Call, and whatever the server says comes next.
 *
 * Used by Today for the job in hand and by My jobs for everything due today or
 * already late. Those two screens showed the same job in two registers before —
 * actionable on one, an inert summary on the other — which left an agent looking
 * at a late job on My jobs with no way to work it. One card, one answer.
 *
 * Two things deliberately do NOT fire from here:
 *
 *   Money. `collect_payment` needs an amount and a mode, so the button carries
 *   the label and opens the job sheet, where the collect sheet lives.
 *
 *   A job that is not due yet. The server withholds `start_pickup` until the
 *   pickup date and sends no actions; the card says why rather than showing a
 *   dead row, because "nothing to do here" on a job you are holding reads as a
 *   fault.
 *
 * The body links to the job sheet — the docket, the full address and Directions
 * are all there, and an agent standing at a gate needs them.
 */

/** Actions whose input lives on the job sheet, not on a summary card. */
const NEEDS_THE_SHEET = new Set(['collect_payment']);

export function ActiveJobCard({ entry }: { entry: PickupEntry }) {
  const action = useOrderAction();
  const regenerate = useRegenerateHandoverCode();

  const order = entry.order;
  const owed = amountOwedAtDoor(order);
  const next = entry.availableActions[0];
  const notDueYet = notDueYetMeta(order);
  const phone = order.origin_address?.phone;
  const isClaim = next?.action === 'claim';
  const opensSheet = !!next && (next.requiresPayload || NEEDS_THE_SHEET.has(next.action));
  const href = `/agent/pickup/${order.id}`;

  /**
   * No toast on success. The agent surface has none (see `SurfaceToaster` in
   * App.tsx), and it does not need one here: the mutation invalidates both
   * lists, so the card the agent just pressed re-renders with its new status
   * and its next action. The screen answering is better than a card sliding
   * over it saying the same thing.
   *
   * Failure does need saying, and says it in place — a lost claim race that
   * reported nothing at all is the silent failure §5 calls out.
   */
  const run = (): void => {
    if (!next) return;
    action.mutate({ orderId: order.id, action: next.action });
  };

  const failure = action.error
    ? action.error.status === 409
      ? isClaim
        ? 'Another agent took this job.'
        : 'This job has moved on — pull to refresh.'
      : action.error.message
    : null;

  return (
    <>
      {/* The body is a link, the action row is not — a button inside an anchor
          is invalid markup and, on a phone, an ambiguous tap. */}
      <Link href={href} className="block" data-testid={`link-job-${order.order_no}`}>
        <JobEntry pickup={order} amount="strip" />
      </Link>

      {owed !== null && <CollectStrip amount={owed} />}

      {/* Only on jobs already in the bag — the server attaches `handover` for
          `picked_up` and nothing else, so this needs no status check of its
          own. Sits below the money and above the action row: the agent reads
          it out at the counter, then presses the button underneath it. */}
      {entry.handover && (
        <HubCodeStrip
          code={entry.handover.code}
          onGenerate={() => regenerate.mutate(order.id)}
          pending={regenerate.isPending}
        />
      )}

      {/* Red means late everywhere else on this surface; it means failed here,
          and only ever sits directly above the button that failed. */}
      {failure && (
        <p
          className="border-t border-[#E2E8F0]! px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#B91C1C]"
          data-testid="job-action-error"
        >
          {failure}
        </p>
      )}

      {notDueYet ? (
        <div className="border-t border-[#E2E8F0]! px-4 py-3.5" data-testid="not-due-yet">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41]">
            {notDueYet}
          </p>
          <p className="text-[13px] font-medium text-[#475569] mt-1">
            You can start this pickup on the day
          </p>
        </div>
      ) : (
        <div className="flex border-t border-[#E2E8F0]!">
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="w-28 h-14 flex items-center justify-center gap-[7px] border-r border-[#E2E8F0]!"
              data-testid="link-call-sender"
            >
              <Phone className="w-[17px] h-[17px] text-[#1B2A41]" strokeWidth={2} />
              <span className="text-[13px] font-semibold text-[#1B2A41]">Call</span>
            </a>
          ) : (
            <span
              className="w-28 h-14 flex items-center justify-center border-r border-[#E2E8F0]! font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]"
              data-testid="no-phone"
            >
              No phone
            </span>
          )}

          {next ? (
            opensSheet ? (
              <Link
                href={href}
                className="flex-1 h-14 bg-[#1B2A41] flex items-center justify-center gap-2 text-[15px] font-bold tracking-[0.01em] text-white"
                data-testid="link-open-job"
              >
                {next.label}
              </Link>
            ) : (
              <PanelAction
                label={next.label}
                arrow
                onClick={run}
                pending={action.isPending}
                className="flex-1"
                testId="button-job-next"
              />
            )
          ) : (
            <Link
              href={href}
              className="flex-1 h-14 bg-[#1B2A41] flex items-center justify-center text-[15px] font-bold text-white"
              data-testid="link-open-job"
            >
              Open job
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** The same card as its own panel, for a screen showing exactly one. */
export function ActiveJobPanel({ entry, className }: { entry: PickupEntry; className?: string }) {
  return (
    <div
      className={cn(
        'bg-white border border-[#E2E8F0]! rounded-[4px] overflow-hidden',
        className,
      )}
    >
      <ActiveJobCard entry={entry} />
    </div>
  );
}
