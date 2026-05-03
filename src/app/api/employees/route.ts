/**
 * v12.1: TENANT-SCOPED employees API.
 *
 * Every query filters by the requesting user's tenantId. Super-admins are blocked
 * from this route entirely (they manage tenants, not employees).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireAuth,
  requireRole,
  getScopedEmployeeIds,
  getScopedLocationIds,
} from "@/lib/guards";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const { searchParams } = new URL(req.url);
  const locationFilter = searchParams.get("locationId");
  const includeArchived = searchParams.get("includeArchived") === "true";

  const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);

  let where: any = { tenantId }; // CRITICAL: tenant filter
  if (scopedIds) where.id = { in: scopedIds };
  if (locationFilter) {
    where.locations = { some: { locationId: locationFilter } };
  }
  if (!includeArchived) {
    where.archivedAt = null;
  }

  const employees = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true, email: true, name: true, role: true, department: true,
      active: true, archivedAt: true, hourlyWage: true, isTipped: true,
      photoUrl: true, createdAt: true,
      locations: { select: { location: { select: { id: true, name: true } } } },
    },
  });

  const safe = auth.role === "ADMIN"
    ? employees
    : employees.map((e) => ({ ...e, hourlyWage: 0, isTipped: false }));

  return NextResponse.json({ employees: safe, viewerRole: auth.role });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const { id, active, role, department, hourlyWage, isTipped, locationIds } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // CRITICAL: verify target is in same tenant
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, tenantId: true } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden — different tenant" }, { status: 403 });
  }

  if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(id)) {
      return NextResponse.json({ error: "You can only manage staff at your assigned location(s)." }, { status: 403 });
    }
    if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
      return NextResponse.json({ error: "You can only edit Employees and Leads." }, { status: 403 });
    }
    if (role && role !== "EMPLOYEE" && role !== "LEAD") {
      return NextResponse.json({ error: "Managers can only assign Employee or Lead roles." }, { status: 403 });
    }
    if (hourlyWage !== undefined || isTipped !== undefined) {
      return NextResponse.json({ error: "Only admins can edit wage information." }, { status: 403 });
    }
    if (Array.isArray(locationIds)) {
      const managerLocs = await getScopedLocationIds(auth.userId, "MANAGER");
      const allowed = new Set(managerLocs ?? []);
      for (const lid of locationIds) {
        if (!allowed.has(lid)) {
          return NextResponse.json({ error: "You can only assign your own location(s)." }, { status: 403 });
        }
      }
    }
  }

  const data: any = {};
  if (typeof active === "boolean") data.active = active;
  if (role) data.role = role;
  if (department !== undefined) data.department = department;
  if (auth.role === "ADMIN") {
    if (typeof hourlyWage === "number") data.hourlyWage = hourlyWage;
    if (typeof isTipped === "boolean") data.isTipped = isTipped;
  }
  if (active === true) data.archivedAt = null;

  await prisma.user.update({ where: { id }, data });

  if (Array.isArray(locationIds)) {
    // Verify all locations are in this tenant
    const tenantLocs = await prisma.location.findMany({
      where: { tenantId, id: { in: locationIds } },
      select: { id: true },
    });
    if (tenantLocs.length !== locationIds.length) {
      return NextResponse.json({ error: "One or more locations are not in your tenant." }, { status: 403 });
    }
    await prisma.employeeLocation.deleteMany({ where: { userId: id } });
    if (locationIds.length > 0) {
      await prisma.employeeLocation.createMany({
        data: locationIds.map((locationId: string) => ({ userId: id, locationId })),
        skipDuplicates: true,
      });
    }
  }

  const updated = await prisma.user.findUnique({
    where: { id },
    include: { locations: { include: { location: true } } },
  });
  return NextResponse.json({ user: updated });
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const hard = searchParams.get("hard") === "true";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (id === auth.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, archivedAt: true, name: true, tenantId: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden — different tenant" }, { status: 403 });
  }

  if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
      return NextResponse.json({ error: "You can only archive Employees and Leads." }, { status: 403 });
    }
    if (hard) {
      return NextResponse.json({ error: "Only admins can permanently delete employees." }, { status: 403 });
    }
  }

  if (hard) {
    if (!target.archivedAt) {
      return NextResponse.json({
        error: "Employee must be archived first. Permanent deletion is only available 1+ year after archiving (KY payroll record-keeping requirement).",
      }, { status: 400 });
    }
    const oneYearAgo = new Date(Date.now() - 365 * 86400_000);
    if (target.archivedAt > oneYearAgo) {
      const daysLeft = Math.ceil(
        (target.archivedAt.getTime() + 365 * 86400_000 - Date.now()) / 86400_000
      );
      return NextResponse.json({
        error: `${target.name} was archived less than 1 year ago. Permanent deletion blocked for ${daysLeft} more days (KY requires 1 year of payroll record retention).`,
      }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: "permanent" });
  }

  await prisma.user.update({
    where: { id },
    data: { active: false, archivedAt: new Date() },
  });
  return NextResponse.json({ ok: true, archived: true });
}
