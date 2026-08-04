import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  ArrowRight,
  MapPin,
  Clock,
  Weight,
  Search,
  Banknote,
  Smartphone,
  CalendarPlus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import {
  agentStatusLabel,
  amountOwedAtDoor,
  formatSlot,
  notDueYetReason,
  shortAddress,
} from '@/components/agent/PickupCard';
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
 * The agent's home, as one priority stack. Four bands, in the order the job
 * needs them:
 *
 *   NOW      the job in your hands, and the button that advances it
 *   QUEUE    how much work is waiting — two tappable tiles
 *   WINDOWS  today's shift, window by window, with the live one called out
 *   CASH     what you are carrying and owe the hub
 *
 * Rhythm is deliberate: the two action bands sit tight together (space-y-3)
 * and the two reference bands are pushed further down the page (space-y-6
 * between bands, with section labels). Uniform spacing everywhere was part of
 * what made the old version read as an undifferentiated pile.
 *
 * Per PRODUCT.md: amber means money and nothing else, status is carried by
 * size and weight rather than colour, and there are no hero-metric stat tiles
 * dressed up as analytics.
 */

/** Furthest-along job wins — that is the one physically in the agent's hands. */
const PROGRESS_RANK: Record<string, number> = {
  picked_up: 3,
  out_for_pickup: 2,
  agent_accepted: 1,
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2.5">
      <h2 className="text-[11px] uppercase tracking-[0.14em] font-bold text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A number you can tap. Replaces counts buried in a sentence. */
function CountTile({
  href,
  value,
  label,
  emphasis = false,
  testId,
}: {
  href: string;
  value: number;
  label: string;
  emphasis?: boolean;
  testId: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-xl border-2 p-4 active:scale-[0.99] transition-transform',
        emphasis ? 'border-primary bg-primary text-white' : 'border-border bg-white',
      )}
      data-testid={testId}
    >
      <span
        className={cn(
          'block text-3xl font-extrabold tabular-nums leading-none',
          !emphasis && 'text-foreground',
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'block text-[11px] uppercase tracking-[0.12em] font-bold mt-1.5',
          emphasis ? 'text-white/75' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/**
 * Today's shift, window by window.
 *
 * Replaces a truncated one-line summary ("9–11, 5–7 PM…") that told the agent
 * almost nothing. The useful question mid-shift is not "what did I sign up
 * for" but "am I in a window right now, and when is the next one" — so each
 * window carries its own state and the live one is unmissable.
 */
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

  // Keep chronological order regardless of the order rows came back in.
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

/**
 * What the agent is carrying.
 *
 * Full width, not a half tile: cash is the one number they are personally
 * accountable for at the end of a shift, and the split between cash and UPI is
 * the thing that decides what physically goes in the pouch. Truncating that
 * into a two-up tile was hiding the only figure that has to be exact.
 */
function CashOnHand({
  cash,
  upi,
  count,
}: {
  cash: number;
  upi: number;
  count: number;
}) {
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

/** The job in progress, with its next action attached. */
function ActiveJob({ entry }: { entry: PickupEntry }) {
  const [, setLocation] = useLocation();
  const action = useOrderAction();
  const { toast } = useToast();

  const order = entry.order;
  const owed = amountOwedAtDoor(order);
  const next = entry.availableActions[0];
  const notDueYet = notDueYetReason(order);

  // Actions needing input (payment) open the detail screen, which owns the
  // sheet. Plain status advances fire from here — the whole point of this card
  // is that the common case takes one tap and no navigation.
  const run = (): void => {
    if (!next) return;
    if (next.requiresPayload) {
      setLocation(`/agent/pickup/${order.id}`);
      return;
    }
    action.mutate(
      { orderId: order.id, action: next.action },
      {
        onSuccess: (r) =>
          toast({
            title: 'Updated',
            description: `${r.order.order_no} — ${agentStatusLabel(r.order.status)}`,
          }),
        onError: (err) =>
          toast({
            title: err.status === 409 ? 'This job has moved on' : 'Could not update',
            description: err.message,
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <div className="rounded-xl border-2 border-border bg-white p-4" data-testid="active-job">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-primary">
          {agentStatusLabel(order.status)}
        </span>
        <Link
          href={`/agent/pickup/${order.id}`}
          className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0 underline decoration-dotted underline-offset-2"
        >
          {order.order_no}
        </Link>
      </div>

      <p className="text-xl font-extrabold tracking-tight text-foreground leading-tight mt-1.5">
        {order.origin_address?.full_name ?? 'Unknown sender'}
      </p>

      <div className="flex items-start gap-2 mt-2">
        <MapPin className="w-4 h-4 text-foreground/70 shrink-0 mt-0.5" strokeWidth={2.5} />
        <p className="text-sm font-medium text-foreground/80 leading-snug">
          {shortAddress(order)}
        </p>
      </div>

      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-foreground/60" strokeWidth={2.5} />
          <span className="text-xs font-semibold text-foreground/70">
            {formatSlot(order.pickup_date, order.pickup_slot)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Weight className="w-3.5 h-3.5 text-foreground/60" strokeWidth={2.5} />
          <span className="text-xs font-semibold text-foreground/70 tabular-nums">
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

      {/* A job held for a future date has no next step — the server withholds
          start_pickup until the day. Show the date rather than a dead card. */}
      {notDueYet ? (
        <div
          className="mt-3 rounded-xl border-2 border-dashed border-border px-4 py-3 text-center"
          data-testid="active-not-due"
        >
          <p className="text-base font-extrabold text-foreground">{notDueYet}</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5">
            You can start this pickup on the day
          </p>
        </div>
      ) : (
        next && (
          <button
            type="button"
            onClick={run}
            disabled={action.isPending}
            className="mt-3 w-full h-14 rounded-xl bg-primary text-white text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            data-testid="button-active-next"
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
        )
      )}
    </div>
  );
}

/**
 * A booking counts as "just in" for this long after it was created.
 *
 * Long enough that an agent who glances at the app a few minutes after a
 * customer books still sees the call-out, short enough that it does not sit
 * there shouting about a job nobody took an hour ago — at which point it is
 * just queue, and the queue already has a screen.
 */
const NEW_BOOKING_WINDOW_MS = 30 * 60_000;

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

/** "just now" / "12 min" / "2 hr" — short enough to sit inside a dense row. */
function shortAge(iso: string): string {
  const mins = minutesAgo(iso);
  if (!Number.isFinite(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr`;
}

/** Newest first. The server returns available jobs oldest-first (FIFO, so a
 *  job cannot sit at the bottom of every agent's list forever) and that
 *  ordering is right for the Available screen — but "what just came in" is the
 *  opposite question, so it is re-sorted here rather than changing the API. */
function newestFirst(entries: PickupEntry[]): PickupEntry[] {
  return [...entries].sort(
    (a, b) =>
      new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime(),
  );
}

/**
 * A booking that landed in the last half hour, called out hard.
 *
 * Distinctiveness is carried by weight, size and motion — a heavy ring, the
 * largest type on the screen, and a live pulse — not by a new colour. Per
 * PRODUCT.md amber means money and nothing else, so a "new job" accent in
 * amber would quietly break the one colour rule the agent surface has.
 */
function NewBookingHit({ entry }: { entry: PickupEntry }) {
  const action = useOrderAction();
  const { toast } = useToast();
  const order = entry.order;
  const owed = amountOwedAtDoor(order);
  const claim = entry.availableActions.find((a) => a.action === 'claim');

  const run = (): void => {
    if (!claim) return;
    action.mutate(
      { orderId: order.id, action: claim.action },
      {
        onSuccess: (r) =>
          toast({ title: 'Job accepted', description: `${r.order.order_no} is yours` }),
        onError: (err) =>
          toast({
            title: err.status === 409 ? 'Another agent took it' : 'Could not accept',
            description: err.message,
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <div
      className="rounded-xl border-2 border-primary bg-primary text-white p-4 ring-4 ring-primary/25"
      data-testid="new-booking-hit"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-bold">
          <span className="relative flex w-2 h-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
          </span>
          Just booked · {shortAge(order.created_at)}
        </span>
        <span className="font-mono text-[11px] font-semibold text-white/70 shrink-0">
          {order.order_no}
        </span>
      </div>

      <p className="text-2xl font-extrabold tracking-tight leading-tight mt-2">
        {order.origin_address?.full_name ?? 'Unknown sender'}
      </p>

      <div className="flex items-start gap-2 mt-2">
        <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-white/80" strokeWidth={2.5} />
        <p className="text-sm font-medium text-white/90 leading-snug">{shortAddress(order)}</p>
      </div>

      <div className="flex items-center gap-4 mt-2">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-white/70" strokeWidth={2.5} />
          <span className="text-xs font-semibold text-white/80">
            {formatSlot(order.pickup_date, order.pickup_slot)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Weight className="w-3.5 h-3.5 text-white/70" strokeWidth={2.5} />
          <span className="text-xs font-semibold text-white/80 tabular-nums">
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

      {claim && (
        <button
          type="button"
          onClick={run}
          disabled={action.isPending}
          className="mt-3 w-full h-14 rounded-xl bg-white text-primary text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          data-testid="button-claim-hit"
        >
          {action.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              {claim.label}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * The newest unclaimed bookings, as a scannable list.
 *
 * Deliberately not the whole queue — that is what /agent/available is for.
 * This answers "has anything come in since I last looked", which is a glance,
 * not a browse.
 */
function RecentBookings({ entries }: { entries: PickupEntry[] }) {
  if (entries.length === 0) {
    return (
      <div
        className="rounded-xl border-2 border-dashed border-border bg-white px-4 py-3.5"
        data-testid="recent-bookings-empty"
      >
        <p className="text-base font-extrabold text-foreground leading-tight">
          Nothing new
        </p>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">
          New bookings show up here as customers make them
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border-2 border-border bg-white divide-y divide-border overflow-hidden"
      data-testid="recent-bookings"
    >
      {entries.map(({ order }) => {
        const owed = amountOwedAtDoor(order);
        return (
          <Link
            key={order.id}
            href={`/agent/pickup/${order.id}`}
            className="flex items-center gap-3 px-3.5 py-3 active:bg-muted/50 transition-colors"
            data-testid={`recent-booking-${order.order_no}`}
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
              <span className="block text-[11px] font-semibold text-muted-foreground tabular-nums mt-0.5">
                {formatSlot(order.pickup_date, order.pickup_slot)}
              </span>
            </span>

            {owed !== null && (
              <span className="rounded-md bg-[#F2A123] px-2 py-1 shrink-0">
                <span className="text-xs font-extrabold text-[#1B2A41] tabular-nums">
                  ₹{owed}
                </span>
              </span>
            )}
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2.5} />
          </Link>
        );
      })}
    </div>
  );
}

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

  // A job that can be worked now beats one that cannot, whatever their
  // statuses — an agent holding tomorrow's pickup and today's must be shown
  // today's. Within that, furthest-along wins: it is the one in their hands.
  const active = [...(mine ?? [])].sort((a, b) => {
    const workable = (e: PickupEntry) => (notDueYetReason(e.order) ? 0 : 1);
    const byWorkable = workable(b) - workable(a);
    if (byWorkable !== 0) return byWorkable;
    return (PROGRESS_RANK[b.order.status] ?? 0) - (PROGRESS_RANK[a.order.status] ?? 0);
  })[0];

  const recent = newestFirst(available ?? []);

  // The hit card is the newest booking only while it is genuinely new. After
  // that it stops being an event and becomes queue, which the list below and
  // the Available screen already cover.
  const hit =
    recent[0] && Date.now() - new Date(recent[0].order.created_at).getTime() < NEW_BOOKING_WINDOW_MS
      ? recent[0]
      : null;

  // Never show the same job twice on one screen.
  const recentList = (hit ? recent.slice(1) : recent).slice(0, 4);

  return (
    <AgentShell title="Today" subtitle={`${greeting()} — here's your shift`}>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Act: NOW + QUEUE sit tight together ──────────────────────── */}
          <div className="space-y-3">
            {/* A job that just came in outranks everything, including a job in
                hand: it is the only thing on this screen that expires. Another
                agent can take it while this one reads. */}
            {hit && <NewBookingHit entry={hit} />}

            {active ? (
              <ActiveJob entry={active} />
            ) : (
              // Suppressed under a hit card: that card already presents
              // claimable work, and two full-width navy panels stacked would
              // cancel out the emphasis the hit is supposed to carry.
              !hit && (
                <Link
                  href="/agent/available"
                  className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary p-4 text-white active:scale-[0.99] transition-transform"
                  data-testid="cta-find-work"
                >
                  <Search className="w-6 h-6 shrink-0" strokeWidth={2.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-extrabold leading-tight">
                      {available?.length
                        ? `${available.length} job${available.length === 1 ? '' : 's'} waiting`
                        : 'No jobs waiting'}
                    </span>
                    <span className="block text-sm font-medium text-white/75 mt-0.5">
                      {available?.length ? 'Tap to pick one up' : 'New jobs appear as they book'}
                    </span>
                  </span>
                  <ArrowRight className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                </Link>
              )
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <CountTile
                href="/agent/mine"
                value={mine?.length ?? 0}
                label="My jobs"
                testId="tile-my-jobs"
              />
              <CountTile
                href="/agent/available"
                value={available?.length ?? 0}
                label="Available"
                // Emphasised only when there is work to take and none in hand,
                // so the tile pushes rather than merely reports.
                emphasis={!active && (available?.length ?? 0) > 0}
                testId="tile-available"
              />
            </div>
          </div>

          {/* ── Reference: what has just come in ─────────────────────────── */}
          <section>
            <SectionLabel
              action={
                (available?.length ?? 0) > recentList.length ? (
                  <Link
                    href="/agent/available"
                    className="text-[11px] font-bold text-primary shrink-0"
                    data-testid="link-all-available"
                  >
                    See all {available?.length}
                  </Link>
                ) : undefined
              }
            >
              Just booked
            </SectionLabel>
            <RecentBookings entries={recentList} />
          </section>

          {/* ── Reference: today's shift ─────────────────────────────────── */}
          <section>
            <SectionLabel
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
            >
              Today&apos;s windows
            </SectionLabel>
            <TodayWindows slots={todaySlots} />
          </section>

          {/* ── Reference: money ─────────────────────────────────────────── */}
          <section>
            <SectionLabel>Money</SectionLabel>
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
