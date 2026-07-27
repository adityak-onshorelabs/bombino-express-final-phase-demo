/**
 * Redis-backed conversation state for the WhatsApp BIA channel (guest users).
 * Every helper degrades gracefully when Redis is unavailable — a dead cache must
 * never stop BIA from answering (mirrors server/supportRateLimit.ts).
 */

import redisClient from "./redisClient.js";
import { withRedis } from "./redisSafe.js";
import type { ChatMessage } from "./supportTypes.js";

const HISTORY_PREFIX = "wa:chat:";
const DEDUPE_PREFIX = "wa:dedupe:";
const RATELIMIT_PREFIX = "ratelimit:support:wa:";

/** Sliding window a conversation stays warm; well under WhatsApp's 24h service window. */
const HISTORY_TTL_SECONDS = 1800; // 30 minutes
/** Keep the last N messages (user + assistant), far below SUPPORT_CHAT_MAX_MESSAGES (50). */
const HISTORY_MAX_MESSAGES = 20;
/** Tata retries a webhook for minutes; hold message ids longer than that. */
const DEDUPE_TTL_SECONDS = 900; // 15 minutes

const RATE_LIMIT_PER_WINDOW = 10;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour — matches the guest limit for /api/support/chat

// ─── History ─────────────────────────────────────────────────────────────────

export async function getHistory(waId: string): Promise<ChatMessage[]> {
  const raw = await withRedis(
    "history read",
    () => redisClient.get(`${HISTORY_PREFIX}${waId}`),
    null
  );
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatMessage).role === "user" ||
          (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string"
    );
  } catch {
    return [];
  }
}

/** Persist one exchange and refresh the sliding TTL. */
export async function appendTurn(
  waId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  const history = await getHistory(waId);
  const next: ChatMessage[] = [
    ...history,
    { role: "user" as const, content: userMessage },
    { role: "assistant" as const, content: assistantMessage },
  ].slice(-HISTORY_MAX_MESSAGES);

  await withRedis(
    "history write",
    () =>
      redisClient.setEx(
        `${HISTORY_PREFIX}${waId}`,
        HISTORY_TTL_SECONDS,
        JSON.stringify(next)
      ),
    null
  );
}

export async function clearHistory(waId: string): Promise<void> {
  await withRedis("history clear", () => redisClient.del(`${HISTORY_PREFIX}${waId}`), 0);
}

// ─── De-duplication ──────────────────────────────────────────────────────────

/**
 * True when this WhatsApp message id (wamid) has already been processed.
 * Uses SET NX so concurrent webhook retries can't both win.
 * Fails open (returns false) when Redis is down — a duplicate reply beats no reply.
 */
export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  const stored = await withRedis(
    "dedupe check",
    () =>
      redisClient.set(`${DEDUPE_PREFIX}${messageId}`, "1", {
        NX: true,
        EX: DEDUPE_TTL_SECONDS,
      }),
    "OK" // treat as "not seen before" so the user still gets an answer
  );
  return stored === null;
}

// ─── Rate limiting ───────────────────────────────────────────────────────────

/**
 * Per-WhatsApp-number limit. supportChatRateLimit is unusable here: it keys on
 * req.session / req.ip, and every webhook arrives from Tata's IPs with no session,
 * so all users would share a single bucket.
 * Returns true when the caller is over the limit. Fails open if Redis is down.
 */
export async function isRateLimited(waId: string): Promise<boolean> {
  const key = `${RATELIMIT_PREFIX}${waId}`;
  const count = await withRedis("rate limit incr", () => redisClient.incr(key), 0);
  if (count === 0) return false; // Redis unusable — fail open

  if (count === 1) {
    await withRedis(
      "rate limit expire",
      () => redisClient.expire(key, RATE_LIMIT_WINDOW_SECONDS),
      0
    );
  }
  return count > RATE_LIMIT_PER_WINDOW;
}

/** Copy shown when the limit is hit — kept in sync with server/supportRateLimit.ts. */
export const RATE_LIMITED_MESSAGE =
  "I've reached my message limit for now. You can continue our " +
  "conversation in about an hour, or contact our team directly " +
  "for immediate help." +
  "\nTAP_CONTACT_US";
