/**
 * Break tracking endpoints.
 *
 * POST /api/clock/break/start  { type: "SHORT_15" | "MEAL_30" | "OTHER" }
 *   Opens a new break on the user's currently-open ClockEntry. Fails if
 *   there's no open shift OR if there's already an open break.
 *
 * POST /api/clock/break/end
 *   Closes the user's currently-open break (sets breakEnd = now).
 *
 * GET /api/clock/break/status
 *   Returns { openBreak: { id, breakStart, breakType } | null } so the
 *   clock-in page can show "Resume work" when a break is in progress.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";

const startSchema = z.object({
  type: z.enum(["SHORT_15", "MEAL_30", "OTHER"]).optional().default("SHORT_15"),
});

async function getOpenShift(userId: string, tenantId: string) {
  return prisma.clockEntry.findFirst({
    where: { userId, tenantId, clockOut: null },
    orderBy: { clockIn: "desc" },
    include: {
      breaks: { where: { breakEnd: null } },
    },
  });
}

export async function POST(req: Request) {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) return NextResponse.json({ error: "No tenant context" }, { status: 400 });

  const url = new URL(req.url);
  const isStart = url.pathname.endsWith("/start");
  const isEnd = url.pathname.endsWith("/end");

  const open = await getOpenShift(userId, tenantId);
  if (!open) {
    return NextResponse.json(
      { error: "You're not currently clocked in." },
      { status: 409 },
    );
  }

  if (isStart) {
    if (open.breaks.length > 0) {
      return NextResponse.json(
        { error: "You already have a break in progress." },
        { status: 409 },
      );
    }
    const body = await req.json().catch(() => ({}));
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const br = await prisma.break.create({
      data: {
        clockEntryId: open.id,
        breakStart: new Date(),
        breakType: parsed.data.type,
      },
    });
    return NextResponse.json({ break: br });
  }

  if (isEnd) {
    if (open.breaks.length === 0) {
      return NextResponse.json(
        { error: "No break in progress." },
        { status: 409 },
      );
    }
    const current = open.breaks[0];
    const updated = await prisma.break.update({
      where: { id: current.id },
      data: { breakEnd: new Date() },
    });
    const actualMin = Math.round(
      (updated.breakEnd!.getTime() - updated.breakStart.getTime()) / 60000,
    );
    const targetMin = updated.breakType === "MEAL_30" ? 30 : updated.breakType === "SHORT_15" ? 15 : null;
    return NextResponse.json({
      break: updated,
      actualMinutes: actualMin,
      targetMinutes: targetMin,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET() {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) return NextResponse.json({ openBreak: null });

  const open = await getOpenShift(userId, tenantId);
  if (!open || open.breaks.length === 0) {
    return NextResponse.json({ openBreak: null });
  }
  const b = open.breaks[0];
  return NextResponse.json({
    openBreak: {
      id: b.id,
      breakStart: b.breakStart.toISOString(),
      breakType: b.breakType,
    },
  });
}
