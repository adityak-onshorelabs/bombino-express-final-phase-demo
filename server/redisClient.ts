import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 3000,
    family: 0, // allow IPv6 (redis.railway.internal) under ipv4-first DNS
  },
});

redisClient.connect().catch((err) => {
  console.error("[redisClient] connection failed:", err);
});

export default redisClient;
