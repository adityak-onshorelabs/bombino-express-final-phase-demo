import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, ChevronUp, ChevronRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { AgentShell } from '@/components/agent/AgentShell';
import { JobCard } from '@/components/agent/PickupCard';
import {
  PICKUP_SLOTS,
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
 * One card, seven rows, one of them open. A collapsed row shows a count, not
 * the windows themselves — the count is what tells an agent whether a day needs
 * their attention, and the windows listed on seven rows are a wall of text
 * nobody reads.
 *
 * Every edit sends the entire week in one request, so a save cannot half-apply.
 *
 * `All day` and `Copy Mon–Fri` are gone, and so is `Day off`. Each was a second
 * way to do something tapping the slots already does, and each was one more
 * target to mis-tap with gloves on. Clearing every slot is a day off, and the
 * collapsed row says `Off`.
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

/** `9 – 11` — the slot with its meridiem stripped, so two fit on a row. */
function slotChipLabel(label: string): string {
  return label.replace(/\s*(AM|PM)\s*/gi, ' ').replace(/\s*–\s*/g, ' – ').trim();
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
    // Reported by the indicator beside the title rather than a toast: the agent
    // surface has none (see `SurfaceToaster` in App.tsx).
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY });
    },
  });

  const pattern: WeekPattern = data ?? {};

  const toggleSlot = (dow: number, slot: PickupSlot): void => {
    const current = pattern[dow] ?? [];
    const next = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot];
    save.mutate({ ...pattern, [dow]: next });
  };

  return (
    <AgentShell
      title="My week"
      sub="Tap the times you can work."
      gap={16}
      meta={
        save.isPending ? (
          <span
            className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#64748B] shrink-0"
            data-testid="indicator-saving"
          >
            Saving
          </span>
        ) : save.isError ? (
          <span
            className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#B91C1C] shrink-0"
            data-testid="indicator-not-saved"
          >
            Not saved
          </span>
        ) : data ? (
          <span
            className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#15803D] shrink-0"
            data-testid="indicator-saved"
          >
            Saved
          </span>
        ) : undefined
      }
    >
      {isLoading && (
        <div className="flex items-center justify-center gap-2.5 py-20 text-[#64748B]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[17px] font-semibold">Loading…</span>
        </div>
      )}

      {isError && (
        <JobCard>
          <p className="px-4 pt-5 text-[17px] font-medium text-[#334155]">Could not load.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-14 px-4 text-[17px] font-bold text-[#1B2A41]"
            data-testid="button-retry-schedule"
          >
            Try again
          </button>
        </JobCard>
      )}

      {data && (
        <JobCard>
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
                  !last && 'border-b border-[#E8EDF2]!',
                  isOpen && 'bg-[#F6F8FA]',
                )}
                data-testid={`day-${dow}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenDay(isOpen ? null : dow)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3.5 px-4 py-[19px] text-left"
                  data-testid={`button-day-${dow}`}
                >
                  <span
                    className={cn(
                      'w-[52px] shrink-0 text-lg font-bold',
                      off && !isOpen ? 'text-[#94A3B8]' : 'text-[#1B2A41]',
                    )}
                  >
                    {DAY_NAMES_SHORT[dow]}
                  </span>

                  {isOpen && isToday ? (
                    <span className="flex-1 text-[13px] font-bold uppercase tracking-[0.1em] text-[#F2A123]">
                      Today
                    </span>
                  ) : isOpen ? (
                    <span className="flex-1" />
                  ) : (
                    <span
                      className={cn(
                        'flex-1 min-w-0 truncate text-[17px] font-medium',
                        off ? 'text-[#94A3B8]' : 'text-[#475569]',
                      )}
                    >
                      {off ? 'Off' : `${slots.length} ${slots.length === 1 ? 'time' : 'times'}`}
                    </span>
                  )}

                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 shrink-0 text-[#1B2A41]" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight
                      className={cn('w-5 h-5 shrink-0', off ? 'text-[#CBD5E1]' : 'text-[#94A3B8]')}
                      strokeWidth={1.5}
                    />
                  )}
                </button>

                {isOpen && (
                  <div className="grid grid-cols-2 gap-2.5 px-4 pb-[18px]">
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
                            'h-[62px] flex items-center justify-center gap-[9px] text-[19px]',
                            'transition-colors duration-150 active:scale-[0.98] disabled:opacity-60',
                            on
                              ? 'bg-[#1B2A41] font-bold text-white'
                              : 'bg-white border border-[#CBD5E1]! font-semibold text-[#1B2A41]',
                          )}
                          data-testid={`button-slot-${dow}-${slot.value}`}
                        >
                          {on && (
                            <Check
                              className="w-[17px] h-[17px] shrink-0 text-[#F2A123]"
                              strokeWidth={2}
                            />
                          )}
                          {slotChipLabel(slot.label)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </JobCard>
      )}
    </AgentShell>
  );
}
