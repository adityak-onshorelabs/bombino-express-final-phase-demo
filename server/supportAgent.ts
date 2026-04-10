/**
 * Bombino AI Support Agent — tool executors, dispatcher, and OpenAI orchestration (Phase 1).
 * All executors return safe strings; handleChat returns a final assistant message or fallback.
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { getRecentShipmentsByUserId } from "./appDb.js";
import { itdClient } from "./itd";
import type { ITDTrackingResult } from "./itd";
import { guidance, escalation } from "./supportContent";
import type { GuidanceKey } from "./supportContent";
import type {
  SupportChatContext,
  TrackingSummary,
  TrackingSummaryLastEvent,
} from "./supportTypes";
import {
  SUPPORT_TRACKING_NO_MAX_LENGTH,
  type ChatMessage,
  type GetRatesArgs,
  type GetTrackingSummaryArgs,
} from "./supportTypes";

// ─── Fallback strings (never expose internal errors) ───────────────────────────

const FALLBACK_RATES =
  "I couldn't get rates for that route right now. Please try the Rates page in the app or contact support.";
const FALLBACK_RATES_NO_DESTINATION =
  "Please tell me which country you're shipping to so I can quote a rate.";
const FALLBACK_RATES_INVALID_WEIGHT =
  "Please provide a valid parcel weight in kilograms (e.g. 2 or 2.5).";
const FALLBACK_TRACKING =
  "I couldn't find tracking for that number. Please check the AWB or contact support.";
const FALLBACK_TRACKING_NO_INPUT = "Please provide an AWB or tracking number.";
const FALLBACK_TRACKING_TOO_LONG =
  "Tracking number is too long; please check and try again.";
const FALLBACK_GUIDANCE =
  "I can help with rates, tracking, how to ship, and support. What do you need?";
const FALLBACK_ESCALATION =
  "Please use the app menu to reach support (WhatsApp or Call).";
const FALLBACK_DISPATCHER =
  "Something went wrong. Please try again or contact support from the app menu.";
const FALLBACK_CHAT =
  "I'm having trouble responding right now. Please try again in a moment or use the app menu to contact support.";
const SUPPORT_CHAT_MAX_TOOL_ITERATIONS = 5;

// ─── Tracking normalizer ─────────────────────────────────────────────────────

function getDocketInfoValue(info: [string, string][], key: string): string {
  const entry = info.find(([k]) =>
    k.toLowerCase().includes(key.toLowerCase())
  );
  return entry ? entry[1] : "";
}

function normalizeTrackingResult(
  result: ITDTrackingResult
): TrackingSummary {
  const info = result.docket_info ?? [];
  const events = result.docket_events ?? [];
  const status = getDocketInfoValue(info, "Status") || "Unknown";
  const origin = getDocketInfoValue(info, "Origin") || "—";
  const destination = getDocketInfoValue(info, "Destination") || "—";
  const bookingDate = getDocketInfoValue(info, "Booking Date") || "—";

  let lastEvent: TrackingSummaryLastEvent | null = null;
  if (events.length > 0) {
    const latest = events.reduce((a, b) => {
      const atA = a.event_at ? new Date(a.event_at).getTime() : 0;
      const atB = b.event_at ? new Date(b.event_at).getTime() : 0;
      return atB > atA ? b : a;
    });
    lastEvent = {
      description: latest.event_description || "—",
      location: latest.event_location || "—",
      at: latest.event_at || "—",
    };
  }

  return {
    status,
    tracking_no: result.tracking_no || "—",
    origin,
    destination,
    booking_date: bookingDate,
    last_event: lastEvent,
    events_count: events.length,
    chargeable_weight: result.chargeable_weight || "—",
  };
}

function formatTrackingSummary(summary: TrackingSummary): string {
  const parts: string[] = [
    `Tracking ${summary.tracking_no}: Status — ${summary.status}.`,
    `Origin — ${summary.origin}, Destination — ${summary.destination}.`,
    `Booking date: ${summary.booking_date}.`,
    `Chargeable weight: ${summary.chargeable_weight} kg.`,
  ];
  if (summary.last_event) {
    parts.push(
      `Last update: ${summary.last_event.at} — ${summary.last_event.description} at ${summary.last_event.location}.`
    );
  } else {
    parts.push("Last update: No events yet.");
  }
  parts.push(`(${summary.events_count} events on record.)`);
  return parts.join(" ");
}

export function normalizeTrackingToSummaryString(
  results: ITDTrackingResult[]
): string {
  if (!results || results.length === 0) return FALLBACK_TRACKING;
  const first = results[0];
  if (first.errors) return FALLBACK_TRACKING;
  const summary = normalizeTrackingResult(first);
  return formatTrackingSummary(summary);
}

// ─── Tool executors ──────────────────────────────────────────────────────────

const BOOKABLE_ORIGIN = "IN";
const BOOKABLE_DESTINATION = "US";

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0;
}

/** Normalize country names/codes to ITD-style 2-letter codes (aligned with BIA rates flow). */
function normalizeCountryToCode(input: string): string {
  const raw = input.trim();
  if (!raw) return "IN";
  const s = raw.toLowerCase().replace(/\s+/g, " ");
  const ALIAS: Record<string, string> = {
    india: "IN",
    usa: "US",
    america: "US",
    "united states": "US",
    states: "US",
    us: "US",
    uk: "GB",
    "united kingdom": "GB",
    england: "GB",
    britain: "GB",
    uae: "AE",
    dubai: "AE",
    emirates: "AE",
    canada: "CA",
    australia: "AU",
    singapore: "SG",
    germany: "DE",
    france: "FR",
  };
  if (ALIAS[s]) return ALIAS[s];
  if (s.length === 2) return s.toUpperCase();
  return raw.toUpperCase();
}

