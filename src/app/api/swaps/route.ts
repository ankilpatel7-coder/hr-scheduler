/**
 * v12.1: TENANT-SCOPED swaps API.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { scopedPrisma } from "@/lib/scoped-prisma";
import { requireAuth, isStaff } from "@/lib/guards";

const createSchema = z.object({
  shiftId: z.string(),
  note: z.string().optional(),
});

function ensureTenant(auth: any) {
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");

  const where: any = {};
  if (locationId && (auth.role === "ADMIN" || auth.role === "MANAGER")) {
    where.shift = { locationId };
  }

  const swaps = await prisma.shiftSwap.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      shift: {
        include: {
          location: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
        },
      },
      offeredBy: { select: { id: true, name: true } },
      claimedBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ swaps });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { shiftId, note } = parsed.data;

  const shift = await prisma.shift.findUnique({ where: { id: shiftId }, include: { swap: true } });
  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  if (shift.employeeId !== auth.userId) return NextResponse.json({ error: "Not your shift" }, { status: 403 });
  if (shift.swap) return NextResponse.json({ error: "Already offered for swap" }, { status: 409 });
  if (shift.startTime < new Date()) return NextResponse.json({ error: "Can't offer past shifts" }, { status: 400 });

  const swap = await prisma.shiftSwap.create({
    data: { shiftId, offeredById: auth.userId, note, status: "OFFERED" },
  });
  return NextResponse.json({ swap });
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const t = ensureTenant(auth); if (t) return t;
  const prisma = scopedPrisma(auth.tenantId!);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const swap = await prisma.shiftSwap.findUnique({ where: { id } });
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (swap.offeredById !== auth.userId && isStaff(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (swap.status === "APPROVED") {
    return NextResponse.json({ error: "Can't cancel an approved swap" }, { status: 400 });
  }
  await prisma.shiftSwap.update({ where: { id }, data: { status: "CANCELED" } });
  return NextResponse.json({ ok: true });
}
