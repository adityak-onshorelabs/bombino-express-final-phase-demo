/**
 * WhatsApp adapter for the Tata Tele Omni platform (BSP over Meta Cloud API).
 * Transport only: inbound webhook parsing, outbound sends, read receipts.
 * No BIA/agent logic lives here.
 *
 * Docs: https://help.omni.tatatelebusiness.com/pages/session-api
 *       https://help.omni.tatatelebusiness.com/pages/api-docs
 *
 * Payloads are Meta Cloud API shaped minus `messaging_product`, plus Tata's
 * `source` field. Inbound webhooks are flattened by Tata: a single
 * `{ contacts, messages, businessPhoneNumber, id }` object rather than Meta's
 * `entry[].changes[].value.messages[]` envelope.
 */

import crypto from "crypto";

const DEFAULT_BASE_URL = "https://wb.omni.tatatelebusiness.com";

/** Tag on every outbound message so Omni's reports can separate BIA traffic. */
const MESSAGE_SOURCE = "bombino-bia";

/** WhatsApp hard limits (enforced by Meta, passed through by Tata). */
export const WHATSAPP_TEXT_MAX_LENGTH = 4096;
export const WHATSAPP_BUTTON_MAX_COUNT = 3;
export const WHATSAPP_BUTTON_TITLE_MAX_LENGTH = 20;
export const WHATSAPP_BODY_MAX_LENGTH = 1024; // interactive messages have a shorter body

// ─── Config ──────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  /** Omni access token — Settings › Channels › WhatsApp. Sent as the raw Authorization header. */
  token: string;
  /** Our own shared secret; Tata does not sign webhooks, so the URL carries the proof. */
  webhookSecret: string;
  baseUrl: string;
}

