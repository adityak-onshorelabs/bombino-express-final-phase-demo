/**
 * Turns a BIA reply into WhatsApp-deliverable parts.
 * Mirrors client/src/lib/supportMessage.ts: the TAP_* tokens are machine signals
 * and must never reach the user as literal text.
 */

import { WHATSAPP_BODY_MAX_LENGTH, WHATSAPP_TEXT_MAX_LENGTH } from "./whatsapp.js";

/** Support desk number shown in the app (client/src/components/SideMenu.tsx). */
const SUPPORT_PHONE_DISPLAY = "+91 22 6640 0000";

export type OutboundPart =
  | { kind: "text"; body: string }
  | { kind: "cta_url"; body: string; buttonLabel: string; url: string };

function createShipmentUrl(): string {
  const base = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/create` : "";
}

/** Split on paragraph/line boundaries where possible, hard-cut only as a last resort. */
function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let cut = window.lastIndexOf("\n");
    if (cut < limit * 0.5) cut = window.lastIndexOf(" ");
    if (cut < limit * 0.5) cut = limit;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.filter((c) => c !== "");
}

/**
 * Strip TAP_* tokens, then attach the matching WhatsApp affordance.
 * TAP_CREATE_SHIPMENT wins when both are present — same precedence as the web client.
 */
export function buildOutboundParts(content: string): OutboundPart[] {
  const hasCreate = content.includes("TAP_CREATE_SHIPMENT");
  const hasContact = content.includes("TAP_CONTACT_US");

  let text = content
    .replace(/TAP_CREATE_SHIPMENT/g, "")
    .replace(/TAP_CONTACT_US/g, "")
    .trim();

  if (text === "") {
    text = "I can help with rates, tracking, how to ship, and support. What do you need?";
  }

  // The user is already in WhatsApp, so an escalation CTA is a phone number, not a chat link.
  if (!hasCreate && hasContact) {
    text = `${text}\n\nCall our team: ${SUPPORT_PHONE_DISPLAY}`;
  }

  const url = hasCreate ? createShipmentUrl() : "";
  if (hasCreate && url) {
    const chunks = chunkText(text, WHATSAPP_BODY_MAX_LENGTH);
    const last = chunks.pop() ?? "";
    return [
      ...chunks.map((body): OutboundPart => ({ kind: "text", body })),
      { kind: "cta_url", body: last, buttonLabel: "Create Shipment", url },
    ];
  }

  // No PUBLIC_URL configured — fall back to plain text so the reply still lands.
  if (hasCreate && !url) {
    text = `${text}\n\nYou can book this shipment in the Bombino Express app.`;
  }

  return chunkText(text, WHATSAPP_TEXT_MAX_LENGTH).map(
    (body): OutboundPart => ({ kind: "text", body })
  );
}
