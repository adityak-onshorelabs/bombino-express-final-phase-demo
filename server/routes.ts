import type { Express, NextFunction, Request, Response } from "express";
import {
  countUnreadNotifications,
  createNewSupportSession,
  findItdUserIdByCustomerId,
  generateSessionTitle,
  getItdUserProfileById,
  getItdUserTokenAndSecretsById,
  getOrCreateSupportSession,
  insertLoginAuditLog,
  resolveSupportSession,
  listAddressesByUserIdAndType,
  getShipmentLabel,
  getShipmentInvoice,
  listNotificationsByUserId,
  listShipmentsByUserId,
  markNotificationRead,
  updateSupportSessionMessages,
  upsertItdUserAndReturnId,
  upsertTrackingEvents,
  updateShipmentTrackingStatus,
  getLastKnownTracking,
} from "./appDb.js";
import { decryptPassword, encryptPassword } from "./crypto.js";
import { refreshItdTokenIfNeeded } from "./itdTokenRefresh.js";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";
import { itdClient } from "./itd";
import type { CreateShipmentPayload, RateParams } from "./itd";
import { handleChat } from "./supportAgent";
import { supportChatRateLimit } from "./supportRateLimit.js";
import type { ChatMessage } from "./supportTypes";
import { persistShipmentAfterCreate } from "./persistShipment.js";
import { lookupPostal } from "./postalLookup.js";
import {
  getKycByCapabilityId,
  getKycByUserId,
  upsertKycDocument,
} from "./kycDb.js";
import {
  buildItdKycPayload,
  toKycSummary,
} from "../shared/kyc.js";
import {
  SUPPORT_CHAT_MAX_MESSAGES,
  SUPPORT_CHAT_MAX_CONTENT_LENGTH,
} from "./supportTypes";

const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, JPEG, and PNG files are accepted."));
    }
  },
});

function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  next();
}