/** Returns null when any required env var is missing; callers should 503 rather than crash. */
export function getWhatsAppConfig(): WhatsAppConfig | null {
  const token = process.env.TATA_WA_TOKEN;
  const webhookSecret = process.env.TATA_WA_WEBHOOK_SECRET;
  const baseUrl = (process.env.TATA_WA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

  if (!token || !webhookSecret) return null;
  return { token, webhookSecret, baseUrl };
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

// ─── Inbound ─────────────────────────────────────────────────────────────────

export interface InboundMessage {
  /** Sender's WhatsApp number in E.164 without "+" (Meta's wa_id, passed through by Tata). */
  waId: string;
  /** Meta message id (wamid...) — used for webhook-retry de-duplication and read receipts. */
  messageId: string;
  /** Unix seconds. */
  timestamp: string;
  /** Text body, or the id/payload of the tapped button / selected list row. */
  text: string;
  /** True when this came from an interactive reply rather than free text. */
  isInteractiveReply: boolean;
}

/**
 * Constant-time compare of the secret Tata echoes back in the webhook URL.
 * Tata sends no HMAC signature, so an unguessable path segment is the only
 * proof-of-origin available — treat it like a bearer token.
 */
export function verifyWebhookSecret(
  received: string | undefined,
  expected: string
): boolean {
  if (!received) return false;

  const receivedBuf = Buffer.from(received, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (receivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Extract user-authored messages from a Tata webhook payload.
 *
 * Omni fires three webhook types and may route them all to one URL, so this
 * must tolerate every shape: delivery callbacks (`statuses`) and
 * `account_settings_update` events carry no `messages` key and fall out as an
 * empty array. Unsupported message types (media, location, reactions) are
 * dropped the same way.
 *
 * Returns an array even though Tata delivers one message per call — keeps the
 * call site unchanged and tolerates a batched payload if Tata ever sends one.
 */
export function parseInboundMessages(body: unknown): InboundMessage[] {
  if (!body || typeof body !== "object") return [];

  const raw = (body as Record<string, unknown>).messages;
  const candidates = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const out: InboundMessage[] = [];
  for (const candidate of candidates) {
    const parsed = parseOneMessage(candidate);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseOneMessage(raw: unknown): InboundMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, any>;

  const waId = typeof m.from === "string" ? m.from : "";
  const messageId = typeof m.id === "string" ? m.id : "";
  if (!waId || !messageId) return null;

  const timestamp = typeof m.timestamp === "string" ? m.timestamp : "";
  let text = "";
  let isInteractiveReply = false;

  if (m.type === "text") {
    text = typeof m.text?.body === "string" ? m.text.body : "";
  } else if (m.type === "interactive") {
    const interactive = m.interactive ?? {};
    text =
      interactive.button_reply?.id ??
      interactive.button_reply?.title ??
      interactive.list_reply?.id ??
      interactive.list_reply?.title ??
      "";
    isInteractiveReply = true;
  } else if (m.type === "button") {
    // Template quick-reply buttons. Tata's payload is an internal routing id,
    // so the visible label is the only thing BIA can reason about.
    text = typeof m.button?.text === "string" ? m.button.text : "";
    isInteractiveReply = true;
  }

  if (typeof text !== "string" || text.trim() === "") return null;
  return { waId, messageId, timestamp, text: text.trim(), isInteractiveReply };
}

// ─── Outbound ────────────────────────────────────────────────────────────────

export interface ReplyButton {
  /** Echoed back as interactive.button_reply.id on the next inbound message. */
  id: string;
  title: string;
}

/** Tata requires the recipient in international format *with* the leading "+". */
function toRecipient(waId: string): string {
  const digits = waId.replace(/[^\d]/g, "");
  return `+${digits}`;
}

class WhatsAppClient {
  /**
   * A 2xx here means "Tata accepted the request", NOT "the user received it".
   * Sends are asynchronous: an unroutable number or a closed 24h session window
   * still returns 200 with a request id, and the real outcome arrives later on
   * the Callbacks webhook as status "failed". Returns that request id so the
   * caller can correlate the two.
   */
  private async request(
    path: string,
    payload: Record<string, unknown> | undefined
  ): Promise<string | null> {
    const config = getWhatsAppConfig();
    if (!config) {
      throw new Error("WhatsApp is not configured (missing env vars)");
    }

    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: config.token,
      },
      body: JSON.stringify(payload ?? {}),
    });

    const raw = await res.text().catch(() => "");

    if (!res.ok) {
      throw new Error(
        `WhatsApp send failed: ${res.status} ${res.statusText} ${raw.slice(0, 300)}`
      );
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      const id = (parsed as Record<string, unknown> | null)?.id;
      return typeof id === "string" ? id : null;
    } catch {
      return null;
    }
  }

  private async send(payload: Record<string, unknown>): Promise<string | null> {
    return this.request("/whatsapp-cloud/messages", {
      source: MESSAGE_SOURCE,
      ...payload,
    });
  }

  async sendText(waId: string, body: string): Promise<string | null> {
    return this.send({
      to: toRecipient(waId),
      type: "text",
      text: { preview_url: true, body: body.slice(0, WHATSAPP_TEXT_MAX_LENGTH) },
    });
  }

  async sendButtons(
    waId: string,
    body: string,
    buttons: ReplyButton[]
  ): Promise<string | null> {
    const trimmed = buttons.slice(0, WHATSAPP_BUTTON_MAX_COUNT).map((b) => ({
      type: "reply" as const,
      reply: {
        id: b.id,
        title: b.title.slice(0, WHATSAPP_BUTTON_TITLE_MAX_LENGTH),
      },
    }));

    return this.send({
      to: toRecipient(waId),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, WHATSAPP_BODY_MAX_LENGTH) },
        action: { buttons: trimmed },
      },
    });
  }

  /**
   * Interactive message with a single URL button (interactive.type "cta_url").
   * Reply buttons cannot carry links, so this is the way to deep-link into the app.
   */
  async sendCtaUrl(
    waId: string,
    body: string,
    buttonLabel: string,
    url: string
  ): Promise<string | null> {
    return this.send({
      to: toRecipient(waId),
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body.slice(0, WHATSAPP_BODY_MAX_LENGTH) },
        action: {
          name: "cta_url",
          parameters: {
            display_text: buttonLabel.slice(0, WHATSAPP_BUTTON_TITLE_MAX_LENGTH),
            url,
          },
        },
      },
    });
  }

  /**
   * Blue ticks plus a typing indicator on the user's message — the indicator
   * covers the seconds BIA spends in its tool loop. Best-effort; failures are non-fatal.
   */
  async markAsRead(messageId: string): Promise<string | null> {
    return this.request(
      `/whatsapp-cloud/messages/${encodeURIComponent(messageId)}`,
      { typing_indicator: { type: "text" } }
    );
  }
}

export const whatsappClient = new WhatsAppClient();
