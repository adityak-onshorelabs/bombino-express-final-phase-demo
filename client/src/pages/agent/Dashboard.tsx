import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  ArrowRight,
  MapPin,
  Weight,
  Banknote,
  Smartphone,
  CalendarPlus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import { BandHeader } from '@/components/agent/BandHeader';
import {
  agentStatusLabel,
  amountOwedAtDoor,
  notDueYetReason,
  shortAddress,
} from '@/components/agent/PickupCard';
import { SlotChip } from '@/components/agent/SlotChip';
import { bandForDate, isTodaysWork, toneForBand } from '@/lib/agentGrouping';
import {
  useAvailablePickups,
  useMyPickups,
  useCollections,
  useOrderAction,
  type PickupEntry,
} from '@/hooks/useAgentPickups';
import {
  PICKUP_SLOTS,
  slotWindowState,
  todayInIst,
  dayOfWeekForDate,
} from '@shared/pickupSlots';

/**
 * The agent's home: two questions, one panel.
 *
 *   RECENT CALLS FOR PICKUP — what has just come in that I could take
 *   TODAY'S LIVE JOB        — what I am doing right now
 *
 * They live behind a two-pill selector inside a single bordered panel rather
 * than as two stacks down the page. Stacked, the second one was permanently
 * below the fold on a 360px screen and the home screen answered neither
 * question without scrolling.
 *
 * Everything inside the panel is a divided block, never a card. Nested cards
 * are always wrong, and a bordered card inside a bordered panel is exactly
 * that — so emphasis comes from a filled block and from type weight instead.
 *
 * Anything dated forward is deliberately absent. A pickup booked for Thursday
 * is not today's work and appears under Scheduled in My pickups; putting it on
 * the home screen is what made "today" meaningless.
 *
 * Accepting is the ONLY lifecycle action this screen performs. Starting a
 * pickup, collecting money and handing to the hub all live on the job's own
 * screen, reached by "Open job". Those actions are consequential and several
 * need the address, the contact or a payment sheet in front of the agent
 * first — firing them from a summary card is how a parcel gets marked
 * collected from the wrong doorstep.
 *
 * Per PRODUCT.md: amber means money and nothing else, and status is size and
 * weight rather than coloured chips.
 */

type Tab = 'calls' | 'live';

// ── Helpers ───────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

/** A booking still counts as "just in" for this long after it was created. */
const NEW_BOOKING_WINDOW_MS = 30 * 60_000;

