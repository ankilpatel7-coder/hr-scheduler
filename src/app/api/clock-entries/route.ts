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
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { id, clockIn, clockOut, editNote } = parsed.data;

  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: any = { editedBy: auth.userId };
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

  const existing = await prisma.clockEntry.findUnique({ where: { id }, select: { tenantId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // Verify target user is in same tenant
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  if (!targetUser || targetUser.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden — user not in your tenant" }, { status: 403 });
  }

  const entry = await prisma.clockEntry.create({
    data: {
      userId,
      tenantId,
      clockIn: new Date(clockIn),
      clockOut: clockOut ? new Date(clockOut) : null,
      editedBy: auth.userId,
      editNote: editNote ?? "Created by manager",
    },
  });
  return NextResponse.json({ entry });
}
