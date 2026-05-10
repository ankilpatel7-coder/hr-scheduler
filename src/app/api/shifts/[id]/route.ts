/**
 * PATCH /api/shifts/[id] — admin/manager edits a single shift in place.
 *
 * Used by the schedule page's "edit" hover action so admins don't need to
 * delete and re-create a shift just to nudge the time or change the role.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const patchSchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  role: z.string().nullable().optional(),
  tagId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({ where: { id: params.id } });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shift.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const data: any = {};
  if (parsed.data.startTime) data.startTime = new Date(parsed.data.startTime);
  if (parsed.data.endTime) data.endTime = new Date(parsed.data.endTime);
  if ("role" in parsed.data) data.role = parsed.data.role || null;
  if ("tagId" in parsed.data) data.tagId = parsed.data.tagId || null;
  if ("notes" in parsed.data) data.notes = parsed.data.notes || null;
  if ("locationId" in parsed.data) data.locationId = parsed.data.locationId || null;

  // Validate tag belongs to same tenant
  if (data.tagId) {
    const tag = await prisma.shiftTag.findUnique({ where: { id: data.tagId } });
    if (!tag || tag.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }
  }

  const updated = await prisma.shift.update({
    where: { id: params.id },
    data,
    include: {
      employee: { select: { id: true, name: true, department: true, hourlyWage: true } },
      location: { select: { id: true, name: true } },
      tag: true,
    },
  });

  return NextResponse.json({ shift: updated });
}
