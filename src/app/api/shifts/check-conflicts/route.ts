/**
 * Preview shift conflicts before saving.
 *
 * POST /api/shifts/check-conflicts
 *   Body: {
 *     employeeId: string | null,
 *     startTime: ISO string,
 *     endTime: ISO string,
 *     shiftId?: string   // when editing, exclude this shift from overlap check
 *   }
 *   Returns: { conflicts: ShiftConflict[] }
 *
 * The schedule UI calls this on input change (debounced) so the user sees
 * conflicts before clicking save.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/guards";
import { detectShiftConflicts } from "@/lib/schedule-conflicts";

const bodySchema = z.object({
  employeeId: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  shiftId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  if (!(end > start)) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }

  const conflicts = await detectShiftConflicts({
    tenantId: auth.tenantId,
    employeeId: parsed.data.employeeId,
    startTime: start,
    endTime: end,
    excludeShiftId: parsed.data.shiftId,
  });

  return NextResponse.json({ conflicts });
}
