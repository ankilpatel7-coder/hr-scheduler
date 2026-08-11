/**
 * v12.1: TENANT-SCOPED clock entries API.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const schema = z.object({
  id: z.string(),
  clockIn: z.string().optional(),
  clockOut: z.string().nullable().optional(),
  editNote: z.string().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { id, clockIn, clockOut, editNote } = parsed.data;

  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Separation of duties — managers cannot edit their own entries
  if (auth.role === "MANAGER" && existing.userId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot edit their own timesheet entries. Ask another admin/manager to make the correction." },
      { status: 403 },
    );
  }

  const data: any = { editedBy: auth.userId, editedAt: new Date() };
  if (clockIn) data.clockIn = new Date(clockIn);
  if (clockOut !== undefined) {
    data.clockOut = clockOut ? new Date(clockOut) : null;
  }
  if (editNote) data.editNote = editNote;

  const entry = await prisma.clockEntry.update({ where: { id }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Separation of duties — managers cannot delete their own entries
  if (auth.role === "MANAGER" && existing.userId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot delete their own timesheet entries." },
      { status: 403 },
    );
  }

  await prisma.clockEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN", "MANAGER"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }
  const tenantId = auth.tenantId;

  const body = await req.json();
  const { userId, clockIn, clockOut, editNote } = body;
  if (!userId || !clockIn) {
    return NextResponse.json({ error: "Missing userId or clockIn" }, { status: 400 });
  }
  // Separation of duties — managers cannot create manual entries for themselves.
  // They must clock in/out through the normal Clock page like everyone else.
  if (auth.role === "MANAGER" && userId === auth.userId) {
    return NextResponse.json(
      { error: "Managers cannot create timesheet entries for themselves. Use the Clock page to clock in/out." },
      { status: 403 },
    );
  }

  // Verify target user is in same tenant
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!targetUser || targetUser.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden — user not in your tenant" }, { status: 403 });
  }

  // Manual entries created by admin/manager are auto-approved — the creator
  // is effectively the approver, so making them re-approve is redundant.
  // Matches the admin-on-behalf-of behavior for time-off requests.
  const entry = await prisma.clockEntry.create({
    data: {
      userId,
      tenantId,
      clockIn: new Date(clockIn),
      clockOut: clockOut ? new Date(clockOut) : null,
      editedBy: auth.userId,
      editedAt: new Date(),
      editNote: editNote ?? "Created by manager",
      approvalStatus: "APPROVED",
      approvedById: auth.userId,
      approvedAt: new Date(),
      approvalNote: "Auto-approved (manual entry by admin)",
    },
  });
  return NextResponse.json({ entry });
}
