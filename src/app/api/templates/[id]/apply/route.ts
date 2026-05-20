/**
 * Schedule Templates — apply to a target week.
 *
 * POST /api/templates/[id]/apply  Body: { weekStart: ISO date string (Monday) }
 *
 * Behavior:
 *   1. Wipe ALL draft (unpublished) shifts in the target week. Published
 *      shifts are preserved (we don't unpublish what's already announced).
 *   2. Create new draft shifts from the template, anchored at weekStart.
 *      Each template shift's dayOfWeek + startMinute/endMinute determines
 *      its absolute time in the target week.
 *   3. Employee binding: if the original employee is still active and in
 *      this tenant, assign to them. Otherwise the shift becomes a house
 *      shift (employeeId = null).
 *   4. Locations / tags: silently dropped if no longer exist.
 *
 * Returns: { applied: number, houseShiftCount: number, replaced: number }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { startOfWeek, endOfWeek } from "date-fns";

const bodySchema = z.object({
  weekStart: z.string(),  // ISO date — will be normalized to Monday 00:00
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const template = await prisma.scheduleTemplate.findUnique({
    where: { id: params.id },
    include: { shifts: true },
  });
  if (!template || template.tenantId !== tenantId) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (template.shifts.length === 0) {
    return NextResponse.json({ error: "Template is empty." }, { status: 400 });
  }

  // Normalize to Monday 00:00 of the target week, regardless of what date
  // the client sent.
  const targetMonday = startOfWeek(new Date(parsed.data.weekStart), { weekStartsOn: 1 });
  const targetSunday = endOfWeek(targetMonday, { weekStartsOn: 1 });

  // Validate referenced employees / locations / tags still exist in this tenant.
  const employeeIds = Array.from(
    new Set(template.shifts.map((s) => s.employeeId).filter(Boolean) as string[]),
  );
  const locationIds = Array.from(
    new Set(template.shifts.map((s) => s.locationId).filter(Boolean) as string[]),
  );
  const tagIds = Array.from(
    new Set(template.shifts.map((s) => s.tagId).filter(Boolean) as string[]),
  );

  const [validEmployees, validLocations, validTags] = await Promise.all([
    employeeIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: employeeIds }, tenantId, active: true },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    locationIds.length > 0
      ? prisma.location.findMany({
          where: { id: { in: locationIds }, tenantId, active: true },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    tagIds.length > 0
      ? prisma.shiftTag.findMany({
          where: { id: { in: tagIds }, tenantId, active: true },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);
  const validEmployeeSet = new Set(validEmployees.map((e) => e.id));
  const validLocationSet = new Set(validLocations.map((l) => l.id));
  const validTagSet = new Set(validTags.map((t) => t.id));

  // Build the new shift rows, anchored to target Monday.
  // Template dayOfWeek uses JS convention: 0=Sun ... 6=Sat. Convert to
  // Mon-based offset (0=Mon ... 6=Sun) for date math against targetMonday.
  let houseShiftCount = 0;
  const newShifts = template.shifts.map((ts) => {
    const dayFromMonday = (ts.dayOfWeek + 6) % 7;
    const startMs =
      targetMonday.getTime() +
      dayFromMonday * 24 * 60 * 60 * 1000 +
      ts.startMinute * 60 * 1000;
    const endMs =
      targetMonday.getTime() +
      dayFromMonday * 24 * 60 * 60 * 1000 +
      ts.endMinute * 60 * 1000;

    const employeeId =
      ts.employeeId && validEmployeeSet.has(ts.employeeId) ? ts.employeeId : null;
    if (employeeId === null) houseShiftCount++;
    const locationId =
      ts.locationId && validLocationSet.has(ts.locationId) ? ts.locationId : null;
    const tagId = ts.tagId && validTagSet.has(ts.tagId) ? ts.tagId : null;

    return {
      tenantId,
      employeeId,
      managerId: auth.userId,
      locationId,
      startTime: new Date(startMs),
      endTime: new Date(endMs),
      role: ts.role,
      tagId,
      notes: ts.notes,
      published: false,
    };
  });

  // Atomic: delete existing drafts in the week, then create the template ones.
  const [deleted] = await prisma.$transaction([
    prisma.shift.deleteMany({
      where: {
        tenantId,
        published: false,
        startTime: { gte: targetMonday, lte: targetSunday },
      },
    }),
    prisma.shift.createMany({ data: newShifts }),
  ]);

  return NextResponse.json({
    applied: newShifts.length,
    houseShiftCount,
    replaced: deleted.count,
  });
}
