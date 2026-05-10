/**
 * Per-employee weekly availability windows.
 *   GET  /api/availability                          → admin/mgr: all in tenant
 *                                                     staff: own only
 *   GET  /api/availability?employeeId=X             → admin/mgr: that employee
 *   POST /api/availability  { dayOfWeek, startMinute, endMinute, available }
 *                                                   → set ONE window for self
 *   DELETE /api/availability?id=X                   → remove a window (own only)
 *
 * Day-of-week: 0=Sunday, 1=Monday, ..., 6=Saturday (matches JS getDay()).
 * Start/end minutes are minutes since midnight (0..1440).
 *
 * Convention: rows with available=false represent "I cannot work this
 * window". A row covering 0..1439 with available=false means "I cannot
 * work this entire day-of-week".
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, getScopedEmployeeIds, isStaff } from "@/lib/guards";

const createSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  available: z.boolean().optional().default(false),
});

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  let userIds: string[] | null = null;
  if (isStaff(auth.role)) {
    userIds = [auth.userId];
  } else if (auth.role === "MANAGER") {
    userIds = (await getScopedEmployeeIds(auth.userId, "MANAGER")) ?? [];
  } else {
    // ADMIN — get all employees in tenant
    const all = await prisma.user.findMany({
      where: { tenantId: auth.tenantId, active: true },
      select: { id: true },
    });
    userIds = all.map((u) => u.id);
  }

  const where: any = { userId: { in: userIds } };
  if (employeeId) where.userId = employeeId;

  const availability = await prisma.availability.findMany({
    where,
    orderBy: [{ userId: "asc" }, { dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  return NextResponse.json({ availability });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.endMinute <= parsed.data.startMinute) {
    return NextResponse.json({ error: "endMinute must be greater than startMinute" }, { status: 400 });
  }
  const created = await prisma.availability.create({
    data: {
      userId: auth.userId,
      dayOfWeek: parsed.data.dayOfWeek,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      available: parsed.data.available ?? false,
    },
  });
  return NextResponse.json({ window: created });
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const win = await prisma.availability.findUnique({ where: { id } });
  if (!win) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (win.userId !== auth.userId && auth.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.availability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
