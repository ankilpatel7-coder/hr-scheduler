/**
 * Payroll pay periods API.
 *
 * GET  /api/payroll               → list pay periods for current tenant
 * POST /api/payroll               → create a new pay period (DRAFT status)
 *
 * Authorization: ADMIN only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenantContext } from "@/lib/tenant";

export async function GET() {
  const ctx = await requireTenantContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const periods = await prisma.payPeriod.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { payStubs: true } } },
  });
  return NextResponse.json({ periods });
}

export async function POST(req: Request) {
  const ctx = await requireTenantContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const periodStart = new Date(body.periodStart);
  const periodEnd = new Date(body.periodEnd);
  const payDate = new Date(body.payDate);

  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime()) || isNaN(payDate.getTime())) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }
  if (periodEnd <= periodStart) {
    return NextResponse.json({ error: "Period end must be after period start" }, { status: 400 });
  }
  // Bi-weekly: enforce 14-day period
  const daysDiff = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
  if (daysDiff < 13 || daysDiff > 14) {
    return NextResponse.json({ error: `Bi-weekly period must be 14 days (got ${daysDiff + 1})` }, { status: 400 });
  }

  // Check for overlap with existing periods for this tenant
  const existing = await prisma.payPeriod.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      OR: [
        { AND: [{ periodStart: { lte: periodStart } }, { periodEnd: { gte: periodStart } }] },
        { AND: [{ periodStart: { lte: periodEnd } }, { periodEnd: { gte: periodEnd } }] },
        { AND: [{ periodStart: { gte: periodStart } }, { periodEnd: { lte: periodEnd } }] },
      ],
    },
  });
  if (existing) {
    return NextResponse.json({ error: `Overlaps existing pay period (${existing.id})` }, { status: 409 });
  }

  const period = await prisma.payPeriod.create({
    data: {
      tenantId: ctx.tenant.id,
      periodStart,
      periodEnd,
      payDate,
      status: "DRAFT",
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json({ period });
}
