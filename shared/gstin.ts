// GSTIN format validation only — no live registry lookup (out of scope this
// phase, see docs/final-phase/markdowns/final-phase-modules.md §9). Checks
// the standard 15-char structure and the public mod-36 checksum algorithm,
// both pure math, not an external call. Shared between client and server so
// both sides agree on what counts as a valid GSTIN.

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CODE_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function codeValue(ch: string): number {
  return CODE_CHARS.indexOf(ch);
}

function computeChecksum(gstin14: string): string {
  let sum = 0;
  for (let i = 0; i < gstin14.length; i++) {
    const factor = i % 2 === 0 ? 1 : 2;
    const product = codeValue(gstin14[i]) * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checksum = (36 - (sum % 36)) % 36;
  return CODE_CHARS[checksum];
}

export function validateGstin(raw: string): { valid: boolean; message?: string } {
  const gstin = raw.trim().toUpperCase();

  if (!gstin) {
    return { valid: false, message: "GST number is required" };
  }
  if (gstin.length !== 15) {
    return { valid: false, message: "GST number must be 15 characters" };
  }
  if (!GSTIN_SHAPE.test(gstin)) {
    return { valid: false, message: "Invalid GST number format" };
  }
  const expectedChecksum = computeChecksum(gstin.slice(0, 14));
  if (expectedChecksum !== gstin[14]) {
    return { valid: false, message: "GST number checksum is invalid" };
  }
  return { valid: true };
}
