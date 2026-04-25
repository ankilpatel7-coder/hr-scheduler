import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { sendEmail, baseEmailTemplate } from "@/lib/email";
import { format } from "date-fns";

const createSchema = z.object({
  shiftId: z.string(),
  note: z.string().optional(),
});

// List swaps - employees see open swaps they could claim + their own; managers/admin see all
export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const swaps = await prisma.shiftSwap.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      shift: {
        include: {
          location: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
        },
      },
      offeredBy: { select: { id: true, name: true } },
      claimedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ swaps });
}

// Offer a shift for swap (employee offers their own shift)
export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { shiftId, note } = parsed.data;

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { swap: true },
  });
  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  if (shift.employeeId !== auth.userId) {
    return NextResponse.json({ error: "Not your shift" }, { status: 403 });
  }
  if (shift.swap) {
    return NextResponse.json({ error: "Already offered for swap" }, { status: 409 });
  }
  if (shift.startTime < new Date()) {
    return NextResponse.json({ error: "Can't offer past shifts" }, { status: 400 });
  }

  const swap = await prisma.shiftSwap.create({
    data: {
      shiftId,
      offeredById: auth.userId,
      note,
      status: "OFFERED",
    },
  });

  return NextResponse.json({ swap });
}

// Cancel a swap offer
export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const swap = await prisma.shiftSwap.findUnique({ where: { id } });
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (swap.offeredById !== auth.userId && auth.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (swap.status === "APPROVED") {
    return NextResponse.json(
      { error: "Can't cancel an approved swap" },
      { status: 400 }
    );
  }
  await prisma.shiftSwap.update({
    where: { id },
    data: { status: "CANCELED" },
  });
  return NextResponse.json({ ok: true });
}
