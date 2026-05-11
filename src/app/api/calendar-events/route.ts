/**
 * Calendar events API.
 *
 * GET  /api/calendar-events?from=&to=   List events overlapping range
 * POST /api/calendar-events             Create event (admin/manager)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const postSchema = z.object({
  title: z.string().min(1).max(100).trim(),
  description: z.string().optional().nullable(),
  type: z.enum(["HOLIDAY", "MEETING", "CLOSED", "OTHER"]),
  startDate: z.string(),
  endDate: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: any = { tenantId: auth.tenantId };
  if (from || to) {
    // overlap formula: startDate <= to AND endDate >= from
    if (to) where.startDate = { lte: new Date(to) };
    if (from) where.endDate = { gte: new Date(from) };
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: auth.tenantId,
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      startDate,
      endDate,
      color: data.color ?? null,
      createdById: auth.userId,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ event });
}
