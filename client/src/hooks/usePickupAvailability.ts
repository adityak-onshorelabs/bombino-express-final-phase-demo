import { useQuery } from '@tanstack/react-query';

/**
 * Pickup window availability, for the booking form.
 *
 * Two separate questions, two queries, because they have different lifetimes:
 * coverage spans a whole month and is fetched once when the picker opens;
 * slot offers are per selected date and change as the day advances.
 */

export interface SlotOffer {
  value: string;
  label: string;
  available: boolean;
  reason: 'open' | 'past' | 'no_agent';
}

/** Windows for one date, each flagged with why it is or isn't bookable. */
export function usePickupSlots(date: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['/api/pickup/slots', date],
    queryFn: async (): Promise<SlotOffer[]> => {
      const res = await fetch(`/api/pickup/slots?date=${encodeURIComponent(date ?? '')}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Could not load pickup windows');
      const body = (await res.json()) as { slots: SlotOffer[] };
      return body.slots ?? [];
    },
    enabled: enabled && !!date,
    // Windows expire as the clock passes them, so this must not be cached for
    // long: a customer lingering on the form should not be offered a window
    // that lapsed while they filled in the address.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Dates in a range that have at least one bookable window. */
export function usePickupCoverage(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['/api/pickup/coverage', from, to],
    queryFn: async (): Promise<string[]> => {
      const res = await fetch(
        `/api/pickup/coverage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Could not load pickup availability');
      const body = (await res.json()) as { dates: string[] };
      return body.dates ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}
