/**
 * Generate paystubs for a pay period.
 *
 * POST /api/payroll/[id]/generate  → compute & store stubs for every active employee
 *
 * v12.4: per-employee state + pre-tax deductions.
 *   - Each employee's tax state comes from their primaryLocation.locState
 *     (falling back to tenant.state). This lets KY + NV employees share a
 *     single pay period.
 *   - Pre-tax 401(k) and Section 125 deductions are pulled from the employee
 *     profile.
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

  // Load employees + clock entries + YTD wages.
  // Include primaryLocation for per-employee state resolution + pre-tax fields.
  const employees = await prisma.user.findMany({
    where: {
      tenantId: ctx.tenant.id,
      role: { not: "ADMIN" },
      OR: [
        { active: true },
        {
          clockEntries: {
            some: {
              clockIn: { lte: period.periodEnd },
              OR: [
                { clockOut: null },
                { clockOut: { gte: period.periodStart } },
              ],
            },
          },
        },
      ],
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
      // v12.4 additions
      primaryLocationId: true,
      primaryLocation: { select: { id: true, locState: true } },
      localTaxJurisdiction: true,
      preTax401kPercent: true,
      preTax401kAmount: true,
      preTaxHealthPremium: true,
      preTaxHsaAmount: true,
      preTaxFsaAmount: true,
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

  // Resolve per-employee tax state: primaryLocation.locState → fallback tenant.state.
  const stubs = computePayPeriod({
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
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
      state: e.primaryLocation?.locState ?? ctx.tenant.state,
      localTaxJurisdiction: e.localTaxJurisdiction,
      preTax401kPercent: e.preTax401kPercent,
      preTax401kAmount: e.preTax401kAmount,
      preTaxHealthPremium: e.preTaxHealthPremium,
      preTaxHsaAmount: e.preTaxHsaAmount,
      preTaxFsaAmount: e.preTaxFsaAmount,
    })),
    clockEntries,
    ytdWagesBefore: ytdMap,
  });

  // Upsert stubs (replace any existing for this period)
  await prisma.$transaction([
    prisma.payStub.deleteMany({ where: { payPeriodId: period.id } }),
    ...stubs
      .filter((s) => s.grossPay > 0)
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
            // Pre-tax breakdown
            preTaxDeductions: s.preTaxDeductions,
            preTax401k: s.preTax401k,
            preTaxHealth: s.preTaxHealth,
            preTaxHsa: s.preTaxHsa,
            preTaxFsa: s.preTaxFsa,
            // Federal
            federalIncomeTax: s.federalIncomeTax,
            socialSecurityTax: s.socialSecurityTax,
            medicareTax: s.medicareTax,
            additionalMedicareTax: s.additionalMedicareTax,
            // State / local
            stateIncomeTax: s.stateIncomeTax,
            localIncomeTax: s.localIncomeTax,
            taxState: s.taxState as any,
            localTaxJurisdiction: s.localTaxJurisdiction,
            extraWithholding: s.extraWithholding,
            totalDeductions: s.totalDeductions,
            netPay: s.netPay,
            // W-4 snapshot
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