function normalizeRateRow(
  raw: unknown
): { id: string; code: string; total: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = r.id != null ? String(r.id) : "";
  const code =
    typeof r.code === "string"
      ? r.code
      : typeof r.internal_api_service_code === "string"
        ? r.internal_api_service_code
        : "";
  if (!id && !code) return null;
  return {
    id: id || code,
    code: code || id,
    total: num(r.total),
  };
}

function parseWeightKg(raw: string): number {
  const s = raw.trim().toLowerCase();
  if (!s) return Number.NaN;
  if (/\b(half|0\.5)\b/.test(s) || s === "half") return 0.5;
  const lbMatch = s.match(/^([\d.]+)\s*(lb|lbs|pound|pounds)\b/);
  if (lbMatch) {
    const lb = parseFloat(lbMatch[1]);
    if (!Number.isNaN(lb) && lb > 0) return lb * 0.45359237;
  }
  const numPart = parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isNaN(numPart) ? Number.NaN : numPart;
}

export async function executeGetRates(
  args: GetRatesArgs,
  _context: SupportChatContext
): Promise<string> {
  try {
    const destRaw = String(args.destination_country ?? "").trim();
    if (!destRaw) {
      return FALLBACK_RATES_NO_DESTINATION;
    }

    const kg = parseWeightKg(String(args.weight_kg ?? ""));
    if (Number.isNaN(kg) || kg <= 0) {
      return FALLBACK_RATES_INVALID_WEIGHT;
    }

    const originCode = normalizeCountryToCode(
      String(args.origin_country ?? "").trim() || "IN"
    );
    const destinationCode = normalizeCountryToCode(destRaw);

    const bookingDate = new Date().toISOString().split("T")[0];
    const params = {
      product_code: "SPX",
      destination_code: destinationCode,
      booking_date: bookingDate,
      origin_code: originCode,
      pcs: "1",
      actual_weight: kg.toFixed(2),
    };

    const data = (await itdClient.getRates(params)) as Record<string, unknown>;
    const rawList: unknown[] = Array.isArray(data?.data)
      ? (data.data as unknown[])
      : [];

    const rows: { id: string; code: string; total: number }[] = [];
    for (const item of rawList) {
      const row = normalizeRateRow(item);
      if (row && row.total > 0) rows.push(row);
    }

    if (rows.length === 0) {
      return FALLBACK_RATES;
    }

    rows.sort((a, b) => a.total - b.total);

    const lines = rows.map((r, i) => {
      const label = i === 0 ? `${r.code} (Best Value)` : r.code;
      return `• ${label}: ${formatInr(r.total)}`;
    });

    const cta =
      originCode === BOOKABLE_ORIGIN && destinationCode === BOOKABLE_DESTINATION
        ? "\nTAP_CREATE_SHIPMENT"
        : "\nTAP_CONTACT_US";

    return `${lines.join("\n")}${cta}`;
  } catch {
    return FALLBACK_RATES;
  }
}

export async function executeGetTrackingSummary(
  args: GetTrackingSummaryArgs,
  context: SupportChatContext
): Promise<string> {
  try {
    const trackingNo = String(args.tracking_no ?? "").trim();
    if (!trackingNo) return FALLBACK_TRACKING_NO_INPUT;
    if (trackingNo.length > SUPPORT_TRACKING_NO_MAX_LENGTH) {
      return FALLBACK_TRACKING_TOO_LONG;
    }

    const results = await itdClient.trackShipment(
      trackingNo,
      context.itdToken ?? undefined
    );
    return normalizeTrackingToSummaryString(results);
  } catch {
    return FALLBACK_TRACKING;
  }
}

