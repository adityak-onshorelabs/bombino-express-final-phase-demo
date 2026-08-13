import { useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import { BandHeader } from '@/components/agent/BandHeader';
import { ActiveJobPanel } from '@/components/agent/ActiveJobCard';
import { JobRow, money, rowMeta, streetLine } from '@/components/agent/PickupCard';
import { bandForDate, isTodaysWork } from '@/lib/agentGrouping';
import { useAppStore } from '@/lib/store';
import {
  useAvailablePickups,
  useMyPickups,
  useCollections,
} from '@/hooks/useAgentPickups';
import {
  PICKUP_SLOTS,
  slotWindowState,
  todayInIst,
  dayOfWeekForDate,
  DAY_NAMES,
} from '@shared/pickupSlots';

/**
 * The agent's home: one dated sheet, ranked.
 *
 *   WORKING NOW — the job furthest along, the one physically in their hands
 *   NEXT UP     — the rest of today's work, as compact rows
 *   LEDGER      — cash in the bag, windows left in the shift
 *
 * The two-pill selector is gone. An agent should not have to choose between
 * "what I'm doing" and "what's available": both are facts about their shift and
 * both belong on the page. The queue itself lives on Calls, which the figure
 * strip links to and the nav badge counts.
 *
 * Anything dated forward is deliberately absent. A pickup booked for Thursday
 * is not today's work and appears under Scheduled in My jobs; putting it on the
 * home screen is what made "today" meaningless.
 *
 * The figure strip is a strip of facts, not stat tiles — no boxes, no borders,
 * no charts. PRODUCT.md rules out the analytics register on this surface: the
 * agent needs the next action, and three counts are context for it.
 */

/** Furthest along wins when several jobs are held — that one is in their hands. */
const PROGRESS_RANK: Record<string, number> = {
  picked_up: 3,
  out_for_pickup: 2,
  agent_accepted: 1,
};

/** `9–11`, short enough for a figure label. */
function compactWindow(startHour: number, endHour: number): string {
  const h = (n: number): number => n % 12 || 12;
  return `${h(startHour)}–${h(endHour)}`;
}

/** `Tuesday, 12 Aug` — the screen's title is the date, because the shift is. */
function dateTitle(today: string): string {
  const when = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  return `${DAY_NAMES[dayOfWeekForDate(today)]}, ${when}`;
}

/** One fact in the header strip: figure over label, nothing around it. */
function Figure({ value, label, href }: { value: string; label: string; href?: string }) {
  const body = (
    <>
      <span className="font-mono text-xl font-bold leading-none text-[#1B2A41] tabular-nums">
        {value}
      </span>
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex flex-col gap-[3px]"
        data-testid={`figure-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {body}
      </Link>
    );
  }

  return (
    <span
      className="flex flex-col gap-[3px]"
      data-testid={`figure-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {body}
    </span>
  );
}

/** Mono 9.5 label over a mono 22 figure, in a white panel. Two of these. */
function LedgerTile({ label, value, href }: { label: string; value: string; href?: string }) {
  const testId = `tile-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const className = 'flex-1 bg-white border border-[#E2E8F0]! rounded-[4px] px-3.5 py-3';
  const body = (
    <>
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
        {label}
      </p>
      <p className="font-mono text-[22px] font-bold leading-none text-[#1B2A41] tabular-nums mt-[5px]">
        {value}
      </p>
    </>
  );

  return href ? (
    <Link href={href} className={className} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={className} data-testid={testId}>
      {body}
    </div>
  );
}

/** Said plainly, once. No illustration, no encouragement (PRODUCT.md). */
function PanelEmpty({ children }: { children: string }) {
  return <p className="px-4 py-5 text-sm font-medium text-[#334155]">{children}</p>;
}

export default function Dashboard() {
  const { data: available, isLoading: loadingAvailable } = useAvailablePickups();
  const { data: mine, isLoading: loadingMine } = useMyPickups();
  const { data: collections } = useCollections();
  const { user } = useAppStore();

  const today = todayInIst();
  const todayDow = dayOfWeekForDate(today);
  const { data: weeklyPattern } = useQuery({
    queryKey: ['/api/agent/availability'],
    queryFn: async (): Promise<Record<number, string[]>> => {
      const res = await fetch('/api/agent/availability', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Could not load schedule');
      const body = (await res.json()) as { availability: Record<number, string[]> };
      return body.availability ?? {};
    },
    staleTime: 0,
  });

  const todaySlots = weeklyPattern?.[todayDow] ?? [];
  const isLoading = loadingAvailable || loadingMine;

  // Today's jobs, and only today's. A held job dated forward is a commitment,
  // not work, and lives under Scheduled in My jobs.
  //
  // Furthest along leads, because that is the parcel physically in their hands.
  // Only then does lateness break the tie: two jobs both merely accepted are
  // separated by which promise is already broken, and after that by which
  // window opens first.
  const liveJobs = useMemo(() => {
    return [...(mine ?? [])]
      .filter((e) => isTodaysWork(e, today))
      .sort((a, b) => {
        const byProgress =
          (PROGRESS_RANK[b.order.status] ?? 0) - (PROGRESS_RANK[a.order.status] ?? 0);
        if (byProgress !== 0) return byProgress;

        const lateA = bandForDate(a.order.pickup_date, today) === 'overdue' ? 0 : 1;
        const lateB = bandForDate(b.order.pickup_date, today) === 'overdue' ? 0 : 1;
        if (lateA !== lateB) return lateA - lateB;

        const byDate = (a.order.pickup_date ?? '').localeCompare(b.order.pickup_date ?? '');
        if (byDate !== 0) return byDate;
        return (a.order.pickup_slot ?? '').localeCompare(b.order.pickup_slot ?? '');
      });
  }, [mine, today]);

  const openCalls = available?.length ?? 0;

  /**
   * Everything else the agent is on the hook for, held or not.
   *
   * Two sources on purpose:
   *
   *   Every job they hold, whatever its date — minus the one leading the screen.
   *   A pickup accepted for Thursday is not today's work, but it is work they
   *   have taken, and a home screen that hides it until Thursday morning is a
   *   home screen an agent cannot plan from. Dated rows carry their date in the
   *   meta line, so nothing here reads as due now that is not.
   *
   *   Unclaimed calls due today or already late. Not the whole queue — an agent
   *   deciding what to pick up next needs the jobs that are live, and the rest
   *   is what Calls is for.
   *
   * Both kinds link to the same job sheet, which offers Accept on one and the
   * lifecycle action on the other, so the row does not need to branch.
   */
  const nextUp = useMemo(() => {
    const rank: Record<string, number> = { overdue: 0, today: 1, undated: 2, scheduled: 3 };
    const leadId = liveJobs[0]?.order.id;
    return [
      ...(mine ?? []).filter((e) => e.order.id !== leadId),
      ...(available ?? []).filter((e) => isTodaysWork(e, today)),
    ].sort((a, b) => {
      const byBand =
        rank[bandForDate(a.order.pickup_date, today)] -
        rank[bandForDate(b.order.pickup_date, today)];
      if (byBand !== 0) return byBand;
      // Inside the scheduled band the date is what separates them; both fields
      // sort as plain strings (`YYYY-MM-DD`, `HH:MM-HH:MM`), which is calendar
      // then clock order.
      const byDate = (a.order.pickup_date ?? '').localeCompare(b.order.pickup_date ?? '');
      if (byDate !== 0) return byDate;
      const bySlot = (a.order.pickup_slot ?? '').localeCompare(b.order.pickup_slot ?? '');
      if (bySlot !== 0) return bySlot;
      return new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime();
    });
  }, [liveJobs, mine, available, today]);

  /** "3 more today" is a lie once a Thursday job is in the list. */
  const nextUpAllToday = nextUp.every(
    (e) => bandForDate(e.order.pickup_date, today) !== 'scheduled',
  );

  // The shift's windows, in clock order, with the one running now called out.
  const windows = useMemo(() => {
    const ordered = PICKUP_SLOTS.filter((s) => todaySlots.includes(s.value));
    const states = ordered.map((s) => slotWindowState(s.value, today));
    const activeIndex = states.indexOf('active');
    const nextIndex = states.indexOf('upcoming');
    const shown = activeIndex >= 0 ? activeIndex : nextIndex;

    return {
      total: ordered.length,
      left: states.filter((s) => s !== 'past').length,
      figure: shown >= 0 ? compactWindow(ordered[shown].startHour, ordered[shown].endHour) : '—',
      label: activeIndex >= 0 ? 'Window now' : shown >= 0 ? 'Window next' : 'No window',
    };
  }, [todaySlots, today]);

  return (
    <AgentShell
      title={dateTitle(today)}
      titleRight={
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B] shrink-0">
          {user?.fullName ?? 'Pickup agent'}
        </span>
      }
      headerExtra={
        <div className="flex gap-6">
          <Figure value={String(liveJobs.length).padStart(2, '0')} label="In hand" />
          <Figure
            value={String(openCalls).padStart(2, '0')}
            label="Open calls"
            href="/agent/available"
          />
          <Figure value={windows.figure} label={windows.label} />
        </div>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-[#64748B]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          <section>
            <BandHeader label="Working now" testId="band-working-now" />
            {liveJobs.length > 0 ? (
              <ActiveJobPanel entry={liveJobs[0]} />
            ) : (
              <div className="bg-white border border-[#E2E8F0]! rounded-[4px]">
                <PanelEmpty>
                  {nextUp.length > 0
                    ? 'Nothing in hand yet. Take one of the jobs below to start.'
                    : openCalls > 0
                      ? `Nothing in hand. ${openCalls} call${openCalls === 1 ? '' : 's'} waiting on Calls, none due today.`
                      : 'Nothing in hand. New calls appear here as customers book them.'}
                </PanelEmpty>
              </div>
            )}
          </section>

          {nextUp.length > 0 && (
            <section>
              <BandHeader
                label={`Next up · ${nextUp.length} more${nextUpAllToday ? ' today' : ''}`}
                testId="band-next-up"
              />
              <div className="bg-white border border-[#E2E8F0]! rounded-[4px] overflow-hidden">
                {nextUp.map((entry, i) => (
                  <div
                    key={entry.order.id}
                    className={cn(i < nextUp.length - 1 && 'border-b border-[#E2E8F0]!')}
                  >
                    <JobRow
                      pickup={entry.order}
                      address={streetLine(entry.order)}
                      meta={rowMeta(entry.order, today)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex gap-2.5">
            <LedgerTile
              label="Cash in bag"
              value={`₹${money(collections?.totals.cash ?? 0)}`}
              href="/agent/collections"
            />
            <LedgerTile
              label="Windows left"
              value={windows.total > 0 ? `${windows.left} of ${windows.total}` : 'Day off'}
              href="/agent/schedule"
            />
          </div>
        </div>
      )}
    </AgentShell>
  );
}
