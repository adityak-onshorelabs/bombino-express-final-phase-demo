/**
 * Pickup window vocabulary, shared by client and server.
 *
 * The slot strings were previously duplicated in three places: the DB CHECK
 * constraint, the Zod schema in `routes.ts`, and a literal array in
 * `CreateShipment.tsx`. They are now defined once here.
 *
 * TIMEZONE: slots are Asia/Kolkata wall-clock times. Every customer and every
 * agent is in India, and `orders.pickup_date` is a bare `date` with no zone,
 * so "has this slot started?" is only meaningful in IST. Never answer that
 * question with a raw `new Date()` on the server, which runs in UTC — use
 * `nowInIst()` below.
 */

/** Six two-hour windows, 9 AM to 9 PM. */
export const PICKUP_SLOTS = [
  { value: '09:00-11:00', label: '9 – 11 AM', startHour: 9, endHour: 11 },
  { value: '11:00-13:00', label: '11 AM – 1 PM', startHour: 11, endHour: 13 },
  { value: '13:00-15:00', label: '1 – 3 PM', startHour: 13, endHour: 15 },
  { value: '15:00-17:00', label: '3 – 5 PM', startHour: 15, endHour: 17 },
  { value: '17:00-19:00', label: '5 – 7 PM', startHour: 17, endHour: 19 },
  { value: '19:00-21:00', label: '7 – 9 PM', startHour: 19, endHour: 21 },
] as const;

/**
 * The three-hour windows this replaced, kept only so historical orders render
 * a readable label instead of a raw `15:00-18:00`.
 *
 * Not bookable: absent from `PICKUP_SLOTS`, so `isPickupSlot` rejects them and
 * no Zod schema or availability query will accept one. Delete once no order
 * predating the change is still on screen.
 */
const LEGACY_SLOT_LABELS: Record<string, string> = {
  '09:00-12:00': '9 AM – 12 PM',
  '12:00-15:00': '12 PM – 3 PM',
  '15:00-18:00': '3 PM – 6 PM',
  '18:00-21:00': '6 PM – 9 PM',
};

export type PickupSlot = (typeof PICKUP_SLOTS)[number]['value'];

export const PICKUP_SLOT_VALUES = PICKUP_SLOTS.map((s) => s.value) as readonly PickupSlot[];

export function isPickupSlot(value: unknown): value is PickupSlot {
  return typeof value === 'string' && (PICKUP_SLOT_VALUES as readonly string[]).includes(value);
}

export function slotLabel(value: string): string {
  return (
    PICKUP_SLOTS.find((s) => s.value === value)?.label ??
    LEGACY_SLOT_LABELS[value] ??
    value
  );
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Current wall-clock time in India, as a plain `{ date, hour, minute }`.
 *
 * Returns the date as `YYYY-MM-DD` so it compares directly against
 * `orders.pickup_date` without any further conversion.
 */
export function nowInIst(now: Date = new Date()): {
  date: string;
  hour: number;
  minute: number;
} {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/**
 * Minutes of notice a pickup needs before its window opens.
 *
 * Zero by design, per the product decision: a slot is bookable right up until
 * the moment it starts. Raise this to require lead time; every caller reads it
 * from here, so one edit changes the rule everywhere.
 */
export const PICKUP_LEAD_TIME_MINUTES = 0;

/**
 * Has this slot already started (or fallen inside the lead time) for the given
 * date? Dates other than today are never in the past by this rule — a date in
 * the past is rejected separately, and future dates are always fine.
 */
export function isSlotPast(
  slotValue: string,
  pickupDate: string,
  now: Date = new Date()
): boolean {
  const slot = PICKUP_SLOTS.find((s) => s.value === slotValue);
  if (!slot) return false;

  const ist = nowInIst(now);
  if (pickupDate > ist.date) return false; // future date
  if (pickupDate < ist.date) return true; // past date

  const minutesNow = ist.hour * 60 + ist.minute + PICKUP_LEAD_TIME_MINUTES;
  return slot.startHour * 60 <= minutesNow;
}

/** Today in India, `YYYY-MM-DD`. The earliest bookable pickup date. */
export function todayInIst(now: Date = new Date()): string {
  return nowInIst(now).date;
}

/**
 * Where a window sits relative to the clock, for an agent looking at their own
 * day. Distinct from `isSlotPast`, which answers the booking question ("can a
 * customer still choose this?") and treats a window as gone the moment it
 * starts. An agent working the 3-5 PM window at 3:30 is very much still in it.
 */
export type SlotWindowState = 'past' | 'active' | 'upcoming';

export function slotWindowState(
  slotValue: string,
  date: string,
  now: Date = new Date()
): SlotWindowState {
  const slot = PICKUP_SLOTS.find((s) => s.value === slotValue);
  if (!slot) return 'upcoming';

  const ist = nowInIst(now);
  if (date > ist.date) return 'upcoming';
  if (date < ist.date) return 'past';

  const minutesNow = ist.hour * 60 + ist.minute;
  if (minutesNow >= slot.endHour * 60) return 'past';
  if (minutesNow >= slot.startHour * 60) return 'active';
  return 'upcoming';
}

// ── Weekdays ──────────────────────────────────────────────────────────────

/**
 * Day of week for a `YYYY-MM-DD` date. 0 = Sunday … 6 = Saturday, matching
 * `Date.getUTCDay()` and the `day_of_week` column.
 *
 * Timezone-safe by construction: a calendar date has exactly one weekday, so
 * parsing it as UTC midnight cannot drift it. Parsing as local midnight would
 * be fine too, but UTC keeps server and client identical.
 */
export function dayOfWeekForDate(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Index matches `dayOfWeekForDate` — do not reorder. */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Weekdays in the order the schedule screen shows them: Monday first, Sunday
 * last, which is how a working week reads. The values are still 0-6.
 */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
