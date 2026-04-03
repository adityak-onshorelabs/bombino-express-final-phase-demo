/**
 * Static support content for Bombino AI Support Assistant (Phase 1).
 * No runtime dependencies on ITD or OpenAI — strings only.
 * USA → India corridor; wording is concise and user-friendly.
 */

export const guidance = {
  howToGetRates:
    "To get a rate: open the Rates page, choose Document or Package, enter weight (and optional dimensions), then tap Get Rates. We calculate for USA to India. You can also ask me for a rate if you tell me the weight and type (document or package).",

  howToTrack:
    "To track a shipment: go to Receive (Track & Receive), enter your AWB number, and tap Track. You can also ask me for a tracking summary if you have the AWB. No login is required to track.",

  howToShip:
    "To create a shipment: first get a rate on the Rates page, then go to Ship (Create Shipment). You’ll need to log in. Enter sender and receiver details, package info, and submit. Use the AWB you receive to track. For step-by-step help, ask for 'booking steps'.",

  requiredDocuments:
    "Typical documents include a commercial invoice and packing list. Exact requirements can depend on the shipment. Our team can advise when you create a shipment or contact support.",

  bookingSteps:
    "1) Get a rate on the Rates page (weight + document or package). 2) Log in if you aren’t already. 3) Go to Ship and create a shipment with sender, receiver, and package details. 4) Submit and use the AWB to track on the Receive page.",

  general:
    "I can help with rates, tracking, how to ship, and connecting you to support. Tell me what you need (e.g. 'rate for 5 lb package' or 'track AWB 12345678').",
} as const;

export const escalation =
  "For direct help, open the app menu and use WhatsApp Support or Call Support. Our team can assist with specific shipments, rates, or booking.";

export type GuidanceKey = keyof typeof guidance;
