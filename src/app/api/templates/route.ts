/**
 * Schedule Templates — list and create.
 *
 * GET  /api/templates              List all templates for the tenant.
 * POST /api/templates              Save a date range (typically a week) as a
 *                                  named template. Snapshots all draft +
 *                                  published shifts in [from, to) into
 *                                  ScheduleTemplateShift rows, normalized to
 *                                  dayOfWeek + minute-of-day so they can be
 *                                  re-applied to any future week.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { startOfWeek } from "date-fns";

const postSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  from: z.string(),  // ISO datetime, inclusive
  to: z.string(),    // ISO datetime, exclusive (typically next week's start)
});

export async function GET() {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const templates = await prisma.scheduleTemplate.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { shifts: true } },
    },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { name, from, to } = parsed.data;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!(fromDate < toDate)) {
    return NextResponse.json({ error: "`to` must be after `from`" }, { status: 400 });
  }

  // Anchor for normalizing shift times into dayOfWeek + minute-of-day.
  // We use the Monday of the source week so the resulting template has
  // dayOfWeek 1=Mon ... 0=Sun matching JS getDay() semantics.
  const weekAnchor = startOfWeek(fromDate, { weekStartsOn: 1 });

  const sourceShifts = await prisma.shift.findMany({
    where: {
      tenantId,
      startTime: { gte: fromDate, lt: toDate },
    },
    select: {
      employeeId: true,
      locationId: true,
      role: true,
      tagId: true,
      notes: true,
      startTime: true,
      endTime: true,
    },
  });

  if (sourceShifts.length === 0) {
    return NextResponse.json(
      { error: "No shifts in this week to save as a template." },
      { status: 400 },
    );
  }

  // Check for name collision
  const existing = await prisma.scheduleTemplate.findFirst({
    where: { tenantId, name },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A template named "${name}" already exists.` },
      { status: 409 },
    );
  }

  const template = await prisma.scheduleTemplate.create({
    data: {
      tenantId,
      name,
      createdById: auth.userId,
      shifts: {
        create: sourceShifts.map((s) => {
          const startOffsetMs = s.startTime.getTime() - weekAnchor.getTime();
          const endOffsetMs = s.endTime.getTime() - weekAnchor.getTime();
          const startMinutes = Math.floor(startOffsetMs / 60_000);
          const endMinutes = Math.floor(endOffsetMs / 60_000);
          // dayOfWeek from start: 0..6 with Mon=0 (since weekAnchor is Mon).
          // Convert to JS-style 0=Sun for storage consistency with Availability.
          const dayFromMonday = Math.floor(startMinutes / (24 * 60));
          const jsDayOfWeek = (dayFromMonday + 1) % 7; // Mon(0)→1, Sun(6)→0
          const startMinute = startMinutes - dayFromMonday * 24 * 60;
          const endMinute = endMinutes - dayFromMonday * 24 * 60;
          return {
            dayOfWeek: jsDayOfWeek,
            startMinute,
            endMinute,
            employeeId: s.employeeId,
            locationId: s.locationId,
            role: s.role,
            tagId: s.tagId,
            notes: s.notes,
          };
        }),
      },
    },
    include: { _count: { select: { shifts: true } } },
  });

  return NextResponse.json({ template });
}
