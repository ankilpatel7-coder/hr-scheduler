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

  const { searchParams } = new URL(req.url);
  const locationFilter = searchParams.get("locationId");
  const includeArchived = searchParams.get("includeArchived") === "true";

  const scopedIds = await getScopedEmployeeIds(auth.userId, auth.role);

  let where: any = {};
  if (scopedIds) where.id = { in: scopedIds };
  if (locationFilter) {
    where.locations = {
      some: { locationId: locationFilter },
    };
  }
  // Hide archived employees by default
  if (!includeArchived) {
    where.archivedAt = null;
  }

  const employees = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      active: true,
      archivedAt: true,
      hourlyWage: true,
      isTipped: true,
      photoUrl: true,
      createdAt: true,
      locations: {
        select: { location: { select: { id: true, name: true } } },
      },
    },
  });

  // Strip wage for non-admins
  const safe =
    auth.role === "ADMIN"
      ? employees
      : employees.map((e) => ({ ...e, hourlyWage: 0, isTipped: false }));

  return NextResponse.json({ employees: safe, viewerRole: auth.role });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const { id, active, role, department, hourlyWage, isTipped, locationIds } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Manager guardrails
  if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(id)) {
      return NextResponse.json(
        { error: "You can only manage staff at your assigned location(s)." },
        { status: 403 }
      );
    }
    // Check the existing user — managers can't edit other managers/admins
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
      return NextResponse.json(
        { error: "You can only edit Employees and Leads." },
        { status: 403 }
      );
    }
    // Restrict role changes to EMPLOYEE/LEAD only
    if (role && role !== "EMPLOYEE" && role !== "LEAD") {
      return NextResponse.json(
        { error: "Managers can only assign Employee or Lead roles." },
        { status: 403 }
      );
    }
    // Managers can't change wage or tipped status
    if (hourlyWage !== undefined || isTipped !== undefined) {
      return NextResponse.json(
        { error: "Only admins can edit wage information." },
        { status: 403 }
      );
    }
    // Validate locations are within manager's scope
    if (Array.isArray(locationIds)) {
      const managerLocs = await getScopedLocationIds(auth.userId, "MANAGER");
      const allowed = new Set(managerLocs ?? []);
      for (const lid of locationIds) {
        if (!allowed.has(lid)) {
          return NextResponse.json(
            { error: "You can only assign your own location(s)." },
            { status: 403 }
          );
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
  // Clear archive flag if reactivating
  if (active === true) {
    data.archivedAt = null;
  }

  await prisma.user.update({ where: { id }, data });

  if (Array.isArray(locationIds)) {
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

// DELETE: archive (soft) by default, or hard delete with ?hard=true (only if archived 1+ year)
export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const hard = searchParams.get("hard") === "true";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Block self-delete
  if (id === auth.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, archivedAt: true, name: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Manager scoping
  if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
      return NextResponse.json(
        { error: "You can only archive Employees and Leads." },
        { status: 403 }
      );
    }
    // Managers can't hard-delete, ever
    if (hard) {
      return NextResponse.json(
        { error: "Only admins can permanently delete employees." },
        { status: 403 }
      );
    }
  }

  if (hard) {
    // Hard delete: only allowed if archived 1+ year ago
    if (!target.archivedAt) {
      return NextResponse.json(
        {
          error:
            "Employee must be archived first. Permanent deletion is only available 1+ year after archiving (KY payroll record-keeping requirement).",
        },
        { status: 400 }
      );
    }
    const oneYearAgo = new Date(Date.now() - 365 * 86400_000);
    if (target.archivedAt > oneYearAgo) {
      const daysLeft = Math.ceil(
        (target.archivedAt.getTime() + 365 * 86400_000 - Date.now()) / 86400_000
      );
      return NextResponse.json(
        {
          error: `${target.name} was archived less than 1 year ago. Permanent deletion blocked for ${daysLeft} more days (KY requires 1 year of payroll record retention).`,
        },
        { status: 400 }
      );
    }
    // Cascade delete (Prisma will cascade where onDelete: Cascade is set)
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: "permanent" });
  }

  // Soft archive
  await prisma.user.update({
    where: { id },
    data: { active: false, archivedAt: new Date() },
  });
  return NextResponse.json({ ok: true, archived: true });
}
