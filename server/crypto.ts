/**
 * AES-256-GCM helpers for ITD password storage.
 * ENCRYPTION_KEY must be 64 hex characters (32 bytes). Never log plaintext or keys.
 */
import nodeCrypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_HEX_CHARS = 64;

let missingKeyWarned = false;

function loadKeyBuffer(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length !== KEY_HEX_CHARS) {
    return null;
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    return null;
  }
  return buf;
}

export function isEncryptionConfigured(): boolean {
  return loadKeyBuffer() !== null;
}

function warnMissingKeyOnce(): void {
  if (missingKeyWarned) {
    return;
  }
  missingKeyWarned = true;
  console.warn(
    "[crypto] ENCRYPTION_KEY is missing or invalid (expected 64 hex chars for 32 bytes); password encryption is disabled."
  );
}

export function encryptPassword(plaintext: string): { encrypted: string; iv: string } {
  const key = loadKeyBuffer();
  if (!key) {
    warnMissingKeyOnce();
    return { encrypted: "", iv: "" };
  }

  const iv = nodeCrypto.randomBytes(IV_LENGTH);
  const cipher = nodeCrypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([ciphertext, authTag]);

  return {
    encrypted: combined.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptPassword(encrypted: string, iv: string): string {
  const key = loadKeyBuffer();
  if (!key) {
    throw new Error("Decryption unavailable: ENCRYPTION_KEY not configured");
  }
  if (!encrypted || !iv) {
    throw new Error("Missing ciphertext or IV");
  }

  const ivBuf = Buffer.from(iv, "base64");
  const combined = Buffer.from(encrypted, "base64");
  if (combined.length < AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext length");
  }

  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);

  const decipher = nodeCrypto.createDecipheriv(ALGO, key, ivBuf);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
