import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, AlertTriangle, ChevronDown, Copy, Sun } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import {
  PICKUP_SLOTS,
  PICKUP_SLOT_VALUES,
  isPickupSlot,
  DAY_NAMES,
  WEEK_ORDER,
  dayOfWeekForDate,
  todayInIst,
  type PickupSlot,
} from '@shared/pickupSlots';

/**
 * The agent's working week, set once and repeating.
 *
 * Shows the WHOLE week at once. The previous version hid six of seven days
 * behind a day-picker strip, so answering "what does my week look like?" took
 * seven taps — wrong for a pattern you set once and rarely revisit. That strip
 * also packed seven targets into ~41px each, under the 44px touch minimum,
 * with 6px gutters under the 8px minimum. Full-width rows fix both.
 *
 * One day expands at a time. Collapsed rows still show their windows as text,
 * so nothing is hidden — expanding is for editing, not for reading.
 *
 * Every edit sends the entire week in one request, so bulk actions (all day,
 * day off, copy to weekdays) are a single write that cannot half-apply.
 *
 * NOTE: no per-date exceptions yet. An agent on leave next Tuesday still shows
 * as working Tuesdays. That needs an exceptions table — see open-items.md.
 */

const AVAILABILITY_KEY = ['/api/agent/availability'] as const;

type WeekPattern = Record<number, PickupSlot[]>;

/** Windows in clock order, however they came back from the server. */
function slotSummary(slots: PickupSlot[]): string {
  return PICKUP_SLOTS.filter((s) => slots.includes(s.value))
    .map((s) => s.label)
    .join(' · ');
}

