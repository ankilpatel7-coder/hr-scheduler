import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { getScopedLocationIds } from "@/lib/guards";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "MANAGER", "LEAD", "EMPLOYEE"]).optional(),
  department: z.string().optional(),
  hourlyWage: z.number().nonnegative().optional(),
  isTipped: z.boolean().optional(),
  locationIds: z.array(z.string()).optional(),
  // Profile fields (all optional)
  photoUrl: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  employmentType: z.enum(["W2", "CONTRACTOR_1099", "UNSPECIFIED"]).optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  emergencyContactRelation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const userCount = await prisma.user.count();
  const session = await getServerAuth();
  const callerRole = (session?.user as any)?.role as
    | "ADMIN"
    | "MANAGER"
    | "LEAD"
    | "EMPLOYEE"
    | undefined;
  const callerId = (session?.user as any)?.id as string | undefined;

  // Bootstrap: first signup with no users yet creates an ADMIN
  const isBootstrap = userCount === 0;

  if (!isBootstrap) {
    if (callerRole !== "ADMIN" && callerRole !== "MANAGER") {
      return NextResponse.json(
        { error: "Only admins or managers can create accounts" },
        { status: 403 }
      );
    }
  }

  const {
    email,
    name,
    password,
    role: requestedRole,
    department,
    hourlyWage,
    isTipped,
    locationIds,
  } = parsed.data;

  // Determine the actual role to assign
  let assignedRole: "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  if (isBootstrap) {
    assignedRole = "ADMIN";
  } else if (callerRole === "ADMIN") {
    assignedRole = requestedRole ?? "EMPLOYEE";
  } else {
    // MANAGER: can only create EMPLOYEE or LEAD
    if (requestedRole && requestedRole !== "EMPLOYEE" && requestedRole !== "LEAD") {
      return NextResponse.json(
        { error: "Managers can only create Employees or Leads" },
        { status: 403 }
      );
    }
    assignedRole = requestedRole ?? "EMPLOYEE";
  }

  // Determine final location assignments
  let assignedLocationIds: string[] = locationIds ?? [];
  if (!isBootstrap && callerRole === "MANAGER" && callerId) {
    const managerLocs = await getScopedLocationIds(callerId, "MANAGER");
    if (!managerLocs || managerLocs.length === 0) {
      return NextResponse.json(
        { error: "You are not assigned to any location, so you cannot add staff." },
        { status: 403 }
      );
    }
    if (assignedLocationIds.length === 0) {
      // Default to manager's locations if they didn't specify
      assignedLocationIds = managerLocs;
    } else {
      // Filter to only manager's allowed locations
      const allowed = new Set(managerLocs);
      const requested = new Set(assignedLocationIds);
      for (const id of assignedLocationIds) {
        if (!allowed.has(id)) {
          return NextResponse.json(
            { error: "You can only assign new staff to your own location(s)." },
            { status: 403 }
          );
        }
      }
    }
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  // Pull profile fields out of parsed.data for cleanliness
  const {
    photoUrl,
    phone,
    address,
    dateOfBirth,
    hireDate,
    employmentType,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelation,
    notes,
  } = parsed.data;

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: assignedRole,
      department,
      hourlyWage: hourlyWage ?? 0,
      isTipped: isTipped ?? false,
      // Profile fields
      photoUrl: photoUrl || null,
      phone: phone || null,
      address: address || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      hireDate: hireDate ? new Date(hireDate) : null,
      employmentType: employmentType ?? "UNSPECIFIED",
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      emergencyContactRelation: emergencyContactRelation || null,
      // Notes is admin-only — managers can't set this on creation
      notes: callerRole === "ADMIN" ? (notes || null) : null,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  if (assignedLocationIds.length > 0) {
    await prisma.employeeLocation.createMany({
      data: assignedLocationIds.map((locationId) => ({
        userId: user.id,
        locationId,
      })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ user });
}
