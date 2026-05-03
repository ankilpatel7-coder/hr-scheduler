/**
 * Federal payroll tax calculations.
 *
 * SOURCES (verify annually — these change every January):
 *   - IRS Publication 15-T (2026): Federal Income Tax Withholding Methods, "Worksheet 1A — Percentage Method".
 *   - SSA wage base 2026: Social Security Administration COLA fact sheet.
 *   - Medicare rates: 26 USC § 3101.
 *
 * Implementation uses the Percentage Method (more accurate than Wage Bracket),
 * post-2020 W-4 design.
 *
 * IMPORTANT: These are 2026 rates as of best-available data. Verify against the
 * actual published IRS Pub 15-T before relying on output for tax filings.
 *
 * NOT INCLUDED (out of v12 scope):
 *   - Pre-2020 W-4 method (allowances)
 *   - Non-resident alien adjustments
 *   - Cumulative wage method
 *   - Annualized wage method
 */

export type FilingStatus =
  | "SINGLE"
  | "MARRIED_JOINT"
  | "MARRIED_SEPARATE"
  | "HEAD_OF_HOUSEHOLD";

export type PayFrequency = "BIWEEKLY"; // v12 only supports biweekly

// Number of pay periods per year, for converting per-period to annualized
const PERIODS_PER_YEAR: Record<PayFrequency, number> = { BIWEEKLY: 26 };

// 2026 Social Security wage base (verify with SSA — typically updates each Oct)
export const SS_WAGE_BASE_2026 = 176_100;
export const SS_RATE = 0.062;

export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD = 200_000;

/**
 * 2026 IRS Pub 15-T Worksheet 1A — Percentage Method tables.
 * STANDARD W-4 (Step 2 box NOT checked).
 *
 * Each entry: [bracketTopAnnualWage, baseTax, marginalRate, bracketStart]
 * Wages above the top of the highest bracket use that bracket's marginal rate.
 *
 * NOTE: These figures are 2026 estimates based on 2025 inflation adjustments
 * (IRS Rev. Proc. 2024-40 + ~2.7% projected). VERIFY against actual IRS Pub 15-T
 * for 2026 once published (typically December 2025).
 */
type Bracket = { upTo: number; baseTax: number; rate: number; bracketStart: number };

const FED_BRACKETS_STANDARD: Record<FilingStatus, Bracket[]> = {
  SINGLE: [
    { upTo: 6_400,    baseTax: 0,         rate: 0.00, bracketStart: 0 },
    { upTo: 18_325,   baseTax: 0,         rate: 0.10, bracketStart: 6_400 },
    { upTo: 53_775,   baseTax: 1_192.50,  rate: 0.12, bracketStart: 18_325 },
    { upTo: 106_525,  baseTax: 5_446.50,  rate: 0.22, bracketStart: 53_775 },
    { upTo: 197_950,  baseTax: 17_051.50, rate: 0.24, bracketStart: 106_525 },
    { upTo: 249_725,  baseTax: 38_993.50, rate: 0.32, bracketStart: 197_950 },
    { upTo: 615_350,  baseTax: 55_561.50, rate: 0.35, bracketStart: 249_725 },
    { upTo: Infinity, baseTax: 183_647.25, rate: 0.37, bracketStart: 615_350 },
  ],
  MARRIED_JOINT: [
    { upTo: 17_400,   baseTax: 0,         rate: 0.00, bracketStart: 0 },
    { upTo: 41_250,   baseTax: 0,         rate: 0.10, bracketStart: 17_400 },
    { upTo: 112_150,  baseTax: 2_385,     rate: 0.12, bracketStart: 41_250 },
    { upTo: 217_650,  baseTax: 10_893,    rate: 0.22, bracketStart: 112_150 },
    { upTo: 400_500,  baseTax: 34_103,    rate: 0.24, bracketStart: 217_650 },
    { upTo: 504_050,  baseTax: 77_987,    rate: 0.32, bracketStart: 400_500 },
    { upTo: 740_650,  baseTax: 111_123,   rate: 0.35, bracketStart: 504_050 },
    { upTo: Infinity, baseTax: 193_933,   rate: 0.37, bracketStart: 740_650 },
  ],
  MARRIED_SEPARATE: [
    { upTo: 6_400,    baseTax: 0,         rate: 0.00, bracketStart: 0 },
    { upTo: 18_325,   baseTax: 0,         rate: 0.10, bracketStart: 6_400 },
    { upTo: 53_775,   baseTax: 1_192.50,  rate: 0.12, bracketStart: 18_325 },
    { upTo: 106_525,  baseTax: 5_446.50,  rate: 0.22, bracketStart: 53_775 },
    { upTo: 197_950,  baseTax: 17_051.50, rate: 0.24, bracketStart: 106_525 },
    { upTo: 249_725,  baseTax: 38_993.50, rate: 0.32, bracketStart: 197_950 },
    { upTo: 367_900,  baseTax: 55_561.50, rate: 0.35, bracketStart: 249_725 },
    { upTo: Infinity, baseTax: 96_922.75, rate: 0.37, bracketStart: 367_900 },
  ],
  HEAD_OF_HOUSEHOLD: [
    { upTo: 13_700,   baseTax: 0,         rate: 0.00, bracketStart: 0 },
    { upTo: 30_175,   baseTax: 0,         rate: 0.10, bracketStart: 13_700 },
    { upTo: 78_750,   baseTax: 1_647.50,  rate: 0.12, bracketStart: 30_175 },
    { upTo: 117_250,  baseTax: 7_476.50,  rate: 0.22, bracketStart: 78_750 },
    { upTo: 208_700,  baseTax: 15_946.50, rate: 0.24, bracketStart: 117_250 },
    { upTo: 260_500,  baseTax: 37_894.50, rate: 0.32, bracketStart: 208_700 },
    { upTo: 626_125,  baseTax: 54_470.50, rate: 0.35, bracketStart: 260_500 },
    { upTo: Infinity, baseTax: 182_439.25, rate: 0.37, bracketStart: 626_125 },
  ],
};