export default function Schedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const todayDow = dayOfWeekForDate(todayInIst());
  const [openDay, setOpenDay] = useState<number | null>(todayDow);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: AVAILABILITY_KEY,
    queryFn: async (): Promise<WeekPattern> => {
      const res = await fetch('/api/agent/availability', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Could not load your schedule');
      const body = (await res.json()) as { availability: Record<number, string[]> };

      // Drop anything outside the current slot vocabulary. A value left over
      // from an older set of windows would otherwise be echoed back on every
      // save and rejected wholesale, locking the agent out of their own week
      // with no way to clear it from the UI.
      const clean: WeekPattern = {};
      for (const [dow, slots] of Object.entries(body.availability ?? {})) {
        clean[Number(dow)] = (slots ?? []).filter(isPickupSlot);
      }
      return clean;
    },
    staleTime: 0,
  });

  const save = useMutation({
    mutationFn: async (pattern: WeekPattern) => {
      const res = await apiRequest('PUT', '/api/agent/availability', { pattern });
      return (await res.json()) as { pattern: WeekPattern };
    },
    // No optimistic update: an agent who believes they are rostered when the
    // save failed is exactly the failure this screen exists to prevent.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY }),
    onError: (err) => {
      void queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY });
      toast({
        title: 'Not saved',
        description: parseApiErrorMessage(err, 'Could not save your schedule'),
        variant: 'destructive',
      });
    },
  });

  const pattern: WeekPattern = data ?? {};
  const daysOn = WEEK_ORDER.filter((d) => (pattern[d]?.length ?? 0) > 0).length;
  // Explicit accumulator type: WEEK_ORDER is a readonly tuple of literals, so
  // reduce would otherwise infer the accumulator as one of those literals.
  const totalWindows = WEEK_ORDER.reduce<number>(
    (n, d) => n + (pattern[d]?.length ?? 0),
    0,
  );

  const toggleSlot = (dow: number, slot: PickupSlot): void => {
    const current = pattern[dow] ?? [];
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot];
    save.mutate({ ...pattern, [dow]: next });
  };

  const setDay = (dow: number, slots: PickupSlot[]): void => {
    save.mutate({ ...pattern, [dow]: slots });
  };

  const copyToWeekdays = (dow: number): void => {
    // Mon-Fri only. Weekends are a separate decision and copying onto them
    // silently would be the wrong default.
    const source = pattern[dow] ?? [];
    const next: WeekPattern = { ...pattern };
    for (const d of [1, 2, 3, 4, 5]) next[d] = [...source];
    save.mutate(next);
    toast({
      title: 'Applied to Mon–Fri',
      description: source.length
        ? `${slotSummary(source)} on every weekday.`
        : 'Every weekday is now a day off.',
    });
  };

  return (
    <AgentShell title="My week" subtitle="Set once, repeats every week">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center text-center py-20 px-4">
          <AlertTriangle className="w-8 h-8 text-red-600 mb-3" />
          <p className="text-base font-extrabold text-foreground">Could not load your schedule</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 text-sm font-bold text-primary"
            data-testid="button-retry-schedule"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Standing summary — answers "am I set up?" without reading rows,
              and carries the save state so success is never silent. */}
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3',
              totalWindows === 0 ? 'border-red-200 bg-red-50' : 'border-border bg-white',
            )}
            data-testid="week-summary"
          >
            <div className="min-w-0">
              <p className="text-base font-extrabold text-foreground leading-tight">
                {totalWindows === 0
                  ? 'No windows set'
                  : `${totalWindows} window${totalWindows === 1 ? '' : 's'} across ${daysOn} day${daysOn === 1 ? '' : 's'}`}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                {totalWindows === 0
                  ? "Customers can't book a pickup unless an agent works it"
                  : 'Customers can book any window you work'}
              </p>
            </div>
            {save.isPending ? (
              <span
                className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground shrink-0"
                data-testid="indicator-saving"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving
              </span>
            ) : (
              totalWindows > 0 && (
                <span
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 shrink-0"
                  data-testid="indicator-saved"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  Saved
                </span>
              )
            )}
          </div>

          {/* The week. Every day visible; expanding is for editing, not reading. */}
          <div className="space-y-2">
            {WEEK_ORDER.map((dow) => {
              const slots = pattern[dow] ?? [];
              const isOpen = openDay === dow;
              const isToday = dow === todayDow;
              const off = slots.length === 0;

              return (
                <div
                  key={dow}
                  className={cn(
                    'rounded-xl border-2 bg-white overflow-hidden',
                    isOpen ? 'border-primary' : 'border-border',
                  )}
                  data-testid={`day-${dow}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenDay(isOpen ? null : dow)}
                    aria-expanded={isOpen}
                    className="w-full min-h-[60px] px-4 py-3 flex items-center gap-3 text-left active:bg-muted/40 transition-colors"
                    data-testid={`button-day-${dow}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-foreground leading-none">
                          {DAY_NAMES[dow]}
                        </span>
                        {isToday && (
                          <span className="text-[9px] uppercase tracking-[0.1em] font-bold text-primary border border-primary rounded px-1 py-0.5 leading-none">
                            Today
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'block text-xs font-semibold mt-1 truncate',
                          off ? 'text-muted-foreground' : 'text-foreground/75',
                        )}
                      >
                        {off ? 'Day off' : slotSummary(slots)}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200',
                        isOpen && 'rotate-180',
                      )}
                      strokeWidth={2.5}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-border">
                      {/* Bulk actions first: clearing a day was six taps. */}
                      <div className="flex gap-2 my-2.5">
                        <button
                          type="button"
                          disabled={save.isPending}
                          onClick={() => setDay(dow, [...PICKUP_SLOT_VALUES])}
                          className="flex-1 h-11 rounded-lg border-2 border-border bg-white text-xs font-bold text-foreground flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
                          data-testid={`button-all-day-${dow}`}
                        >
                          <Sun className="w-3.5 h-3.5" strokeWidth={2.5} />
                          All day
                        </button>
                        <button
                          type="button"
                          disabled={save.isPending || off}
                          onClick={() => setDay(dow, [])}
                          className="flex-1 h-11 rounded-lg border-2 border-border bg-white text-xs font-bold text-foreground active:scale-[0.98] transition-transform disabled:opacity-40"
                          data-testid={`button-day-off-${dow}`}
                        >
                          Day off
                        </button>
                        <button
                          type="button"
                          disabled={save.isPending}
                          onClick={() => copyToWeekdays(dow)}
                          className="flex-1 h-11 rounded-lg border-2 border-border bg-white text-xs font-bold text-foreground flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
                          data-testid={`button-copy-${dow}`}
                        >
                          <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />
                          Mon–Fri
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {PICKUP_SLOTS.map((slot) => {
                          const on = slots.includes(slot.value);
                          return (
                            <button
                              key={slot.value}
                              type="button"
                              disabled={save.isPending}
                              onClick={() => toggleSlot(dow, slot.value)}
                              aria-pressed={on}
                              className={cn(
                                'h-12 rounded-lg border-2 px-2 flex items-center justify-center gap-1.5 text-sm font-bold tabular-nums transition-colors active:scale-[0.98] disabled:opacity-60',
                                on
                                  ? 'bg-primary border-primary text-white'
                                  : 'bg-white border-border text-foreground',
                              )}
                              data-testid={`button-slot-${dow}-${slot.value}`}
                            >
                              {on && <Check className="w-3.5 h-3.5 stroke-[3] shrink-0" />}
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AgentShell>
  );
}
