import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/guards";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.role !== "ADMIN" && auth.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const employees = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      department: true,
      active: true,
      hourlyWage: true,
      isTipped: true,
      createdAt: true,
      locations: {
        select: {
          location: { select: { id: true, name: true } },
        },
      },
    },
  });
  return NextResponse.json({ employees });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const { id, active, role, department, hourlyWage, isTipped, locationIds } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const data: any = {};
  if (typeof active === "boolean") data.active = active;
  if (role) data.role = role;
  if (department !== undefined) data.department = department;
  if (typeof hourlyWage === "number") data.hourlyWage = hourlyWage;
  if (typeof isTipped === "boolean") data.isTipped = isTipped;

  await prisma.user.update({ where: { id }, data });

  // If locationIds provided, replace location assignments
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
