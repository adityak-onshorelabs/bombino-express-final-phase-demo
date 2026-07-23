import { createClient } from "redis";

/**
 * Shared Redis client. Only connects when REDIS_URL is set — otherwise every
 * consumer (whatsappSession, supportRateLimit, session store) degrades
 * gracefully via `isReady` guards. Without this guard the client would loop
 * forever trying to reach redis://localhost:6379 on hosts with no local Redis
 * (e.g. Railway), spamming ECONNREFUSED.
 */
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

// A dead cache must never crash the process; log once per failed (re)connect.
redisClient.on("error", (err) => {
  console.error("[redisClient] error:", err.message);
});

if (process.env.REDIS_URL) {
  redisClient.connect().catch((err) => {
    console.error("[redisClient] connection failed:", err);
  });
} else {
  console.log("[redisClient] REDIS_URL not set — Redis disabled, caches degrade to no-op");
}

export default redisClient;
