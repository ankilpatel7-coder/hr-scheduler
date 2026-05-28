/**
 * POST /api/shifts/[id]/ignore    { reason?: string }
 * DELETE /api/shifts/[id]/ignore  — un-ignore
 *
 * Admin-only. Marks a shift as attendance-ignored (or removes the flag).
 * Ignored shifts are excluded from the attendance scoring + missed counts.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const postSchema = z.object({
  reason: z.string().max(200).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const shift = await prisma.shift.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body ?? {});
  const reason = parsed.success ? (parsed.data.reason ?? null) : null;

  const updated = await prisma.shift.update({
    where: { id: params.id },
    data: {
      attendanceIgnored: true,
      attendanceIgnoredById: auth.userId,
      attendanceIgnoredAt: new Date(),
      attendanceIgnoreReason: reason,
    },
  });

  return NextResponse.json({ shift: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const shift = await prisma.shift.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!shift) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }

  await prisma.shift.update({
    where: { id: params.id },
    data: {
      attendanceIgnored: false,
      attendanceIgnoredById: null,
      attendanceIgnoredAt: null,
      attendanceIgnoreReason: null,
    },
  });

  return NextResponse.json({ ok: true });
}
