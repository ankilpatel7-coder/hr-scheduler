/**
 * POST /api/shifts/[id]/attendance
 *
 * Manager/admin classifies a shift's attendance reason.
 *
 *   Body: { reason: "SICK_CALL" | "ABSENT_NO_CALL" | "LEFT_EARLY_APPROVED"
 *                  | "LATE_EXCUSED" | "OTHER" | null,
 *           note?: string | null }
 *
 *   null reason clears the classification.
 *
 * Separation of duties — managers cannot classify their own shifts.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const ReasonEnum = z.enum([
  "SICK_CALL",
  "ABSENT_NO_CALL",
  "LEFT_EARLY_APPROVED",
  "LATE_EXCUSED",
  "OTHER",
]);

const schema = z.object({
  reason: ReasonEnum.nullable(),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { reason, note } = parsed.data;

  const shift = await prisma.shift.findFirst({
    where: { id: params.id, tenantId: auth.tenantId },
    select: { id: true, employeeId: true },
  });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Separation of duties — managers can't classify their own shifts
  if (auth.role === "MANAGER" && shift.employeeId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot classify their own shifts. Ask another admin/manager." },
      { status: 403 },
    );
  }

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      attendanceReason: reason,
      attendanceNote: reason ? (note ?? null) : null,
      attendanceSetById: reason ? auth.userId : null,
      attendanceSetAt: reason ? new Date() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    reason,
    note: reason ? (note ?? null) : null,
  });
}
