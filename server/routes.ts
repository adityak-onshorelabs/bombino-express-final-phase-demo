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
  listNotificationsByUserId,
  listShipmentsByUserId,
  markNotificationRead,
  updateSupportSessionMessages,
  upsertItdUserAndReturnId,
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
import type { ChatMessage } from "./supportTypes";
import { persistShipmentAfterCreate } from "./persistShipment.js";
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

const kycMemStore = new Map<
  string,
  {
    buffer: Buffer;
    mimeType: string;
    originalFilename: string;
    documentType: string;
    documentNo: string;
  }
>();

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
        res.json(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tracking failed";
        res.status(502).json({ message });
      }
    }
  );

  // ── ITD: Rate Calculation ─────────────────────────────────────────────────

  app.post(
    "/api/rates",
    ensureDbUser,
    refreshItdTokenIfNeeded,
    async (req: Request, res: Response) => {
      const { product_code, destination_code, booking_date, origin_code, pcs, actual_weight } =
        req.body as RateParams;

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
  app.post("/api/support/chat", ensureDbUser, async (req: Request, res: Response) => {
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

    const payload = req.body as CreateShipmentPayload;

    if (!payload.product_code || !payload.destination_code || !payload.actual_weight) {
      res.status(400).json({ message: "product_code, destination_code, and actual_weight are required" });
      return;
    }

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

  // POST /api/kyc/upload — upload KYC document; returns { id, file_path }
  app.post(
    "/api/kyc/upload",
    kycUpload.single("file"),
    async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ message: "No file uploaded." });
        return;
      }

      const bodySchema = z.object({
        document_type: z.string().min(1, "document_type is required"),
        document_no: z.string().regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits"),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0].message });
        return;
      }

      try {
        const id = crypto.randomUUID();
        kycMemStore.set(id, {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalFilename: req.file.originalname,
          documentType: parsed.data.document_type,
          documentNo: parsed.data.document_no,
        });

        const base = (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5000}`).replace(/\/$/, "");
        res.json({ id, file_path: `${base}/api/kyc/documents/${id}/file` });
      } catch (err) {
        console.error("KYC upload full error:", JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
        res.status(500).json({ message: "Failed to save KYC document." });
      }
    }
  );

  // GET /api/kyc/documents/:id/file — serve KYC document (no auth; ITD must be able to fetch)
  app.get("/api/kyc/documents/:id/file", async (req: Request, res: Response) => {
    try {
      const doc = kycMemStore.get(req.params.id);
      if (!doc) {
        res.status(404).json({ message: "Document not found." });
        return;
      }
      res.set({
        "Content-Type":        doc.mimeType,
        "Content-Length":      String(doc.buffer.length),
        "Cache-Control":       "private, max-age=3600",
        "Content-Disposition": `inline; filename="${doc.originalFilename}"`,
      });
      res.send(doc.buffer);
    } catch (err) {
      console.error("[GET /api/kyc/documents/:id/file] failed:", err);
      res.status(500).json({ message: "Failed to retrieve document." });
    }
  });

  return httpServer;
}
