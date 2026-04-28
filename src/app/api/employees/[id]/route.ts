import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, getScopedEmployeeIds, getScopedLocationIds, isStaff } from "@/lib/guards";

// What an employee can see/edit on their own profile
const SELF_EDITABLE_FIELDS = [
  "phone",
  "address",
  "dateOfBirth",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
] as const;

// Additional fields admins can edit
const ADMIN_EDITABLE_FIELDS = [
  "name",
  "department",
  "hireDate",
  "employmentType",
  "hourlyWage",
  "isTipped",
  "active",
  "role",
  "notes",
] as const;

const updateSchema = z.object({
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  emergencyContactRelation: z.string().nullable().optional(),
  // Admin-only fields below
  name: z.string().min(1).optional(),
  department: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  employmentType: z.enum(["W2", "CONTRACTOR_1099", "UNSPECIFIED"]).optional(),
  hourlyWage: z.number().nonnegative().optional(),
  isTipped: z.boolean().optional(),
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]).optional(),
  notes: z.string().nullable().optional(),
  locationIds: z.array(z.string()).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const targetId = params.id;
  const isSelf = targetId === auth.userId;
  const isAdmin = auth.role === "ADMIN";

  // Authz: employee can see own profile + names of others. Manager sees own + scoped.
  if (!isSelf && isStaff(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isSelf && auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, auth.role);
    if (!scoped || !scoped.includes(targetId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      locations: { include: { location: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Strip sensitive fields based on viewer role
  const { passwordHash, ...rest } = user;
  const safe: any = { ...rest };
  if (!isAdmin && !isSelf) {
    // Manager viewing someone else: no wage, no notes
    safe.hourlyWage = 0;
    safe.notes = null;
  }
  if (!isAdmin) {
    // Non-admin: no admin notes, no wage on others, hide DOB unless self
    safe.notes = isSelf ? safe.notes : null;
    if (!isSelf) {
      safe.dateOfBirth = null;
      safe.hourlyWage = 0;
    }
  }

  return NextResponse.json({
    user: safe,
    canEditAll: isAdmin,
    canEditSelf: isSelf,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const targetId = params.id;
  const isSelf = targetId === auth.userId;
  const isAdmin = auth.role === "ADMIN";

  if (!isSelf && !isAdmin) {
    // Manager can edit profile fields for staff at their location
    if (auth.role === "MANAGER") {
      const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { role: true },
      });
      if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!scoped || !scoped.includes(targetId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (target.role !== "EMPLOYEE" && target.role !== "LEAD") {
        return NextResponse.json(
          { error: "You can only edit Employees and Leads." },
          { status: 403 }
        );
      }
      // OK — manager can proceed but with admin-only fields stripped below
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data: any = {};
  // Self-editable fields (anyone can edit on own profile)
  for (const f of SELF_EDITABLE_FIELDS) {
    if (parsed.data[f] !== undefined) {
      if (f === "dateOfBirth") {
        data[f] = parsed.data[f] ? new Date(parsed.data[f] as string) : null;
      } else {
        data[f] = parsed.data[f];
      }
    }
  }

  // Admin can edit everything; manager can edit a subset (no wage, role limited to EMPLOYEE/LEAD)
  const editableExtraFields = isAdmin
    ? ADMIN_EDITABLE_FIELDS
    : auth.role === "MANAGER"
    ? (["name", "department", "hireDate", "employmentType", "active", "role"] as const)
    : [];

  for (const f of editableExtraFields) {
    if (parsed.data[f] !== undefined) {
      // Manager role guardrail
      if (f === "role" && auth.role === "MANAGER") {
        const r = parsed.data.role;
        if (r && r !== "EMPLOYEE" && r !== "LEAD") {
          return NextResponse.json(
            { error: "Managers can only assign Employee or Lead roles." },
            { status: 403 }
          );
        }
      }
      if (f === "hireDate") {
        data[f] = parsed.data[f] ? new Date(parsed.data[f] as string) : null;
      } else {
        data[f] = parsed.data[f];
      }
    }
  }

  await prisma.user.update({ where: { id: targetId }, data });

  // Location reassignment — admin can do anything; manager limited to their locations
  if (Array.isArray(parsed.data.locationIds)) {
    let locationIds = parsed.data.locationIds;
    if (auth.role === "MANAGER") {
      const managerLocs = await getScopedLocationIds(auth.userId, "MANAGER");
      const allowed = new Set(managerLocs ?? []);
      for (const lid of locationIds) {
        if (!allowed.has(lid)) {
          return NextResponse.json(
            { error: "You can only assign locations you manage." },
            { status: 403 }
          );
        }
      }
    } else if (!isAdmin) {
      // Non-admin/manager (i.e., self) can't change locations
      locationIds = [];
    }

    if (isAdmin || auth.role === "MANAGER") {
      await prisma.employeeLocation.deleteMany({ where: { userId: targetId } });
      if (locationIds.length > 0) {
        await prisma.employeeLocation.createMany({
          data: locationIds.map((locationId) => ({
            userId: targetId,
            locationId,
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  const updated = await prisma.user.findUnique({
    where: { id: targetId },
    include: { locations: { include: { location: true } } },
  });
  return NextResponse.json({ user: updated });
}
