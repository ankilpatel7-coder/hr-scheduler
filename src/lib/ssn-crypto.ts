/**
 * SSN encryption / decryption helpers.
 *
 * Uses AES-256-GCM with a per-record random IV and authentication tag.
 * The encryption key comes from process.env.SSN_ENCRYPTION_KEY — must be
 * 32 bytes, base64-encoded. Generate with:
 *
 *   openssl rand -base64 32
 *
 * Storage format (base64-encoded):
 *   12 bytes IV  ||  16 bytes auth tag  ||  N bytes ciphertext
 *
 * SECURITY:
 *   - Never log or return plaintext SSN to the client.
 *   - Server-side decrypt only inside W-2 / EFW2 generation paths.
 *   - The encryption key must be the same across all environments that
 *     share the database — rotating the key requires re-encrypting all
 *     existing records.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const k = process.env.SSN_ENCRYPTION_KEY;
  if (!k) {
    throw new Error(
      "SSN_ENCRYPTION_KEY env var is not set. Generate one with `openssl rand -base64 32` " +
        "and set it in Vercel + .env.local before using SSN features.",
    );
  }
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `SSN_ENCRYPTION_KEY must be 32 bytes (base64-encoded). Got ${buf.length} bytes.`,
    );
  }
  return buf;
}

/**
 * Encrypt a 9-digit SSN. Accepts SSN with or without dashes; strips them.
 * Returns { encrypted: string, last4: string }.
 */
export function encryptSsn(plaintext: string): { encrypted: string; last4: string } {
  const cleaned = plaintext.replace(/\D/g, "");
  if (cleaned.length !== 9) {
    throw new Error("SSN must be 9 digits.");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(cleaned, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc]).toString("base64");
  return { encrypted: blob, last4: cleaned.slice(-4) };
}

/**
 * Decrypt a stored SSN blob back to a 9-digit string. Throws if the blob
 * is malformed or the auth tag fails (tamper detection).
 */
export function decryptSsn(encrypted: string): string {
  const blob = Buffer.from(encrypted, "base64");
  if (blob.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("SSN ciphertext is too short to be valid.");
  }
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

/** Format a 9-digit SSN as "XXX-XX-XXXX". */
export function formatSsn(plaintext: string): string {
  const cleaned = plaintext.replace(/\D/g, "");
  if (cleaned.length !== 9) return plaintext;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`;
}

/** Display mask from stored last 4 digits, e.g. "***-**-1234". */
export function maskSsn(last4: string | null | undefined): string {
  if (!last4) return "—";
  return `***-**-${last4}`;
}

/** Return true if SSN_ENCRYPTION_KEY is configured and valid. */
export function ssnEncryptionAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
