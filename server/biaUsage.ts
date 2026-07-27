/**
 * Per-channel usage accounting for BIA.
 *
 * The two channels are deliberately kept in separate key namespaces because they
 * are not comparable: the app channel is one HTTP request per turn with the full
 * history posted by the client, while WhatsApp is webhook-driven, always guest,
 * and bills on Tata's side per 24h conversation window rather than per message.
 * Mixing them into one counter would produce a number that means nothing.
 *
 * Every write degrades gracefully — usage accounting must never break a reply.
 * The structured log line is emitted first and unconditionally, so Railway logs
 * remain a complete record even when Redis is down.
 */

import nodeCrypto from "crypto";
import redisClient from "./redisClient.js";
import { withRedis } from "./redisSafe.js";
import type { BiaChannel, SupportChatContext } from "./supportTypes.js";

export type { BiaChannel };

const KEY_PREFIX = "bia:usage:";
/** Keep a rolling month-plus so month-end reporting always has full coverage. */
const RETENTION_SECONDS = 60 * 60 * 24 * 35;
/** Reporting timezone — the team reads these numbers in IST, not UTC. */
const REPORT_TIME_ZONE = "Asia/Kolkata";
const DEFAULT_REPORT_DAYS = 7;
const MAX_REPORT_DAYS = 35;

/**
 * gpt-4o-mini list price in USD per 1M tokens (input / output). Env-overridable
 * so a price change is a redeploy-free config edit, not a code change.
 */
const PRICE_INPUT_PER_M = Number(process.env.OPENAI_PRICE_INPUT_PER_M ?? 0.15);
const PRICE_OUTPUT_PER_M = Number(process.env.OPENAI_PRICE_OUTPUT_PER_M ?? 0.6);

// ─── Key helpers ─────────────────────────────────────────────────────────────

/** YYYY-MM-DD in the reporting timezone. `en-CA` yields ISO order natively. */
export function usageDateKey(at: Date = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: REPORT_TIME_ZONE });
}

function dayKey(channel: BiaChannel, date: string): string {
  return `${KEY_PREFIX}${channel}:${date}`;
}

function toolsKey(channel: BiaChannel, date: string): string {
  return `${KEY_PREFIX}${channel}:${date}:tools`;
}

function actorsKey(channel: BiaChannel, date: string): string {
  return `${KEY_PREFIX}${channel}:${date}:actors`;
}

/**
 * Phone numbers are personal data and these keys outlive a conversation by weeks,
 * so WhatsApp actors are stored as a truncated digest — enough to count uniques,
 * not enough to recover the number.
 */
export function hashActor(raw: string): string {
  return nodeCrypto.createHash("sha256").update(raw).digest("hex").slice(0, 12);
}

/**
 * Opaque actor id for unique-user counting.
 *
 * App guests all collapse into a single "guest" bucket — they have no stable id
 * of any kind server-side, so `uniqueActors` on the app channel counts logged-in
 * users plus at most one for all guest traffic. WhatsApp always has a wa_id, so
 * its unique count is exact and doubles as a proxy for Tata's per-conversation
 * billing.
 */
export function actorFor(context: SupportChatContext): string {
  if (context.channel === "whatsapp") {
    return context.waId ? `wa_${hashActor(context.waId)}` : "wa_unknown";
  }
  return context.dbUserId ?? "guest";
}

// ─── Recording ───────────────────────────────────────────────────────────────

export interface TurnUsage {
  channel: BiaChannel;
  /** Opaque per-user id: dbUserId or "guest" on the app, hashed wa_id on WhatsApp. */
  actor: string;
  promptTokens: number;
  completionTokens: number;
  /** OpenAI round-trips this turn — >1 whenever tools ran. */
  apiCalls: number;
  toolCalls: string[];
  latencyMs: number;
  /** False when the user got a fallback string instead of a real answer. */
  ok: boolean;
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const usd =
    (promptTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (completionTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  return Math.round(usd * 1e6) / 1e6;
}

/** One line per turn plus daily counters. Never throws. */
export async function recordTurn(usage: TurnUsage): Promise<void> {
  const date = usageDateKey();

  console.log(
    `[biaUsage] ${JSON.stringify({
      channel: usage.channel,
      date,
      actor: usage.actor,
      ok: usage.ok,
      apiCalls: usage.apiCalls,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      costUsd: estimateCostUsd(usage.promptTokens, usage.completionTokens),
      tools: usage.toolCalls,
      latencyMs: usage.latencyMs,
    })}`
  );

  const { channel } = usage;
  const day = dayKey(channel, date);
  const tools = toolsKey(channel, date);
  const actors = actorsKey(channel, date);

  await withRedis(
    "usage record",
    () => {
      const tx = redisClient
        .multi()
        .hIncrBy(day, "turns", 1)
        .hIncrBy(day, "api_calls", usage.apiCalls)
        .hIncrBy(day, "prompt_tokens", usage.promptTokens)
        .hIncrBy(day, "completion_tokens", usage.completionTokens)
        .hIncrBy(day, "latency_ms_total", Math.max(0, Math.round(usage.latencyMs)));

      if (!usage.ok) tx.hIncrBy(day, "failed_turns", 1);

      for (const tool of usage.toolCalls) {
        tx.hIncrBy(tools, tool, 1);
      }

      return tx
        .sAdd(actors, usage.actor)
        .expire(day, RETENTION_SECONDS)
        .expire(tools, RETENTION_SECONDS)
        .expire(actors, RETENTION_SECONDS)
        .exec();
    },
    null
  );
}

/**
 * WhatsApp-only counters with no app-channel equivalent: outbound parts are what
 * Tata actually sends (one reply can split into several), and duplicates /
 * rate-limited hits only exist because the webhook can retry and has no session.
 */
export type WhatsAppUsageEvent =
  | { kind: "parts_sent"; count: number }
  | { kind: "rate_limited" }
  | { kind: "duplicate" };

export async function recordWhatsAppEvent(event: WhatsAppUsageEvent): Promise<void> {
  const day = dayKey("whatsapp", usageDateKey());
  const field = event.kind;
  const by = event.kind === "parts_sent" ? event.count : 1;
  if (by <= 0) return;

  await withRedis(
    `usage ${field}`,
    () =>
      redisClient
        .multi()
        .hIncrBy(day, field, by)
        .expire(day, RETENTION_SECONDS)
        .exec(),
    null
  );
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export interface UsageDay {
  date: string;
  turns: number;
  failedTurns: number;
  apiCalls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  avgLatencyMs: number;
  uniqueActors: number;
  tools: Record<string, number>;
  /** Present on the WhatsApp channel only. */
  whatsapp?: {
    partsSent: number;
    rateLimited: number;
    duplicates: number;
  };
}

export interface UsageChannelReport {
  days: UsageDay[];
  totals: {
    turns: number;
    failedTurns: number;
    apiCalls: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  };
}

export interface UsageReport {
  timeZone: string;
  days: number;
  pricePerMillionUsd: { input: number; output: number };
  redisAvailable: boolean;
  channels: Record<BiaChannel, UsageChannelReport>;
}

function n(hash: Record<string, string>, field: string): number {
  const v = Number(hash[field]);
  return Number.isFinite(v) ? v : 0;
}

function toCounts(hash: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(hash)) {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) out[k] = parsed;
  }
  return out;
}

function recentDates(days: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    out.push(usageDateKey(new Date(now - i * 24 * 60 * 60 * 1000)));
  }
  return out;
}

