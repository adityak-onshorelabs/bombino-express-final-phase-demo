import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { parseApiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import {
  PICKUP_SLOTS,
  PICKUP_SLOT_VALUES,
  isPickupSlot,
  DAY_NAMES_SHORT,
  WEEK_ORDER,
  dayOfWeekForDate,
  todayInIst,
  type PickupSlot,
} from '@shared/pickupSlots';

/**
 * The agent's working week, set once and repeating.
 *
 * One panel, seven rows, one of them open. Collapsed rows still show their
 * windows as mono text, so nothing is hidden — expanding is for editing, not
 * for reading, which is why the whole week fits on one screen without a
 * day-picker strip in front of it.
 *
 * Every edit sends the entire week in one request, so a bulk action is a single
 * write that cannot half-apply.
 *
 * `Day off` is not a button. Clearing all the slots is the same act, and the
 * row's own summary already says "Day off" when they are clear — a button that
 * duplicates a gesture is a third way to do the same thing and one more target
 * to mis-tap with gloves on.
 *
 * The save state is the one place emerald appears on this surface. It is not a
 * status colour: it marks that a write landed, which is the only reassurance
 * this screen owes an agent who taps and walks away.
 *
 * NOTE: no per-date exceptions yet. An agent on leave next Tuesday still shows
 * as working Tuesdays. That needs an exceptions table — see open-items.md.
 */

const AVAILABILITY_KEY = ['/api/agent/availability'] as const;

type WeekPattern = Record<number, PickupSlot[]>;

/** Windows in clock order, however they came back from the server. */
function slotSummary(slots: PickupSlot[]): string {
  return PICKUP_SLOTS.filter((s) => slots.includes(s.value))
    .map((s) => s.label.replace(/\s*(AM|PM)\s*/gi, '').replace(/\s+/g, ''))
    .join(' · ');
}

export default function Schedule() {
  const queryClient = useQueryClient();

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
    // Reported by the "Not saved" indicator in the header rather than a toast:
    // the agent surface has none (see `SurfaceToaster` in App.tsx).
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY });
    },
  });

  const pattern: WeekPattern = data ?? {};
  const daysOn = WEEK_ORDER.filter((d) => (pattern[d]?.length ?? 0) > 0).length;
  // Explicit accumulator type: WEEK_ORDER is a readonly tuple of literals, so
  // reduce would otherwise infer the accumulator as one of those literals.
  const totalWindows = WEEK_ORDER.reduce<number>((n, d) => n + (pattern[d]?.length ?? 0), 0);

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
    // No confirmation: five weekday rows change under the agent's thumb, which
    // is the confirmation.
    save.mutate(next);
  };

  return (
    <AgentShell
      title="My week"
      subtitle={
        totalWindows === 0
          ? 'No windows set'
          : `${totalWindows} window${totalWindows === 1 ? '' : 's'} across ${daysOn} day${daysOn === 1 ? '' : 's'}`
      }
      titleRight={
        save.isPending ? (
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B] shrink-0"
            data-testid="indicator-saving"
          >
            Saving
          </span>
        ) : save.isError ? (
          // Replaces the toast this surface no longer has. It sits where
          // "Saved" would, because that is where an agent already looks to
          // check the roster stuck — and a roster that silently did not save
          // is what this screen exists to prevent.
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#B91C1C] shrink-0"
            data-testid="indicator-not-saved"
          >
            Not saved
          </span>
        ) : data ? (
          <span
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#15803D] shrink-0"
            data-testid="indicator-saved"
          >
            Saved
          </span>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-[#64748B]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <div className="bg-white border border-[#E2E8F0]! rounded-[4px] px-4 py-5">
          <p className="text-sm font-medium text-[#334155]">
            Could not load your schedule. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-11 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#1B2A41]"
            data-testid="button-retry-schedule"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-3.5">
          <div className="bg-white border border-[#E2E8F0]! rounded-[4px] overflow-hidden">
            {WEEK_ORDER.map((dow, i) => {
              const slots = pattern[dow] ?? [];
              const isOpen = openDay === dow;
              const isToday = dow === todayDow;
              const off = slots.length === 0;
              const last = i === WEEK_ORDER.length - 1;

              return (
                <div
                  key={dow}
                  className={cn(
                    !last && 'border-b border-[#E2E8F0]!',
                    isOpen && 'bg-[#F8FAFC]',
                  )}
                  data-testid={`day-${dow}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenDay(isOpen ? null : dow)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    data-testid={`button-day-${dow}`}
                  >
                    <span
                      className={cn(
                        'w-11 shrink-0 font-mono text-xs font-bold uppercase tracking-[0.1em]',
                        off && !isOpen ? 'text-[#94A3B8]' : 'text-[#1B2A41]',
                      )}
                    >
                      {DAY_NAMES_SHORT[dow]}
                    </span>

                    {isOpen ? (
                      <span className="flex-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#F2A123]">
                        {isToday ? 'Today · editing' : 'Editing'}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'flex-1 min-w-0 truncate font-mono text-xs font-medium',
                          off ? 'text-[#94A3B8]' : 'text-[#475569]',
                        )}
                      >
                        {off ? 'Day off' : slotSummary(slots)}
                      </span>
                    )}

                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 shrink-0 text-[#1B2A41]" strokeWidth={2.5} />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0 text-[#94A3B8]" strokeWidth={2.5} />
                    )}
                  </button>

                  {isOpen && (
                    <div className="grid grid-cols-2 gap-2 px-4 pb-3.5">
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
                              'h-[52px] flex items-center justify-center gap-[7px] font-mono text-[13px] font-semibold',
                              'transition-colors duration-150 active:scale-[0.98] disabled:opacity-60',
                              on
                                ? 'bg-[#1B2A41] text-white'
                                : 'bg-white border border-[#CBD5E1]! text-[#1B2A41]',
                            )}
                            data-testid={`button-slot-${dow}-${slot.value}`}
                          >
                            {on && (
                              <Check
                                className="w-[15px] h-[15px] shrink-0 text-[#F2A123]"
                                strokeWidth={3}
                              />
                            )}
                            {slot.label.replace(/\s*–\s*/g, '–')}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() => setDay(dow, [...PICKUP_SLOT_VALUES])}
                        className="h-11 bg-white border border-[#E2E8F0]! font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1B2A41] active:scale-[0.98] transition-transform disabled:opacity-60"
                        data-testid={`button-all-day-${dow}`}
                      >
                        All day
                      </button>
                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() => copyToWeekdays(dow)}
                        className="h-11 bg-white border border-[#E2E8F0]! font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1B2A41] active:scale-[0.98] transition-transform disabled:opacity-60"
                        data-testid={`button-copy-${dow}`}
                      >
                        Copy Mon–Fri
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[13.5px] font-medium leading-[1.5] text-[#475569]">
            Customers can only book a window you work. Changes save as you tap.
          </p>
        </div>
      )}
    </AgentShell>
  );
}
