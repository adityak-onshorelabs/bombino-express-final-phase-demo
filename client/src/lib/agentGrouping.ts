/**
 * Date segregation for the agent's job lists.
 *
 * One axis across every agent screen: when is this pickup due. It is the only
 * question that changes what an agent does next — a job for Thursday is not
 * work, it is a commitment, and mixing the two into one scroll is what made
 * the lists unreadable.
 *
 * Deliberately three bands, not five. "Tomorrow" and "next week" call for the
 * same response (nothing today), so they share a band and each card carries
 * its own date. Overdue earns its own band because it is the opposite: a
 * promise already broken, and the one thing that should never sit below the
 * fold.
 *
 * TIMEZONE: compares `YYYY-MM-DD` strings against `todayInIst`, never a raw
 * `new Date()`. `pickup_date` is an Indian calendar date and the server runs
 * in UTC; between 18:30 and midnight UTC they disagree, which is the middle of
 * an Indian working evening.
 */

import { todayInIst } from '@shared/pickupSlots';
import type { PickupEntry } from '@/hooks/useAgentPickups';

export type DateBand = 'overdue' | 'today' | 'scheduled' | 'undated';

/** Render order. Most urgent first; undated last because it is an anomaly. */
export const DATE_BANDS: readonly DateBand[] = ['overdue', 'today', 'scheduled', 'undated'];

export const BAND_LABEL: Record<DateBand, string> = {
  overdue: 'Overdue',
  today: 'Today',
  scheduled: 'Scheduled',
  undated: 'No date set',
};

/**
 * Bands that should read louder than the rest. Emphasis is carried by weight
 * and by position, never by a colour — amber means money on this surface and
 * nothing else (PRODUCT.md).
 */
export function isUrgentBand(band: DateBand): boolean {
  return band === 'overdue';
}

/**
 * Colour by urgency — the one deliberate exception to PRODUCT.md §2.
 *
 * That rule reserves colour for money because a palette of coloured status
 * chips competes with the amber that means cash. This keeps the rule intact by
 * not adding a palette: amber still means money and only money, and the single
 * hue introduced here is red, which already means "wrong" everywhere else in
 * the app (failed actions, error states, destructive toasts). An overdue
 * pickup is a promise already broken, so it reads as the same class of thing.
 *
 * Today and Scheduled are separated by weight and by border strength, not by
 * new hues — a job due today gets the primary border it would have had anyway,
 * a future one recedes to the default. So the surface carries two meanings,
 * both pre-existing, rather than four.
 *
 * Contrast: red-700 on red-50 clears 7:1, and the primary on white clears AA
 * comfortably — both hold up in the direct sunlight PRODUCT.md assumes.
 */
export interface BandTone {
  /** Card border + fill. */
  shell: string;
  /** The status eyebrow at the top of the card. */
  eyebrow: string;
  /** The pickup window chip. */
  slot: string;
  /** Icon inside the window chip. */
  slotIcon: string;
}

const BAND_TONE: Record<DateBand, BandTone> = {
  overdue: {
    shell: 'border-red-300 bg-red-50',
    eyebrow: 'text-red-700',
    slot: 'border-red-200 bg-red-100 text-red-800',
    slotIcon: 'text-red-700',
  },
  today: {
    shell: 'border-primary/40 bg-white',
    eyebrow: 'text-primary',
    slot: 'border-primary/25 bg-primary/10 text-primary',
    slotIcon: 'text-primary',
  },
  scheduled: {
    shell: 'border-border bg-white',
    eyebrow: 'text-muted-foreground',
    slot: 'border-border bg-muted text-foreground/75',
    slotIcon: 'text-foreground/50',
  },
  undated: {
    shell: 'border-border bg-white',
    eyebrow: 'text-muted-foreground',
    slot: 'border-border bg-muted text-foreground/75',
    slotIcon: 'text-foreground/50',
  },
};

export function toneForBand(band: DateBand): BandTone {
  return BAND_TONE[band];
}

export function toneForDate(pickupDate: string | null, today = todayInIst()): BandTone {
  return BAND_TONE[bandForDate(pickupDate, today)];
}

export function bandForDate(pickupDate: string | null, today = todayInIst()): DateBand {
  if (!pickupDate) return 'undated';
  if (pickupDate < today) return 'overdue';
  if (pickupDate === today) return 'today';
  return 'scheduled';
}

export function bandForEntry(entry: PickupEntry, today = todayInIst()): DateBand {
  return bandForDate(entry.order.pickup_date, today);
}

/**
 * Split a list into its bands, each internally sorted.
 *
 * Overdue runs oldest first — the longest-broken promise leads. Everything
 * else runs by date then by booking time, so the next thing due is at the top
 * of its band.
 */
export function groupByDate(
  entries: PickupEntry[],
  today = todayInIst(),
): { band: DateBand; entries: PickupEntry[] }[] {
  const buckets: Record<DateBand, PickupEntry[]> = {
    overdue: [],
    today: [],
    scheduled: [],
    undated: [],
  };

  for (const entry of entries) {
    buckets[bandForEntry(entry, today)].push(entry);
  }

  const byDateThenBooking = (a: PickupEntry, b: PickupEntry): number => {
    const dateDelta = (a.order.pickup_date ?? '').localeCompare(b.order.pickup_date ?? '');
    if (dateDelta !== 0) return dateDelta;
    return new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime();
  };

  buckets.overdue.sort(byDateThenBooking);
  buckets.today.sort(byDateThenBooking);
  buckets.scheduled.sort(byDateThenBooking);
  buckets.undated.sort(byDateThenBooking);

  return DATE_BANDS.map((band) => ({ band, entries: buckets[band] })).filter(
    (g) => g.entries.length > 0,
  );
}

/**
 * Held jobs that count as today's work.
 *
 * Includes overdue: a pickup that slipped a day is late, not cancelled, and it
 * is still the thing the agent should be doing right now. Excludes anything
 * dated forward, which belongs in My pickups under Scheduled.
 */
export function isTodaysWork(entry: PickupEntry, today = todayInIst()): boolean {
  const band = bandForEntry(entry, today);
  return band === 'today' || band === 'overdue' || band === 'undated';
}
