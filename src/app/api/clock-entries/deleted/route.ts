/**
 * Recycle bin API for deleted timesheet entries.
 *
 * GET    /api/clock-entries/deleted        — list recent deletions (admin)
 * POST   /api/clock-entries/deleted        — restore one  { id }
 * DELETE /api/clock-entries/deleted?id=... — purge permanently
 *
 * Restore rebuilds the punch AND its breaks from the JSON snapshot, keeping
 * the original ids so nothing downstream is orphaned.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const RETAIN_DAYS = 30;

export async function GET() {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000);
  const deleted = await prisma.deletedClockEntry.findMany({
    where: { tenantId: auth.tenantId, deletedAt: { gte: cutoff } },
    orderBy: { deletedAt: "desc" },
    take: 200,
    select: {
      id: true,
      userName: true,
      clockIn: true,
      clockOut: true,
      approvalStatus: true,
      breakCount: true,
      deletedByName: true,
      deletedAt: true,
      deleteReason: true,
    },
  });

  return NextResponse.json({ deleted, retainDays: RETAIN_DAYS });
}

const restoreSchema = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const archived = await prisma.deletedClockEntry.findFirst({
    where: { id: parsed.data.id, tenantId: auth.tenantId },
  });
  if (!archived) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snap = archived.snapshot as any;
  if (!snap || typeof snap !== "object") {
    return NextResponse.json(
      { error: "Archive snapshot is unreadable — cannot restore." },
      { status: 500 },
    );
  }

  // Guard: id collision
  const clash = await prisma.clockEntry.findUnique({ where: { id: archived.id } });
  if (clash) {
    return NextResponse.json(
      { error: "An entry with this id already exists." },
      { status: 409 },
    );
  }

  // Guard: employee must still be active
  const emp = await prisma.user.findFirst({
    where: { id: archived.userId, tenantId: auth.tenantId, active: true },
    select: { id: true },
  });
  if (!emp) {
    return NextResponse.json(
      {
        error:
          "Can't restore — that employee is no longer active. Reactivate them first.",
      },
      { status: 409 },
    );
  }

  // Guard: overlapping punch already covers this period
  const endBound = archived.clockOut ?? archived.clockIn;
  const overlap = await prisma.clockEntry.findFirst({
    where: {
      tenantId: auth.tenantId,
      userId: archived.userId,
      clockIn: { lte: endBound },
      OR: [{ clockOut: null }, { clockOut: { gte: archived.clockIn } }],
    },
    select: { id: true },
  });
  if (overlap) {
    return NextResponse.json(
      {
        error:
          "Can't restore — this employee already has a punch overlapping that period.",
      },
      { status: 409 },
    );
  }

  const breaks = Array.isArray(snap.breaks) ? snap.breaks : [];

  await prisma.$transaction([
    prisma.clockEntry.create({
      data: {
        id: archived.id,
        tenantId: archived.tenantId,
        userId: archived.userId,
        clockIn: new Date(snap.clockIn),
        clockOut: snap.clockOut ? new Date(snap.clockOut) : null,
        selfieIn: snap.selfieIn ?? null,
        selfieOut: snap.selfieOut ?? null,
        latIn: snap.latIn ?? null,
        lngIn: snap.lngIn ?? null,
        latOut: snap.latOut ?? null,
        lngOut: snap.lngOut ?? null,
        addressIn: snap.addressIn ?? null,
        addressOut: snap.addressOut ?? null,
        editedBy: snap.editedBy ?? null,
        editNote: snap.editNote ?? null,
        editedAt: snap.editedAt ? new Date(snap.editedAt) : null,
        createdAt: new Date(snap.createdAt ?? archived.originalCreatedAt),
        approvalStatus: snap.approvalStatus ?? "PENDING",
        approvedById: snap.approvedById ?? null,
        approvedAt: snap.approvedAt ? new Date(snap.approvedAt) : null,
        approvalNote: snap.approvalNote ?? null,
        ...(breaks.length > 0
          ? {
              breaks: {
                create: breaks.map((b: any) => ({
                  id: b.id,
                  breakStart: new Date(b.breakStart),
                  breakEnd: b.breakEnd ? new Date(b.breakEnd) : null,
                  breakType: b.breakType ?? "SHORT_15",
                  notes: b.notes ?? null,
                  selfieStart: b.selfieStart ?? null,
                  createdAt: new Date(b.createdAt ?? Date.now()),
                })),
              },
            }
          : {}),
      },
    }),
    prisma.deletedClockEntry.delete({ where: { id: archived.id } }),
  ]);

  return NextResponse.json({
    ok: true,
    restoredId: archived.id,
    breaksRestored: breaks.length,
  });
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const archived = await prisma.deletedClockEntry.findFirst({
    where: { id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.deletedClockEntry.delete({ where: { id: archived.id } });
  return NextResponse.json({ ok: true });
}
