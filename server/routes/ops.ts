/**
 * Phase 3A — Ops read endpoints (board + order detail).
 *
 * Self-registering: `registerOpsRoutes(app)` is called from `routes.ts`.
 * Every route is gated requireUser + requireRole("admin","super_admin") so
 * super_admin is never rejected by an exact single-arg "admin" match.
 *
 * No lifecycle writes here — 3B owns actions.
 */

import type { Express, Request, Response } from "express";
import { ORDER_STATUSES, isOrderStatus } from "../../shared/orderContract.js";
import {
  getOrderByIdForOps,
  listAllOrdersForOps,
  listOrderEventsForOps,
} from "../opsDb.js";
import { requireRole, requireUser } from "../routeGuards.js";

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

  // GET /api/ops/orders/:id — any order by id + events (no ownership filter)
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

      res.json({ order, events });
    }
  );
}
