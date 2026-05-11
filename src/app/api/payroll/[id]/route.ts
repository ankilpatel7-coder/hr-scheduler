/**
 * Single pay period operations.
 *
 * DELETE /api/payroll/[id]
 *   Admin-only. Only allowed when status === DRAFT.
 *   Cascades to all child PayStub rows (set up via Prisma onDelete: Cascade
 *   on the PayStub.payPeriod relation).
 *
 * Why we block delete on FINALIZED periods:
 *   Finalized stubs are part of the financial record (used for YTD wage
 *   calculation, W-2 generation, audit). Even an admin shouldn't be able
 *   to silently delete them. To remove a finalized period, an admin would
 *   need to first un-finalize it (separate flow, not built yet) or manually
 *   in the database with intent.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenantContext } from "@/lib/tenant";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireTenantContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const period = await prisma.payPeriod.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true, status: true, periodStart: true, periodEnd: true },
  });
  if (!period || period.tenantId !== ctx.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (period.status !== "DRAFT") {
    return NextResponse.json(
      {
        error:
          "Cannot delete a finalized pay period. Finalized stubs are part of the financial record.",
      },
      { status: 409 },
    );
  }

  // Delete the period — cascade removes child PayStub rows.
  await prisma.payPeriod.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true, deleted: { id: period.id } });
}
