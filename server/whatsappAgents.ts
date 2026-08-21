/**
 * Which agents hear about a job.
 *
 * Deliberately its own file rather than an addition to `availabilityDb.ts`.
 * That file opens by stating that its reads are anonymous — a customer must
 * never learn which agent or how many (§1) — and this read is the exact
 * opposite: it exists to name agents and their phone numbers. Putting it there
 * would sit a staff-identifying query under a header promising there are none.
 *
 * Internal only. Nothing here may ever reach a customer-facing response.
 */

import { supabase } from "./supabaseClient.js";
import { dayOfWeekForDate } from "../shared/pickupSlots.js";
import type { WhatsappRecipient } from "./whatsappDb.js";

function logSupabaseError(
  operation: string,
  error: { message?: string; code?: string } | null
): void {
  console.error("[whatsappAgents] supabase operation failed (non-fatal):", {
    operation,
    message: error?.message,
    code: error?.code,
  });
}

function getSupabaseClient() {
  if (!supabase) {
    console.error("[whatsappAgents] supabase client is not configured");
    return null;
  }
  return supabase;
}

function readOptOut(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).whatsapp_opt_out === true;
}

async function loadAgents(ids: string[] | null): Promise<WhatsappRecipient[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  let query = client
    .from("itd_users")
    .select("id, full_name, phone, metadata")
    .eq("role", "agent");

  if (ids) {
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError("loadAgents", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    full_name: (row.full_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    optedOut: readOptOut(row.metadata),
  }));
}

/**
 * The agents to tell about a pickup in this window.
 *
 * NOT every agent — that is a pager storm, and the fastest way to have the
 * whole field team mute the number. Only those whose weekly pattern covers the
 * job's day and slot.
 *
 * FALLBACK, and it is on purpose: if the roster names nobody, every agent is
 * told instead. A window with no rostered agent should not have been bookable
 * at all (`isSlotBookable` gates it), so reaching this branch means the roster
 * and the booking disagree — and the failure that matters then is a parcel
 * nobody collects, not one extra notification. The log line is the signal that
 * `agent_weekly_availability` has a hole in it.
 */
export async function listAgentsForPickup(input: {
  date: string | null;
  slot: string | null;
}): Promise<WhatsappRecipient[]> {
  const { date, slot } = input;

  if (!date || !slot) {
    // A pickup with no window is not something the roster can answer, so
    // everyone hears about it.
    return loadAgents(null);
  }

  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("agent_weekly_availability")
    .select("agent_id")
    // `dayOfWeekForDate` parses the bare calendar date as UTC midnight. Never
    // `new Date().getDay()` here: the server runs in UTC, and between 18:30
    // and midnight UTC that is the wrong Indian day — which is the middle of
    // an Indian evening, when pickups are still running.
    .eq("day_of_week", dayOfWeekForDate(date))
    .eq("slot", slot);

  if (error) {
    logSupabaseError("listAgentsForPickup", error);
    return [];
  }

  const ids = Array.from(new Set((data ?? []).map((row) => row.agent_id as string)));

  if (ids.length === 0) {
    console.warn(
      "[whatsappAgents] no agent is rostered for a booked window — telling everyone",
      { date, slot }
    );
    return loadAgents(null);
  }

  return loadAgents(ids);
}

/** One agent, by id, with the opt-out flag the send path needs. */
export async function getAgent(agentId: string): Promise<WhatsappRecipient | null> {
  const agents = await loadAgents([agentId]);
  return agents[0] ?? null;
}

/** Every agent. For the morning digest, which iterates their own claimed jobs. */
export async function listAllAgents(): Promise<WhatsappRecipient[]> {
  return loadAgents(null);
}
