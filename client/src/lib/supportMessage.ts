export type SupportCTA = "create_shipment" | "contact_us" | null;

export interface ParsedMessage {
  text: string;
  cta: SupportCTA;
}

/**
 * Strips machine-readable TAP_* signals from assistant-visible text.
 * If both tokens were present, TAP_CREATE_SHIPMENT wins (first branch).
 */
export function parseAssistantMessage(content: string): ParsedMessage {
  if (content.includes("TAP_CREATE_SHIPMENT")) {
    return {
      text: content.replace("TAP_CREATE_SHIPMENT", "").trim(),
      cta: "create_shipment",
    };
  }
  if (content.includes("TAP_CONTACT_US")) {
    return {
      text: content.replace("TAP_CONTACT_US", "").trim(),
      cta: "contact_us",
    };
  }
  return { text: content, cta: null };
}
