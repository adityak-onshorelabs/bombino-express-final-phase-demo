/**
 * Bridges inbound WhatsApp messages to BIA (server/supportAgent.ts).
 * Phase 1: guest mode only — no phone→account linking, so shipment history is
 * unavailable and BIA tells the user to log in to the app for that.
 */

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
const GUEST_CONTEXT: SupportChatContext = {
  user: null,
  itdToken: null,
  dbUserId: null,
  sessionId: null,
};

async function deliver(waId: string, content: string): Promise<void> {
  for (const part of buildOutboundParts(content)) {
    if (part.kind === "cta_url") {
      await whatsappClient.sendCtaUrl(waId, part.body, part.buttonLabel, part.url);
    } else {
      await whatsappClient.sendText(waId, part.body);
    }
  }
}

export async function handleWhatsAppMessage(message: InboundMessage): Promise<void> {
  const { waId, messageId } = message;

  try {
    if (await isDuplicateMessage(messageId)) return;

    const text = message.text.slice(0, SUPPORT_CHAT_MAX_CONTENT_LENGTH);

    void whatsappClient.markAsRead(messageId).catch(() => {});

    if (await isRateLimited(waId)) {
      await deliver(waId, RATE_LIMITED_MESSAGE);
      return;
    }

    const history = await getHistory(waId);
    const messages: ChatMessage[] = [...history, { role: "user", content: text }];

    const reply = await handleChat(messages, GUEST_CONTEXT);

    await appendTurn(waId, text, reply);
    await deliver(waId, reply);
  } catch (err) {
    console.error("[whatsappBia] failed to handle message:", err);
    // Never leave the user hanging — a fallback beats silence.
    await whatsappClient
      .sendText(waId, FALLBACK_REPLY)
      .catch((sendErr) => console.error("[whatsappBia] fallback send failed:", sendErr));
  }
}
