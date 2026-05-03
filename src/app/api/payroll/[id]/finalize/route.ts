/**
 * Finalize a pay period — locks all stubs as immutable.
 *
 * POST /api/payroll/[id]/finalize
 *
 * After finalization, stubs cannot be regenerated. The period contributes to YTD
 * wage calculations for subsequent periods (SS cap, Additional Medicare threshold).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenantContext } from "@/lib/tenant";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireTenantContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const period = await prisma.payPeriod.findUnique({
    where: { id: params.id },
    include: { _count: { select: { payStubs: true } } },
  });
  if (!period || period.tenantId !== ctx.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (period.status === "FINALIZED") {
    return NextResponse.json({ error: "Already finalized" }, { status: 409 });
  }
  if (period._count.payStubs === 0) {
    return NextResponse.json({ error: "Cannot finalize a period with no stubs. Generate stubs first." }, { status: 400 });
  }

  const updated = await prisma.payPeriod.update({
    where: { id: params.id },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
      finalizedBy: ctx.userId,
    },
  });
  return NextResponse.json({ period: updated });
}
