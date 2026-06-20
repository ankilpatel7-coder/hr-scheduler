/**
 * Approve / reject a single clock entry.
 *
 * POST   /api/clock-entries/[id]/approve   { note?: string }
 * POST   /api/clock-entries/[id]/reject    { note?: string }
 * DELETE /api/clock-entries/[id]/approve   → reset to PENDING (undo)
 *
 * Admin or Manager. Tenant-scoped. Managers can only act on employees in
 * their scope.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, getScopedEmployeeIds } from "@/lib/guards";

const bodySchema = z.object({
  note: z.string().max(500).nullable().optional(),
});

async function loadAndAuthorize(entryId: string, auth: any) {
  const entry = await prisma.clockEntry.findFirst({
    where: { id: entryId, tenantId: auth.tenantId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!entry) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  // Separation of duties — managers can't approve/reject their own entries
  if (auth.role === "MANAGER" && entry.userId === auth.userId) {
    return {
      error: NextResponse.json(
        { error: "Managers cannot approve or reject their own timesheet entries" },
        { status: 403 },
      ),
    };
  }
  // Manager scope check
  if (auth.role === "MANAGER") {
    const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
    if (!scoped || !scoped.includes(entry.userId)) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
  }
  return { entry };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  // Decide approve vs reject based on URL path
  const isReject = new URL(req.url).pathname.endsWith("/reject");

  const { error, entry } = await loadAndAuthorize(params.id, auth);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const note = parsed.success ? parsed.data.note ?? null : null;

  await prisma.clockEntry.update({
    where: { id: params.id },
    data: {
      approvalStatus: isReject ? "REJECTED" : "APPROVED",
      approvedById: auth.userId,
      approvedAt: new Date(),
      approvalNote: note,
    },
  });

  return NextResponse.json({
    ok: true,
    status: isReject ? "REJECTED" : "APPROVED",
    employeeName: entry!.user.name,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const { error } = await loadAndAuthorize(params.id, auth);
  if (error) return error;

  await prisma.clockEntry.update({
    where: { id: params.id },
    data: {
      approvalStatus: "PENDING",
      approvedById: null,
      approvedAt: null,
      approvalNote: null,
    },
  });

  return NextResponse.json({ ok: true, status: "PENDING" });
}
