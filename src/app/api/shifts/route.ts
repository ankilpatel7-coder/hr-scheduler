import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/guards";

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
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const locationId = searchParams.get("locationId");

  const where: any = {};
  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = new Date(from);
    if (to) where.startTime.lte = new Date(to);
  }
  if (locationId) where.locationId = locationId;

  // Employees see only their own published shifts
  if (auth.role === "EMPLOYEE") {
    where.employeeId = auth.userId;
    where.published = true;
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
  return NextResponse.json({ shifts });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { employeeId, locationId, startTime, endTime, role: shiftRole, notes } =
    parsed.data;
  if (new Date(endTime) <= new Date(startTime)) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 }
    );
  }
  const shift = await prisma.shift.create({
    data: {
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
  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
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
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.shift.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
