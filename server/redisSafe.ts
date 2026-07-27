/**
 * Shared guard for optional Redis reads/writes.
 *
 * Two failure modes to defend against, not one: when the client has never
 * connected, node-redis v4 *queues* commands instead of rejecting, so a bare
 * try/catch would hang the caller forever rather than throw. Hence the isReady
 * guard plus a timeout race — a slow or dead cache must never stall a reply.
 */

import redisClient from "./redisClient.js";

/** Hard ceiling on any single Redis round-trip. */
export const REDIS_TIMEOUT_MS = 1000;

const TIMED_OUT = Symbol("redis-timeout");

/** Run a Redis command, returning `fallback` if the cache is unusable or slow. */
export async function withRedis<T>(
  label: string,
  op: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (!redisClient.isReady) return fallback;

  try {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), REDIS_TIMEOUT_MS);
    });

    const result = await Promise.race([op(), timeout]);
    if (timer) clearTimeout(timer);

    if (result === TIMED_OUT) {
      console.warn(`[redisSafe] ${label} timed out after ${REDIS_TIMEOUT_MS}ms`);
      return fallback;
    }
    return result as T;
  } catch (err) {
    console.warn(`[redisSafe] ${label} failed (non-fatal):`, err);
    return fallback;
  }
}
