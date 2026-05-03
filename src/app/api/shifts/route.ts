/**
 * v12.1: TENANT-SCOPED shifts API.
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

const createSchema = z.object({
  employeeId: z.string(),
  locationId: z.string().optional().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

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
    where.employeeId = { in: scopedIds ?? [] };
    const scopedLocs = await getScopedLocationIds(auth.userId, auth.role);
    if (scopedLocs && scopedLocs.length > 0) {
      where.OR = [
        { locationId: { in: scopedLocs } },
        { locationId: null, employeeId: { in: scopedIds ?? [] } },
      ];
    }
  }

  const shifts = await prisma.shift.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: {
      employee: { select: { id: true, name: true, department: true, hourlyWage: true } },
      location: { select: { id: true, name: true } },
      swap: true,
    },
  });

  const safe = auth.role === "ADMIN"
    ? shifts
    : shifts.map((s) => ({ ...s, employee: { ...s.employee, hourlyWage: 0 } }));

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
  const { employeeId, locationId, startTime, endTime, role: shiftRole, notes } = parsed.data;

  // Verify employee in same tenant
  const emp = await prisma.user.findUnique({ where: { id: employeeId }, select: { tenantId: true } });
  if (!emp || emp.tenantId !== tenantId) {
    return NextResponse.json({ error: "Employee not in your tenant" }, { status: 403 });
  }
  if (locationId) {
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { tenantId: true } });
    if (!loc || loc.tenantId !== tenantId) {
      return NextResponse.json({ error: "Location not in your tenant" }, { status: 403 });
    }
  }

  if (auth.role === "MANAGER") {
    const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);
    if (!scopedIds || !scopedIds.includes(employeeId)) {
      return NextResponse.json({ error: "You can only schedule employees at your assigned location(s)." }, { status: 403 });
    }
    if (locationId) {
      const scopedLocs = await getScopedLocationIds(auth.userId, auth.role);
      if (!scopedLocs || !scopedLocs.includes(locationId)) {
        return NextResponse.json({ error: "You can only schedule shifts at your assigned location(s)." }, { status: 403 });
      }
    }
  }

  if (new Date(endTime) <= new Date(startTime)) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const shift = await prisma.shift.create({
    data: {
      tenantId,
      employeeId,
      managerId: auth.userId,
      locationId: locationId || null,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      role: shiftRole,
      notes,
      published: false,
    },
  });
  return NextResponse.json({ shift });
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
    const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);
    if (!scopedIds || !scopedIds.includes(existing.employeeId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updates: any = {};
  if (rest.startTime) updates.startTime = new Date(rest.startTime);
  if (rest.endTime) updates.endTime = new Date(rest.endTime);
  if (rest.locationId !== undefined) updates.locationId = rest.locationId || null;
  if (rest.role !== undefined) updates.role = rest.role;
  if (rest.notes !== undefined) updates.notes = rest.notes;
  const shift = await prisma.shift.update({ where: { id }, data: updates });
  return NextResponse.json({ shift });
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
    const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);
    if (!scopedIds || !scopedIds.includes(existing.employeeId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
