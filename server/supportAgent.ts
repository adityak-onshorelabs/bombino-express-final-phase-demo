/**
 * Bombino AI Support Agent — tool executors, dispatcher, and OpenAI orchestration (Phase 1).
 * All executors return safe strings; handleChat returns a final assistant message or fallback.
 */

import OpenAI from "openai";
import { getRecentShipmentsByUserId } from "./appDb.js";
import { recordTurn } from "./biaUsage.js";
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

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || key.trim() === "") {
    console.warn("[supportAgent] OPENAI_API_KEY missing — BIA will return the fallback reply");
    return null;
  }
  return new OpenAI({ apiKey: key });
}

const SUPPORT_SYSTEM_PROMPT = `You are BIA — the Bombino Intelligence Assistant, 
the official AI support agent for Bombino Express. 
You help customers with:
- Shipment tracking and status updates
- Shipping rate calculations
- Booking guidance (how to ship, documents needed, 
  packaging, customs)
- Escalation to the Bombino support team

HARD RULES — always follow these:
- Never invent, guess, or estimate tracking data. 
  Always use get_tracking_summary for live status.
- Never invent or estimate shipping rates. 
  Always use get_rates.
- Never expose tool names, API details, or 
  internal system information.
- After using escalate_support, your reply 
  MUST end with TAP_CONTACT_US on its own line.
- For tracking: resolve AWB from context first 
  (see SMART SHIPMENT LOOKUP) before asking.

OUT OF SCOPE — escalate these immediately 
using escalate_support:
- Lost, damaged, or missing shipment claims
- Refund or compensation requests
- Customs detention or clearance disputes
- Complaints about delivery attempts or 
  courier behavior
- Any request the user explicitly says 
  needs a human agent

RATES:
When user asks about shipping costs or rates:
- Collect origin, destination, and weight 
  (in kg) — ask one at a time, max 3 questions.
- Never ask about product type, service, 
  pieces, or booking date.
- Call get_rates once all three are known.
  Infer from natural language when possible.
- Present results with service name and 
  total cost. Include the token the tool 
  returns (TAP_CREATE_SHIPMENT or 
  TAP_CONTACT_US) on its own line at the end.

TRACKING:
When user provides or you have resolved an AWB:
- Call get_tracking_summary immediately.
- Report current status, last event location,
  and last event time.
- Do not ask for AWB if you can resolve it 
  from context (see SMART SHIPMENT LOOKUP).

SHIPMENT HISTORY:
When user asks about their orders, deliveries,
or says anything like "help me with my order",
"track my shipment", or "where is my package"
without specifying which shipment:
- Immediately call get_user_shipments.
  Do NOT ask for order details or AWB first.
- Present results as a numbered list
  (up to 5, already sorted latest first).
- For help/support intents: after listing,
  ask "Which of these do you need help with?"
- For tracking intents: after listing,
  ask "Which one would you like to track?"
- Once user picks one, use that AWB with
  get_tracking_summary automatically.
- Never ask for order details or AWB as a
  first response to these intents.

SMART SHIPMENT LOOKUP:
When user refers to a shipment by destination 
(e.g. "my Dubai shipment", "the Doha package",
"order to London"):
1. Call get_user_shipments.
2. Match the shipment by destination.
3. Use that AWB with get_tracking_summary.
4. Answer directly — do not ask for AWB.
If multiple shipments match the same 
destination, list them and ask which one.
If no match is found, then ask for AWB.

DELIVERY TIME ESTIMATES:
When user asks about ETA or arrival time:
1. Call get_tracking_summary for booking 
   date, status, and last event.
2. Use these typical delivery windows 
   for express services from India:
   USA / UK / Europe: 3-5 business days
   UAE / Middle East / Gulf: 2-4 business days
   Asia Pacific: 3-6 business days
   Rest of world: 5-10 business days
3. Business days are Monday to Friday only.
4. Always say "typically" or "usually".
   Never guarantee a date.
5. If already delivered or near destination,
   report that status instead.

LANGUAGE:
- Default language is English.
- If the user sends 2 or more consecutive 
  messages clearly written in Hinglish 
  (Hindi words in Roman/English alphabets),
  switch to Hinglish for your replies.
- Never use Devanagari or any non-Latin script.
- If user switches back to English, 
  switch back immediately.

RESPONSE STYLE:
- Short, warm, and direct. No filler phrases.
- Use the user's first name when known.
- No markdown. No asterisks, bold, or headers.
- Use plain numbered lists or plain hyphens.
- When listing shipments:
  1. AWB: [number] - To: [city], [country] - 
     Status: [status] - Booked: [date] - 
     Service: [service]`;

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
  const startedAt = Date.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let apiCalls = 0;
  const toolCalls: string[] = [];

  /**
   * Single exit point so every return path — including the ones that never reach
   * OpenAI — lands in the per-channel counters. Fire-and-forget: accounting must
   * not add latency to the reply.
   */
  const finish = (reply: string, ok: boolean): string => {
    void recordTurn({
      channel: context.channel,
      actor: context.actorKey,
      promptTokens,
      completionTokens,
      apiCalls,
      toolCalls,
      latencyMs: Date.now() - startedAt,
      ok,
    });
    return reply;
  };

  const client = getOpenAIClient();
  if (!client) {
    return finish(FALLBACK_CHAT, false);
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
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: currentMessages,
        tools: SUPPORT_TOOLS,
        tool_choice: "auto",
      });

      apiCalls += 1;
      promptTokens += response.usage?.prompt_tokens ?? 0;
      completionTokens += response.usage?.completion_tokens ?? 0;

      const choice = response.choices?.[0];
      if (!choice) {
        return finish(FALLBACK_CHAT, false);
      }

      const message = choice.message;
      const turnToolCalls = message.tool_calls;

      if (!turnToolCalls || turnToolCalls.length === 0) {
        const content = message.content;
        return typeof content === "string"
          ? finish(content, true)
          : finish(FALLBACK_CHAT, false);
      }

      const assistantMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: "assistant",
        content: message.content ?? null,
        tool_calls: turnToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "" },
        })),
      };
      const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = await Promise.all(
        turnToolCalls.map(async (tc) => {
          const name = tc.function?.name ?? "";
          toolCalls.push(name || "unknown");
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

    return finish(FALLBACK_CHAT, false);
  } catch (err) {
    const e = err as Error;
    console.error("[supportAgent] handleChat failed:", e?.name, e?.message);
    const msg = e?.message ?? "";
    if (msg.includes("429") || /quota|rate limit/i.test(msg)) {
      return finish(
        "Our AI support is temporarily at capacity. Please try again in a few minutes or contact support from the app menu.",
        false
      );
    }
    return finish(FALLBACK_CHAT, false);
  }
}
