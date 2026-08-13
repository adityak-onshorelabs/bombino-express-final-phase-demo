import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import { BandHeader } from '@/components/agent/BandHeader';
import { PanelAction } from '@/components/agent/ActionButtons';
import {
  JobEntry,
  JobRow,
  amountOwedAtDoor,
  money,
  windowLabel,
} from '@/components/agent/PickupCard';
import { BAND_LABEL, groupByDate, toneForBand } from '@/lib/agentGrouping';
import {
  useAvailablePickups,
  useOrderAction,
  type PickupEntry,
} from '@/hooks/useAgentPickups';

/**
 * Jobs nobody has claimed, banded by when they are due.
 *
 * Flat FIFO order was right for fairness and wrong for reading: an agent
 * scanning for work today had to read the date on every job to find out whether
 * it was even relevant, and a job overdue since yesterday sat wherever the
 * queue happened to put it. Bands answer that before the agent reads a line.
 *
 * Within a band the queue is still oldest-first, so nothing rots at the bottom
 * of the list — the fairness the FIFO ordering existed for is untouched.
 *
 * One Accept button per band, on the job at the top of it. That is the job most
 * likely to be taken, it keeps the one-tap accept a queue needs, and it stops
 * the column turning into a wall of identical 56px buttons — which is what
 * happens when every job carries its own and none of them reads as the next
 * one.
 */

/** "just now" / "12 min ago" / "2 hr ago" — how stale this call is. */
function shortAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ago`;
}

/** `4–6 PM · POWAI · ₹2,400 DUE` — enough to decide by, in one mono line. */
function callMeta(entry: PickupEntry, withDate: boolean): string {
  const owed = amountOwedAtDoor(entry.order);
  return [
    windowLabel(entry.order, withDate),
    entry.order.origin_address?.city?.toUpperCase(),
    owed !== null ? `₹${money(owed)} DUE` : 'PREPAID',
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function AvailablePickups() {
  const { data: pickups, isLoading, isError, refetch } = useAvailablePickups();
  const action = useOrderAction();
  const { toast } = useToast();

  const handleAccept = (orderId: string, actionName: string): void => {
    action.mutate(
      { orderId, action: actionName },
      {
        onSuccess: (result) => {
          toast({
            title: 'Pickup accepted',
            description: `${result.order.order_no} is now in My jobs.`,
          });
        },
        onError: (err) => {
          // 409 is the expected outcome of a lost race, not a malfunction —
          // say so plainly rather than showing a generic failure.
          toast({
            title: err.status === 409 ? 'Someone got there first' : 'Could not accept',
            description: err.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const bands = groupByDate(pickups ?? []);
  const count = pickups?.length ?? 0;

  return (
    <AgentShell
      title="Open calls"
      subtitle={
        count === 0 ? 'Nothing unclaimed' : `${count} unclaimed · oldest first`
      }
    >
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-[#64748B]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="bg-white border border-[#E2E8F0]! rounded-[4px] px-4 py-5">
          <p className="text-sm font-medium text-[#334155]">
            Could not load calls. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-11 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41]"
            data-testid="button-retry-available"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && count === 0 && (
        <div
          className="bg-white border border-[#E2E8F0]! rounded-[4px] px-4 py-5"
          data-testid="empty-available"
        >
          <p className="text-sm font-medium text-[#334155]">
            New jobs appear here as customers book them.
          </p>
        </div>
      )}

      {!isLoading && !isError && bands.length > 0 && (
        <div className="flex flex-col gap-4">
          {bands.map(({ band, entries }) => {
            const tone = toneForBand(band);
            const isOverdue = band === 'overdue';
            // Scheduled work is nobody's next tap: it is read, not claimed on
            // the spot, so that band is rows only.
            const lead = band === 'scheduled' ? null : entries[0];
            const rows = lead ? entries.slice(1) : entries;
            const accept = lead?.availableActions.find((a) => a.action === 'claim');

            return (
              <section key={band}>
                <BandHeader
                  label={BAND_LABEL[band]}
                  count={entries.length}
                  band={band}
                  testId={`band-${band}`}
                />
                <div className={cn('border rounded-[4px] overflow-hidden', tone.panel)}>
                  {lead && (
                    <JobEntry
                      pickup={lead.order}
                      amount="due"
                      eyebrow={
                        isOverdue ? undefined : `Unclaimed · ${shortAge(lead.order.created_at)}`
                      }
                    >
                      {accept && (
                        <PanelAction
                          label="Accept this job"
                          onClick={() => handleAccept(lead.order.id, accept.action)}
                          pending={
                            action.isPending && action.variables?.orderId === lead.order.id
                          }
                          disabled={action.isPending}
                          className={cn(
                            'border-t',
                            isOverdue ? 'border-[#FECACA]!' : 'border-[#E2E8F0]!',
                          )}
                          testId={`button-accept-${lead.order.order_no}`}
                        />
                      )}
                    </JobEntry>
                  )}

                  {rows.map((entry, i) => (
                    <div
                      key={entry.order.id}
                      className={cn(
                        (lead || i > 0) && 'border-t',
                        isOverdue ? 'border-[#FECACA]!' : 'border-[#E2E8F0]!',
                      )}
                    >
                      <JobRow
                        pickup={entry.order}
                        meta={callMeta(entry, band !== 'today')}
                        showAmount={false}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AgentShell>
  );
}
