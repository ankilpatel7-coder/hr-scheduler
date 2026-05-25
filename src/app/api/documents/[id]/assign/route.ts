/**
 * POST /api/documents/[id]/assign  { employeeIds: string[] }
 *
 * Assigns additional employees to sign an existing document. Creates PENDING
 * DocumentSignature rows for each employee that doesn't already have one.
 *
 * - Skips employees who already have a signature row (any status — signed,
 *   pending, or waived). To re-request a signature from someone, archive
 *   their existing row first (future enhancement).
 * - Only employees in the same tenant + active + non-archived can be assigned.
 * - Returns { assignedCount, skippedCount, skippedReasons }.
 *
 * Admin only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";

const bodySchema = z.object({
  employeeIds: z.array(z.string()).min(1).max(200),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Verify the doc exists in this tenant and is active.
  const doc = await prisma.document.findFirst({
    where: { id: params.id, tenantId: auth.tenantId, active: true },
    select: { id: true, title: true },
  });
  if (!doc) {
    return NextResponse.json(
      { error: "Document not found or archived" },
      { status: 404 },
    );
  }

  // Verify each employee is in tenant + active.
  const eligible = await prisma.user.findMany({
    where: {
      id: { in: parsed.data.employeeIds },
      tenantId: auth.tenantId,
      active: true,
      archivedAt: null,
      role: { not: "ADMIN" }, // admins don't sign their own docs
    },
    select: { id: true },
  });
  const eligibleIds = new Set(eligible.map((e) => e.id));

  // Find any existing signature rows so we skip them.
  const existing = await prisma.documentSignature.findMany({
    where: {
      documentId: params.id,
      employeeId: { in: parsed.data.employeeIds },
    },
    select: { employeeId: true, status: true },
  });
  const alreadyAssigned = new Set(existing.map((s) => s.employeeId));

  const toAssign: string[] = [];
  const skippedReasons: { id: string; reason: string }[] = [];
  for (const id of parsed.data.employeeIds) {
    if (!eligibleIds.has(id)) {
      skippedReasons.push({ id, reason: "not in tenant / inactive / admin" });
      continue;
    }
    if (alreadyAssigned.has(id)) {
      skippedReasons.push({ id, reason: "already assigned" });
      continue;
    }
    toAssign.push(id);
  }

  if (toAssign.length === 0) {
    return NextResponse.json({
      assignedCount: 0,
      skippedCount: skippedReasons.length,
      skippedReasons,
    });
  }

  await prisma.documentSignature.createMany({
    data: toAssign.map((employeeId) => ({
      documentId: params.id,
      employeeId,
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    assignedCount: toAssign.length,
    skippedCount: skippedReasons.length,
    skippedReasons,
  });
}
