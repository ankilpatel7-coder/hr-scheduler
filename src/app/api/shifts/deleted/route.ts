/**
 * Recycle bin API for deleted shifts.
 *
 * GET    /api/shifts/deleted            — list recent deletions (admin only)
 * POST   /api/shifts/deleted            — restore one  { id }
 * DELETE /api/shifts/deleted?id=xxx     — purge one permanently
 *
 * Restore recreates the Shift with its original id. It refuses if the employee
 * already has an overlapping shift, so restoring can't silently double-book.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const RETAIN_DAYS = 30;

export async function GET(req: Request) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000);

  const deleted = await prisma.deletedShift.findMany({
    where: { tenantId: auth.tenantId, deletedAt: { gte: cutoff } },
    orderBy: { deletedAt: "desc" },
    take: 200,
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

  const archived = await prisma.deletedShift.findFirst({
    where: { id: parsed.data.id, tenantId: auth.tenantId },
  });
  if (!archived) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Guard: don't recreate a row whose id somehow already exists.
  const clash = await prisma.shift.findUnique({ where: { id: archived.id } });
  if (clash) {
    return NextResponse.json(
      { error: "A shift with this id already exists." },
      { status: 409 },
    );
  }

  // Guard: don't double-book the employee.
  if (archived.employeeId) {
    const overlap = await prisma.shift.findFirst({
      where: {
        tenantId: auth.tenantId,
        employeeId: archived.employeeId,
        startTime: { lt: archived.endTime },
        endTime: { gt: archived.startTime },
      },
      select: { id: true, startTime: true, endTime: true },
    });
    if (overlap) {
      return NextResponse.json(
        {
          error:
            "Can't restore — this employee already has an overlapping shift in that slot.",
        },
        { status: 409 },
      );
    }
  }

  // Employee or location may have been archived since deletion.
  if (archived.employeeId) {
    const emp = await prisma.user.findFirst({
      where: { id: archived.employeeId, tenantId: auth.tenantId, active: true },
      select: { id: true },
    });
    if (!emp) {
      return NextResponse.json(
        {
          error:
            "Can't restore — the assigned employee is no longer active. Reactivate them first.",
        },
        { status: 409 },
      );
    }
  }

  await prisma.$transaction([
    prisma.shift.create({
      data: {
        id: archived.id,
        tenantId: archived.tenantId,
        employeeId: archived.employeeId,
        managerId: archived.managerId,
        locationId: archived.locationId,
        startTime: archived.startTime,
        endTime: archived.endTime,
        role: archived.role,
        tagId: archived.tagId,
        notes: archived.notes,
        published: archived.published,
        publishedAt: archived.publishedAt,
        createdAt: archived.originalCreatedAt,
      },
    }),
    prisma.deletedShift.delete({ where: { id: archived.id } }),
  ]);

  return NextResponse.json({ ok: true, restoredId: archived.id });
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

  const archived = await prisma.deletedShift.findFirst({
    where: { id, tenantId: auth.tenantId },
    select: { id: true },
  });
  if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.deletedShift.delete({ where: { id: archived.id } });
  return NextResponse.json({ ok: true });
}
