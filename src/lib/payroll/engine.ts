/**
 * Payroll engine — computes paystubs for a pay period.
 *
 * v12.4 changes vs v12.0:
 *   - Per-EMPLOYEE tax state (not per-period). An employee's state comes from
 *     their primaryLocation.locState (or tenant.state fallback). This lets a
 *     single tenant run payroll for KY + NV employees in the same period.
 *   - Pre-tax deductions: 401(k) traditional, Section 125 (health/HSA/FSA).
 *   - Local tax dispatcher (Louisville Metro 2.2% occupational tax).
 *
 * Hours computation (FLSA-compliant):
 *   - Workweek = Sun 00:00 → Sat 23:59 (FLSA default)
 *   - Per workweek: hours over 40 are overtime (1.5x)
 *   - Overtime is computed PER WORKWEEK, then summed across the pay period
 *
 * Tax flow (order matters — pre-tax deductions reduce different bases):
 *   1. grossPay = regularPay + overtimePay
 *   2. preTax401k → reduces FEDERAL + STATE taxable wages (NOT FICA)
 *   3. Section 125 (health + HSA + FSA) → reduces FED + FICA + STATE
 *   4. Federal withholding computed on (gross - 401k - section125)
 *   5. FICA (SS + Medicare) computed on (gross - section125)
 *   6. State withholding computed on (gross - 401k - section125) [KY follows fed]
 *   7. Local tax computed on gross (Louisville Metro doesn't honor pre-tax)
 *   8. netPay = gross - all deductions
 */

import { differenceInMinutes, startOfWeek, endOfWeek } from "date-fns";
import {
  computeFederalIncomeTax,
  computeSocialSecurityTax,
  computeMedicareTax,
  computeAdditionalMedicareTax,
  type FilingStatus as FedFilingStatus,
} from "./federal";
import { computeStateIncomeTax } from "./state-dispatch";
import { computeLocalIncomeTax } from "./local-tax";

export type EmployeePayrollInput = {
  id: string;
  name: string;
  hourlyWage: number;

  // Federal W-4
  filingStatus: FedFilingStatus;
  multipleJobsCheckbox: boolean;
  dependentsCredit: number;
  otherIncome: number;
  deductionsAdjustment: number;
  extraWithholding: number;

  // State / local (per-employee — v12.4)
  state: string;                          // USState enum value, e.g. "KY", "NV"
  localTaxJurisdiction: string | null;    // e.g. "LOUISVILLE_METRO"
  kyExemptionsAllowance: number | null;   // KY K-4

  // Pre-tax deductions (per pay period)
  preTax401kPercent: number;              // 0-100 (takes precedence over amount if > 0)
  preTax401kAmount: number;
  preTaxHealthPremium: number;
  preTaxHsaAmount: number;
  preTaxFsaAmount: number;
};

export type ClockEntryInput = {
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  // Optional breaks taken within this clock entry. MEAL_30 + OTHER
  // are deducted from worked hours (unpaid). SHORT_15 stays paid.
  breaks?: { breakStart: Date; breakEnd: Date | null; breakType: "SHORT_15" | "MEAL_30" | "OTHER" }[];
};

export type StubComputation = {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;

  // Pre-tax breakdown
  preTax401k: number;
  preTaxHealth: number;
  preTaxHsa: number;
  preTaxFsa: number;
  preTaxDeductions: number;        // sum of the four above

  // Federal
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  additionalMedicareTax: number;

  // State / local
  stateIncomeTax: number;
  localIncomeTax: number;
  taxState: string;                // recorded for audit
  localTaxJurisdiction: string | null;

  extraWithholding: number;
  totalDeductions: number;
  netPay: number;

  // For audit
  hoursPerWorkweek: { weekStart: string; hours: number }[];
};

export type PayPeriodInput = {
  periodStart: Date;
  periodEnd: Date;
  employees: EmployeePayrollInput[];
  clockEntries: ClockEntryInput[];
  // YTD wages BEFORE this period (per employee), for SS cap + Additional Medicare threshold
  ytdWagesBefore: Map<string, number>;
};

function sumMinutesInRange(entries: ClockEntryInput[], rangeStart: Date, rangeEnd: Date, fallbackEnd: Date): number {
  // MS_PRECISION_V1 — uses millisecond-accurate float math so payroll
  // totals match the timesheet pivot view exactly. Old version used
  // date-fns differenceInMinutes which truncated seconds, causing tiny
  // drift between payroll and timesheets.
  let total = 0;
  for (const e of entries) {
    const start = e.clockIn;
    const end = e.clockOut ?? fallbackEnd;
    const effectiveStart = start < rangeStart ? rangeStart : start;
    const effectiveEnd = end > rangeEnd ? rangeEnd : end;
    if (effectiveEnd > effectiveStart) {
      total += (effectiveEnd.getTime() - effectiveStart.getTime()) / 60000;
      // Subtract overlapping UNPAID break minutes (MEAL_30 + OTHER).
      // SHORT_15 stays in (paid by convention).
      let unpaidBreakMinutes = 0;
      for (const b of e.breaks ?? []) {
        if (b.breakType === "SHORT_15") continue;
        if (!b.breakEnd) continue;
        const bs = b.breakStart < effectiveStart ? effectiveStart : b.breakStart;
        const be = b.breakEnd > effectiveEnd ? effectiveEnd : b.breakEnd;
        if (be > bs) unpaidBreakMinutes += (be.getTime() - bs.getTime()) / 60000;
      }
      total = Math.max(0, total - unpaidBreakMinutes);
    }
  }
  return total;
}