async function ensureDbUser(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (req.session.dbUserId || !req.session.user) {
    next();
    return;
  }

  try {
    const row = await findItdUserIdByCustomerId(req.session.user.id);

    if (!row?.id) {
      console.error(
        `[ensureDbUser] no itd_users row found for itd_customer_id=${req.session.user.id}`
      );
      next();
      return;
    }

    req.session.dbUserId = row.id;
    req.session.save((err) => {
      if (err) {
        console.error("[ensureDbUser] session save error:", err);
      }
      next();
    });
  } catch (err) {
    console.error("[ensureDbUser] failed:", err);
    next();
  }
}

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Auth ──────────────────────────────────────────────────────────────────

  // POST /api/auth/login — authenticate via ITD; store token + user in session
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ message: "email and password are required" });
      return;
    }

    try {
      const { token, user } = await itdClient.loginUser(email, password);
      req.session.itdToken = token;
      req.session.user = user;
      // Non-blocking DB sync — never affects login response
      void (async () => {
        try {
          const tokenExpiresAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString();
          const enc = encryptPassword(password);
          const dbRow = await upsertItdUserAndReturnId({
            itd_customer_id: user.id,
            itd_customer_code: user.customerId,
            email: user.email,
            full_name: user.fullName,
            username: user.username,
            role: user.role,
            itd_token: token,
            itd_token_expires_at: tokenExpiresAt,
            ...(enc.encrypted && enc.iv
              ? {
                  itd_password_encrypted: enc.encrypted,
                  encryption_iv: enc.iv,
                }
              : {}),
          });
          if (dbRow?.id) {
            void insertLoginAuditLog({
              user_id: dbRow.id,
              metadata: {
                itd_customer_code: user.customerId,
                role: user.role,
              },
              ip_address: req.ip ?? null,
            });
          }
        } catch (e: any) {
          console.error("[login] DB sync error (non-fatal):", e.message);
        }
      })();
      req.session.save((err) => {
        if (err) {
          console.error("[login] session save error:", err);
        }
        res.json(user);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      res.status(401).json({ message });
    }
  });

  app.get("/api/debug/session", (req, res) => {
    res.json({
      hasSession: !!req.session,
      hasItdToken: !!req.session.itdToken,
      hasUser: !!req.session.user,
      hasDbUserId: !!req.session.dbUserId,
      sessionID: req.sessionID,
      cookieSettings: req.session.cookie,
    });
  });

  // POST /api/auth/logout — destroy session
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: "Logout failed" });
        return;
      }
      res.json({ message: "Logged out" });
    });
  });

  // GET /api/auth/me — return session user
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.session.user) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    res.json(req.session.user);
  });

  app.get(
    "/api/user/profile",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        return res.status(404).json({
          error: "Profile not found",
        });
      }
      const profile = await getItdUserProfileById(req.session.dbUserId);
      if (!profile) {
        return res.status(404).json({
          error: "Profile not found",
        });
      }
      return res.json(profile);
    }
  );

  // ── Shipments history & notifications (DB) ──────────────────────────────

  app.get(
    "/api/shipments/history",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        return res.json([]);
      }
      const rows = await listShipmentsByUserId(req.session.dbUserId);
      return res.json(rows ?? []);
    }
  );

  app.get(
    "/api/shipments/:awb/label",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const { awb } = req.params;
      const dbUserId = req.session.dbUserId;

      if (!dbUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const label = await getShipmentLabel(awb, dbUserId);
      if (!label) {
        return res.status(404).json({ message: "Label not available" });
      }

      return res.json({ label });
    }
  );

  app.get(
    "/api/shipments/:awb/invoice",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const { awb } = req.params;
      const dbUserId = req.session.dbUserId;

      if (!dbUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const invoice = await getShipmentInvoice(awb, dbUserId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not available" });
      }

      return res.json({ invoice });
    }
  );

  app.get(
    "/api/shipments/download-csv",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const rows = await listShipmentsByUserId(req.session.dbUserId);
      if (!rows) {
        return res.status(500).json({ error: "Failed to fetch shipments" });
      }

      const headers = [
        "AWB Number",
        "Booking Date",
        "Service Type",
        "Origin City",
        "Destination City",
        "Destination Country",
        "Consignee Name",
        "Consignee Phone",
        "Shipment Content",
        "Weight",
        "Declared Value",
        "Currency",
        "Current Status",
        "Last Updated",
      ];

      const escape = (val: unknown) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const csvRows = [
        headers.join(","),
        ...rows.map((r) =>
          [
            escape(r.awb_number),
            escape(
              r.booking_date
                ? new Date(r.booking_date).toLocaleDateString("en-IN")
                : r.created_at
                  ? new Date(r.created_at).toLocaleDateString("en-IN")
                  : ""
            ),
            escape(r.service_name),
            escape(r.sender_city),
            escape(r.consignee_city),
            escape(r.consignee_country),
            escape(r.consignee_name),
            escape(r.consignee_phone),
            escape(r.contents_description),
            escape(r.weight_kg),
            escape(r.declared_value),
            escape(r.currency),
            escape(r.current_status),
            escape(
              r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : ""
            ),
          ].join(",")
        ),
      ];

      const csv = csvRows.join("\n");
      const filename =
        "bombino-shipments-" + new Date().toISOString().split("T")[0] + ".csv";

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
      return res.send(csv);
    }
  );

  app.get(
    "/api/addresses",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const parseType = z.enum(["sender", "recipient"]).safeParse(req.query.type);
      if (!parseType.success) {
        return res.status(400).json({ message: "type must be sender or recipient" });
      }

      if (!req.session.dbUserId) {
        return res.json([]);
      }

      const rows = await listAddressesByUserIdAndType(req.session.dbUserId, parseType.data);
      return res.json(rows ?? []);
    }
  );

  app.get(
    "/api/notifications/unread-count",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        return res.json({ count: 0 });
      }
      const count = await countUnreadNotifications(req.session.dbUserId);
      return res.json({ count: count ?? 0 });
    }
  );

  app.get(
    "/api/notifications",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        return res.json([]);
      }
      const rows = await listNotificationsByUserId(req.session.dbUserId);
      return res.json(rows ?? []);
    }
  );

  app.patch(
    "/api/notifications/:id/read",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        return res.status(404).json({ message: "Not found" });
      }
      const rows = await markNotificationRead(req.params.id, req.session.dbUserId);
      if (rows === null) {
        return res.status(500).json({ message: "Database error" });
      }
      if (rows.length === 0) {
        return res.status(404).json({ message: "Not found" });
      }
      return res.json({ ok: true });
    }
  );

  // ── ITD: Tracking ────────────────────────────────────────────────────────

  // GET /api/track/:trackingNo — no login required; guest uses company token + superadmin
  app.get(
    "/api/track/:trackingNo",
    ensureDbUser,
    refreshItdTokenIfNeeded,
    async (req: Request, res: Response) => {
      const { trackingNo } = req.params;

      try {
        const user = req.session.user;
        const data = await itdClient.trackShipment(
          trackingNo,
          user ? req.session.itdToken : undefined,
          user ? user.code : "superadmin"
        );
        const first = data[0];
        const events = first?.docket_events ?? [];
        const latestStatus =
          events.length > 0
            ? String((events[events.length - 1] as { event_state?: string }).event_state ?? "")
                .trim() || "INTRANSIT"
            : "INTRANSIT";
        const trackedAt = new Date().toISOString();
        void upsertTrackingEvents(trackingNo, events);
        void updateShipmentTrackingStatus(trackingNo, latestStatus, trackedAt);
        res.json({
          results: data,
          fromCache: false as const,
          lastTrackedAt: trackedAt,
        });
      } catch (_err) {
        const lastKnown = await getLastKnownTracking(trackingNo);
        if (lastKnown) {
          res.status(200).json({
            fromCache: true as const,
            lastTrackedAt: lastKnown.lastTrackedAt,
            currentStatus: lastKnown.currentStatus,
            message:
              "Tracking service temporarily unavailable. Showing last known status.",
          });
          return;
        }
        res.status(502).json({
          message: "Tracking unavailable. Please try again later.",
        });
      }
    }
  );

  // ── Postal lookup (pincode → city/state) ─────────────────────────────────

  app.get(
    "/api/postal-lookup",
    ensureDbUser,
    async (req: Request, res: Response) => {
      const parseQuery = z
        .object({
          country: z.string().min(1),
          code: z.string().min(1),
        })
        .safeParse(req.query);

      if (!parseQuery.success) {
        return res.status(400).json({ message: "country and code are required" });
      }

      try {
        const result = await lookupPostal(parseQuery.data.country, parseQuery.data.code);
        return res.json(result);
      } catch {
        return res.json({ found: false, city: "", state: "" });
      }
    }
  );

  // ── ITD: Rate Calculation ─────────────────────────────────────────────────

  app.post(
    "/api/rates",
    ensureDbUser,
    refreshItdTokenIfNeeded,
    async (req: Request, res: Response) => {
      const {
        product_code,
        destination_code,
        booking_date,
        origin_code,
        pcs,
        actual_weight,
        ori_city,
        ori_pincode,
        dest_city,
        dest_pincode,
      } = req.body as RateParams;

      if (!product_code || !destination_code || !actual_weight) {
        res.status(400).json({ message: "product_code, destination_code, and actual_weight are required" });
        return;
      }

      const rateParams: RateParams = {
        product_code,
        destination_code,
        booking_date: booking_date ?? new Date().toISOString().split("T")[0],
        origin_code: origin_code ?? "IN",
        pcs: pcs ?? "1",
        actual_weight,
        ori_city,
        ori_pincode,
        dest_city,
        dest_pincode,
      };

      try {
        let data: unknown;
        const sessionUser = req.session.user;
        if (sessionUser && req.session.dbUserId) {
          try {
            const secrets = await getItdUserTokenAndSecretsById(req.session.dbUserId);
            if (
              secrets?.itd_password_encrypted &&
              secrets?.encryption_iv
            ) {
              const plain = decryptPassword(
                secrets.itd_password_encrypted,
                secrets.encryption_iv
              );
              data = await itdClient.getRates(
                rateParams,
                sessionUser.email,
                sessionUser.code,
                plain
              );
            } else {
              data = await itdClient.getRates(rateParams);
            }
          } catch {
            data = await itdClient.getRates(rateParams);
          }
        } else {
          data = await itdClient.getRates(rateParams);
        }
        res.json(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Rate calculation failed";
        res.status(502).json({ message });
      }
    }
  );

  // ── Support: AI chat ──────────────────────────────────────────────────────

  // POST /api/support/chat — guest and logged-in; validates body and returns { message }
  app.post(
    "/api/support/chat",
    ensureDbUser,
  refreshItdTokenIfNeeded,
    supportChatRateLimit,
    async (req: Request, res: Response) => {
    // #region agent log
    try {
      const debugLogPath = path.join(process.cwd(), ".cursor", "debug-643d35.log");
      fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
      fs.appendFileSync(
        debugLogPath,
        JSON.stringify({
          sessionId: "643d35",
          runId: "request",
          hypothesisId: "H0_route_hit",
          location: "routes.ts:POST /api/support/chat",
          message: "chat route hit",
          data: {},
          timestamp: Date.now(),
        }) + "\n"
      );
    } catch (_) {}
    // #endregion
    const body = req.body as { messages?: unknown; sessionId?: unknown };
    const messages = body?.messages;
    const bodySessionId =
      typeof body?.sessionId === "string" && body.sessionId.trim() !== ""
        ? body.sessionId.trim()
        : null;

    if (!Array.isArray(messages)) {
      res.status(400).json({ message: "messages must be an array" });
      return;
    }
    if (messages.length < 1 || messages.length > SUPPORT_CHAT_MAX_MESSAGES) {
      res.status(400).json({
        message: `messages must have 1–${SUPPORT_CHAT_MAX_MESSAGES} items`,
      });
      return;
    }

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i] as Record<string, unknown>;
      if (m?.role !== "user" && m?.role !== "assistant") {
        res.status(400).json({
          message: `messages[${i}]: role must be "user" or "assistant"`,
        });
        return;
      }
      if (typeof m?.content !== "string") {
        res.status(400).json({
          message: `messages[${i}]: content must be a string`,
        });
        return;
      }
      if (m.content.length > SUPPORT_CHAT_MAX_CONTENT_LENGTH) {
        res.status(400).json({
          message: `messages[${i}]: content must be at most ${SUPPORT_CHAT_MAX_CONTENT_LENGTH} characters`,
        });
        return;
      }
    }

    const chatMessages: ChatMessage[] = messages.map((m: Record<string, unknown>) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    }));

    const dbUserId = req.session.dbUserId ?? null;
    const isLoggedIn = !!req.session.user && !!dbUserId;

    let activeSessionId: string | null = null;
    if (isLoggedIn && dbUserId) {
      if (bodySessionId) {
        activeSessionId = bodySessionId;
      } else {
        const row = await getOrCreateSupportSession(dbUserId);
        activeSessionId = row?.id ?? null;
      }
    }

    const context = {
      user: req.session.user ?? null,
      itdToken: req.session.itdToken ?? null,
      dbUserId,
      sessionId: activeSessionId,
    };

    try {
      const message = await handleChat(chatMessages, context);
      const stored: ChatMessage[] = [
        ...chatMessages,
        { role: "assistant" as const, content: message },
      ];

      if (isLoggedIn && activeSessionId) {
        const firstUser = chatMessages.find((m) => m.role === "user");
        const titleCandidate =
          firstUser !== undefined
            ? generateSessionTitle(firstUser.content)
            : undefined;
        void updateSupportSessionMessages(
          activeSessionId,
          stored,
          titleCandidate
        );

        const lastUserMsg =
          chatMessages
            .filter((m) => m.role === "user")
            .at(-1)
            ?.content?.toLowerCase() ?? "";
        const isThankyou = [
          "thank you",
          "thanks",
          "bye",
          "goodbye",
          "perfect",
          "great",
        ].some((phrase) => lastUserMsg.includes(phrase));
        const hasContactCta = message
          .toLowerCase()
          .includes("tap_contact_us");
        if (isThankyou && !hasContactCta && activeSessionId) {
          void resolveSupportSession(activeSessionId);
        }
      }

      res.json({
        message,
        sessionId: isLoggedIn ? activeSessionId : null,
      });
    } catch {
      res.status(500).json({
        message:
          "Something went wrong. Please try again or contact support from the app menu.",
      });
    }
  });

  // GET /api/support/session — logged-in: active session + messages
  app.get(
    "/api/support/session",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const dbUserId = req.session.dbUserId ?? null;
      if (!dbUserId) {
        res.json({
          sessionId: null,
          messages: [] as ChatMessage[],
          title: null as string | null,
        });
        return;
      }

      const row = await getOrCreateSupportSession(dbUserId);
      if (!row) {
        res.json({
          sessionId: null,
          messages: [] as ChatMessage[],
          title: null as string | null,
        });
        return;
      }

      res.json({
        sessionId: row.id,
        messages: row.messages,
        title: row.title,
      });
    }
  );

  // POST /api/support/new-session — start fresh conversation
  app.post(
    "/api/support/new-session",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const dbUserId = req.session.dbUserId ?? null;
      if (!dbUserId) {
        res.status(400).json({ message: "Profile not synced yet" });
        return;
      }

      const created = await createNewSupportSession(dbUserId);
      if (!created) {
        res.status(503).json({ message: "Could not create a new session" });
        return;
      }

      res.json({ sessionId: created.id });
    }
  );

  // ── ITD: Create Shipment ──────────────────────────────────────────────────

  // POST /api/shipments — requires login (session token)
  app.post(
    "/api/shipments",
    ensureDbUser,
    refreshItdTokenIfNeeded,
    async (req: Request, res: Response) => {
    if (!req.session.itdToken) {
      res.status(401).json({ message: "Login required to create a shipment" });
      return;
    }

    if (!req.session.dbUserId) {
      res.status(401).json({ message: "User profile not found. Please log in again." });
      return;
    }

    const payload = req.body as CreateShipmentPayload;

    if (!payload.product_code || !payload.destination_code || !payload.actual_weight) {
      res.status(400).json({ message: "product_code, destination_code, and actual_weight are required" });
      return;
    }

    const kyc = await getKycByUserId(req.session.dbUserId);
    if (!kyc) {
      res.status(422).json({
        message: "KYC required. Upload your identity document before creating a shipment.",
      });
      return;
    }

    const publicUrl =
      process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
    const kycPayload = buildItdKycPayload(
      {
        document_type: kyc.document_type,
        document_no: kyc.document_no,
        capability_id: kyc.capability_id,
      },
      publicUrl
    );
    payload.kyc_details = kycPayload.kyc_details;
    payload.shipper_gstin_type = kycPayload.shipper_gstin_type;
    payload.shipper_gstin_no = kycPayload.shipper_gstin_no;

    try {
      const token = req.session.itdToken;
      if (!token) {
        return res
          .status(401)
          .json({ message: "Session token missing. Please log in again." });
      }
      const data = await itdClient.createShipment(payload, token);
      res.json(data);
      if (data.success && req.session.dbUserId) {
        void persistShipmentAfterCreate(
          req.session.dbUserId,
          payload,
          data,
          req.ip
        );
      }
    } catch (err) {
      console.error("[POST /api/shipments] createShipment failed:", err);
      const message = err instanceof Error ? err.message : "Shipment creation failed";
      const tokenError =
        message.includes("Session expired") || message.includes("AUTH TOKEN");
      res.status(tokenError ? 401 : 502).json({ message });
    }
  });

  // ── KYC: Upload document ──────────────────────────────────────────────────

  // GET /api/kyc/me — masked summary of stored KYC for the logged-in user
  app.get(
    "/api/kyc/me",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      const kyc = await getKycByUserId(req.session.dbUserId);
      if (!kyc) {
        res.status(404).json({ message: "KYC not on file" });
        return;
      }

      res.json(toKycSummary(kyc));
    }
  );

  // POST /api/kyc/upload — upload KYC document; upserts one row per user
  app.post(
    "/api/kyc/upload",
    requireUser,
    ensureDbUser,
    kycUpload.single("file"),
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: "No file uploaded." });
        return;
      }

      const validDocTypes = [
        "Aadhaar Number",
        "PAN Number",
        "Passport Number",
        "Driving Licence",
        "GSTIN (Normal)",
      ] as const;

      const docNoValidation: Record<string, RegExp> = {
        "Aadhaar Number": /^\d{12}$/,
        "PAN Number": /^[A-Z]{5}[0-9]{4}[A-Z]$/i,
        "Passport Number": /^[A-Z0-9]{7,8}$/i,
        "Driving Licence": /^[A-Z0-9-]{5,20}$/i,
        "GSTIN (Normal)": /^.{15}$/,
      };

      const documentType =
        typeof req.body.document_type === "string"
          ? req.body.document_type.trim()
          : "";
      const documentNo =
        typeof req.body.document_no === "string"
          ? req.body.document_no.trim()
          : "";

      if (!documentType) {
        res.status(400).json({ message: "document_type is required" });
        return;
      }
      if (!documentNo) {
        res.status(400).json({ message: "document_no is required" });
        return;
      }
      if (!validDocTypes.includes(documentType as (typeof validDocTypes)[number])) {
        res.status(400).json({ message: "Invalid document type" });
        return;
      }
      if (!docNoValidation[documentType].test(documentNo)) {
        res.status(400).json({
          message: `Invalid document number for ${documentType}`,
        });
        return;
      }

      const normalizedDocumentNo =
        documentType === "Aadhaar Number"
          ? documentNo
          : documentNo.toUpperCase();

      try {
        const existing = await getKycByUserId(req.session.dbUserId);
        const capabilityId = existing?.capability_id ?? crypto.randomUUID();
        const fileDataBase64 = req.file.buffer.toString("base64");

        const saved = await upsertKycDocument({
          user_id: req.session.dbUserId,
          capability_id: capabilityId,
          document_type: documentType,
          document_no: normalizedDocumentNo,
          original_filename: req.file.originalname,
          mime_type: req.file.mimetype,
          file_size_bytes: req.file.size,
          file_data: fileDataBase64,
        });

        if (!saved) {
          res.status(500).json({ message: "Failed to save KYC document." });
          return;
        }

        res.json({
          capability_id: saved.capability_id,
          ...toKycSummary(saved),
        });
      } catch (err) {
        console.error("KYC upload full error:", JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
        res.status(500).json({ message: "Failed to save KYC document." });
      }
    }
  );

  // GET /api/kyc/documents/:id/file — serve KYC document (no auth; ITD must be able to fetch)
  app.get("/api/kyc/documents/:id/file", async (req: Request, res: Response) => {
    try {
      const doc = await getKycByCapabilityId(req.params.id);
      if (!doc) {
        res.status(404).json({ message: "Document not found." });
        return;
      }

      const buffer = Buffer.from(doc.file_data, "base64");
      res.set({
        "Content-Type": doc.mime_type,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${doc.original_filename}"`,
      });
      res.send(buffer);
    } catch (err) {
      console.error("[GET /api/kyc/documents/:id/file] failed:", err);
      res.status(500).json({ message: "Failed to retrieve document." });
    }
  });

  return httpServer;
}
