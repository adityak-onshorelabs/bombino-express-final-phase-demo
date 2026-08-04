import type { Express, NextFunction, Request, Response } from "express";
import {
  countUnreadNotifications,
  createNewSupportSession,
  findItdUserIdByCustomerId,
  findItdUserIdByPhone,
  findOrCreateAddress,
  generateSessionTitle,
  getItdUserProfileById,
  getItdUserTokenAndSecretsById,
  getOrCreateSupportSession,
  insertLoginAuditLog,
  resolveSupportSession,
  listAddressesByUserIdAndType,
  getShipmentDocument,
  listShipmentDocumentKinds,
  listNotificationsByUserId,
  listShipmentsByUserId,
  insertOrderStatusNotification,
  markNotificationRead,
  mergeItdUserMetadataById,
  updateSupportSessionMessages,
  upsertItdUserAndReturnId,
  upsertTrackingEvents,
  updateShipmentTrackingStatus,
  getLastKnownTracking,
} from "./appDb.js";
import type { ShipmentDocumentKind } from "./appDb.js";
import {
  getOrderById,
  getOrderByNumberForUser,
  getUserContactsByIds,
  insertOrderAndReturnRow,
  insertOrderEvent,
  listOrderEvents,
  listOrdersByUserId,
  listPaymentsByOrderId,
} from "./ordersDb.js";
import {
  availableActions,
  findTransition,
  isKnownAction,
} from "./orderLifecycle.js";
import {
  advanceOrderStatus,
  claimPickup,
  recordCollectedPayment,
  transitionOrderStatus,
} from "./agentDb.js";
import { ensureDbUser, requireRole, requireUser } from "./routeGuards.js";
import { registerAgentRoutes } from "./routes/agent.js";
import { deriveCustomerStatus, isInternalOnlyStatus, isRole } from "../shared/orderContract.js";
import type { Order, OrderStatus, Role } from "../shared/orderContract.js";
import { PICKUP_SLOT_VALUES } from "../shared/pickupSlots.js";
import {
  getCoveredDates,
  getSlotOffersForDate,
  isSlotBookable,
} from "./availabilityDb.js";
import {
  generateOtp,
  hashOtp,
  sendOtpSms,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_HOUR,
  OTP_VERIFICATION_WINDOW_MINUTES,
} from "./otp.js";
import type { OtpPurpose } from "./otpDb.js";
import {
  countRecentRequests,
  insertOtpCode,
  getLatestOtpForVerify,
  markConsumed,
  hasRecentVerification,
} from "./otpDb.js";
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
  getKycFileByUserId,
  upsertKycDocument,
} from "./kycDb.js";
import {
  buildItdKycPayload,
  toKycSummary,
} from "../shared/kyc.js";
import { validateGstin } from "../shared/gstin.js";
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

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Self-registering route modules (M0 item 1) ───────────────────────────
  // Agent read endpoints. Transitions stay on the uniform action endpoint
  // below, so this file keeps the state machine and `routes/agent.ts` stays
  // read-only.
  registerAgentRoutes(app);

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

  // ── Signup: OTP + personal/company account creation (A2) ─────────────────

  const otpPurposeSchema = z.enum(["signup_personal", "signup_company", "login"]);
  const phoneSchema = z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit phone number");

  // POST /api/auth/otp/request
  app.post("/api/auth/otp/request", async (req: Request, res: Response) => {
    const parsed = z
      .object({ phone: phoneSchema, purpose: otpPurposeSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { phone, purpose } = parsed.data;

    const recentCount = await countRecentRequests(phone, 60);
    if (recentCount !== null && recentCount >= OTP_MAX_REQUESTS_PER_HOUR) {
      res.status(429).json({ message: "Too many OTP requests. Please try again later." });
      return;
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
    const inserted = await insertOtpCode({
      phone,
      code_hash: hashOtp(code),
      purpose,
      expires_at: expiresAt,
    });
    if (!inserted) {
      res.status(502).json({ message: "Could not send OTP. Please try again." });
      return;
    }

    await sendOtpSms(phone, code);
    res.json({ message: "OTP sent" });
  });

  // POST /api/auth/otp/verify
  app.post("/api/auth/otp/verify", async (req: Request, res: Response) => {
    const parsed = z
      .object({
        phone: phoneSchema,
        purpose: otpPurposeSchema,
        code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { phone, purpose, code } = parsed.data;

    const row = await getLatestOtpForVerify(phone, purpose as OtpPurpose);
    if (!row) {
      res.status(400).json({ message: "No pending OTP for this number. Request a new one." });
      return;
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      res.status(400).json({ message: "This OTP has expired. Request a new one." });
      return;
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      res.status(429).json({ message: "Too many incorrect attempts. Request a new OTP." });
      return;
    }

    // TODO(A2): any 6-digit code is accepted — no SMS provider is wired yet
    // (doc §8 blocker), so there's no real code for a customer to type back.
    // Swap this for `hashOtp(code) !== row.code_hash` once one lands; the
    // real hash is already generated and stored, just unused for comparison.

    await markConsumed(row.id);
    res.json({ verified: true });
  });

  const signupPersonalSchema = z.object({
    full_name: z.string().trim().min(1, "Full name is required"),
    email: z.string().trim().email("Enter a valid email"),
    phone: phoneSchema,
  });

  // POST /api/auth/signup/personal
  app.post("/api/auth/signup/personal", async (req: Request, res: Response) => {
    const parsed = signupPersonalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { full_name, email, phone } = parsed.data;

    const existing = await findItdUserIdByPhone(phone);
    if (existing) {
      res.status(409).json({ message: "This phone number is already registered. Please sign in instead." });
      return;
    }

    const verified = await hasRecentVerification(phone, "signup_personal", OTP_VERIFICATION_WINDOW_MINUTES);
    if (!verified) {
      res.status(400).json({ message: "Please verify your phone number first" });
      return;
    }

    const itdCustomerId = `local-${crypto.randomUUID()}`;
    const row = await upsertItdUserAndReturnId({
      itd_customer_id: itdCustomerId,
      itd_customer_code: itdCustomerId,
      email,
      full_name,
      username: phone,
      role: "customer",
      phone,
      account_type: "personal",
    });
    if (!row?.id) {
      res.status(502).json({ message: "Could not create account. Please try again." });
      return;
    }

    const user = {
      id: itdCustomerId,
      customerId: itdCustomerId,
      code: itdCustomerId,
      email,
      fullName: full_name,
      username: phone,
      role: "customer",
      account_type: "personal" as const,
    };
    req.session.user = user;
    req.session.dbUserId = row.id;
    req.session.save((err) => {
      if (err) {
        console.error("[signup/personal] session save error:", err);
      }
      res.json(user);
    });
  });

  const signupCompanySchema = z.object({
    phone: phoneSchema,
    company_name: z.string().trim().min(1, "Company name is required"),
    gstin: z.string().trim().length(15, "GST number must be 15 characters"),
  });

  // POST /api/auth/signup/company
  app.post("/api/auth/signup/company", async (req: Request, res: Response) => {
    const parsed = signupCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { phone, company_name, gstin: rawGstin } = parsed.data;
    const gstin = rawGstin.toUpperCase();

    const gstinCheck = validateGstin(gstin);
    if (!gstinCheck.valid) {
      res.status(400).json({ message: gstinCheck.message ?? "Invalid GST number" });
      return;
    }

    const existing = await findItdUserIdByPhone(phone);
    if (existing) {
      res.status(409).json({ message: "This phone number is already registered. Please sign in instead." });
      return;
    }

    const verified = await hasRecentVerification(phone, "signup_company", OTP_VERIFICATION_WINDOW_MINUTES);
    if (!verified) {
      res.status(400).json({ message: "Please verify your phone number first" });
      return;
    }

    const itdCustomerId = `local-${crypto.randomUUID()}`;
    const row = await upsertItdUserAndReturnId({
      itd_customer_id: itdCustomerId,
      itd_customer_code: itdCustomerId,
      email: "",
      full_name: company_name,
      username: phone,
      role: "customer",
      phone,
      account_type: "company",
      company_name,
      gstin,
    });
    if (!row?.id) {
      res.status(502).json({ message: "Could not create account. Please try again." });
      return;
    }

    let itdRegistered = false;
    let addCustomerResponse: unknown = null;
    let addCustomerError: string | null = null;
    try {
      const addCustomerResult = await itdClient.addCustomer({
        name: company_name,
        contact_no: phone,
        gst_number: gstin,
      });
      itdRegistered = !!addCustomerResult.success;
      addCustomerResponse = addCustomerResult;
    } catch (err) {
      addCustomerError = err instanceof Error ? err.message : "addCustomer failed";
      console.error("[signup/company] itdClient.addCustomer failed (non-fatal):", err);
    }

    // Persist the attribution context. Without this the ITD registration is
    // invisible to everything downstream — M5 has to know, days later, whether
    // this company exists inside ITD and under what identity. `add_customer`
    // returns no id of its own (§7), so the synthetic `local-<uuid>` we minted
    // above is the only stable handle either side has; record it explicitly
    // rather than leaving it implicit in the `itd_customer_id` column.
    // Non-fatal: a failure here must not cost the customer their account.
    void mergeItdUserMetadataById(row.id, {
      itd_registered: itdRegistered,
      itd_customer_id: itdCustomerId,
      itd_registration_attempted_at: new Date().toISOString(),
      itd_add_customer_response: addCustomerResponse,
      ...(addCustomerError ? { itd_add_customer_error: addCustomerError } : {}),
    });

    const user = {
      id: itdCustomerId,
      customerId: itdCustomerId,
      code: itdCustomerId,
      email: "",
      fullName: company_name,
      username: phone,
      role: "customer",
      account_type: "company" as const,
    };
    req.session.user = user;
    req.session.dbUserId = row.id;
    req.session.save((err) => {
      if (err) {
        console.error("[signup/company] session save error:", err);
      }
      res.json({ ...user, itdRegistered });
    });
  });

  // POST /api/auth/login/otp — re-authenticate an existing personal/company
  // account by phone+OTP (the counterpart to signup/personal & signup/company).
  app.post("/api/auth/login/otp", async (req: Request, res: Response) => {
    const parsed = z.object({ phone: phoneSchema }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { phone } = parsed.data;

    const verified = await hasRecentVerification(phone, "login", OTP_VERIFICATION_WINDOW_MINUTES);
    if (!verified) {
      res.status(400).json({ message: "Please verify your phone number first" });
      return;
    }

    const existing = await findItdUserIdByPhone(phone);
    if (!existing) {
      res.status(404).json({ message: "No account found for this number. Create an account instead." });
      return;
    }

    const profile = await getItdUserProfileById(existing.id);
    if (!profile) {
      res.status(502).json({ message: "Could not sign in. Please try again." });
      return;
    }

    const user = {
      id: profile.itd_customer_id,
      customerId: profile.itd_customer_id,
      code: profile.itd_customer_code,
      email: profile.email ?? "",
      fullName: profile.full_name,
      username: profile.username,
      role: profile.role,
      // Persisted at signup; drives the client's KYC branch on re-login.
      account_type: profile.account_type === "company" ? ("company" as const) : ("personal" as const),
    };
    req.session.user = user;
    req.session.dbUserId = existing.id;
    req.session.save((err) => {
      if (err) {
        console.error("[login/otp] session save error:", err);
      }
      res.json(user);
    });
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

  // Shipment printables (AWB label, box/postal label, invoice) come from the
  // create_docket response stored on the shipment row — tracking never returns them.
  const documentRoutes: {
    path: string;
    kind: ShipmentDocumentKind;
    key: string;
    missing: string;
  }[] = [
    { path: "label", kind: "label", key: "label", missing: "Label not available" },
    {
      path: "box-label",
      kind: "boxLabel",
      key: "boxLabel",
      missing: "Box label not available",
    },
    {
      path: "postal-label",
      kind: "postalLabel",
      key: "postalLabel",
      missing: "Postal service label not available",
    },
    { path: "invoice", kind: "invoice", key: "invoice", missing: "Invoice not available" },
  ];

  app.get(
    "/api/shipments/:awb/documents",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const dbUserId = req.session.dbUserId;
      if (!dbUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const documents = await listShipmentDocumentKinds(req.params.awb, dbUserId);
      return res.json({ documents });
    }
  );

  for (const { path, kind, key, missing } of documentRoutes) {
    app.get(
      `/api/shipments/:awb/${path}`,
      requireUser,
      ensureDbUser,
      async (req: Request, res: Response) => {
        const { awb } = req.params;
        const dbUserId = req.session.dbUserId;

        if (!dbUserId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const document = await getShipmentDocument(awb, dbUserId, kind);
        if (!document) {
          return res.status(404).json({ message: missing });
        }

        return res.json({ [key]: document });
      }
    );
  }

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
    // Docket creation is irreversible — ITD permits no amendment once an AWB
    // exists. Under the deferred-docket model this is fired by ops at the end
    // of the lifecycle (M5), never by a customer at booking. Admin only.
    requireUser,
    requireRole("admin"),
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

  // ── Orders (A3: Booking) ────────────────────────────────────────────────
  // Booking creates a Bombino order, not an ITD docket. Zero ITD calls here —
  // the docket is generated later by ops (M5), reusing itdClient.createShipment
  // above with the data stashed in `items`/`consignee` on this order.

  const PAYMENT_METHODS = ["pay_now", "pay_at_pickup", "pay_at_dropoff", "cod"] as const;

  // ── Pickup slot availability (customer-facing) ──────────────────────────
  // Namespaced under /api/pickup rather than /api/config/slots, which M1 owns
  // (final-phase-modules.md §M1). When Arbaaz builds that endpoint it should
  // delegate here rather than re-deriving availability.

  const isoDateSchema = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

  // GET /api/pickup/slots?date=YYYY-MM-DD
  // Every window for that date, each flagged available with a reason. Returns
  // all four rather than only the open ones so the UI can show why a window is
  // closed instead of silently omitting it.
  app.get("/api/pickup/slots", requireUser, async (req: Request, res: Response) => {
    const parsed = z.object({ date: isoDateSchema }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "date is required" });
      return;
    }

    const slots = await getSlotOffersForDate(parsed.data.date);
    if (slots === null) {
      res.status(502).json({ message: "Could not load pickup windows" });
      return;
    }
    res.json({ date: parsed.data.date, slots });
  });

  // GET /api/pickup/coverage?from=&to=
  // Dates with at least one bookable window, so the date picker can disable
  // the rest. Deliberately returns only dates — never which agent, or how
  // many; that is internal (§1).
  app.get("/api/pickup/coverage", requireUser, async (req: Request, res: Response) => {
    const parsed = z
      .object({ from: isoDateSchema, to: isoDateSchema })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "from and to are required",
      });
      return;
    }

    const dates = await getCoveredDates(parsed.data.from, parsed.data.to);
    if (dates === null) {
      res.status(502).json({ message: "Could not load pickup availability" });
      return;
    }
    res.json({ dates });
  });

  const orderCreateSchema = z
    .object({
      pickup_request: z.union([z.literal(1), z.literal(2)]),
      pickup_date: z.string().trim().min(1).optional().nullable(),
      pickup_slot: z.enum(PICKUP_SLOT_VALUES as [string, ...string[]]).optional().nullable(),
      payment_method: z.enum(PAYMENT_METHODS),
      booked_weight: z.number().optional().nullable(),
      quoted_amount: z.number().optional().nullable(),
      origin_address: z.object({
        full_name: z.string().trim().min(1),
        company: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        phone: z.string().trim().min(1),
        address_line_1: z.string().trim().min(1),
        city: z.string().trim().min(1),
        state: z.string().optional().nullable(),
        pincode: z.string().optional().nullable(),
        country_code: z.string().trim().min(2),
        country_name: z.string().optional().nullable(),
      }),
      consignee: z.record(z.unknown()),
      items: z.record(z.unknown()),
    })
    .refine((body) => body.pickup_request !== 1 || (!!body.pickup_date && !!body.pickup_slot), {
      message: "pickup_date and pickup_slot are required when pickup_request is 1 (pickup)",
    })
    // Two payment methods are tied to how the parcel reaches us, because each
    // names the person who physically takes the money. Pay-at-pickup is
    // collected by the agent at the customer's door and has no collector on a
    // drop-off; pay-at-drop-off is collected by ops at the hub counter and has
    // no collector on a pickup. Allowing the mismatch would create an order
    // whose money nobody is positioned to take, and which no lifecycle action
    // can settle: `collect_payment` is guarded on the method in
    // server/orderLifecycle.ts, so the order would stall before `settled`.
    .refine(
      (body) => !(body.pickup_request === 1 && body.payment_method === "pay_at_dropoff"),
      { message: "Pay at drop-off is only available when you drop the parcel off yourself" }
    )
    .refine(
      (body) => !(body.pickup_request === 2 && body.payment_method === "pay_at_pickup"),
      { message: "Pay at pickup is only available when an agent collects the parcel" }
    );

  // POST /api/orders — requires login (session)
  app.post("/api/orders", ensureDbUser, async (req: Request, res: Response) => {
    if (!req.session.dbUserId) {
      res.status(401).json({ message: "Login required to book a shipment" });
      return;
    }

    const parsed = orderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid order payload" });
      return;
    }
    const body = parsed.data;

    // Authoritative slot check. The client filters the same way, but that is a
    // convenience: the roster can empty between the form loading and the
    // customer submitting, and nothing stops a hand-crafted request. Runs
    // before the address write so a rejected booking leaves nothing behind.
    if (body.pickup_request === 1 && body.pickup_date && body.pickup_slot) {
      const check = await isSlotBookable(body.pickup_date, body.pickup_slot);
      if (!check.ok) {
        const message =
          check.reason === "past"
            ? "That pickup window has already started. Choose a later one."
            : check.reason === "no_agent"
              ? "No pickup agent is available for that window. Choose another."
              : "Could not confirm that pickup window. Please try again.";
        res.status(check.reason === "unknown" ? 502 : 409).json({
          message,
          code: check.reason === "past" ? "SLOT_PAST" : "SLOT_UNAVAILABLE",
        });
        return;
      }
    }

    const originAddr = await findOrCreateAddress({
      user_id: req.session.dbUserId,
      type: "sender",
      full_name: body.origin_address.full_name,
      company: body.origin_address.company || null,
      email: body.origin_address.email || null,
      phone: body.origin_address.phone,
      address_line_1: body.origin_address.address_line_1,
      city: body.origin_address.city,
      state: body.origin_address.state || null,
      pincode: body.origin_address.pincode || null,
      country_code: body.origin_address.country_code,
      country_name: body.origin_address.country_name || null,
    });

    if (!originAddr?.id) {
      res.status(502).json({ message: "Could not save pickup address" });
      return;
    }

    const isPickup = body.pickup_request === 1;
    const status = isPickup ? "pickup_requested" : "awaiting_dropoff";

    const order = await insertOrderAndReturnRow({
      user_id: req.session.dbUserId,
      status,
      pickup_request: body.pickup_request,
      pickup_date: isPickup ? body.pickup_date ?? null : null,
      pickup_slot: isPickup ? body.pickup_slot ?? null : null,
      origin_address_id: originAddr.id,
      consignee: body.consignee,
      items: body.items,
      booked_weight: body.booked_weight ?? null,
      quoted_amount: body.quoted_amount ?? null,
      payment_method: body.payment_method,
      is_cod: body.payment_method === "cod",
    });

    if (!order) {
      res.status(502).json({ message: "Order creation failed" });
      return;
    }

    void insertOrderEvent({
      order_id: order.id,
      status,
      note: "Order created",
      actor_user_id: req.session.dbUserId,
    });

    res.json({ order });
  });

  /**
   * The second line of a customer notification. The title is the derived
   * customer-facing status ("Agent on the way"); this says what it means for
   * them in plain terms.
   *
   * Only customer-visible statuses appear — the three internal ones never
   * produce a notification at all.
   */
  const CUSTOMER_STATUS_DETAIL: Record<string, string> = {
    agent_accepted: "An agent has accepted your pickup.",
    out_for_pickup: "Your agent is on the way to collect your parcel.",
    picked_up: "Your parcel has been collected.",
    received_at_hub: "Your parcel has arrived at the Bombino hub.",
    dispatched: "Your parcel is on its way. You can now track it.",
    cancelled: "Your order has been cancelled.",
  };

  // ── The uniform lifecycle endpoint (M0 item 7) ──────────────────────────
  //
  // Every transition, for every role, in every surface, goes through here.
  // The response carries the recomputed `availableActions` so a caller never
  // has to know the state machine — it renders one button per entry.
  //
  // SCAFFOLD: authorisation is complete and enforced; the write is not built.
  // A legal request gets 501 today. When the handlers land, replace the 501
  // with the transition's effect — and put the race-prone preconditions in the
  // UPDATE's WHERE clause, not just in the guard (see orderLifecycle.ts).

  /**
   * Session role → contract role. `req.session.user.role` is a free-form
   * string (ITD's value on password logins, a Bombino literal on OTP signups),
   * so anything unrecognised resolves to null and is refused rather than
   * defaulted to something permissive.
   */
  function resolveRole(raw: string | undefined): Role | null {
    return isRole(raw) ? raw : null;
  }

  app.post(
    "/api/orders/:id/actions",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      const callerId = req.session.dbUserId;
      if (!callerId) {
        res.status(401).json({ message: "Login required" });
        return;
      }

      const role = resolveRole(req.session.user?.role);
      if (!role) {
        res.status(403).json({
          message: "You do not have permission to perform this action.",
          code: "FORBIDDEN",
        });
        return;
      }

      const parsed = z
        .object({
          action: z.string().trim().min(1, "action is required"),
          payload: z.record(z.unknown()).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          message: parsed.error.issues[0]?.message ?? "Invalid action request",
          code: "INVALID_REQUEST",
        });
        return;
      }

      // Unknown verb is a malformed request (400). A known verb the caller may
      // not perform right now is a refusal (403). Keeping those apart is what
      // lets the client tell "I sent nonsense" from "someone beat me to it".
      if (!isKnownAction(parsed.data.action)) {
        res.status(400).json({
          message: `Unknown action "${parsed.data.action}".`,
          code: "UNKNOWN_ACTION",
        });
        return;
      }
      const action = parsed.data.action;

      const order = await getOrderById(req.params.id);
      if (!order) {
        res.status(404).json({ message: "Order not found", code: "ORDER_NOT_FOUND" });
        return;
      }

      // Ownership, before anything else. A customer may only ever touch their
      // own order. Agents and ops are scoped by the transition table instead —
      // an agent's per-job ownership is enforced by the `isOwningAgent` guard.
      // Note RLS is bypassed everywhere (service-role key), so this check is
      // the only thing standing between a customer and someone else's order.
      if (role === "customer" && order.user_id !== callerId) {
        res.status(404).json({ message: "Order not found", code: "ORDER_NOT_FOUND" });
        return;
      }

      const transition = findTransition(order, action, role, { userId: callerId });
      if (!transition) {
        // Deliberately does not say which precondition failed — that would
        // leak other users' state (e.g. that another agent holds this job).
        res.status(403).json({
          message: "That action is not available on this order right now.",
          code: "ACTION_NOT_AVAILABLE",
          availableActions: availableActions(order, role, { userId: callerId }),
        });
        return;
      }

      // ── Execute ─────────────────────────────────────────────────────────
      // Past this point the caller is authorised and the transition is legal
      // against the row we read. That row is now stale by definition, so each
      // branch re-asserts its preconditions in the UPDATE's WHERE clause and
      // treats a zero-row result as "someone else got there first" (409).

      let updated: Order | null = null;
      let eventNote = "";
      let extra: Record<string, unknown> = {};
      let collectionReceipt: { txnId: string | null; amount: number } | null = null;

      switch (action) {
        case "claim": {
          updated = await claimPickup(order.id, callerId);
          if (!updated) {
            res.status(409).json({
              message: "Another agent just took this pickup.",
              code: "PICKUP_ALREADY_CLAIMED",
            });
            return;
          }
          eventNote = "Pickup claimed by agent";
          break;
        }

        case "start_pickup":
        case "mark_picked_up":
        case "mark_received_at_hub": {
          // `transition.to` is non-null for all three — they are status moves.
          if (!transition.to) {
            res.status(500).json({ message: "Malformed transition", code: "BAD_TRANSITION" });
            return;
          }
          updated = await advanceOrderStatus({
            orderId: order.id,
            agentId: callerId,
            expectedFrom: transition.from,
            to: transition.to,
          });
          if (!updated) {
            // Either the order moved under us, or it is not ours. Both are the
            // same answer to the caller, and saying which would disclose
            // whether another agent holds it.
            res.status(409).json({
              message: "This pickup has already moved on. Refresh your list.",
              code: "ORDER_STATE_CHANGED",
            });
            return;
          }
          eventNote = `Agent moved order to ${transition.to}`;
          break;
        }

        case "collect_payment": {
          // Ops collection at the hub is M3's; this branch is the doorstep.
          if (order.payment_method !== "pay_at_pickup") {
            res.status(400).json({
              message: "This order is not marked pay-at-pickup.",
              code: "PAYMENT_METHOD_MISMATCH",
            });
            return;
          }

          const paymentBody = z
            .object({
              amount: z.number().positive("amount must be greater than zero"),
              // How the money actually moved. Required: an agent handing over
              // a parcel must have said whether they hold cash or watched a
              // UPI transfer land, because only one of those ends up in their
              // pouch at the end of the shift.
              collection_mode: z.enum(["upi", "cash"], {
                errorMap: () => ({ message: "Choose UPI or cash" }),
              }),
              // UPI reference from the customer's app, if they read it out.
              reference: z.string().trim().max(120).optional().nullable(),
            })
            .safeParse(parsed.data.payload ?? {});
          if (!paymentBody.success) {
            res.status(400).json({
              message: paymentBody.error.issues[0]?.message ?? "Invalid payment payload",
              code: "INVALID_PAYLOAD",
            });
            return;
          }

          const result = await recordCollectedPayment({
            order_id: order.id,
            user_id: order.user_id,
            amount: paymentBody.data.amount,
            method: "pay_at_pickup",
            status: "collected",
            collection_mode: paymentBody.data.collection_mode,
            collected_by: callerId,
            reference: paymentBody.data.reference ?? null,
          });
          if (!result) {
            res.status(502).json({
              message: "Could not record the payment. Do not hand over the parcel.",
              code: "PAYMENT_WRITE_FAILED",
            });
            return;
          }

          // Deliberately no status change — the parcel is still out_for_pickup.
          updated = result.order ?? order;
          eventNote = `Collected ₹${paymentBody.data.amount} at pickup (${paymentBody.data.collection_mode})`;
          extra = {
            payment_id: result.paymentId,
            txn_id: result.txnId,
            amount: paymentBody.data.amount,
            collection_mode: paymentBody.data.collection_mode,
          };
          // Surfaced at the top level so the sheet can show the receipt without
          // digging through the event metadata.
          collectionReceipt = { txnId: result.txnId, amount: paymentBody.data.amount };
          break;
        }

        case "cancel": {
          if (!transition.to) {
            res.status(500).json({ message: "Malformed transition", code: "BAD_TRANSITION" });
            return;
          }
          updated = await transitionOrderStatus({
            orderId: order.id,
            expectedFrom: transition.from,
            to: transition.to,
          });
          if (!updated) {
            res.status(409).json({
              message: "This order has already moved on and can no longer be cancelled.",
              code: "ORDER_STATE_CHANGED",
            });
            return;
          }
          eventNote = "Order cancelled";
          break;
        }

        default: {
          // Ops actions — weigh, settle, generate_docket, mark_received_dropoff.
          // Authorised and legal, but the handlers are Arbaaz's (M3/M5). The
          // 501 stays until those land.
          res.status(501).json({
            message: `"${action}" is legal for this order but not implemented yet.`,
            code: "NOT_IMPLEMENTED",
            action,
            from: transition.from,
            to: transition.to,
            requiresPayload: transition.requiresPayload ?? false,
            availableActions: availableActions(order, role, { userId: callerId }),
          });
          return;
        }
      }

      // The write landed. Log it before responding — awaited, not fire-and-
      // forget, so a failure is visible rather than a silently missing row.
      // The status change is already committed and cannot be rolled back from
      // here (supabase-js has no multi-statement transaction), so a failed log
      // is reported alongside a successful action rather than masking it.
      // The durable fix is an AFTER UPDATE trigger on `orders`, which would
      // cover every writer instead of just this endpoint.
      const eventLogged = await insertOrderEvent({
        order_id: updated.id,
        status: updated.status,
        note: eventNote,
        actor_user_id: callerId,
        metadata: { action, role, ...extra },
      });

      if (!eventLogged) {
        console.error("[POST /api/orders/:id/actions] order_events insert failed", {
          order_id: updated.id,
          action,
          status: updated.status,
          actor_user_id: callerId,
        });
      }

      // Tell the customer their order moved.
      //
      // Three statuses are deliberately silent: weigh, settle and
      // ready_for_docket happen while the parcel sits at the hub, and from the
      // customer's point of view nothing has changed. Firing a notification for
      // each would be noise (§2 of roles-and-flows).
      //
      // Also silent when the actor IS the customer — nobody needs telling about
      // something they just did themselves.
      //
      // NOTE: M6 (Status Sync) owns notification fan-out and the audit_log row
      // that should accompany it. This covers the agent transitions only; when
      // M6 lands it should absorb this block rather than double-notify.
      if (
        transition.to &&
        !isInternalOnlyStatus(updated.status) &&
        updated.user_id !== callerId
      ) {
        void insertOrderStatusNotification({
          user_id: updated.user_id,
          title: deriveCustomerStatus(updated),
          body: `${updated.order_no} — ${CUSTOMER_STATUS_DETAIL[updated.status] ?? 'Your order has been updated.'}`,
          data: { order_id: updated.id, order_no: updated.order_no, status: updated.status },
        });
      }

      res.json({
        order: updated,
        availableActions: availableActions(updated, role, { userId: callerId }),
        ...(collectionReceipt ? { receipt: collectionReceipt } : {}),
        ...(eventLogged ? {} : { warning: "Action applied but history entry failed to write." }),
      });
    }
  );

  // GET /api/orders — requires login (session)
  app.get("/api/orders", ensureDbUser, async (req: Request, res: Response) => {
    if (!req.session.dbUserId) {
      res.status(401).json({ message: "Login required" });
      return;
    }

    const orders = await listOrdersByUserId(req.session.dbUserId);
    if (orders === null) {
      res.status(502).json({ message: "Could not load orders" });
      return;
    }

    res.json({ orders });
  });

  // ── GET /api/orders/:orderNo — one order, in full, for its owner ─────────
  //
  // The customer's counterpart to the agent's pickup detail screen. Everything
  // captured at booking, plus the lifecycle log so a pickup customer can see
  // what the agent did and when.
  //
  // Ownership is enforced in the SQL WHERE (`getOrderByNumberForUser`), not
  // here — the service-role key bypasses RLS, so a JS-side comparison would not
  // be a boundary (§4.2 of open-items).

  /**
   * Statuses during which the assigned agent's phone number is useful to the
   * customer. Before a claim there is no agent; after the hub handoff the
   * parcel is ops' problem and the agent should not keep taking calls about it.
   */
  const AGENT_PHONE_VISIBLE_STATUSES: readonly OrderStatus[] = [
    "agent_accepted",
    "out_for_pickup",
    "picked_up",
  ];

  /** Who moved the order, in terms the customer cares about. */
  function eventActorKind(role: unknown, isOwner: boolean): "agent" | "ops" | "you" | "system" {
    if (isOwner) return "you";
    if (role === "agent") return "agent";
    if (role === "admin" || role === "super_admin") return "ops";
    return "system";
  }

  app.get("/api/orders/:orderNo", ensureDbUser, async (req: Request, res: Response) => {
    const userId = req.session.dbUserId;
    if (!userId) {
      res.status(401).json({ message: "Login required" });
      return;
    }

    const order = await getOrderByNumberForUser(req.params.orderNo, userId);
    if (!order) {
      // An order that belongs to someone else is reported the same way as one
      // that does not exist — the distinction is not the caller's business.
      res.status(404).json({ message: "Order not found", code: "ORDER_NOT_FOUND" });
      return;
    }

    const [rawEvents, payments] = await Promise.all([
      listOrderEvents(order.id),
      listPaymentsByOrderId(order.id),
    ]);

    // The three internal statuses produce no customer-visible change (§2 of
    // roles-and-flows) and are dropped rather than rendered as a stalled
    // repeat of "Arrived at Bombino hub".
    const visibleEvents = (rawEvents ?? []).filter(
      (ev) => !isInternalOnlyStatus(ev.status as OrderStatus)
    );

    const contacts = await getUserContactsByIds([
      ...visibleEvents.map((ev) => ev.actor_user_id).filter((id): id is string => !!id),
      ...(payments ?? []).map((p) => p.collected_by).filter((id): id is string => !!id),
      ...(order.agent_id ? [order.agent_id] : []),
    ]);

    const events = visibleEvents.map((ev) => {
      const meta = (ev.metadata ?? {}) as Record<string, unknown>;
      const actor = ev.actor_user_id ? contacts.get(ev.actor_user_id) : undefined;
      // `collect_payment` is the one action that does real work without moving
      // the order, so deriving its label from the status would repeat the
      // previous entry verbatim ("Agent on the way" twice in a row). Name what
      // actually happened instead.
      const isCollection = meta.action === "collect_payment";
      return {
        id: ev.id,
        at: ev.created_at,
        status: ev.status,
        // Same phrase the list and the badge use, so one order never reads as
        // two different things on two screens.
        label: isCollection
          ? "Payment collected"
          : deriveCustomerStatus({ ...order, status: ev.status as OrderStatus }),
        note: ev.note,
        action: typeof meta.action === "string" ? meta.action : null,
        actorName: actor?.full_name ?? null,
        actorKind: eventActorKind(meta.role, ev.actor_user_id === userId),
        amount: typeof meta.amount === "number" ? meta.amount : null,
      };
    });

    const agentContact = order.agent_id ? contacts.get(order.agent_id) : undefined;
    const agent = agentContact
      ? {
          name: agentContact.full_name,
          phone: AGENT_PHONE_VISIBLE_STATUSES.includes(order.status)
            ? agentContact.phone
            : null,
        }
      : null;

    res.json({
      order,
      customerStatus: deriveCustomerStatus(order),
      agent,
      events,
      payments: (payments ?? []).map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        status: p.status,
        reference: p.reference,
        collectedAt: p.collected_at ?? p.created_at,
        collectedByName: p.collected_by ? contacts.get(p.collected_by)?.full_name ?? null : null,
      })),
      // Lets the page render a Cancel button without knowing the state machine.
      availableActions: availableActions(order, "customer", { userId }),
      // A failed events read is not fatal — the booking detail is still worth
      // showing — but the page must be able to say so rather than imply the
      // order has no history.
      ...(rawEvents === null ? { warning: "History could not be loaded." } : {}),
    });
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

      // Never cache: a fresh upload must be visible on the next read.
      res.set("Cache-Control", "no-store");

      const kyc = await getKycByUserId(req.session.dbUserId);
      if (!kyc) {
        res.status(404).json({ message: "KYC not on file" });
        return;
      }

      res.json(toKycSummary(kyc));
    }
  );

  // GET /api/kyc/me/file — serve the logged-in user's own KYC document for preview
  app.get(
    "/api/kyc/me/file",
    requireUser,
    ensureDbUser,
    async (req: Request, res: Response) => {
      if (!req.session.dbUserId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }

      try {
        const doc = await getKycFileByUserId(req.session.dbUserId);
        if (!doc) {
          res.status(404).json({ message: "KYC not on file" });
          return;
        }

        const buffer = Buffer.from(doc.file_data, "base64");
        res.set({
          "Content-Type": doc.mime_type,
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-store",
          "Content-Disposition": `inline; filename="${doc.original_filename.replace(/"/g, "")}"`,
        });
        res.send(buffer);
      } catch (err) {
        console.error("[GET /api/kyc/me/file] failed:", err);
        res.status(500).json({ message: "Failed to retrieve document." });
      }
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
        // Re-uploads reuse the capability_id, so a cached copy would go stale.
        "Cache-Control": "no-store",
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
