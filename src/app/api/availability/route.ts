import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/guards";

const saveSchema = z.object({
  entries: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startMinute: z.number().int().min(0).max(1440),
      endMinute: z.number().int().min(0).max(1440),
      available: z.boolean(),
    })
  ),
  userId: z.string().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? auth.userId;

  if (userId !== auth.userId && auth.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const availability = await prisma.availability.findMany({
    where: { userId },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  return NextResponse.json({ availability });
}

export async function PUT(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const targetUserId = parsed.data.userId ?? auth.userId;
  if (targetUserId !== auth.userId && auth.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Replace all availability for this user
  await prisma.availability.deleteMany({ where: { userId: targetUserId } });
  if (parsed.data.entries.length > 0) {
    await prisma.availability.createMany({
      data: parsed.data.entries.map((e) => ({ ...e, userId: targetUserId })),
    });
  }

  const updated = await prisma.availability.findMany({
    where: { userId: targetUserId },
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
  return NextResponse.json({ availability: updated });
}
