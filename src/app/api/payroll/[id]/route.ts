/**
 * Single pay period operations.
 *
 * DELETE /api/payroll/[id]
 *   ADMIN: can delete DRAFT or FINALIZED periods.
 *   MANAGER: can delete DRAFT only.
 *   Cascades to all child PayStub rows.
 *
 *   When deleting a FINALIZED period, the client should require an extra
 *   confirmation step (e.g. type the period range to confirm). This API
 *   doesn't enforce that — it trusts the caller — but the UI does.
 *
 * PATCH /api/payroll/[id]
 *   ADMIN only. Body: { action: "unfinalize" }
 *   Flips status back to DRAFT so paystubs can be regenerated or edited.
 *   Use this when you need to fix something but want to keep an audit trail
 *   instead of a hard delete.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
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

  // Note: previously we blocked DELETE on FINALIZED periods. Admins can now
  // delete them — the UI requires a strong confirmation. Cascade still wipes
  // all child PayStub rows.
  await prisma.payPeriod.delete({ where: { id: params.id } });

  return NextResponse.json({
    ok: true,
    deleted: { id: period.id, wasFinalized: period.status === "FINALIZED" },
  });
}

const patchSchema = z.object({
  action: z.enum(["unfinalize"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await requireTenantContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path.length > 0 ? first.path.join(".") : "input";
    return NextResponse.json(
      { error: `Invalid ${field}: ${first.message}`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const period = await prisma.payPeriod.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true, status: true },
  });
  if (!period || period.tenantId !== ctx.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.action === "unfinalize") {
    if (period.status !== "FINALIZED") {
      return NextResponse.json(
        { error: "Period is not finalized." },
        { status: 409 },
      );
    }
    await prisma.payPeriod.update({
      where: { id: params.id },
      data: { status: "DRAFT", finalizedAt: null, finalizedBy: null },
    });
    return NextResponse.json({ ok: true, status: "DRAFT" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
