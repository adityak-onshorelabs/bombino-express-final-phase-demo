import "dotenv/config";
import path from "path";
import fs from "fs";
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
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// ─── Session + Auth ───────────────────────────────────────────────────────────
const PgStore = connectPgSimple(session);
const sessionPool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(
  session({
    store: new PgStore({ pool: sessionPool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET ?? "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

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