async function readDay(channel: BiaChannel, date: string): Promise<UsageDay> {
  const [day, tools, uniqueActors] = await Promise.all([
    withRedis(
      "usage read day",
      () => redisClient.hGetAll(dayKey(channel, date)),
      {} as Record<string, string>
    ),
    withRedis(
      "usage read tools",
      () => redisClient.hGetAll(toolsKey(channel, date)),
      {} as Record<string, string>
    ),
    withRedis("usage read actors", () => redisClient.sCard(actorsKey(channel, date)), 0),
  ]);

  const turns = n(day, "turns");
  const promptTokens = n(day, "prompt_tokens");
  const completionTokens = n(day, "completion_tokens");

  const row: UsageDay = {
    date,
    turns,
    failedTurns: n(day, "failed_turns"),
    apiCalls: n(day, "api_calls"),
    promptTokens,
    completionTokens,
    costUsd: estimateCostUsd(promptTokens, completionTokens),
    avgLatencyMs: turns > 0 ? Math.round(n(day, "latency_ms_total") / turns) : 0,
    uniqueActors,
    tools: toCounts(tools),
  };

  if (channel === "whatsapp") {
    row.whatsapp = {
      partsSent: n(day, "parts_sent"),
      rateLimited: n(day, "rate_limited"),
      duplicates: n(day, "duplicate"),
    };
  }

  return row;
}

function sumDays(days: UsageDay[]): UsageChannelReport["totals"] {
  return days.reduce(
    (acc, d) => ({
      turns: acc.turns + d.turns,
      failedTurns: acc.failedTurns + d.failedTurns,
      apiCalls: acc.apiCalls + d.apiCalls,
      promptTokens: acc.promptTokens + d.promptTokens,
      completionTokens: acc.completionTokens + d.completionTokens,
      costUsd: Math.round((acc.costUsd + d.costUsd) * 1e6) / 1e6,
    }),
    {
      turns: 0,
      failedTurns: 0,
      apiCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    }
  );
}

/** Newest day first. Missing days read as zeros — absence of traffic, not an error. */
export async function getUsageReport(daysRaw = DEFAULT_REPORT_DAYS): Promise<UsageReport> {
  const days = Math.min(Math.max(Math.trunc(daysRaw) || DEFAULT_REPORT_DAYS, 1), MAX_REPORT_DAYS);
  const dates = recentDates(days);

  const [app, whatsapp] = await Promise.all([
    Promise.all(dates.map((d) => readDay("app", d))),
    Promise.all(dates.map((d) => readDay("whatsapp", d))),
  ]);

  return {
    timeZone: REPORT_TIME_ZONE,
    days,
    pricePerMillionUsd: { input: PRICE_INPUT_PER_M, output: PRICE_OUTPUT_PER_M },
    redisAvailable: redisClient.isReady,
    channels: {
      app: { days: app, totals: sumDays(app) },
      whatsapp: { days: whatsapp, totals: sumDays(whatsapp) },
    },
  };
}

// ─── Report access ───────────────────────────────────────────────────────────

/**
 * Constant-time check of the secret path segment on the usage endpoint.
 * Same pattern as the WhatsApp webhook: no admin role exists yet, so an
 * unguessable segment is the only gate available. Returns false when
 * BIA_USAGE_SECRET is unset, which keeps the endpoint closed by default.
 */
export function verifyUsageSecret(received: string | undefined): boolean {
  const expected = process.env.BIA_USAGE_SECRET;
  if (!expected || !received) return false;

  const receivedBuf = Buffer.from(received, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (receivedBuf.length !== expectedBuf.length) return false;
  return nodeCrypto.timingSafeEqual(receivedBuf, expectedBuf);
}

export function isUsageReportConfigured(): boolean {
  return !!process.env.BIA_USAGE_SECRET;
}
