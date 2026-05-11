/**
 * v12.1: TENANT-SCOPED shifts API.
 *
 * House Shifts (employeeId: null) are open shifts admins post before
 * assigning. Manager permissions for house shifts are gated by location
 * scope (since there's no employee to scope by).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireAuth,
  requireRole,
  getScopedEmployeeIds,
  getScopedLocationIds,
  isStaff,
} from "@/lib/guards";

import { detectShiftConflicts, firstBlock } from "@/lib/schedule-conflicts";
const createSchema = z.object({
  employeeId: z.string().nullable().optional(),
  locationId: z.string().optional().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  role: z.string().optional(),
  notes: z.string().optional(),
  tagId: z.string().optional().nullable(),
});

/**
 * Manager permission check for editing/deleting an existing shift.
 * - Assigned shift (employeeId set): employee must be in manager's scope.
 * - House shift (employeeId null): location must be in manager's scope.
 *   If the house shift has no location either, only ADMIN can touch it.
 *
 * Returns null if allowed, or a NextResponse with 403 if not.
 */
async function checkManagerCanMutate(
  managerId: string,
  existing: { employeeId: string | null; locationId: string | null },
) {
  if (existing.employeeId) {
    const scopedIds = await getScopedEmployeeIds(managerId, "MANAGER");
    if (!scopedIds || !scopedIds.includes(existing.employeeId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }
  // House shift — gate by location.
  if (!existing.locationId) {
    return NextResponse.json(
      { error: "Only admins can modify unassigned house shifts with no location." },
      { status: 403 },
    );
  }
  const scopedLocs = await getScopedLocationIds(managerId, "MANAGER");
  if (!scopedLocs || !scopedLocs.includes(existing.locationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const locationId = searchParams.get("locationId");

  const where: any = { tenantId }; // CRITICAL
  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = new Date(from);
    if (to) where.startTime.lte = new Date(to);
  }
  if (locationId) where.locationId = locationId;

  if (isStaff(auth.role)) {
    where.employeeId = auth.userId;
    where.published = true;
  } else if (auth.role === "MANAGER") {
    const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);
    const scopedLocs = await getScopedLocationIds(auth.userId, auth.role);
    // Manager sees:
    //   1. Assigned shifts where employee is in their scope, OR
    //   2. House shifts (no employee) at one of their scoped locations.
    // Both clauses are AND-ed against the tenant + date filters above.
    const orClauses: any[] = [
      { employeeId: { in: scopedIds ?? [] } },
    ];
    if (scopedLocs && scopedLocs.length > 0) {
      orClauses.push({ employeeId: null, locationId: { in: scopedLocs } });
    }
    where.OR = orClauses;
  }

  const shifts = await prisma.shift.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: {
      employee: { select: { id: true, name: true, department: true, hourlyWage: true } },
      location: { select: { id: true, name: true } },
      swap: true,
      tag: true,
    },
  });

  // Strip wages for non-admins. House shifts have no employee, so leave as-is.
  const safe = auth.role === "ADMIN"
    ? shifts
    : shifts.map((s) =>
        s.employee
          ? { ...s, employee: { ...s.employee, hourlyWage: 0 } }
          : s,
      );

  return NextResponse.json({ shifts: safe, viewerRole: auth.role });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { employeeId, locationId, startTime, endTime, role: shiftRole, notes, tagId } = parsed.data;

  // House shift: employeeId is null. Skip employee-tenant check.
  if (employeeId) {
    const emp = await prisma.user.findUnique({ where: { id: employeeId }, select: { tenantId: true } });
    if (!emp || emp.tenantId !== tenantId) {
      return NextResponse.json({ error: "Employee not in your tenant" }, { status: 403 });
    }
  }
  if (locationId) {
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { tenantId: true } });
    if (!loc || loc.tenantId !== tenantId) {
      return NextResponse.json({ error: "Location not in your tenant" }, { status: 403 });
    }
  }

  if (auth.role === "MANAGER") {
    if (employeeId) {
      const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);
      if (!scopedIds || !scopedIds.includes(employeeId)) {
        return NextResponse.json({ error: "You can only schedule employees at your assigned location(s)." }, { status: 403 });
      }
    }
    if (locationId) {
      const scopedLocs = await getScopedLocationIds(auth.userId, auth.role);
      if (!scopedLocs || !scopedLocs.includes(locationId)) {
        return NextResponse.json({ error: "You can only schedule shifts at your assigned location(s)." }, { status: 403 });
      }
    }
    // Posting a house shift requires at least a location (so we have
    // something to scope by). Admins can post location-less house shifts.
    if (!employeeId && !locationId) {
      return NextResponse.json(
        { error: "House shifts must specify a location." },
        { status: 400 },
      );
    }
  }

  if (new Date(endTime) <= new Date(startTime)) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  // POST_CONFLICT_CHECK
  const postConflicts = await detectShiftConflicts({
    tenantId,
    employeeId: employeeId ?? null,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
  });
  const postBlock = firstBlock(postConflicts);
  if (postBlock) {
    return NextResponse.json(
      { error: postBlock.message, conflicts: postConflicts },
      { status: 409 },
    );
  }


  // Validate tag belongs to same tenant if provided
  if (tagId) {
    const tag = await prisma.shiftTag.findUnique({ where: { id: tagId } });
    if (!tag || tag.tenantId !== tenantId) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }
  }

  const shift = await prisma.shift.create({
    data: {
      tenantId,
      employeeId: employeeId || null,
      managerId: auth.userId,
      locationId: locationId || null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      role: shiftRole,
      notes,
      tagId: tagId || null,
      published: false,
    },
    include: { tag: true },
  });
  return NextResponse.json({ shift, conflicts: postConflicts });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (auth.role === "MANAGER") {
    const denied = await checkManagerCanMutate(auth.userId, existing);
    if (denied) return denied;
  }

  // PATCH_CONFLICT_CHECK
  const newStart = rest.startTime ? new Date(rest.startTime) : existing.startTime;
  const newEnd = rest.endTime ? new Date(rest.endTime) : existing.endTime;
  const patchConflicts = await detectShiftConflicts({
    tenantId,
    employeeId: existing.employeeId,
    startTime: newStart,
    endTime: newEnd,
    excludeShiftId: existing.id,
  });
  const patchBlock = firstBlock(patchConflicts);
  if (patchBlock) {
    return NextResponse.json(
      { error: patchBlock.message, conflicts: patchConflicts },
      { status: 409 },
    );
  }

  const updates: any = {};
  if (rest.startTime) updates.startTime = new Date(rest.startTime);
  if (rest.endTime) updates.endTime = new Date(rest.endTime);
  if (rest.locationId !== undefined) updates.locationId = rest.locationId || null;
  if (rest.role !== undefined) updates.role = rest.role;
  if (rest.notes !== undefined) updates.notes = rest.notes;
  const shift = await prisma.shift.update({ where: { id }, data: updates });
  return NextResponse.json({ shift, conflicts: patchConflicts });
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (auth.role === "MANAGER") {
    const denied = await checkManagerCanMutate(auth.userId, existing);
    if (denied) return denied;
  }

  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
