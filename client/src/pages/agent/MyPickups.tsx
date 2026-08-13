import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import { BandHeader } from '@/components/agent/BandHeader';
import { ActiveJobCard } from '@/components/agent/ActiveJobCard';
import { JobRow, notDueYetMeta, rowMeta, streetLine } from '@/components/agent/PickupCard';
import { BAND_LABEL, groupByDate, isTodaysWork, toneForBand } from '@/lib/agentGrouping';
import { useMyPickups } from '@/hooks/useAgentPickups';
import { todayInIst } from '@shared/pickupSlots';

/**
 * The agent's own jobs, banded by when they are due.
 *
 * Today's work and a commitment for Thursday are different things and were
 * previously one undifferentiated stack, so the count in the nav badge told an
 * agent nothing about how much of it was actually theirs to do now. Overdue
 * leads, then today, then everything dated forward.
 *
 * Today's jobs are full entries inside ONE panel, divided by hairlines — not
 * one bordered card each. Anything dated forward is a compact row carrying the
 * one fact that matters about it: how many days off it is.
 *
 * Today's and overdue entries carry the same card Today uses: the job, then Call
 * and its next action. They used to be summaries that only navigated, which read
 * as a list of things the agent could look at rather than work — worst on an
 * overdue job, where the one screen that says LATE offered no way to act on it.
 * Anything needing input (money) still opens the job sheet, and so does the card
 * body, because the docket and Directions live there.
 *
 * A job leaves this list at `received_at_hub`. That is the handoff to ops and it
 * is one-directional: the server stops returning it, so it simply disappears on
 * the next refetch. The design asks for a "handed to hub today" line to answer
 * "where did my job go?" — the client does not hold that count (the server
 * excludes `received_at_hub` from this endpoint), so it is left out rather than
 * faked. See the handoff's open items.
 */
export default function MyPickups() {
  const { data: pickups, isLoading, isError, refetch } = useMyPickups();

  const today = todayInIst();
  const bands = groupByDate(pickups ?? [], today);
  const count = pickups?.length ?? 0;
  const dueToday = (pickups ?? []).filter((e) => isTodaysWork(e, today)).length;

  return (
    <AgentShell
      title="My jobs"
      subtitle={
        count === 0 ? 'Nothing accepted' : `${count} accepted · ${dueToday} due today`
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
            Could not load your jobs. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-11 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41]"
            data-testid="button-retry-mine"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && count === 0 && (
        <div
          className="bg-white border border-[#E2E8F0]! rounded-[4px] px-4 py-5"
          data-testid="empty-mine"
        >
          <p className="text-sm font-medium text-[#334155]">
            Accept a call to see it here.
          </p>
        </div>
      )}

      {!isLoading && !isError && bands.length > 0 && (
        <div className="flex flex-col gap-4">
          {bands.map(({ band, entries }) => {
            const tone = toneForBand(band);
            // Dated forward: rows, because there is nothing to do about them
            // today beyond knowing they are coming.
            const asRows = band === 'scheduled';
            const edge = band === 'overdue' ? 'border-[#FECACA]!' : 'border-[#E2E8F0]!';

            return (
              <section key={band}>
                <BandHeader
                  label={BAND_LABEL[band]}
                  count={entries.length}
                  band={band}
                  testId={`band-${band}`}
                />
                <div className={cn('border rounded-[4px] overflow-hidden', tone.panel)}>
                  {entries.map((entry, i) => (
                    <div key={entry.order.id} className={cn(i > 0 && 'border-t', edge)}>
                      {asRows ? (
                        <JobRow
                          pickup={entry.order}
                          address={streetLine(entry.order)}
                          meta={notDueYetMeta(entry.order) ?? rowMeta(entry.order, today)}
                        />
                      ) : (
                        // Due today or already late: the same card Today shows,
                        // actions and all. A late job that could only be read
                        // here and worked somewhere else was the gap.
                        <ActiveJobCard entry={entry} />
                      )}
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
