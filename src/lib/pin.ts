/**
 * Shared PIN helpers.
 *
 * PINs are stored as bcrypt hashes, and bcrypt salts every hash differently —
 * the same PIN produces a different hash per user. So a DB unique index can
 * never detect a collision. The only way to check uniqueness is to compare the
 * candidate against every PIN hash in the tenant.
 *
 * That's O(n) bcrypt compares (~50-100ms each at cost 10). Fine for a team of
 * tens on an occasional admin action; revisit with a deterministic HMAC lookup
 * column if a tenant ever grows into the hundreds.
 *
 * Why uniqueness matters: kiosk login (auth.ts) resolves a user by PIN alone
 * within a tenant. On a collision it refuses to sign anyone in, which silently
 * locks out BOTH employees. Enforcing uniqueness at write time prevents that.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1230", "1212", "2121", "2580", "1379",
]);

export function isValidPinFormat(
  pin: string,
): { ok: true } | { ok: false; reason: string } {
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, reason: "PIN must be exactly 4 digits (0-9 only)." };
  }
  if (WEAK_PINS.has(pin)) {
    return {
      ok: false,
      reason: "PIN is too predictable. Choose something less guessable.",
    };
  }
  return { ok: true };
}

/**
 * Returns the user in `tenantId` who already uses `pin`, or null if free.
 * Pass `exceptUserId` to ignore the person whose PIN is being changed.
 *
 * Only considers active, non-archived users — the same population kiosk login
 * searches, so we don't block a PIN that could never actually collide.
 */
export async function findPinOwner(
  tenantId: string,
  pin: string,
  exceptUserId?: string,
): Promise<{ id: string; name: string | null; email: string } | null> {
  const candidates = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      archivedAt: null,
      pinHash: { not: null },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true, name: true, email: true, pinHash: true },
  });

  for (const u of candidates) {
    if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
      return { id: u.id, name: u.name, email: u.email };
    }
  }
  return null;
}

/**
 * Generates a random 4-digit PIN that is not weak and not already in use
 * within the tenant. Throws if it can't find a free one (effectively
 * impossible unless thousands of PINs are taken).
 */
export async function generateUniquePin(
  tenantId: string,
  maxAttempts = 40,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (WEAK_PINS.has(pin)) continue;
    const owner = await findPinOwner(tenantId, pin);
    if (!owner) return pin;
  }
  throw new Error(
    "Could not generate an unused PIN after many attempts. Too many PINs in use.",
  );
}

/** Friendly display name for a collision message. */
export function pinOwnerLabel(owner: {
  name: string | null;
  email: string;
}): string {
  return owner.name || owner.email;
}
