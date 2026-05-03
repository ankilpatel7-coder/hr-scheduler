/**
 * POST /api/me/pin
 * Body: { currentPin?: string, newPin: string }
 *
 * Sets or changes the user's 4-digit PIN for mobile clock-in.
 * - If user has no PIN yet: currentPin not required
 * - If user has a PIN: currentPin required (verify before change)
 * - newPin must be exactly 4 digits, not "0000" / "1111" / "1234" / common weak PINs
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";

const WEAK_PINS = new Set([
  "0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","4321","0123","1230","1212","2121","2580","1379",
]);

function isValidPin(pin: string): { ok: true } | { ok: false; reason: string } {
  if (!/^\d{4}$/.test(pin)) return { ok: false, reason: "PIN must be exactly 4 digits (0-9 only)." };
  if (WEAK_PINS.has(pin)) return { ok: false, reason: "PIN is too predictable. Choose something less guessable." };
  return { ok: true };
}

export async function POST(req: Request) {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const newPin = String(body.newPin ?? "");
  const currentPin = body.currentPin != null ? String(body.currentPin) : null;

  const valid = isValidPin(newPin);
  if (!valid.ok) return NextResponse.json({ error: valid.reason }, { status: 400 });

  const userId = (session.user as any).id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, pinHash: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // If user already has a PIN, require currentPin to match (unless they're explicitly resetting to a new one)
  if (user.pinHash) {
    if (!currentPin) return NextResponse.json({ error: "Current PIN required to change existing PIN." }, { status: 400 });
    const ok = await bcrypt.compare(currentPin, user.pinHash);
    if (!ok) return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 400 });
    if (currentPin === newPin) return NextResponse.json({ error: "New PIN must differ from current." }, { status: 400 });
  }

  const pinHash = await bcrypt.hash(newPin, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash, pinUpdatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, hadExistingPin: !!user.pinHash });
}

export async function DELETE() {
  // Allow user to clear their own PIN (e.g. lost device, want to disable mobile clock-in)
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  await prisma.user.update({
    where: { id: userId },
    data: { pinHash: null, pinUpdatedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
