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
 * Colour by urgency, under the agent surface's colour law.
 *
 * Three meanings and no more: amber is money, navy is a state change the agent
 * commits, red on `#FEF2F2` is late. Everything else is grey. So the only band
 * that carries a hue is overdue — a promise already broken, and red already
 * means "wrong" everywhere else in the app.
 *
 * Today and Scheduled are separated by the weight of their band head and by
 * position, never by a border colour or a fill. A coloured border on a job due
 * today would spend a signal the agent needs for cash.
 *
 * Contrast: `#B91C1C` on `#FEF2F2` clears 7:1 and `#1B2A41` on white clears
 * 13:1 — both hold up in the direct sunlight PRODUCT.md assumes.
 */
export interface BandTone {
  /** Panel fill + hairline for a band that owns its own panel. */
  panel: string;
  /** Compact row fill inside a shared panel. */
  row: string;
  /** The status eyebrow above a job's name. */
  eyebrow: string;
  /** The mono meta line under a job's name. */
  meta: string;
  /** The band head label. */
  head: string;
  /** The hairline that fills the rest of the band head row. */
  rule: string;
}

const BAND_TONE: Record<DateBand, BandTone> = {
  overdue: {
    panel: 'bg-[#FEF2F2] border-[#FECACA]!',
    row: 'bg-[#FEF2F2]',
    eyebrow: 'text-[#B91C1C]',
    meta: 'text-[#B91C1C]',
    head: 'text-[#B91C1C]',
    rule: 'bg-[#FECACA]',
  },
  today: {
    panel: 'bg-white border-[#E2E8F0]!',
    row: 'bg-white',
    eyebrow: 'text-[#1B2A41]',
    meta: 'text-[#64748B]',
    head: 'text-[#1B2A41]',
    rule: 'bg-[#CBD5E1]',
  },
  scheduled: {
    panel: 'bg-white border-[#E2E8F0]!',
    row: 'bg-white',
    eyebrow: 'text-[#64748B]',
    meta: 'text-[#64748B]',
    head: 'text-[#64748B]',
    rule: 'bg-[#E2E8F0]',
  },
  undated: {
    panel: 'bg-white border-[#E2E8F0]!',
    row: 'bg-white',
    eyebrow: 'text-[#64748B]',
    meta: 'text-[#64748B]',
    head: 'text-[#64748B]',
    rule: 'bg-[#E2E8F0]',
  },
};

export function toneForBand(band: DateBand): BandTone {
  return BAND_TONE[band];
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