function splitRegularOvertime(
  entries: ClockEntryInput[],
  periodStart: Date,
  periodEnd: Date,
): { regularHours: number; overtimeHours: number; perWeek: { weekStart: string; hours: number }[] } {
  const weeks: { start: Date; end: Date }[] = [];
  let cursor = startOfWeek(periodStart, { weekStartsOn: 0 });
  while (cursor <= periodEnd) {
    weeks.push({ start: cursor, end: endOfWeek(cursor, { weekStartsOn: 0 }) });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  const perWeek: { weekStart: string; hours: number }[] = [];

  for (const w of weeks) {
    const clippedStart = w.start < periodStart ? periodStart : w.start;
    const clippedEnd = w.end > periodEnd ? periodEnd : w.end;

    const minutes = sumMinutesInRange(entries, clippedStart, clippedEnd, periodEnd);
    const hours = minutes / 60;

    perWeek.push({ weekStart: w.start.toISOString().slice(0, 10), hours: roundHours(hours) });

    if (hours > 40) {
      regularHours += 40;
      overtimeHours += hours - 40;
    } else {
      regularHours += hours;
    }
  }

  return {
    regularHours: roundHours(regularHours),
    overtimeHours: roundHours(overtimeHours),
    perWeek,
  };
}

function roundHours(h: number): number {
  return Math.round(h * 100) / 100;
}
function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Resolve the actual 401(k) per-period deduction:
 * - If percent > 0: percent * gross
 * - Else if amount > 0: amount (capped at gross)
 * - Else: 0
 */
function compute401kDeduction(grossPay: number, percent: number, amount: number): number {
  if (percent > 0) {
    return roundCents(grossPay * (percent / 100));
  }
  if (amount > 0) {
    return roundCents(Math.min(amount, grossPay));
  }
  return 0;
}

/**
 * Compute paystubs for every employee in the pay period.
 */
export function computePayPeriod(input: PayPeriodInput): StubComputation[] {
  const stubs: StubComputation[] = [];

  for (const emp of input.employees) {
    const empEntries = input.clockEntries.filter((e) => e.userId === emp.id);

    const { regularHours, overtimeHours, perWeek } = splitRegularOvertime(
      empEntries,
      input.periodStart,
      input.periodEnd,
    );

    const regularPay = roundCents(regularHours * emp.hourlyWage);
    const overtimePay = roundCents(overtimeHours * emp.hourlyWage * 1.5);
    const grossPay = roundCents(regularPay + overtimePay);

    // ─── Pre-tax deductions ───
    const preTax401k = compute401kDeduction(grossPay, emp.preTax401kPercent, emp.preTax401kAmount);
    const preTaxHealth = roundCents(emp.preTaxHealthPremium);
    const preTaxHsa = roundCents(emp.preTaxHsaAmount);
    const preTaxFsa = roundCents(emp.preTaxFsaAmount);
    const section125 = roundCents(preTaxHealth + preTaxHsa + preTaxFsa);
    const preTaxDeductions = roundCents(preTax401k + section125);

    // Taxable bases
    const federalTaxableWages = roundCents(grossPay - preTax401k - section125);
    const ficaTaxableWages = roundCents(grossPay - section125);          // 401k does NOT reduce FICA
    const stateTaxableWages = federalTaxableWages;                       // KY follows federal; NV doesn't tax

    const ytdBefore = input.ytdWagesBefore.get(emp.id) ?? 0;

    // Federal
    const federalIncomeTax = computeFederalIncomeTax({
      grossPayPerPeriod: federalTaxableWages,
      payFrequency: "BIWEEKLY",
      filingStatus: emp.filingStatus,
      multipleJobsCheckbox: emp.multipleJobsCheckbox,
      dependentsCredit: emp.dependentsCredit,
      otherIncome: emp.otherIncome,
      deductionsAdjustment: emp.deductionsAdjustment,
      extraWithholding: 0,
    });
    const socialSecurityTax = computeSocialSecurityTax(ficaTaxableWages, ytdBefore);
    const medicareTax = computeMedicareTax(ficaTaxableWages);
    const additionalMedicareTax = computeAdditionalMedicareTax(ficaTaxableWages, ytdBefore);

    // State (per-employee dispatcher)
    const stateIncomeTax = computeStateIncomeTax(emp.state, {
      stateTaxableWages,
      kyExemptionsAllowance: emp.kyExemptionsAllowance ?? 0,
    });

    // Local (Louisville Metro applies to gross — does NOT honor pre-tax 401k or Section 125;
    // verify against actual paystub before relying)
    const localIncomeTax = computeLocalIncomeTax(emp.localTaxJurisdiction, grossPay);

    const extraWithholding = roundCents(emp.extraWithholding);

    const totalDeductions = roundCents(
      preTaxDeductions +
      federalIncomeTax + socialSecurityTax + medicareTax + additionalMedicareTax +
      stateIncomeTax + localIncomeTax + extraWithholding,
    );

    const netPay = roundCents(grossPay - totalDeductions);

    stubs.push({
      employeeId: emp.id,
      regularHours, overtimeHours, hourlyRate: emp.hourlyWage,
      regularPay, overtimePay, grossPay,
      preTax401k, preTaxHealth, preTaxHsa, preTaxFsa, preTaxDeductions,
      federalIncomeTax, socialSecurityTax, medicareTax, additionalMedicareTax,
      stateIncomeTax, localIncomeTax,
      taxState: emp.state,
      localTaxJurisdiction: emp.localTaxJurisdiction,
      extraWithholding,
      totalDeductions, netPay,
      hoursPerWorkweek: perWeek,
    });
  }

  return stubs;
}
