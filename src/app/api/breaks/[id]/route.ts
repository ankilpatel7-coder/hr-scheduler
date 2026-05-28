/**
 * PATCH  /api/breaks/[id]  — adjust a break (admin only)
 * DELETE /api/breaks/[id]  — remove a break (admin only)
 *
 * Both verify the break's clock entry belongs to admin's tenant.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const patchSchema = z.object({
  breakStart: z.string().optional(),
  breakEnd: z.string().nullable().optional(),
  breakType: z.enum(["SHORT_15", "MEAL_30", "OTHER"]).optional(),
  notes: z.string().nullable().optional(),
});

async function getBreakInTenant(id: string, tenantId: string) {
  return prisma.break.findFirst({
    where: { id, clockEntry: { tenantId } },
    include: {
      clockEntry: { select: { clockIn: true, clockOut: true } },
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const existing = await getBreakInTenant(params.id, auth.tenantId);
  if (!existing) {
    return NextResponse.json({ error: "Break not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const start = parsed.data.breakStart
    ? new Date(parsed.data.breakStart)
    : existing.breakStart;
  const end =
    parsed.data.breakEnd === null
      ? null
      : parsed.data.breakEnd
        ? new Date(parsed.data.breakEnd)
        : existing.breakEnd;

  if (end && end < start) {
    return NextResponse.json(
      { error: "Break end must be after start" },
      { status: 400 },
    );
  }
  if (start < existing.clockEntry.clockIn) {
    return NextResponse.json(
      { error: "Break can't start before the clock-in time" },
      { status: 400 },
    );
  }
  if (existing.clockEntry.clockOut && end && end > existing.clockEntry.clockOut) {
    return NextResponse.json(
      { error: "Break can't end after the clock-out time" },
      { status: 400 },
    );
  }

  const updated = await prisma.break.update({
    where: { id: params.id },
    data: {
      breakStart: start,
      breakEnd: end,
      ...(parsed.data.breakType ? { breakType: parsed.data.breakType } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    },
  });

  return NextResponse.json({ break: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const existing = await getBreakInTenant(params.id, auth.tenantId);
  if (!existing) {
    return NextResponse.json({ error: "Break not found" }, { status: 404 });
  }

  await prisma.break.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
