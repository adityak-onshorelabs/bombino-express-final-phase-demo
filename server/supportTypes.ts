/**
 * Types for Bombino AI Support Assistant (Phase 1).
 * No runtime logic — interfaces and constants only.
 */

// ─── Chat API ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  message: string;
  sessionId?: string | null;
}

export interface SupportChatContext {
  user: {
    id: string;
    email: string;
    fullName: string;
    code: string;
  } | null;
  itdToken: string | null;
  dbUserId: string | null;
  sessionId: string | null;
}

// ─── Tool arguments (LLM → executor) ─────────────────────────────────────────

export interface GetRatesArgs {
  /** Origin country name or code; defaults to India in executor */
  origin_country?: string;
  destination_country: string;
  weight_kg: string;
}

export interface GetTrackingSummaryArgs {
  tracking_no: string;
}

// ─── Normalized tracking summary (internal; used to build string for LLM) ────

export interface TrackingSummaryLastEvent {
  description: string;
  location: string;
  at: string;
}

export interface TrackingSummary {
  status: string;
  tracking_no: string;
  origin: string;
  destination: string;
  booking_date: string;
  last_event: TrackingSummaryLastEvent | null;
  events_count: number;
  chargeable_weight: string;
}

// ─── Validation constants ───────────────────────────────────────────────────

export const SUPPORT_CHAT_MAX_MESSAGES = 50;
export const SUPPORT_CHAT_MAX_CONTENT_LENGTH = 4096;
export const SUPPORT_TRACKING_NO_MAX_LENGTH = 32;
