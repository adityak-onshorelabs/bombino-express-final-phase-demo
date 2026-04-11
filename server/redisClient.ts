import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.connect().catch((err) => {
  console.error("[redisClient] connection failed:", err);
});

export default redisClient;
