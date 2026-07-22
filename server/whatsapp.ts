/**
 * WhatsApp Cloud API adapter (Meta Graph API, direct — no BSP).
 * Transport only: signature verification, inbound webhook parsing, and outbound sends.
 * No BIA/agent logic lives here.
 */

import crypto from "crypto";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Cloud API hard limits. */
export const WHATSAPP_TEXT_MAX_LENGTH = 4096;
export const WHATSAPP_BUTTON_MAX_COUNT = 3;
export const WHATSAPP_BUTTON_TITLE_MAX_LENGTH = 20;
export const WHATSAPP_BODY_MAX_LENGTH = 1024; // interactive messages have a shorter body

// ─── Config ──────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  verifyToken: string;
  appSecret: string;
  token: string;
  phoneNumberId: string;
}

/** Returns null when any required env var is missing; callers should 503 rather than crash. */
export function getWhatsAppConfig(): WhatsAppConfig | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!verifyToken || !appSecret || !token || !phoneNumberId) return null;
  return { verifyToken, appSecret, token, phoneNumberId };
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

// ─── Inbound ─────────────────────────────────────────────────────────────────

export interface InboundMessage {
  /** Sender's WhatsApp number in E.164 without "+" (Meta's wa_id). */
  waId: string;
  /** Meta message id (wamid...) — used for webhook-retry de-duplication. */
  messageId: string;
  /** Unix seconds, as sent by Meta. */
  timestamp: string;
  /** Text body, or the id of the tapped button / selected list row. */
  text: string;
  /** True when this came from an interactive reply rather than free text. */
  isInteractiveReply: boolean;
}

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body.
 * The raw buffer is captured by the express.json({ verify }) hook in server/index.ts.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(received, "utf8");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Extract user-authored messages from a webhook payload.
 * Delivery/read receipts (value.statuses) and unsupported message types are dropped.
 */
export function parseInboundMessages(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  if (!body || typeof body !== "object") return out;

  const entries = (body as Record<string, unknown>).entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as Record<string, unknown>)?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as Record<string, unknown>)?.value as
        | Record<string, unknown>
        | undefined;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;

      for (const raw of messages) {
        const m = raw as Record<string, any>;
        const waId = typeof m.from === "string" ? m.from : "";
        const messageId = typeof m.id === "string" ? m.id : "";
        if (!waId || !messageId) continue;

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
          // Template quick-reply buttons arrive as type "button".
          text = typeof m.button?.text === "string" ? m.button.text : "";
          isInteractiveReply = true;
        }

        if (typeof text !== "string" || text.trim() === "") continue;
        out.push({ waId, messageId, timestamp, text: text.trim(), isInteractiveReply });
      }
    }
  }

  return out;
}

// ─── Outbound ────────────────────────────────────────────────────────────────

export interface ReplyButton {
  /** Echoed back as interactive.button_reply.id on the next inbound message. */
  id: string;
  title: string;
}

class WhatsAppClient {
  private async post(payload: Record<string, unknown>): Promise<void> {
    const config = getWhatsAppConfig();
    if (!config) {
      throw new Error("WhatsApp is not configured (missing env vars)");
    }

    const res = await fetch(`${GRAPH_BASE}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `WhatsApp send failed: ${res.status} ${res.statusText} ${detail.slice(0, 300)}`
      );
    }
  }

  async sendText(waId: string, body: string): Promise<void> {
    await this.post({
      to: waId,
      type: "text",
      text: { preview_url: true, body: body.slice(0, WHATSAPP_TEXT_MAX_LENGTH) },
    });
  }

  async sendButtons(
    waId: string,
    body: string,
    buttons: ReplyButton[]
  ): Promise<void> {
    const trimmed = buttons.slice(0, WHATSAPP_BUTTON_MAX_COUNT).map((b) => ({
      type: "reply" as const,
      reply: {
        id: b.id,
        title: b.title.slice(0, WHATSAPP_BUTTON_TITLE_MAX_LENGTH),
      },
    }));

    await this.post({
      to: waId,
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
  ): Promise<void> {
    await this.post({
      to: waId,
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

  /** Blue ticks on the user's message. Best-effort — failures are non-fatal. */
  async markAsRead(messageId: string): Promise<void> {
    await this.post({ status: "read", message_id: messageId });
  }
}

export const whatsappClient = new WhatsAppClient();
