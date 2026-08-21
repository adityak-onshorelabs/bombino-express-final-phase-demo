/**
 * Phase 3A/3B — Ops read endpoints (board + order detail + availableActions).
 *
 * Self-registering: `registerOpsRoutes(app)` is called from `routes.ts`.
 * Every route is gated requireUser + requireRole("admin","super_admin") so
 * super_admin is never rejected by an exact single-arg "admin" match.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isIndiaHubId } from "../../shared/hubs.js";
import {
  ORDER_STATUSES,
  isOrderStatus,
  isRole,
  type Order,
  type PaymentMethod,
  type PaymentStatus,
} from "../../shared/orderContract.js";
import {
  findItdUserIdByPhone,
  insertStaffUser,
  listStaffUsers,
} from "../appDb.js";
import { getCodeForOwner } from "../handoverCodes.js";
import { availableActions } from "../orderLifecycle.js";
import {
  getOrderByIdForOps,
  listAllOrdersForOps,
  listOrderEventsForOps,
  type OpsOrderDetail,
} from "../opsDb.js";
import { requireRole, requireUser } from "../routeGuards.js";

const createStaffSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required"),
  phone: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
  role: z.enum(["agent", "admin"]),
  hub_id: z.coerce.number().int().refine(isIndiaHubId, "Select a valid hub"),
});

/** Narrow ops detail row to the shared Order contract for availableActions. */
function asOrder(row: OpsOrderDetail): Order {
  return {
    id: row.id,
    order_no: row.order_no,
    user_id: row.user_id,
    status: row.status as Order["status"],
    pickup_request: row.pickup_request === 2 ? 2 : 1,
    pickup_date: row.pickup_date,
    pickup_slot: row.pickup_slot,
    origin_address_id: row.origin_address_id,
    consignee: row.consignee,
    items: row.items,
    booked_weight: row.booked_weight,
    quoted_amount: row.quoted_amount,
    packaging_required: row.packaging_required,
    payment_method: row.payment_method as PaymentMethod,
    payment_status: row.payment_status as PaymentStatus,
    is_cod: row.is_cod,
    agent_id: row.agent_id,
    actual_weight: row.actual_weight,
    final_amount: row.final_amount,
    awb_no: row.awb_no,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function registerOpsRoutes(app: Express): void {
  // GET /api/ops/orders — all orders, newest first (cap 200)
  app.get(
    "/api/ops/orders",
    requireUser,
    requireRole("admin", "super_admin"),
    async (req: Request, res: Response) => {
      const rawStatus = req.query.status;
      let status: string | undefined;

      if (rawStatus !== undefined) {
        if (typeof rawStatus !== "string" || !isOrderStatus(rawStatus)) {
          res.status(400).json({
            message: `status must be one of: ${ORDER_STATUSES.join(", ")}`,
          });
          return;
        }
        status = rawStatus;
      }

      const orders = await listAllOrdersForOps({ status, limit: 200 });
      if (orders === null) {
        res.status(502).json({ message: "Could not load orders" });
        return;
      }

      res.json({ orders });
    }
  );

  // GET /api/ops/orders/:id — any order by id + events + availableActions
  app.get(
    "/api/ops/orders/:id",
    requireUser,
    requireRole("admin", "super_admin"),
    async (req: Request, res: Response) => {
      const order = await getOrderByIdForOps(req.params.id);
      if (!order) {
        res.status(404).json({ message: "Order not found", code: "ORDER_NOT_FOUND" });
        return;
      }

      const events = await listOrderEventsForOps(order.id);
      if (events === null) {
        res.status(502).json({ message: "Could not load order events" });
        return;
      }

      const role = isRole(req.session.user?.role) ? req.session.user!.role : null;
      const callerId = req.session.dbUserId;
      const actions =
        role && callerId
          ? availableActions(asOrder(order), role, { userId: callerId })
          : [];

      // Hub code is owned by ops and typed by the agent. Read only — never
      // issueCode here, or a page load would rotate the number the agent was told.
      let handover: { kind: "hub"; code: string | null; locked: boolean } | null = null;
      if (order.status === "picked_up") {
        const hub = await getCodeForOwner(order.id, "hub");
        handover = {
          kind: "hub",
          code: hub?.code ?? null,
          locked: hub?.locked ?? false,
        };
      }

      res.json({ order, events, availableActions: actions, handover });
    }
  );

  // GET /api/ops/users — staff accounts (agent / admin / super_admin)
  app.get(
    "/api/ops/users",
    requireUser,
    requireRole("admin", "super_admin"),
    async (_req: Request, res: Response) => {
      const users = await listStaffUsers();
      if (users === null) {
        res.status(502).json({ message: "Could not load users" });
        return;
      }
      res.json({ users });
    }
  );

  // POST /api/ops/users — mint a real itd_users staff row (seed-script shape)
  app.post(
    "/api/ops/users",
    requireUser,
    requireRole("admin", "super_admin"),
    async (req: Request, res: Response) => {
      const parsed = createStaffSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        });
        return;
      }
      const { full_name, phone, role, hub_id } = parsed.data;

      const existing = await findItdUserIdByPhone(phone);
      if (existing) {
        res.status(409).json({
          message: "This phone number is already registered. Please sign in instead.",
        });
        return;
      }

      const created = await insertStaffUser({ full_name, phone, role, hub_id });
      if (created === "taken") {
        res.status(409).json({
          message: "This phone number is already registered. Please sign in instead.",
        });
        return;
      }
      if (!created) {
        res.status(502).json({ message: "Could not create user. Please try again." });
        return;
      }

      res.json({
        id: created.id,
        phone: created.phone,
        full_name: created.full_name,
        role: created.role,
      });
    }
  );
}
