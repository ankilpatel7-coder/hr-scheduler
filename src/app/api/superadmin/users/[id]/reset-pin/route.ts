/**
 * POST /api/superadmin/users/[id]/reset-pin
 * Super-admin resets any user's PIN. Returns the new temp PIN once.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

function generateTempPin(): string {
  const weak = new Set(["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999","1234","4321"]);
  while (true) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!weak.has(pin)) return pin;
  }
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tempPin = generateTempPin();
  const pinHash = await bcrypt.hash(tempPin, 10);
  await prisma.user.update({
    where: { id: target.id },
    data: { pinHash, pinUpdatedAt: new Date() },
  });

  return NextResponse.json({
    user: { id: target.id, email: target.email, name: target.name },
    tempPin,
  });
}
