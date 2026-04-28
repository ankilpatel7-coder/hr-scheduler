import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, getScopedLocationIds } from "@/lib/guards";

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  timezone: z.string().optional(),
});

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const scoped = await getScopedLocationIds(auth.userId, auth.role);

  const locations = await prisma.location.findMany({
    where: scoped ? { id: { in: scoped } } : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { employees: true } } },
  });
  return NextResponse.json({ locations });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const loc = await prisma.location.create({ data: parsed.data });
  return NextResponse.json({ location: loc });
}

const dayHoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  close: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  closed: z.boolean().optional(),
});

const hoursSchema = z.object({
  mon: dayHoursSchema.optional(),
  tue: dayHoursSchema.optional(),
  wed: dayHoursSchema.optional(),
  thu: dayHoursSchema.optional(),
  fri: dayHoursSchema.optional(),
  sat: dayHoursSchema.optional(),
  sun: dayHoursSchema.optional(),
});

const patchSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  timezone: z.string().optional(),
  active: z.boolean().optional(),
  hours: hoursSchema.nullable().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, ...rest } = parsed.data;
  const loc = await prisma.location.update({ where: { id }, data: rest as any });
  return NextResponse.json({ location: loc });
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // Soft delete by setting inactive
  await prisma.location.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