const TOPIC_MAP: Record<string, GuidanceKey> = {
  howtogetrates: "howToGetRates",
  howtogetrate: "howToGetRates",
  rates: "howToGetRates",
  howtotrack: "howToTrack",
  track: "howToTrack",
  tracking: "howToTrack",
  howtoship: "howToShip",
  ship: "howToShip",
  create: "howToShip",
  shipment: "howToShip",
  requireddocuments: "requiredDocuments",
  documents: "requiredDocuments",
  bookingsteps: "bookingSteps",
  steps: "bookingSteps",
  booking: "bookingSteps",
  general: "general",
};

export function executeGetShipmentGuidance(
  args: { topic?: string },
  _context: SupportChatContext
): string {
  try {
    const raw = String(args?.topic ?? "").trim().toLowerCase().replace(/\s+/g, "");
    const key = raw ? TOPIC_MAP[raw] : undefined;
    const guidanceKey = key && key in guidance ? key : "general";
    return guidance[guidanceKey as GuidanceKey] ?? FALLBACK_GUIDANCE;
  } catch {
    return FALLBACK_GUIDANCE;
  }
}

export function executeEscalateSupport(
  _args: { reason?: string },
  _context: SupportChatContext
): string {
  try {
    return `${escalation ?? FALLBACK_ESCALATION}\nTAP_CONTACT_US`;
  } catch {
    return `${FALLBACK_ESCALATION}\nTAP_CONTACT_US`;
  }
}

export async function executeGetUserShipments(
  context: SupportChatContext
): Promise<string> {
  try {
    if (!context.dbUserId) {
      return "You need to be logged in to view your shipments. Please log in to the app and try again.";
    }
    const text = await getRecentShipmentsByUserId(context.dbUserId);
    if (text === null) {
      return "I couldn't load your shipments right now. Please try again in a moment or check the Orders section in the app.";
    }
    return text;
  } catch {
    return "I couldn't load your shipments right now. Please try again in a moment.";
  }
}

// ─── Tool dispatcher ─────────────────────────────────────────────────────────

export type ToolName =
  | "get_rates"
  | "get_tracking_summary"
  | "get_shipment_guidance"
  | "escalate_support"
  | "get_user_shipments";

export async function dispatchTool(
  toolName: string,
  args: unknown,
  context: SupportChatContext
): Promise<string> {
  try {
    const raw = args && typeof args === "object" ? (args as Record<string, unknown>) : {};

    switch (toolName) {
      case "get_rates": {
        const a: GetRatesArgs = {
          origin_country:
            raw.origin_country != null ? String(raw.origin_country) : undefined,
          destination_country: String(raw.destination_country ?? ""),
          weight_kg: String(raw.weight_kg ?? ""),
        };
        return executeGetRates(a, context);
      }
      case "get_tracking_summary": {
        const a: GetTrackingSummaryArgs = {
          tracking_no: String(raw.tracking_no ?? ""),
        };
        return executeGetTrackingSummary(a, context);
      }
      case "get_shipment_guidance": {
        const a = {
          topic: raw.topic != null ? String(raw.topic) : undefined,
        };
        return executeGetShipmentGuidance(a, context);
      }
      case "escalate_support": {
        const a = {
          reason: raw.reason != null ? String(raw.reason) : undefined,
        };
        return executeEscalateSupport(a, context);
      }
      case "get_user_shipments":
        return executeGetUserShipments(context);
      default:
        return FALLBACK_DISPATCHER;
    }
  } catch {
    return FALLBACK_DISPATCHER;
  }
}

// ─── OpenAI orchestration ────────────────────────────────────────────────────

