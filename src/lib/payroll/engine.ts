/**
 * Payroll engine — computes paystubs for a pay period.
 *
 * Inputs:
 *   - Pay period (start/end dates)
 *   - List of employees with W-4 + wage settings
 *   - Clock entries for those employees within the period
 *   - Tenant state (for state tax routing)
 *
 * Output: PayStub data ready to insert into DB.
 *
 * Hours computation (FLSA-compliant):
 *   - Workweek = Sun 00:00 → Sat 23:59 (FLSA default; could be tenant-configurable later)
 *   - Per workweek: hours over 40 are overtime (1.5x)
 *   - Overtime is computed PER WORKWEEK, then summed across the pay period
 *
 * Tax flow (matches schema PayStub fields):
 *   regular + OT pay → grossPay
 *   grossPay → federal withholding, FICA, Medicare, state withholding
 *   gross - all deductions → netPay
 */

import { differenceInMinutes, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import {
  computeFederalIncomeTax,
  computeSocialSecurityTax,
  computeMedicareTax,
  computeAdditionalMedicareTax,
  type FilingStatus as FedFilingStatus,
} from "./federal";
import { computeKentuckyIncomeTax } from "./state-ky";

export type EmployeePayrollInput = {
  id: string;
  name: string;
  hourlyWage: number;
  filingStatus: FedFilingStatus;
  multipleJobsCheckbox: boolean;
  dependentsCredit: number;
  otherIncome: number;
  deductionsAdjustment: number;
  extraWithholding: number;
  kyExemptionsAllowance: number | null;
};

export type ClockEntryInput = {
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
};

export type StubComputation = {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  federalIncomeTax: number;
  socialSecurityTax: number;
  medicareTax: number;
  additionalMedicareTax: number;
  stateIncomeTax: number;
  localIncomeTax: number;
  preTaxDeductions: number;
  extraWithholding: number;
  totalDeductions: number;
  netPay: number;
  // For audit
  hoursPerWorkweek: { weekStart: string; hours: number }[];
};

export type PayPeriodInput = {
  periodStart: Date;
  periodEnd: Date;
  state: string; // USState enum value, e.g. "KY"
  employees: EmployeePayrollInput[];
  clockEntries: ClockEntryInput[];
  // YTD wages BEFORE this period (per employee), for SS cap + Additional Medicare threshold
  ytdWagesBefore: Map<string, number>;
};

/**
 * Sum minutes worked from clock entries within an interval.
 * Open clock entries (no clockOut) are treated as ending at periodEnd
 * (or now, whichever is earlier) — the user should close out open entries
 * before finalizing payroll.
 */
function sumMinutesInRange(entries: ClockEntryInput[], rangeStart: Date, rangeEnd: Date, fallbackEnd: Date): number {
  let total = 0;
  for (const e of entries) {
    const start = e.clockIn;
    const end = e.clockOut ?? fallbackEnd;
    // Clip to range
    const effectiveStart = start < rangeStart ? rangeStart : start;
    const effectiveEnd = end > rangeEnd ? rangeEnd : end;
    if (effectiveEnd > effectiveStart) {
      total += differenceInMinutes(effectiveEnd, effectiveStart);
    }
  }
  return total;
}

/**
 * Split hours into regular + overtime per workweek (FLSA: > 40 hrs/week is OT).
 * Returns separate sums plus a per-workweek breakdown for the audit log.
 */
function splitRegularOvertime(
  entries: ClockEntryInput[],
  periodStart: Date,
  periodEnd: Date,
): { regularHours: number; overtimeHours: number; perWeek: { weekStart: string; hours: number }[] } {
  // Find workweeks that overlap the pay period
  const weeks: { start: Date; end: Date }[] = [];
  let cursor = startOfWeek(periodStart, { weekStartsOn: 0 }); // Sunday
  while (cursor <= periodEnd) {
    weeks.push({
      start: cursor,
      end: endOfWeek(cursor, { weekStartsOn: 0 }),
    });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  let regularHours = 0;
  let overtimeHours = 0;
  const perWeek: { weekStart: string; hours: number }[] = [];

  for (const w of weeks) {
    // Clip the workweek to the pay period (in case the period starts/ends mid-week)
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
 * Compute paystubs for every employee in the pay period.
 * Returns one StubComputation per employee.
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

    const ytdBefore = input.ytdWagesBefore.get(emp.id) ?? 0;

    // Federal
    const federalIncomeTax = computeFederalIncomeTax({
      grossPayPerPeriod: grossPay,
      payFrequency: "BIWEEKLY",
      filingStatus: emp.filingStatus,
      multipleJobsCheckbox: emp.multipleJobsCheckbox,
      dependentsCredit: emp.dependentsCredit,
      otherIncome: emp.otherIncome,
      deductionsAdjustment: emp.deductionsAdjustment,
      extraWithholding: 0, // applied as separate line item below
    });
    const socialSecurityTax = computeSocialSecurityTax(grossPay, ytdBefore);
    const medicareTax = computeMedicareTax(grossPay);
    const additionalMedicareTax = computeAdditionalMedicareTax(grossPay, ytdBefore);

    // State
    let stateIncomeTax = 0;
    if (input.state === "KY") {
      stateIncomeTax = computeKentuckyIncomeTax({
        grossPayPerPeriod: grossPay,
        kyExemptionsAllowance: emp.kyExemptionsAllowance ?? 0,
      });
    }
    // For other states (TX/FL/etc with no income tax), stateIncomeTax stays 0.
    // Adding more states = new functions in lib/payroll/state-XX.ts + add a case here.

    const localIncomeTax = 0; // v12 doesn't compute local taxes
    const preTaxDeductions = 0; // v12 doesn't handle 401k/HSA/health
    const extraWithholding = roundCents(emp.extraWithholding);

    const totalDeductions = roundCents(
      federalIncomeTax + socialSecurityTax + medicareTax + additionalMedicareTax +
      stateIncomeTax + localIncomeTax + preTaxDeductions + extraWithholding
    );

    const netPay = roundCents(grossPay - totalDeductions);

    stubs.push({
      employeeId: emp.id,
      regularHours,
      overtimeHours,
      hourlyRate: emp.hourlyWage,
      regularPay,
      overtimePay,
      grossPay,
      federalIncomeTax,
      socialSecurityTax,
      medicareTax,
      additionalMedicareTax,
      stateIncomeTax,
      localIncomeTax,
      preTaxDeductions,
      extraWithholding,
      totalDeductions,
      netPay,
      hoursPerWorkweek: perWeek,
    });
  }

  return stubs;
}
