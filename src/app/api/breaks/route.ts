/**
 * POST /api/breaks  { clockEntryId, breakStart, breakEnd?, breakType?, notes? }
 *
 * Admin-only — add a break to an existing clock entry retroactively (e.g.
 * employee forgot to log their lunch). The clock entry must belong to the
 * admin's tenant.
 *
 * Times accept ISO strings.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const schema = z.object({
  clockEntryId: z.string(),
  breakStart: z.string(),
  breakEnd: z.string().nullable().optional(),
  breakType: z.enum(["SHORT_15", "MEAL_30", "OTHER"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Verify the clock entry belongs to admin's tenant.
  const ce = await prisma.clockEntry.findUnique({
    where: { id: parsed.data.clockEntryId },
    select: { id: true, tenantId: true, clockIn: true, clockOut: true },
  });
  if (!ce || ce.tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "Clock entry not found or not in your tenant" },
      { status: 404 },
    );
  }

  const start = new Date(parsed.data.breakStart);
  const end = parsed.data.breakEnd ? new Date(parsed.data.breakEnd) : null;
  if (end && end < start) {
    return NextResponse.json(
      { error: "Break end must be after start" },
      { status: 400 },
    );
  }

  // Sanity check: break should fall within the clock entry's range.
  if (start < ce.clockIn) {
    return NextResponse.json(
      { error: "Break can't start before the clock-in time" },
      { status: 400 },
    );
  }
  if (ce.clockOut && end && end > ce.clockOut) {
    return NextResponse.json(
      { error: "Break can't end after the clock-out time" },
      { status: 400 },
    );
  }

  const br = await prisma.break.create({
    data: {
      clockEntryId: parsed.data.clockEntryId,
      breakStart: start,
      breakEnd: end,
      breakType: parsed.data.breakType ?? "SHORT_15",
      notes: parsed.data.notes ?? null,
    },
  });

  return NextResponse.json({ break: br });
}
