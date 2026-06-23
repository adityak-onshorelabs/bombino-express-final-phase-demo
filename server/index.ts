import "dotenv/config";
import { setDefaultResultOrder } from "node:dns";
import path from "path";
import fs from "fs";

// Cloud Postgres (e.g. Supabase) often resolves to IPv6 first; some networks time out on IPv6.
// Prefer IPv4 for all outbound connections in this process (Node 17+). Also applied via
// server/dns-ipv4first.mjs + NODE_OPTIONS --import so DNS order is set before any module loads.
if (typeof setDefaultResultOrder === "function") {
  setDefaultResultOrder("ipv4first");
}
// #region agent log
const DEBUG_LOG = path.join(process.cwd(), ".cursor", "debug-643d35.log");
function debugLog(payload: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, JSON.stringify(payload) + "\n");
  } catch (_) {}
}
(function () {
  const key = process.env.OPENAI_API_KEY;
  const cwd = process.cwd();
  const envPath = path.resolve(cwd, ".env");
  const payload = {
    sessionId: "643d35",
    runId: "startup",
    hypothesisId: "H1_env",
    location: "index.ts:env-check",
    message: "runtime env loading",
    data: {
      cwd,
      envPath,
      keyUndefined: key === undefined,
      keyType: typeof key,
      keyLength: typeof key === "string" ? key.length : 0,
      keyTrimmedLength: typeof key === "string" ? key.trim().length : 0,
      keyHasLeadingSpace: typeof key === "string" && key.length > 0 && key[0] === " ",
      keyHasTrailingSpace: typeof key === "string" && key.length > 0 && key[key.length - 1] === " ",
      keyWrappedInQuotes:
        typeof key === "string" &&
        key.length >= 2 &&
        ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))),
      keyHasNewline: typeof key === "string" && (key.includes("\n") || key.includes("\r")),
      keyValidPrefix: typeof key === "string" && key.trim().startsWith("sk-"),
    },
    timestamp: Date.now(),
  };
  debugLog(payload);
  fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" },
    body: JSON.stringify(payload),
  }).catch(() => {});
})();
// #endregion
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

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

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  // #region agent log
  if (path === "/api/support/chat" && req.method === "POST") {
    try {
      debugLog({
        sessionId: "643d35",
        runId: "request",
        hypothesisId: "H0_incoming",
        location: "index.ts:middleware",
        message: "incoming POST /api/support/chat",
        data: {},
        timestamp: Date.now(),
      });
    } catch (_) {}
  }
  // #endregion
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
});

(async () => {
  const sessionStore = await buildSessionStore();

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
        sameSite:
          process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "File too large. Maximum size is 5MB." });
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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  
  // reusePort is only supported on Linux - use explicit runtime check
  // Store platform in a variable to prevent esbuild from optimizing it away
  const isLinux = process.platform === "linux";
  const listenOptions: { port: number; host: string; reusePort?: boolean } = {
    port,
    host: "0.0.0.0",
    ...(isLinux && { reusePort: true }),
  };
  
  httpServer
    .listen(
      listenOptions,
      () => {
        log(`serving on port ${port}`);
        // #region agent log
        try {
          debugLog({
            sessionId: "643d35",
            runId: "startup",
            hypothesisId: "H1_env",
            location: "index.ts:listen",
            message: "server listening",
            data: { port },
            timestamp: Date.now(),
          });
        } catch (_) {}
        // #endregion
      },
    )
    .on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        log(`Port ${port} is already in use`, "error");
      } else if (err.code === "ENOTSUP") {
        log(
          `Socket option not supported: ${err.message}. This may occur if reusePort is used on non-Linux systems.`,
          "error",
        );
      } else {
        log(`Server error: ${err.message}`, "error");
      }
      process.exit(1);
    });
})();
