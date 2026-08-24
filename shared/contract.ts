/**
 * The customer contract a new account signs on its way in.
 *
 * Signing is typed, not uploaded: at the last step the customer ticks
 * acceptance and types their name, and that name is what appears on the
 * contract. Corporate accounts still hand over a countersigned copy as the
 * authorization letter — the two are different artefacts and both are kept.
 *
 * `CONTRACT_VERSION` is stamped onto every acceptance. Never edit the clauses
 * below without bumping it: an accepted contract must stay readable years
 * later as the text that was actually on screen.
 */

export const CONTRACT_VERSION = "CONTRACT-2026";
export const CONTRACT_TITLE = "Bombino Express Customer Contract (2026)";

export interface ContractClause {
  heading: string;
  body: string;
}

/**
 * Summary presented at signing.
 *
 * TODO(accounts): replace with the operative text of CONTRACT 2026.pdf, the
 * attachment to the 14 Aug 2026 onboarding mail, and bump CONTRACT_VERSION in
 * the same change. Until then this states the terms the customer is actually
 * held to today and points at the full document.
 */
export const CONTRACT_CLAUSES: readonly ContractClause[] = [
  {
    heading: "Scope",
    body: "Bombino Express Pvt Ltd carries parcels tendered by the customer from India to the destinations it serves, on the rates and transit times quoted at the time of each booking.",
  },
  {
    heading: "Customs and declarations",
    body: "The customer declares the contents, value and nature of every shipment truthfully, and is responsible for the accuracy of the KYC and export documents supplied with this account. Duties, taxes and penalties arising from a wrong or incomplete declaration are the customer's.",
  },
  {
    heading: "Prohibited goods",
    body: "The customer will not tender anything barred by Indian export law, by the destination country's import law, or by the carrier's own restricted list. Bombino Express may open, hold or return any shipment it believes to be in breach.",
  },
  {
    heading: "Charges",
    body: "Freight is billed on the greater of actual and volumetric weight, as re-weighed at the hub. Fuel surcharge, remote-area and customs-clearance charges apply where they arise and are shown on the invoice.",
  },
  {
    heading: "Liability",
    body: "Liability for loss or damage is limited to the amount declared and insured for that shipment. Consequential loss is excluded. Claims must be raised within 30 days of the delivery date or the expected delivery date.",
  },
  {
    heading: "Account information",
    body: "The customer keeps the details and documents on this account current, and tells Bombino Express when its GST, IEC or banking particulars change.",
  },
];

/**
 * What a signature has to be for us to hold someone to it.
 * Names are typed by hand, so this is deliberately forgiving about
 * punctuation and initials while still refusing an empty or joke entry.
 */
export const SIGNATURE_PATTERN = /^[A-Za-z][A-Za-z.'\- ]{1,79}$/;
export const SIGNATURE_MAX_LENGTH = 80;
export const SIGNATURE_ERROR = "Type your full name as your signature";

export function isValidSignature(name: string): boolean {
  return SIGNATURE_PATTERN.test(name.trim());
}
