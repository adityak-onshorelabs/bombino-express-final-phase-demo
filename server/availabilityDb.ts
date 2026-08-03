/**
 * A5 — agent weekly availability, and the slot offer it produces.
 *
 * Agents set a recurring week once in their profile; it applies to every
 * matching date from then on. This replaced a per-date table that required
 * ticking boxes daily.
 *
 * Two audiences read it for opposite reasons:
 *   - the agent, editing their own weekly pattern
 *   - the customer at booking, asking "is anyone working this window?"
 *
 * The customer-facing reads are deliberately anonymous. A customer must never
 * learn which agent, or how many, only whether the window is open — staff
 * names and headcount are internal (§1).
 *
 * KNOWN GAP: no per-date exceptions. An agent on leave next Tuesday still
 * counts as working it. See the migration header and open-items.md.
 */

import { supabase } from "./supabaseClient.js";
import {
  PICKUP_SLOTS,
  dayOfWeekForDate,
  isSlotPast,
  type PickupSlot,
} from "../shared/pickupSlots.js";

function logSupabaseError(
  operation: string,
  error: { message?: string; code?: string } | null
): void {
  console.error("[availabilityDb] supabase operation failed:", {
    operation,
    message: error?.message,
    code: error?.code,
  });
}

function getSupabaseClient() {
  if (!supabase) {
    console.error("[availabilityDb] supabase client is not configured");
    return null;
  }
  return supabase;
}

/** Why a window is closed, so the customer sees a reason rather than a gap. */
export type SlotOffer = {
  value: PickupSlot;
  label: string;
  available: boolean;
  reason: "open" | "past" | "no_agent";
};

/**
 * Every `day_of_week -> slots` pair that at least one agent works.
 *
 * The whole table is at most 7 x 4 x (agent count) rows, so it is read in full
 * rather than filtered per query. That keeps the range queries below to a
 * single round trip regardless of how many dates they span.
 */
async function loadCoverageMap(): Promise<Map<number, Set<string>> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("agent_weekly_availability")
    .select("day_of_week, slot");

  if (error) {
    logSupabaseError("loadCoverageMap", error);
    return null;
  }

  const map = new Map<number, Set<string>>();
  for (const row of (data ?? []) as { day_of_week: number; slot: string }[]) {
    const set = map.get(row.day_of_week) ?? new Set<string>();
    set.add(row.slot);
    map.set(row.day_of_week, set);
  }
  return map;
}

/**
 * The four windows for one date, each marked available or not.
 *
 * Two independent gates, evaluated in this order because "already started" is
 * the more useful message: a customer who sees "no agent" for a window that
 * also happens to be in the past would reasonably try the next day and be
 * confused when the same window works there.
 */
export async function getSlotOffersForDate(
  date: string,
  now: Date = new Date()
): Promise<SlotOffer[] | null> {
  const coverage = await loadCoverageMap();
  if (!coverage) return null;

  const covered = coverage.get(dayOfWeekForDate(date)) ?? new Set<string>();

  return PICKUP_SLOTS.map((slot) => {
    if (isSlotPast(slot.value, date, now)) {
      return { value: slot.value, label: slot.label, available: false, reason: "past" as const };
    }
    if (!covered.has(slot.value)) {
      return {
        value: slot.value,
        label: slot.label,
        available: false,
        reason: "no_agent" as const,
      };
    }
    return { value: slot.value, label: slot.label, available: true, reason: "open" as const };
  });
}

/**
 * Dates in `[from, to]` that have at least one bookable window.
 *
 * Drives the date picker: a date nobody works is not selectable. Walks the
 * range day by day and resolves each against the weekly pattern — today is
 * included only if a window on it has not yet started, otherwise the picker
 * would offer a date whose every slot is spent.
 *
 * Range is capped so a crafted `from`/`to` cannot spin the loop.
 */
const MAX_COVERAGE_DAYS = 400;

export async function getCoveredDates(
  from: string,
  to: string,
  now: Date = new Date()
): Promise<string[] | null> {
  const coverage = await loadCoverageMap();
  if (!coverage) return null;

  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let guard = 0;

  while (cursor <= end && guard++ < MAX_COVERAGE_DAYS) {
    const iso = cursor.toISOString().slice(0, 10);
    const slots = coverage.get(cursor.getUTCDay());
    if (slots) {
      for (const slot of Array.from(slots)) {
        if (!isSlotPast(slot, iso, now)) {
          out.push(iso);
          break;
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Is this exact date + slot bookable right now?
 *
 * The authoritative check, called by `POST /api/orders`. The client filters the
 * same way, but a client filter is a convenience: an agent can change their
 * pattern between the customer opening the form and submitting it, and nothing
 * stops a crafted request.
 */
export async function isSlotBookable(
  date: string,
  slot: string,
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; reason: "past" | "no_agent" | "unknown" }> {
  if (isSlotPast(slot, date, now)) return { ok: false, reason: "past" };

  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: "unknown" };

  const { data, error } = await client
    .from("agent_weekly_availability")
    .select("id")
    .eq("day_of_week", dayOfWeekForDate(date))
    .eq("slot", slot)
    .limit(1);

  if (error) {
    logSupabaseError("isSlotBookable", error);
    return { ok: false, reason: "unknown" };
  }
  return (data ?? []).length > 0 ? { ok: true } : { ok: false, reason: "no_agent" };
}

// ── Agent-facing ──────────────────────────────────────────────────────────

/** This agent's weekly pattern, as `{ dayOfWeek: slots[] }`. */
export async function getAgentWeeklyAvailability(
  agentId: string
): Promise<Record<number, string[]> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("agent_weekly_availability")
    .select("day_of_week, slot")
    .eq("agent_id", agentId);

  if (error) {
    logSupabaseError("getAgentWeeklyAvailability", error);
    return null;
  }

  const byDay: Record<number, string[]> = {};
  for (const row of (data ?? []) as { day_of_week: number; slot: string }[]) {
    (byDay[row.day_of_week] ??= []).push(row.slot);
  }
  return byDay;
}

/**
 * Replace this agent's entire weekly pattern in one write.
 *
 * The editor sends the whole week on every change rather than diffing a single
 * day. At most 7 x 6 = 42 rows, so the payload is trivial, and it makes bulk
 * edits ("copy to weekdays", "clear the week") one request instead of five
 * sequential ones that could half-apply and leave a week nobody intended.
 *
 * Two statements, not a transaction — supabase-js cannot express one. Ordered
 * to fail safe: a crash between them leaves the agent with an empty week
 * rather than a stale one. An agent who appears unavailable gets no jobs; a
 * stale roster sends a customer a pickup nobody will collect.
 */
export async function setAgentWeekPattern(
  agentId: string,
  pattern: Record<number, string[]>
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error: deleteError } = await client
    .from("agent_weekly_availability")
    .delete()
    .eq("agent_id", agentId);

  if (deleteError) {
    logSupabaseError("setAgentWeekPattern:delete", deleteError);
    return false;
  }

  const rows: { agent_id: string; day_of_week: number; slot: string }[] = [];
  for (const [dow, slots] of Object.entries(pattern)) {
    for (const slot of Array.from(new Set(slots))) {
      rows.push({ agent_id: agentId, day_of_week: Number(dow), slot });
    }
  }

  if (rows.length === 0) return true;

  const { error: insertError } = await client
    .from("agent_weekly_availability")
    .insert(rows);

  if (insertError) {
    logSupabaseError("setAgentWeekPattern:insert", insertError);
    return false;
  }
  return true;
}
