/**
 * Single calendar event API.
 *
 * GET    /api/calendar-events/[id]  — any authenticated tenant user
 * DELETE /api/calendar-events/[id]  — admin/manager only
 */

import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const event = await prisma.calendarEvent.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true, attachmentUrl: true },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort blob cleanup
  if (event.attachmentUrl) {
    try {
      await del(event.attachmentUrl);
    } catch {
      // Non-fatal — the DB row deletion is the source of truth
    }
  }

  await prisma.calendarEvent.delete({ where: { id: event.id } });
  return NextResponse.json({ ok: true });
}
