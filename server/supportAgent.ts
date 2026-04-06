/**
 * Bombino AI Support Agent — tool executors, dispatcher, and OpenAI orchestration (Phase 1).
 * All executors return safe strings; handleChat returns a final assistant message or fallback.
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";
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
  "I couldn't get rates for that request. Please check the weight and type (document or package), try the Rates page, or contact support.";
const FALLBACK_RATES_INVALID_PRODUCT =
  "I can only get rates for Document (DOC) or Package (PKG). Please specify which.";
const FALLBACK_RATES_INVALID_DESTINATION =
  "Rates are available for USA to India only. Use destination IN.";
const FALLBACK_RATES_INVALID_WEIGHT =
  "Please provide a valid weight in pounds (e.g. 2 or 5.5).";
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

function parseAmount(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  return parseFloat(String(val).replace(/[^0-9.]/g, "")) || 0;
}

export async function executeGetRates(
  args: GetRatesArgs,
  _context: SupportChatContext
): Promise<string> {
  try {
    const productCode = String(args.product_code ?? "").trim().toUpperCase();
    const destCode = String(args.destination_code ?? "").trim().toUpperCase();
    const weightStr = String(args.actual_weight ?? "").trim();

    if (productCode !== "DOC" && productCode !== "PKG") {
      return FALLBACK_RATES_INVALID_PRODUCT;
    }
    if (destCode !== "IN") {
      return FALLBACK_RATES_INVALID_DESTINATION;
    }

    const weight = parseFloat(weightStr);
    if (Number.isNaN(weight) || weight <= 0) {
      return FALLBACK_RATES_INVALID_WEIGHT;
    }

    const bookingDate =
      args.booking_date?.trim() ||
      new Date().toISOString().split("T")[0];
    const pcs = args.pcs?.trim() || "1";

    const params = {
      product_code: productCode,
      destination_code: "IN",
      booking_date: bookingDate,
      origin_code: "US",
      pcs,
      actual_weight: weight.toFixed(2),
    };

    const data = (await itdClient.getRates(params)) as Record<string, unknown>;
    const inner = (data?.data ?? data) as Record<string, unknown>;
    let total = parseAmount(
      (inner?.total_amount ?? data?.total_amount) as string | number
    );
    const base = parseAmount(
      (inner?.base_rate ?? data?.base_rate) as string | number
    );
    const fuel = parseAmount(
      (inner?.fuel_surcharge as string | number) ?? 0
    );
    const handling = parseAmount(
      (inner?.handling_charges as string | number) ?? 0
    );
    const tax = parseAmount((inner?.tax as string | number) ?? 0);

    if (total <= 0 && (base > 0 || fuel > 0 || handling > 0 || tax > 0)) {
      total = base + fuel + handling + tax;
    }

    const productLabel = productCode === "DOC" ? "Document" : "Package";
    if (total > 0) {
      const breakdown: string[] = [];
      if (base > 0) breakdown.push(`base $${base}`);
      if (fuel > 0) breakdown.push(`fuel $${fuel}`);
      if (handling > 0) breakdown.push(`handling $${handling}`);
      if (tax > 0) breakdown.push(`tax $${tax}`);
      const breakdownStr =
        breakdown.length > 0
          ? ` Breakdown: ${breakdown.join(", ")}.`
          : "";
      return `Rate for ${productLabel} to India: total $${total}.${breakdownStr} Weight: ${params.actual_weight} lb.`;
    }
    return FALLBACK_RATES;
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
    return escalation ?? FALLBACK_ESCALATION;
  } catch {
    return FALLBACK_ESCALATION;
  }
}

// ─── Tool dispatcher ─────────────────────────────────────────────────────────

export type ToolName =
  | "get_rates"
  | "get_tracking_summary"
  | "get_shipment_guidance"
  | "escalate_support";

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
          product_code: String(raw.product_code ?? ""),
          destination_code: String(raw.destination_code ?? ""),
          actual_weight: String(raw.actual_weight ?? ""),
          origin_code: raw.origin_code != null ? String(raw.origin_code) : undefined,
          booking_date: raw.booking_date != null ? String(raw.booking_date) : undefined,
          pcs: raw.pcs != null ? String(raw.pcs) : undefined,
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
- For rate questions: use get_rates when the user wants a quote. The tool returns live rates only for the corridor it supports; use the tool's parameters as described. If the user asks for a rate for a route or corridor that the tool does not support, do not invent pricing. Say that live quoting support is currently limited for that route and offer to connect them to support via escalate_support.
- For tracking questions: use get_tracking_summary with the user's AWB or tracking number.
- For how to ship, documents, or booking steps: use get_shipment_guidance with the appropriate topic.
- To send the user to human support: use escalate_support.
- Reply in a short, friendly, professional way. Do not expose internal system details, API names, or secrets.
- If the user's request is unclear or outside support (rates, tracking, shipping help, escalation), say so briefly and offer to help with what you can.`;

const SUPPORT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_rates",
      description:
        "Get a live shipping rate. Use for document or package rate queries. Returns rates only for the currently supported shipping corridor. Requires product_code (DOC or PKG), destination_code, and actual_weight in pounds. If the tool returns that the corridor is not supported, tell the user and offer escalate_support.",
      parameters: {
        type: "object",
        properties: {
          product_code: { type: "string", enum: ["DOC", "PKG"], description: "Document or Package" },
          destination_code: { type: "string", description: "Destination country code (e.g. IN). Tool enforces supported corridor." },
          actual_weight: { type: "string", description: "Weight in pounds, e.g. 2 or 5.5" },
          origin_code: { type: "string", description: "Optional; origin country code" },
          booking_date: { type: "string", description: "Optional; YYYY-MM-DD" },
          pcs: { type: "string", description: "Optional; number of pieces, default 1" },
        },
        required: ["product_code", "destination_code", "actual_weight"],
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

  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SUPPORT_SYSTEM_PROMPT },
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