// Multiple Jobs (Step 2c on W-4): use a different table with halved bracket widths
// effectively. Implementation: scale the brackets but keep the percentage method intact.
// IRS provides a separate table for this — for v12 we approximate by treating it as
// if filing status were one bracket "tighter" — DOCUMENT this caveat.
// TODO: implement IRS Pub 15-T Worksheet 1B (Step 2 checkbox) tables for full accuracy.

export type FedWithholdingInput = {
  grossPayPerPeriod: number;
  payFrequency: PayFrequency;
  filingStatus: FilingStatus;
  multipleJobsCheckbox: boolean;
  dependentsCredit: number;          // W-4 step 3 (annual $)
  otherIncome: number;                // W-4 step 4a (annual $)
  deductionsAdjustment: number;       // W-4 step 4b (annual $ above standard)
  extraWithholding: number;           // W-4 step 4c (per-period $)
};

/**
 * Compute federal income tax withholding for a single pay period.
 * Implements IRS Pub 15-T Worksheet 1A.
 */
export function computeFederalIncomeTax(input: FedWithholdingInput): number {
  const periods = PERIODS_PER_YEAR[input.payFrequency];

  // Step 1: Annualize the gross + add other income
  const annualWages = input.grossPayPerPeriod * periods + input.otherIncome;

  // Step 2: Subtract deductions adjustment
  // (Does NOT subtract standard deduction — that's already baked into the bracket starts above.)
  const adjusted = Math.max(0, annualWages - input.deductionsAdjustment);

  // Step 3: Apply bracket lookup
  const brackets = FED_BRACKETS_STANDARD[input.filingStatus];
  let tentativeAnnualTax = 0;
  for (const b of brackets) {
    if (adjusted <= b.upTo) {
      tentativeAnnualTax = b.baseTax + (adjusted - b.bracketStart) * b.rate;
      break;
    }
  }

  // Step 4: Subtract tax credits (dependents)
  const annualTaxAfterCredits = Math.max(0, tentativeAnnualTax - input.dependentsCredit);

  // Step 5: Divide back to per-period
  let perPeriodTax = annualTaxAfterCredits / periods;

  // Step 6: Add extra withholding from W-4 step 4c
  perPeriodTax += input.extraWithholding;

  // Multiple jobs adjustment (very rough — see TODO above)
  if (input.multipleJobsCheckbox) {
    // For accuracy, we'd use Worksheet 1B's table. As an approximation,
    // increase withholding by ~15% to err on the side of over-withholding
    // (which results in a larger refund — preferable to underpayment penalty).
    perPeriodTax *= 1.15;
  }

  return roundCents(Math.max(0, perPeriodTax));
}

/**
 * Social Security tax — 6.2% of gross, capped at SS_WAGE_BASE_2026 per year.
 * Caller must pass YTD wages BEFORE this period to enforce the cap correctly.
 */
export function computeSocialSecurityTax(grossPayPerPeriod: number, ytdWagesBefore: number): number {
  const remainingTaxable = Math.max(0, SS_WAGE_BASE_2026 - ytdWagesBefore);
  const taxable = Math.min(grossPayPerPeriod, remainingTaxable);
  return roundCents(taxable * SS_RATE);
}

/**
 * Medicare tax — 1.45% of gross, no cap.
 */
export function computeMedicareTax(grossPayPerPeriod: number): number {
  return roundCents(grossPayPerPeriod * MEDICARE_RATE);
}

/**
 * Additional Medicare — 0.9% on YTD wages over $200k.
 * Employer is required to withhold this; the employee may owe more or get refund at year-end.
 */
export function computeAdditionalMedicareTax(grossPayPerPeriod: number, ytdWagesBefore: number): number {
  const ytdAfter = ytdWagesBefore + grossPayPerPeriod;
  if (ytdAfter <= ADDITIONAL_MEDICARE_THRESHOLD) return 0;
  const taxableThisPeriod = Math.min(
    grossPayPerPeriod,
    ytdAfter - ADDITIONAL_MEDICARE_THRESHOLD
  );
  return roundCents(taxableThisPeriod * ADDITIONAL_MEDICARE_RATE);
}

function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}
