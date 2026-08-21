/**
 * The two agent messages that need a clock: the morning digest and the
 * before-the-window reminder.
 *
 * Driven by an EXTERNAL SCHEDULER hitting this endpoint, not by a `setInterval`
 * in the process. Two reasons, and both have bitten this deployment shape
 * before: the Railway service restarts on every push, which kills a timer
 * silently and leaves no trace of the messages that stopped going out; and a
 * second instance would fire everything twice. The dedupe key makes the second
 * harmless rather than merely unlikely, but an explicit trigger is observable
 * from outside and a timer is not.
 *
 * Wire it as two Railway cron jobs against
 *   POST {PUBLIC_URL}/api/internal/wa/agent-schedule
 * with `Authorization: Bearer {WA_CRON_SECRET}`:
 *
 *   digest    once, early — 07:00 IST is 01:30 UTC
 *   reminders every 15 minutes
 *
 * Running either more often is safe. Every message is deduped, so a digest
 * fired hourly still sends exactly one per agent per day, and a reminder loop
 * at 15 minutes sends exactly one per job.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { supabase } from "../supabaseClient.js";
import { toOrder, type OrderRow } from "../ordersDb.js";
import type { Order } from "../../shared/orderContract.js";
import { PICKUP_SLOTS, nowInIst, todayInIst } from "../../shared/pickupSlots.js";
import { listAllAgents } from "../whatsappAgents.js";
import { deliverToAgent } from "../notify.js";
import {
  agentDailyDigestMessage,
  agentSlotReminderMessage,
  pickupArea,
} from "../whatsappTemplates.js";

/**
 * How long before a window opens the agent is nudged.
 *
 * Long enough to travel, short enough that the message is about now. The
 * reminder cron runs every 15 minutes, so the real window this opens is
 * 45–60 minutes out, and the dedupe key means only the first tick inside it
 * actually sends.
 */
const REMINDER_LEAD_MINUTES = 45;

type PickupAddressRow = { city: string | null; pincode: string | null };
type JobRow = OrderRow & { origin_address?: PickupAddressRow | null };

const JOB_COLUMNS =
  "id, order_no, user_id, status, pickup_request, pickup_date, pickup_slot, origin_address_id, " +
  "consignee, items, booked_weight, quoted_amount, payment_method, payment_status, is_cod, " +
  "agent_id, actual_weight, final_amount, awb_no, metadata, created_at, updated_at, " +
  "origin_address:addresses(city, pincode)";

function authorised(req: Request): boolean {
  const expected = process.env.WA_CRON_SECRET;
  if (!expected) return false;

  const header = req.header("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

/**
 * Every claimed, not-yet-started job for a date.
 *
 * `agent_accepted` only. A job already at `out_for_pickup` has an agent on the
 * road for it, and reminding someone about the thing they are currently doing
 * is how a notification channel gets muted.
 */
async function listClaimedJobsForDate(date: string): Promise<(Order & {
  agentId: string;
  address: PickupAddressRow | null;
})[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("orders")
    .select(JOB_COLUMNS)
    .eq("pickup_date", date)
    .eq("status", "agent_accepted")
    .not("agent_id", "is", null);

  if (error) {
    console.error("[whatsappSchedule] could not read claimed jobs (non-fatal):", {
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data as unknown as JobRow[]).map((row) => ({
    ...toOrder(row),
    agentId: row.agent_id as string,
    address: row.origin_address ?? null,
  }));
}

function slotStartMinutes(slot: string | null): number | null {
  if (!slot) return null;
  const known = PICKUP_SLOTS.find((s) => s.value === slot);
  if (known) return known.startHour * 60;
  // Legacy three-hour windows are still on older orders and still have to be
  // reminded about. `slotLabel` renders them; this parses them.
  const match = /^(\d{2}):(\d{2})-/.exec(slot);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * One message per agent who has work today: how much, and when it starts.
 *
 * Agents with nothing on are not messaged. A digest that says "0 jobs" is a
 * notification that exists only to be dismissed.
 */
async function sendDailyDigest(date: string): Promise<number> {
  const jobs = await listClaimedJobsForDate(date);
  if (jobs.length === 0) return 0;

  const byAgent = new Map<string, typeof jobs>();
  for (const job of jobs) {
    byAgent.set(job.agentId, [...(byAgent.get(job.agentId) ?? []), job]);
  }

  const agents = await listAllAgents();
  let sent = 0;

  for (const agent of agents) {
    const theirs = byAgent.get(agent.id);
    if (!theirs || theirs.length === 0) continue;

    const firstSlot =
      theirs
        .map((job) => job.pickup_slot)
        .filter((slot): slot is string => Boolean(slot))
        .sort((a, b) => (slotStartMinutes(a) ?? 0) - (slotStartMinutes(b) ?? 0))[0] ?? null;

    await deliverToAgent({
      message: agentDailyDigestMessage({
        agentName: agent.full_name,
        jobCount: theirs.length,
        firstSlot,
        date,
      }),
      agentId: agent.id,
      agentPhone: agent.phone,
      // A digest spans several orders, so it belongs to none of them.
      orderId: null,
      scope: `digest:${agent.id}`,
    });
    sent++;
  }

  return sent;
}

/** One message per job whose window opens shortly. */
async function sendSlotReminders(date: string, now: Date): Promise<number> {
  const jobs = await listClaimedJobsForDate(date);
  if (jobs.length === 0) return 0;

  const ist = nowInIst(now);
  const minutesNow = ist.hour * 60 + ist.minute;

  const agents = await listAllAgents();
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  let sent = 0;

  for (const job of jobs) {
    const start = slotStartMinutes(job.pickup_slot);
    if (start === null) continue;

    // Inside the lead window and not yet begun. A window that has already
    // opened needs no reminder — the agent is either working it or late, and
    // neither is fixed by a message saying it is about to start.
    const minutesUntil = start - minutesNow;
    if (minutesUntil <= 0 || minutesUntil > REMINDER_LEAD_MINUTES) continue;

    const agent = byId.get(job.agentId);
    if (!agent) continue;

    await deliverToAgent({
      message: agentSlotReminderMessage({ order: job, area: pickupArea(job.address) }),
      agentId: agent.id,
      agentPhone: agent.phone,
      orderId: job.id,
      scope: `${job.id}:agent:${agent.id}`,
    });
    sent++;
  }

  return sent;
}

export function registerWhatsappScheduleRoutes(app: Express): void {
  app.post("/api/internal/wa/agent-schedule", async (req: Request, res: Response) => {
    if (!authorised(req)) {
      // 404, not 401. An internal endpoint that confirms it exists is an
      // internal endpoint somebody will start guessing at.
      res.status(404).json({ message: "Not found" });
      return;
    }

    const kind = req.query.kind === "digest" ? "digest" : "reminders";
    const now = new Date();
    const date = todayInIst(now);

    try {
      const sent =
        kind === "digest" ? await sendDailyDigest(date) : await sendSlotReminders(date, now);
      res.json({ ok: true, kind, date, sent });
    } catch (error) {
      console.error("[whatsappSchedule] run failed", {
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      // 500 so a scheduler with retries tries again. Every message is deduped,
      // so a retry after a partial run finishes the job rather than repeating it.
      res.status(500).json({ ok: false, kind });
    }
  });
}