// #region agent log
const DEBUG_LOG = path.join(process.cwd(), ".cursor", "debug-643d35.log");
function debugLog(payload: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true });
    fs.appendFileSync(DEBUG_LOG, JSON.stringify(payload) + "\n");
  } catch (_) {}
}
// #endregion

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || key.trim() === "") {
    // #region agent log
    debugLog({
      sessionId: "643d35",
      runId: "request",
      hypothesisId: "H4_no_client",
      location: "supportAgent.ts:getOpenAIClient",
      message: "fallback path: no client created",
      data: { keyFalsy: !key, keyType: typeof key, keyTrimEmpty: typeof key === "string" ? key.trim() === "" : "n/a" },
      timestamp: Date.now(),
    });
    fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" },
      body: JSON.stringify({
        sessionId: "643d35",
        runId: "request",
        hypothesisId: "H4_no_client",
        location: "supportAgent.ts:getOpenAIClient",
        message: "fallback path: no client created",
        data: { keyFalsy: !key, keyType: typeof key, keyTrimEmpty: typeof key === "string" ? key.trim() === "" : "n/a" },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return null;
  }
  // #region agent log
  debugLog({
    sessionId: "643d35",
    runId: "request",
    hypothesisId: "H4_client_created",
    location: "supportAgent.ts:getOpenAIClient",
    message: "OpenAI client created",
    data: {},
    timestamp: Date.now(),
  });
  fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" },
    body: JSON.stringify({
      sessionId: "643d35",
      runId: "request",
      hypothesisId: "H4_client_created",
      location: "supportAgent.ts:getOpenAIClient",
      message: "OpenAI client created",
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return new OpenAI({ apiKey: key });
}

const SUPPORT_SYSTEM_PROMPT = `You are the Bombino Express support assistant. You help users with:
- Shipment tracking
- Rate queries
- Shipping guidance (how to ship, documents, booking steps)
- Escalation to human support when needed

Rules:
- You MUST use the provided tools for rates and tracking. Never invent or guess rates or tracking status.
- For tracking questions: use get_tracking_summary with the user's AWB or tracking number.
- For how to ship, documents, or booking steps: use get_shipment_guidance with the appropriate topic.
- To send the user to human support: use escalate_support.
- After using escalate_support tool, your final reply to the user MUST end with TAP_CONTACT_US on its own line.
- If the user's request is unclear or outside support (rates, tracking, shipping help, escalation), say so briefly and offer to help with what you can.

RATES REQUESTS:
When user asks about rates or shipping costs:
- Ask ONLY these questions, at most one at a time (maximum 3 total): (1) Where are you shipping from? (2) Where are you shipping to? (3) How heavy is your parcel in kg?
- Never ask about product type, service type, pieces count, or booking date.
- Use get_rates only once you know origin, destination, and weight in kg (infer from natural language when possible).
- Accept natural language for countries and weights — the tool normalizes them.
- After the tool returns, present each service with its total in INR only (the tool lists them). The tool output ends with TAP_CREATE_SHIPMENT (India to US) or TAP_CONTACT_US (other corridors) — include that exact token on its own line in your reply so the app can show the right action later.

SHIPMENT HISTORY:
When user asks about their orders, packages, or deliveries without an AWB number, use get_user_shipments first, then offer to track specific AWBs with get_tracking_summary.

RESPONSE STYLE:
- Keep responses short and friendly.
- Use the user's first name when known (from CURRENT USER CONTEXT).
- Do not expose internal system details, API names, or secrets.`;

function buildSystemPrompt(context: SupportChatContext): string {
  const personalization = context.user
    ? `

CURRENT USER CONTEXT:

Name: ${context.user.fullName}

Email: ${context.user.email}

Customer Code: ${context.user.code}

Address the user by their first name.

You already know who they are.

Do not ask for their name or email.`
    : `

GUEST USER:

The user is not logged in.

For shipment history or personalized help,

encourage them to log in to the app.`;

  return SUPPORT_SYSTEM_PROMPT + personalization;
}

const SUPPORT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_rates",
      description:
        "Get shipping rates. Call this when user asks about rates or shipping costs. Ask the user: where shipping FROM, where shipping TO, and weight in kg. Nothing else.",
      parameters: {
        type: "object",
        properties: {
          origin_country: {
            type: "string",
            description: "Origin country name or code; default India",
          },
          destination_country: {
            type: "string",
            description: "Destination country name or code",
          },
          weight_kg: {
            type: "string",
            description: "Weight in kg as a number",
          },
        },
        required: ["destination_country", "weight_kg"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tracking_summary",
      description: "Get tracking summary for an AWB or tracking number. Use when the user asks about status of a shipment.",
      parameters: {
        type: "object",
        properties: {
          tracking_no: { type: "string", description: "AWB or tracking number" },
        },
        required: ["tracking_no"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shipment_guidance",
      description:
        "Get pre-written guidance on how to get rates, track, ship, required documents, or booking steps. Use for how-to questions.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Topic: e.g. rates, tracking, how to ship, documents, booking steps, or general",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_support",
      description: "Direct the user to human support (WhatsApp or phone). Use when they ask to talk to someone or need help beyond what you can provide.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Optional reason for escalation" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_shipments",
      description:
        "Fetch the user's recent shipments. Use when user asks about their orders, deliveries, or shipment status without providing a specific AWB number.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export async function handleChat(
  messages: ChatMessage[],
  context: SupportChatContext
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    // #region agent log
    debugLog({
      sessionId: "643d35",
      runId: "request",
      hypothesisId: "H5_fallback_branch",
      location: "supportAgent.ts:handleChat",
      message: "fallback: no client",
      data: { branch: "no_client" },
      timestamp: Date.now(),
    });
    fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: no client", data: { branch: "no_client" }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return FALLBACK_CHAT;
  }

  const systemPrompt = buildSystemPrompt(context);
  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) =>
      m.role === "user"
        ? { role: "user" as const, content: m.content }
        : { role: "assistant" as const, content: m.content }
    ),
  ];

  let iteration = 0;
  let currentMessages = openaiMessages;

  try {
    while (iteration < SUPPORT_CHAT_MAX_TOOL_ITERATIONS) {
      iteration += 1;
      // #region agent log
      debugLog({ sessionId: "643d35", runId: "request", hypothesisId: "H6_openai_call", location: "supportAgent.ts:handleChat", message: "OpenAI API call start", data: { iteration }, timestamp: Date.now() });
      fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H6_openai_call", location: "supportAgent.ts:handleChat", message: "OpenAI API call start", data: { iteration }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: currentMessages,
        tools: SUPPORT_TOOLS,
        tool_choice: "auto",
      });

      const choice = response.choices?.[0];
      if (!choice) {
        // #region agent log
        debugLog({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: no choices", data: { branch: "no_choice", choicesLength: response.choices?.length ?? 0 }, timestamp: Date.now() });
        fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: no choices", data: { branch: "no_choice", choicesLength: response.choices?.length ?? 0 }, timestamp: Date.now() }) }).catch(() => {});
        // #endregion
        return FALLBACK_CHAT;
      }

      const message = choice.message;
      const toolCalls = message.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        const content = message.content;
        const isString = typeof content === "string";
        if (!isString) {
          // #region agent log
          debugLog({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: final content not string", data: { branch: "content_not_string", contentType: typeof content }, timestamp: Date.now() });
          fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: final content not string", data: { branch: "content_not_string", contentType: typeof content }, timestamp: Date.now() }) }).catch(() => {});
          // #endregion
        }
        return typeof content === "string" ? content : FALLBACK_CHAT;
      }
      // #region agent log
      debugLog({ sessionId: "643d35", runId: "request", hypothesisId: "H6_tool_loop", location: "supportAgent.ts:handleChat", message: "tool calls returned", data: { iteration, toolCallsCount: toolCalls.length }, timestamp: Date.now() });
      fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H6_tool_loop", location: "supportAgent.ts:handleChat", message: "tool calls returned", data: { iteration, toolCallsCount: toolCalls.length }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion

      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
        })),
      };
      const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = await Promise.all(
        toolCalls.map(async (tc) => {
          const name = tc.function?.name ?? "";
          const argsStr = tc.function?.arguments ?? "{}";
          let args: unknown = {};
          try {
            args = JSON.parse(argsStr);
          } catch {
            args = {};
          }
          const result = await dispatchTool(name, args, context);
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: result,
          };
        })
      );
      currentMessages = [...currentMessages, assistantMsg, ...toolResults];
    }

    // #region agent log
    debugLog({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: loop exhausted", data: { branch: "loop_exhausted", iteration }, timestamp: Date.now() });
    fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H5_fallback_branch", location: "supportAgent.ts:handleChat", message: "fallback: loop exhausted", data: { branch: "loop_exhausted", iteration }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    return FALLBACK_CHAT;
  } catch (err) {
    // #region agent log
    const e = err as Error;
    debugLog({
      sessionId: "643d35",
      runId: "request",
      hypothesisId: "H5_openai_throw",
      location: "supportAgent.ts:handleChat",
      message: "fallback: catch",
      data: { branch: "catch", errName: e?.name, errMessage: e?.message?.slice(0, 200) ?? String(e).slice(0, 200) },
      timestamp: Date.now(),
    });
    fetch("http://127.0.0.1:7701/ingest/99554fe6-af8f-4c6f-9a0a-628d3111f8a2", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "643d35" }, body: JSON.stringify({ sessionId: "643d35", runId: "request", hypothesisId: "H5_openai_throw", location: "supportAgent.ts:handleChat", message: "fallback: catch", data: { branch: "catch", errName: e?.name, errMessage: e?.message?.slice(0, 200) ?? String(e).slice(0, 200) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
    const msg = e?.message ?? "";
    if (msg.includes("429") || /quota|rate limit/i.test(msg)) {
      return "Our AI support is temporarily at capacity. Please try again in a few minutes or contact support from the app menu.";
    }
    return FALLBACK_CHAT;
  }
}
