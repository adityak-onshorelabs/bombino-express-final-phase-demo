/**
 * Bridges inbound WhatsApp messages to BIA (server/supportAgent.ts).
 * Phase 1: guest mode only — no phone→account linking, so shipment history is
 * unavailable and BIA tells the user to log in to the app for that.
 */

import { recordWhatsAppEvent } from "./biaUsage.js";
import { handleChat } from "./supportAgent.js";
import type { ChatMessage, SupportChatContext } from "./supportTypes.js";
import { SUPPORT_CHAT_MAX_CONTENT_LENGTH } from "./supportTypes.js";
import { buildOutboundParts } from "./whatsappFormat.js";
import { whatsappClient, type InboundMessage } from "./whatsapp.js";
import {
  appendTurn,
  getHistory,
  isDuplicateMessage,
  isRateLimited,
  RATE_LIMITED_MESSAGE,
} from "./whatsappSession.js";

const FALLBACK_REPLY =
  "I'm having trouble responding right now. Please try again in a moment.";

/** Guest context: itdClient falls back to the shared company token for rates/tracking. */
function guestContext(waId: string): SupportChatContext {
  return {
    user: null,
    itdToken: null,
    dbUserId: null,
    sessionId: null,
    channel: "whatsapp",
    waId,
  };
}

/** Last 4 digits only — full numbers are personal data and don't belong in logs. */
function maskWaId(waId: string): string {
  return `…${waId.slice(-4)}`;
}

/** Returns Tata's request ids, one per part, for correlating with status callbacks. */
async function deliver(waId: string, content: string): Promise<(string | null)[]> {
  const ids: (string | null)[] = [];
  for (const part of buildOutboundParts(content)) {
    ids.push(
      part.kind === "cta_url"
        ? await whatsappClient.sendCtaUrl(waId, part.body, part.buttonLabel, part.url)
        : await whatsappClient.sendText(waId, part.body)
    );
  }
  // Parts, not turns, are what Tata actually transmits — track them separately.
  void recordWhatsAppEvent({ kind: "parts_sent", count: ids.length });
  return ids;
}

export async function handleWhatsAppMessage(message: InboundMessage): Promise<void> {
  const { waId, messageId } = message;
  const startedAt = Date.now();

  try {
    if (await isDuplicateMessage(messageId)) {
      void recordWhatsAppEvent({ kind: "duplicate" });
      return;
    }

    const text = message.text.slice(0, SUPPORT_CHAT_MAX_CONTENT_LENGTH);

    void whatsappClient.markAsRead(messageId).catch(() => {});

    if (await isRateLimited(waId)) {
      void recordWhatsAppEvent({ kind: "rate_limited" });
      await deliver(waId, RATE_LIMITED_MESSAGE);
      return;
    }

    const history = await getHistory(waId);
    const messages: ChatMessage[] = [...history, { role: "user", content: text }];

    const reply = await handleChat(messages, guestContext(waId));

    await appendTurn(waId, text, reply);
    const ids = await deliver(waId, reply);

    // Acceptance, not delivery — Tata reports the real outcome on the Callbacks
    // webhook. These ids are the only way to tie a failure back to a reply.
    console.log(
      `[whatsappBia] replied to ${maskWaId(waId)} in ${Date.now() - startedAt}ms ` +
        `(${ids.length} part(s), ids: ${ids.join(", ") || "none"})`
    );
  } catch (err) {
    console.error("[whatsappBia] failed to handle message:", err);
    // Never leave the user hanging — a fallback beats silence.
    await whatsappClient
      .sendText(waId, FALLBACK_REPLY)
      .catch((sendErr) => console.error("[whatsappBia] fallback send failed:", sendErr));
  }
}
