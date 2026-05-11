/**
 * Single calendar event ops.
 *
 * PATCH /api/calendar-events/[id]    Update (admin/manager, tenant-scoped)
 * DELETE /api/calendar-events/[id]   Delete (admin/manager, tenant-scoped)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const patchSchema = z.object({
  title: z.string().min(1).max(100).trim().optional(),
  description: z.string().nullable().optional(),
  type: z.enum(["HOLIDAY", "MEETING", "CLOSED", "OTHER"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const existing = await prisma.calendarEvent.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!existing || existing.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  const updates: any = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.type !== undefined) updates.type = data.type;
  if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) updates.endDate = new Date(data.endDate);
  if (data.color !== undefined) updates.color = data.color;

  if (
    updates.startDate &&
    updates.endDate &&
    updates.endDate < updates.startDate
  ) {
    return NextResponse.json({ error: "End must be on or after start" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.update({
    where: { id: params.id },
    data: updates,
  });
  return NextResponse.json({ event });
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

  const existing = await prisma.calendarEvent.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!existing || existing.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.calendarEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
