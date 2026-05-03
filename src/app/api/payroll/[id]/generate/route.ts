/**
 * Generate paystubs for a pay period.
 *
 * POST /api/payroll/[id]/generate  → compute & store stubs for every active employee
 *
 * Idempotent: re-running re-computes and overwrites stubs (only allowed if status=DRAFT).
 * Once finalized, stubs are immutable.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenantContext } from "@/lib/tenant";
import { computePayPeriod } from "@/lib/payroll/engine";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireTenantContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.role !== "ADMIN" && !ctx.isSuperAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const period = await prisma.payPeriod.findUnique({
    where: { id: params.id },
  });
  if (!period || period.tenantId !== ctx.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (period.status !== "DRAFT") {
    return NextResponse.json({ error: "Cannot regenerate stubs for a finalized period" }, { status: 409 });
  }

  // Load employees + clock entries + YTD wages (for SS cap & Additional Medicare)
  const employees = await prisma.user.findMany({
    where: {
      tenantId: ctx.tenant.id,
      active: true,
      role: { not: "ADMIN" }, // typical: don't pay admins; flip if needed
    },
    select: {
      id: true,
      name: true,
      hourlyWage: true,
      filingStatus: true,
      multipleJobsCheckbox: true,
      dependentsCredit: true,
      otherIncome: true,
      deductionsAdjustment: true,
      extraWithholding: true,
      kyExemptionsAllowance: true,
    },
  });

  const empIds = employees.map((e) => e.id);

  const clockEntries = await prisma.clockEntry.findMany({
    where: {
      userId: { in: empIds },
      clockIn: { lte: period.periodEnd },
      OR: [{ clockOut: null }, { clockOut: { gte: period.periodStart } }],
    },
    select: { userId: true, clockIn: true, clockOut: true },
  });

  // YTD wages = sum of grossPay from finalized stubs in same calendar year, before this period
  const periodYear = period.periodStart.getFullYear();
  const yearStart = new Date(periodYear, 0, 1);
  const ytdStubs = await prisma.payStub.findMany({
    where: {
      employeeId: { in: empIds },
      payPeriod: {
        tenantId: ctx.tenant.id,
        periodEnd: { lt: period.periodStart, gte: yearStart },
        status: "FINALIZED",
      },
    },
    select: { employeeId: true, grossPay: true },
  });
  const ytdMap = new Map<string, number>();
  for (const s of ytdStubs) {
    ytdMap.set(s.employeeId, (ytdMap.get(s.employeeId) ?? 0) + s.grossPay);
  }

  // Compute stubs
  const stubs = computePayPeriod({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    state: ctx.tenant.state,
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      hourlyWage: e.hourlyWage,
      filingStatus: e.filingStatus as any,
      multipleJobsCheckbox: e.multipleJobsCheckbox,
      dependentsCredit: e.dependentsCredit,
      otherIncome: e.otherIncome,
      deductionsAdjustment: e.deductionsAdjustment,
      extraWithholding: e.extraWithholding,
      kyExemptionsAllowance: e.kyExemptionsAllowance,
    })),
    clockEntries,
    ytdWagesBefore: ytdMap,
  });

  // Upsert stubs (replace any existing for this period)
  await prisma.$transaction([
    prisma.payStub.deleteMany({ where: { payPeriodId: period.id } }),
    ...stubs
      .filter((s) => s.grossPay > 0) // skip employees with zero hours
      .map((s) => {
        const emp = employees.find((e) => e.id === s.employeeId)!;
        return prisma.payStub.create({
          data: {
            payPeriodId: period.id,
            employeeId: s.employeeId,
            regularHours: s.regularHours,
            overtimeHours: s.overtimeHours,
            hourlyRate: s.hourlyRate,
            regularPay: s.regularPay,
            overtimePay: s.overtimePay,
            grossPay: s.grossPay,
            federalIncomeTax: s.federalIncomeTax,
            socialSecurityTax: s.socialSecurityTax,
            medicareTax: s.medicareTax,
            additionalMedicareTax: s.additionalMedicareTax,
            stateIncomeTax: s.stateIncomeTax,
            localIncomeTax: s.localIncomeTax,
            preTaxDeductions: s.preTaxDeductions,
            extraWithholding: s.extraWithholding,
            totalDeductions: s.totalDeductions,
            netPay: s.netPay,
            filingStatusSnapshot: emp.filingStatus as any,
            multipleJobsCheckboxSnapshot: emp.multipleJobsCheckbox,
            dependentsCreditSnapshot: emp.dependentsCredit,
            otherIncomeSnapshot: emp.otherIncome,
            deductionsAdjustmentSnapshot: emp.deductionsAdjustment,
          },
        });
      }),
  ]);

  return NextResponse.json({ generated: stubs.length, periodId: period.id });
}
