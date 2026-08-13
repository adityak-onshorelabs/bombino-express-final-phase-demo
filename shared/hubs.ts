/**
 * India hub list for corporate ITD add_customer.
 *
 * Single source for the company-signup picker and server-side validation.
 * Membership check only — ids are not a contiguous range (13–22 are unused).
 */

export const INDIA_HUBS = [
  { id: 1, name: "Mumbai" },
  { id: 2, name: "Hyderabad" },
  { id: 3, name: "Delhi" },
  { id: 4, name: "Chandigarh" },
  { id: 5, name: "Ahmedabad" },
  { id: 6, name: "Bangalore" },
  { id: 7, name: "Pune" },
  { id: 8, name: "Fort Office" },
  { id: 9, name: "Jaipur" },
  { id: 10, name: "Chennai" },
  { id: 11, name: "Kolkata" },
  { id: 12, name: "Lower Parel" },
  { id: 23, name: "Surat" },
] as const;

export type IndiaHubId = (typeof INDIA_HUBS)[number]["id"];

export function isIndiaHubId(value: number): value is IndiaHubId {
  return INDIA_HUBS.some((h) => h.id === value);
}
