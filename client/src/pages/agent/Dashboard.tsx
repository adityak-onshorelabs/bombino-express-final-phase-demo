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

      {next && (
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
      )}
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

  const active = [...(mine ?? [])].sort(
    (a, b) => (PROGRESS_RANK[b.order.status] ?? 0) - (PROGRESS_RANK[a.order.status] ?? 0),
  )[0];

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
            {active ? (
              <ActiveJob entry={active} />
            ) : (
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