/** "just now" / "12 min" / "2 hr" — short enough to sit inside a dense row. */
function shortAge(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} hr`;
}

/** Furthest along wins when several jobs are held — that one is in their hands. */
const PROGRESS_RANK: Record<string, number> = {
  picked_up: 3,
  out_for_pickup: 2,
  agent_accepted: 1,
};

/** How many calls the home screen shows before deferring to Available. */
const CALLS_ON_HOME = 3;

// ── Panel ─────────────────────────────────────────────────────────────────

/**
 * Two pills in a track at the top of the panel.
 *
 * 56px tall per PRODUCT.md — these are pressed with gloves on. An empty tab
 * stays tappable rather than disabled: a dead control under a gloved thumb
 * reads as a broken screen, and an agent who taps through to an empty tab has
 * still learned something.
 */
function PanelTabs({
  selected,
  onSelect,
  counts,
}: {
  selected: Tab;
  onSelect: (tab: Tab) => void;
  counts: Record<Tab, number>;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'calls', label: 'Recent calls' },
    { key: 'live', label: "Today's live job" },
  ];

  return (
    <div role="tablist" aria-label="Agent home" className="flex gap-1.5 p-2">
      {tabs.map(({ key, label }) => {
        const isSelected = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(key)}
            className={cn(
              'flex-1 min-w-0 h-14 rounded-lg border-2 flex flex-col items-center justify-center px-2',
              'transition-colors duration-150 active:scale-[0.98]',
              isSelected
                ? 'border-primary bg-primary text-white'
                : 'border-border bg-white text-foreground',
            )}
            data-testid={`tab-${key}`}
          >
            <span className="text-lg font-extrabold tabular-nums leading-none">{counts[key]}</span>
            <span
              className={cn(
                'text-[10px] uppercase tracking-[0.1em] font-bold leading-none mt-1 truncate max-w-full',
                isSelected ? 'text-white/75' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One job, filling the panel's width.
 *
 * `emphatic` is a booking that landed minutes ago: a light primary wash and a
 * live pulse, mirroring how an overdue job wears a red wash. A ring or a
 * border here would make it a card inside a card, and a solid navy fill made
 * the block shout louder than the job in hand — so it is a tint, not a slab.
 */
function JobBlock({ entry, emphatic = false }: { entry: PickupEntry; emphatic?: boolean }) {
  const action = useOrderAction();
  const { toast } = useToast();

  const order = entry.order;
  const owed = amountOwedAtDoor(order);
  const next = entry.availableActions[0];
  const notDueYet = notDueYetReason(order);
  const isClaim = next?.action === 'claim';
  const band = bandForDate(order.pickup_date);
  const tone = toneForBand(band);

  const run = (): void => {
    if (!next || next.requiresPayload) return;
    action.mutate(
      { orderId: order.id, action: next.action },
      {
        onSuccess: (r) =>
          toast({
            title: isClaim ? 'Job accepted' : 'Updated',
            description: isClaim
              ? `${r.order.order_no} is yours`
              : `${r.order.order_no} — ${agentStatusLabel(r.order.status)}`,
          }),
        onError: (err) =>
          toast({
            title:
              err.status === 409
                ? isClaim
                  ? 'Another agent took it'
                  : 'This job has moved on'
                : 'Could not update',
            description: err.message,
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <div
      className={cn(
        'px-4 py-4',
        emphatic ? 'bg-primary/10' : band === 'overdue' && 'bg-red-50',
      )}
      data-testid={emphatic ? 'job-block-emphatic' : 'job-block'}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-bold',
            emphatic ? 'text-primary' : tone.eyebrow,
          )}
        >
          {emphatic && (
            <span className="relative flex w-2 h-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex w-full h-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-primary" />
            </span>
          )}
          {emphatic
            ? `Just booked · ${shortAge(order.created_at)}`
            : band === 'overdue'
              ? `Overdue · ${agentStatusLabel(order.status)}`
              : agentStatusLabel(order.status)}
        </span>
        <Link
          href={`/agent/pickup/${order.id}`}
          className="font-mono text-[11px] font-semibold shrink-0 underline decoration-dotted underline-offset-2 text-muted-foreground"
        >
          {order.order_no}
        </Link>
      </div>

      <p className="text-xl font-extrabold tracking-tight leading-tight mt-1.5 text-foreground">
        {order.origin_address?.full_name ?? 'Unknown sender'}
      </p>

      <div className="flex items-start gap-2 mt-2">
        <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-foreground/70" strokeWidth={2.5} />
        <p className="text-sm font-medium leading-snug text-foreground/80">
          {shortAddress(order)}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap mt-2.5">
        {/* The window is the appointment — being early or late to it is the
            whole job — so it reads as a chip rather than as metadata. */}
        <SlotChip pickupDate={order.pickup_date} pickupSlot={order.pickup_slot} />
        <span className="flex items-center gap-1.5">
          <Weight className="w-3.5 h-3.5 text-foreground/60" strokeWidth={2.5} />
          <span className="text-xs font-semibold tabular-nums text-foreground/70">
            {order.booked_weight ? `${order.booked_weight} kg est.` : 'No weight'}
          </span>
        </span>
      </div>

      {owed !== null && (
        <div className="flex items-baseline gap-2 mt-3 rounded-lg bg-[#F2A123] px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-[#1B2A41]">
            Collect
          </span>
          <span className="text-lg font-extrabold text-[#1B2A41] tabular-nums leading-none">
            ₹{owed}
          </span>
        </div>
      )}

      {notDueYet ? (
        <div className="mt-3 rounded-lg px-4 py-3 text-center bg-muted/60" data-testid="active-not-due">
          <p className="text-base font-extrabold text-foreground">{notDueYet}</p>
          <p className="text-xs font-medium mt-0.5 text-muted-foreground">
            You can start this pickup on the day
          </p>
        </div>
      ) : isClaim && next ? (
        // Accepting is the only lifecycle action the home screen performs.
        // It is safe here because it is reversible in practice — the worst
        // case is a job taken and handed back — and because taking work is
        // the one thing an agent does without needing the address in front of
        // them.
        <button
          type="button"
          onClick={run}
          disabled={action.isPending}
          className="mt-3 w-full h-14 rounded-xl text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 bg-primary text-white"
          data-testid="button-job-next"
        >
          {action.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {next.label}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </>
          )}
        </button>
      ) : (
        // Everything after accepting — starting, collecting money, handing to
        // the hub — happens on the job's own screen. Those actions are
        // consequential and several need the address, the contact or a payment
        // sheet in front of the agent first, so firing them from a summary card
        // is how a parcel gets marked collected from the wrong doorstep.
        <Link
          href={`/agent/pickup/${order.id}`}
          className="mt-3 w-full h-14 rounded-xl text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform bg-primary text-white"
          data-testid="link-open-job"
        >
          Open job
          <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
        </Link>
      )}
    </div>
  );
}

/** Any job after the leading one, in either tab: enough to choose by, nothing
 *  more. Tapping opens the job's own screen, where its actions live. */
function JobRow({ entry }: { entry: PickupEntry }) {
  const order = entry.order;
  const owed = amountOwedAtDoor(order);
  const band = bandForDate(order.pickup_date);

  return (
    <Link
      href={`/agent/pickup/${order.id}`}
      className={cn(
        'flex items-center gap-3 px-4 min-h-14 py-3 transition-colors',
        band === 'overdue' ? 'bg-red-50 active:bg-red-100' : 'active:bg-muted/50',
      )}
      data-testid={`job-row-${order.order_no}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-base font-extrabold text-foreground leading-tight truncate">
            {order.origin_address?.full_name ?? 'Unknown sender'}
          </span>
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums shrink-0">
            {shortAge(order.created_at)}
          </span>
        </span>
        <span className="block text-xs font-medium text-muted-foreground truncate mt-0.5">
          {shortAddress(order)}
        </span>
        <span className="block mt-1.5">
          <SlotChip pickupDate={order.pickup_date} pickupSlot={order.pickup_slot} />
        </span>
      </span>

      {owed !== null && (
        <span className="rounded-md bg-[#F2A123] px-2 py-1 shrink-0">
          <span className="text-xs font-extrabold text-[#1B2A41] tabular-nums">₹{owed}</span>
        </span>
      )}
      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2.5} />
    </Link>
  );
}

