/**
 * A5 — Pickup Agent read endpoints.
 *
 * Self-registering: `registerAgentRoutes(app)` is called from `routes.ts`.
 * First module of the M0 item-1 split — the rest of `routes.ts` follows the
 * same shape when Arbaaz breaks it up.
 *
 * Both routes are agent-only. Ops must not appear here at all: there is no
 * dispatcher and no assignment screen anywhere in this build (§1), so an admin
 * has no reason to read an agent's queue and `requireRole('agent')` stays
 * exact rather than becoming a list.
 *
 * Transitions do NOT live here. They go through the uniform endpoint,
 * POST /api/orders/:id/actions, so the agent UI renders buttons from
 * `availableActions` and holds no copy of the state machine.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  getAgentWeeklyAvailability,
  setAgentWeekPattern,
} from "../availabilityDb.js";
import { PICKUP_SLOT_VALUES } from "../../shared/pickupSlots.js";
import {
  getAvailablePickups,
  getCollectionsToday,
  getMyPickups,
  type AgentPickup,
} from "../agentDb.js";
import { availableActions } from "../orderLifecycle.js";
import { ensureDbUser, requireRole, requireUser } from "../routeGuards.js";

/**
 * Attach the actions the agent may take on each row, so the list screen can
 * render its buttons without a follow-up request per order.
 */
function withActions(orders: AgentPickup[], agentId: string) {
  return orders.map((order) => ({
    order,
    availableActions: availableActions(order, "agent", { userId: agentId }),
  }));
}

export function registerAgentRoutes(app: Express): void {
  // GET /api/agent/pickups/available — unclaimed jobs, oldest first
  app.get(
    "/api/agent/pickups/available",
    requireUser,
    requireRole("agent"),
    ensureDbUser,
    async (req: Request, res: Response) => {
      const agentId = req.session.dbUserId;
      if (!agentId) {
        res.status(401).json({ message: "Login required" });
        return;
      }

      const pickups = await getAvailablePickups();
      if (pickups === null) {
        res.status(502).json({ message: "Could not load available pickups" });
        return;
      }

      res.json({ pickups: withActions(pickups, agentId) });
    }
  );

  // GET /api/agent/pickups/mine — the caller's own live jobs
  app.get(
    "/api/agent/pickups/mine",
    requireUser,
    requireRole("agent"),
    ensureDbUser,
    async (req: Request, res: Response) => {
      const agentId = req.session.dbUserId;
      if (!agentId) {
        res.status(401).json({ message: "Login required" });
        return;
      }

      const pickups = await getMyPickups(agentId);
      if (pickups === null) {
        res.status(502).json({ message: "Could not load your pickups" });
        return;
      }

      res.json({ pickups: withActions(pickups, agentId) });
    }
  );

  // GET /api/agent/collections — money this agent has taken today (IST),
  // so they can reconcile their pouch against the transaction ids at the end
  // of a shift.
  app.get(
    "/api/agent/collections",
    requireUser,
    requireRole("agent"),
    ensureDbUser,
    async (req: Request, res: Response) => {
      const agentId = req.session.dbUserId;
      if (!agentId) {
        res.status(401).json({ message: "Login required" });
        return;
      }

      const collections = await getCollectionsToday(agentId);
      if (collections === null) {
        res.status(502).json({ message: "Could not load your collections" });
        return;
      }

      const total = collections.reduce((sum, c) => sum + c.amount, 0);
      const cash = collections
        .filter((c) => c.collection_mode === "cash")
        .reduce((sum, c) => sum + c.amount, 0);

      res.json({
        collections,
        // Cash is called out separately because it is the only part the agent
        // is physically carrying and has to hand over.
        totals: { all: total, cash, upi: total - cash, count: collections.length },
      });
    }
  );

  // ── Weekly availability pattern ─────────────────────────────────────────
  // Agents set a normal week once; it repeats. A window no agent works is not
  // offered to customers at booking.

  // GET /api/agent/availability — this agent's weekly pattern
  app.get(
    "/api/agent/availability",
    requireUser,
    requireRole("agent"),
    ensureDbUser,
    async (req: Request, res: Response) => {
      const agentId = req.session.dbUserId;
      if (!agentId) {
        res.status(401).json({ message: "Login required" });
        return;
      }

      const availability = await getAgentWeeklyAvailability(agentId);
      if (availability === null) {
        res.status(502).json({ message: "Could not load your schedule" });
        return;
      }

      res.json({ availability });
    }
  );

  // PUT /api/agent/availability — replace this agent's windows for one weekday
  app.put(
    "/api/agent/availability",
    requireUser,
    requireRole("agent"),
    ensureDbUser,
    async (req: Request, res: Response) => {
      const agentId = req.session.dbUserId;
      if (!agentId) {
        res.status(401).json({ message: "Login required" });
        return;
      }

      // The whole week, every time. Keys are 0 = Sunday .. 6 = Saturday,
      // matching Date.getUTCDay(). An absent or empty day means "not working",
      // so a cleared week is expressible.
      const parsed = z
        .object({
          pattern: z.record(
            z.string().regex(/^[0-6]$/, "Day must be 0-6"),
            z.array(z.enum(PICKUP_SLOT_VALUES as [string, ...string[]]))
          ),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Invalid schedule payload",
        });
        return;
      }

      const pattern: Record<number, string[]> = {};
      for (const [dow, slots] of Object.entries(parsed.data.pattern)) {
        pattern[Number(dow)] = slots;
      }

      const ok = await setAgentWeekPattern(agentId, pattern);
      if (!ok) {
        res.status(502).json({ message: "Could not save your schedule" });
        return;
      }

      res.json({ pattern });
    }
  );
}
