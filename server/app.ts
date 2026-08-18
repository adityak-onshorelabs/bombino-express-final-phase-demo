/**
 * The Express app, built once and handed to whoever is hosting it.
 *
 * Two hosts, and the difference between them is the whole reason this file is
 * separate from `index.ts`:
 *
 *   index.ts      a long-lived node process. Serves the client itself (Vite in
 *                 dev, `dist/public` in production) and listens on a port.
 *   api/index.ts  a Vercel serverless function. Serves no static files — the
 *                 CDN does that — and never listens.
 *
 * Nothing here touches the filesystem or binds a socket, so it is safe in both.
 * `createApp` is async because the session store has to resolve Redis first,
 * and callers must await it before handling a request.
 */

import "dotenv/config";
import { setDefaultResultOrder } from "node:dns";

// Cloud Postgres (e.g. Supabase) often resolves to IPv6 first; some networks time out on IPv6.
// Prefer IPv4 for all outbound connections in this process (Node 17+). Also applied via
// server/dns-ipv4first.mjs + NODE_OPTIONS --import so DNS order is set before any module loads.
if (typeof setDefaultResultOrder === "function") {
  setDefaultResultOrder("ipv4first");
}
import express, { type Express, type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { warnIfPaymentsTestModeEnabled } from "./paymentsTestMode";
import { createServer, type Server } from "http";


// ─── Session + Auth ───────────────────────────────────────────────────────────
const REDIS_READY_WAIT_MS = 5000; // > redis socket.connectTimeout (3000)

async function waitForRedisReady(
  client: {
    isReady: boolean;
    isOpen: boolean;
    on(event: "ready", listener: () => void): void;
    off(event: "ready", listener: () => void): void;
  },
  timeoutMs = REDIS_READY_WAIT_MS
): Promise<boolean> {
  if (client.isReady) return true;

  return new Promise((resolve) => {
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      client.off("ready", onReady);
    };
    client.on("ready", onReady);
  });
}

function makeSessionStoreFailOpen(base: session.Store): session.Store {
  base.on("error", (err: Error) =>
    console.warn("[session] store error (non-fatal):", err?.message ?? err));

  const origGet = base.get.bind(base);
  base.get = (sid, cb) =>
    origGet(sid, (err, sess) => {
      if (err) {
        console.warn("[session] get failed, treating as no session:", err.message);
        return cb(null, null);
      }
      cb(null, sess);
    });

  const origSet = base.set.bind(base);
  base.set = (sid, sess, cb) =>
    origSet(sid, sess, (err?: unknown) => {
      if (err) console.warn("[session] set failed:", String(err));
      if (cb) cb();
    });

  if (typeof base.touch === "function") {
    const origTouch = base.touch.bind(base);
    base.touch = (sid, sess, cb) =>
      origTouch(sid, sess, (err?: unknown) => {
        if (err) console.warn("[session] touch failed:", String(err));
        if (cb) cb();
      });
  }

  return base;
}

async function buildSessionStore(): Promise<session.Store | undefined> {
  if (!process.env.REDIS_URL) {
    console.log("[session] using MemoryStore (REDIS_URL not set)");
    return undefined;
  }

  try {
    const { RedisStore } = await import("connect-redis");
    const { default: client } = await import("./redisClient.js");

    const ready = await waitForRedisReady(client);
    if (!ready) {
      console.warn(
        `[session] using MemoryStore (Redis not ready within ${REDIS_READY_WAIT_MS}ms; ` +
          `isOpen=${client.isOpen}, isReady=${client.isReady})`
      );
      return undefined;
    }

    const baseStore = new RedisStore({ client });
    console.log("[session] using RedisStore");
    return makeSessionStoreFailOpen(baseStore);
  } catch (e) {
    console.warn("[session] using MemoryStore (RedisStore init failed):", e);
    return undefined;
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/** One line per API request, with the JSON it answered. */
function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (path === "/api/support/chat") {
        logLine += " :: [redacted]";
      } else if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
}

/**
 * Build the app. Call once per process and reuse the result.
 *
 * The `httpServer` is created but never listened on here. `registerRoutes`
 * takes one and hands it back; on a serverless host nothing ever binds it, and
 * that is fine — it exists so the signature holds for both hosts.
 */
export async function createApp(): Promise<{ app: Express; httpServer: Server }> {
  const app = express();
  // Behind Vercel's proxy (and any other), so req.protocol and the secure
  // cookie flag read the forwarded headers rather than the socket.
  app.set("trust proxy", 1);
  const httpServer = createServer(app);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));
  app.use(requestLogger);

  const sessionStore = await buildSessionStore();

  // No store means MemoryStore, which is per-process. On a long-lived server
  // that is merely lossy across restarts; on serverless it is broken — every
  // invocation gets an empty store and the user is signed out at random. Set
  // REDIS_URL anywhere the process is not permanent.
  if (!sessionStore && process.env.NODE_ENV === "production") {
    console.warn(
      "[session] PRODUCTION WITHOUT REDIS — sessions live in this process only. " +
        "Set REDIS_URL, or logins will not survive a restart or a second instance.",
    );
  }

  app.use(
    session({
      ...(sessionStore ? { store: sessionStore } : {}),
      secret: process.env.SESSION_SECRET ?? "dev-secret",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    }),
  );

  warnIfPaymentsTestModeEnabled();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "File too large. Maximum size is 4MB." });
      return;
    }
    if (err?.message?.includes("Only PDF")) {
      res.status(400).json({ message: err.message });
      return;
    }
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  return { app, httpServer };
}