/** Said plainly, once. No illustration, no encouragement (PRODUCT.md). */
function PanelEmpty({ children }: { children: string }) {
  return (
    <p className="px-4 py-8 text-sm font-semibold text-muted-foreground text-center">{children}</p>
  );
}

// ── Reference bands ───────────────────────────────────────────────────────

function TodayWindows({ slots }: { slots: string[] }) {
  const today = todayInIst();

  if (slots.length === 0) {
    return (
      <Link
        href="/agent/schedule"
        className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border bg-white px-4 py-3.5 active:scale-[0.99] transition-transform"
        data-testid="windows-empty"
      >
        <CalendarPlus className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={2.5} />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-foreground leading-tight">
            Not working today
          </span>
          <span className="block text-xs font-medium text-muted-foreground mt-0.5">
            Customers can't book a window unless an agent works it
          </span>
        </span>
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2.5} />
      </Link>
    );
  }

  const ordered = PICKUP_SLOTS.filter((s) => slots.includes(s.value));
  const states = ordered.map((s) => slotWindowState(s.value, today));
  const firstUpcoming = states.indexOf('upcoming');
  const allDone = states.every((s) => s === 'past');

  return (
    <div className="rounded-xl border-2 border-border bg-white p-3" data-testid="windows-detail">
      <div className="space-y-1.5">
        {ordered.map((slot, i) => {
          const state = states[i];
          const isNext = state === 'upcoming' && i === firstUpcoming;
          return (
            <div
              key={slot.value}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg px-3 h-11',
                state === 'active' && 'bg-primary text-white',
                state === 'past' && 'bg-muted/50',
                state === 'upcoming' && 'bg-white border border-border',
              )}
              data-testid={`window-${slot.value}-${state}`}
            >
              <span
                className={cn(
                  'text-sm font-bold tabular-nums',
                  state === 'past' && 'text-muted-foreground line-through decoration-1',
                  state === 'upcoming' && 'text-foreground',
                )}
              >
                {slot.label}
              </span>
              <span
                className={cn(
                  'text-[10px] uppercase tracking-[0.12em] font-bold shrink-0',
                  state === 'active' && 'text-white',
                  state === 'past' && 'text-muted-foreground',
                  state === 'upcoming' && 'text-muted-foreground',
                )}
              >
                {state === 'active' ? 'Now' : state === 'past' ? 'Done' : isNext ? 'Next' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {allDone && (
        <p className="text-xs font-semibold text-muted-foreground text-center mt-2.5">
          Shift finished. Hand your cash to the hub.
        </p>
      )}
    </div>
  );
}

function CashOnHand({ cash, upi, count }: { cash: number; upi: number; count: number }) {
  const carrying = cash > 0;

  return (
    <Link
      href="/agent/collections"
      className={cn(
        'block rounded-xl border-2 p-4 active:scale-[0.99] transition-transform',
        carrying ? 'border-[#F2A123] bg-[#F2A123]' : 'border-border bg-white',
      )}
      data-testid="card-cash-on-hand"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              'block text-[10px] uppercase tracking-[0.12em] font-bold',
              carrying ? 'text-[#1B2A41]' : 'text-muted-foreground',
            )}
          >
            Cash in hand
          </span>
          <span
            className={cn(
              'block text-4xl font-extrabold tabular-nums leading-none mt-1',
              carrying ? 'text-[#1B2A41]' : 'text-foreground',
            )}
          >
            ₹{cash}
          </span>
        </div>
        <Banknote
          className={cn('w-8 h-8 shrink-0', carrying ? 'text-[#1B2A41]' : 'text-muted-foreground')}
          strokeWidth={2}
        />
      </div>

      <div
        className={cn(
          'flex items-center gap-4 mt-3 pt-3 border-t',
          carrying ? 'border-[#1B2A41]/25' : 'border-border',
        )}
      >
        <span className="flex items-center gap-1.5">
          <Smartphone
            className={cn('w-3.5 h-3.5', carrying ? 'text-[#1B2A41]' : 'text-muted-foreground')}
            strokeWidth={2.5}
          />
          <span
            className={cn(
              'text-xs font-bold tabular-nums',
              carrying ? 'text-[#1B2A41]' : 'text-muted-foreground',
            )}
          >
            ₹{upi} by UPI
          </span>
        </span>
        <span
          className={cn(
            'text-xs font-bold tabular-nums',
            carrying ? 'text-[#1B2A41]' : 'text-muted-foreground',
          )}
        >
          {count} collection{count === 1 ? '' : 's'}
        </span>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: available, isLoading: loadingAvailable } = useAvailablePickups();
  const { data: mine, isLoading: loadingMine } = useMyPickups();
  const { data: collections } = useCollections();

  const todayDow = dayOfWeekForDate(todayInIst());
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

  // Newest call first. The Available screen is FIFO by design so nothing rots
  // at the bottom of the queue; this tab answers the opposite question — what
  // has just come in — so it reads the other way round.
  const calls = useMemo(
    () =>
      [...(available ?? [])]
        .sort(
          (a, b) =>
            new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime(),
        )
        .slice(0, CALLS_ON_HOME),
    [available],
  );

  // Today's jobs, and only today's. A held job dated forward is a commitment,
  // not work, and lives under Scheduled in My pickups.
  //
  // All of them, not just the leading one. An agent holding three pickups
  // previously saw one card with the other two nowhere on the screen — no
  // count, no list, no way through. Furthest along leads, because that is the
  // parcel physically in their hands.
  const liveJobs = useMemo(() => {
    const today = todayInIst();
    return [...(mine ?? [])]
      .filter((e) => isTodaysWork(e, today))
      .sort(
        (a, b) => (PROGRESS_RANK[b.order.status] ?? 0) - (PROGRESS_RANK[a.order.status] ?? 0),
      );
  }, [mine]);

  const scheduledCount = (mine ?? []).length - liveJobs.length;
  const isFreshCall =
    calls[0] && Date.now() - new Date(calls[0].order.created_at).getTime() < NEW_BOOKING_WINDOW_MS;

  // Opens on the job in hand when there is one — that is the obligation, and a
  // call is only an opportunity. `null` until the agent chooses, so the default
  // keeps tracking the data as jobs advance.
  const [chosen, setChosen] = useState<Tab | null>(null);
  const selected: Tab = chosen ?? (liveJobs.length > 0 ? 'live' : 'calls');

  const counts: Record<Tab, number> = {
    calls: available?.length ?? 0,
    live: liveJobs.length,
  };

  return (
    <AgentShell title="Today" subtitle={`${greeting()} — here's your shift`}>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      ) : (
        <div className="space-y-7">
          {/* One panel: the selector and whatever it selects, inside the same
              border, so the controls plainly belong to the list below them. */}
          <div
            className="rounded-xl border-2 border-border bg-white overflow-hidden"
            data-testid="home-panel"
          >
            <PanelTabs selected={selected} onSelect={setChosen} counts={counts} />

            <div className="border-t-2 border-border divide-y divide-border">
              {selected === 'calls' ? (
                calls.length === 0 ? (
                  <PanelEmpty>New bookings show up here as customers make them</PanelEmpty>
                ) : (
                  <>
                    <JobBlock entry={calls[0]} emphatic={!!isFreshCall} />
                    {calls.slice(1).map((entry) => (
                      <JobRow key={entry.order.id} entry={entry} />
                    ))}
                    {(available?.length ?? 0) > calls.length && (
                      <Link
                        href="/agent/available"
                        className="flex items-center justify-center gap-1.5 h-12 text-[11px] uppercase tracking-[0.12em] font-bold text-primary active:bg-muted/50 transition-colors"
                        data-testid="link-all-available"
                      >
                        See all {available?.length}
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </Link>
                    )}
                  </>
                )
              ) : liveJobs.length > 0 ? (
                <>
                  <JobBlock entry={liveJobs[0]} />
                  {/* The rest of today's jobs, reachable rather than buried
                      under the leading one. */}
                  {liveJobs.slice(1).map((entry) => (
                    <JobRow key={entry.order.id} entry={entry} />
                  ))}
                  {scheduledCount > 0 && (
                    <Link
                      href="/agent/mine"
                      className="flex items-center justify-center gap-1.5 h-12 text-[11px] uppercase tracking-[0.12em] font-bold text-primary active:bg-muted/50 transition-colors"
                      data-testid="link-scheduled"
                    >
                      {scheduledCount} scheduled for later
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </Link>
                  )}
                </>
              ) : (
                <PanelEmpty>Nothing in hand. Accept a call to start one.</PanelEmpty>
              )}
            </div>
          </div>

          <section>
            <BandHeader
              label="Today's windows"
              testId="band-windows"
              action={
                todaySlots.length > 0 ? (
                  <Link
                    href="/agent/schedule"
                    className="text-[11px] font-bold text-primary shrink-0"
                    data-testid="link-edit-week"
                  >
                    Edit week
                  </Link>
                ) : undefined
              }
            />
            <TodayWindows slots={todaySlots} />
          </section>

          <section>
            <BandHeader label="Money" testId="band-money" />
            <CashOnHand
              cash={collections?.totals.cash ?? 0}
              upi={collections?.totals.upi ?? 0}
              count={collections?.totals.count ?? 0}
            />
          </section>
        </div>
      )}
    </AgentShell>
  );
}
