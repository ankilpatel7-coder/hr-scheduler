/**
 * Kentucky state income tax withholding (2026).
 *
 * KY has a flat income tax rate. Withholding formula (per KY DOR Withholding Tax Tables):
 *   1. Annualize gross wages.
 *   2. Subtract the annual standard deduction.
 *   3. Multiply by the flat rate.
 *   4. Subtract per-allowance credit (from K-4 form).
 *   5. Divide by pay periods to get per-period withholding.
 *
 * SOURCES (verify annually):
 *   - KY DOR Form K-4 (Employee's Withholding Exemption Certificate)
 *   - KY DOR 2026 Withholding Tax Tables (revenue.ky.gov, typically published December)
 *
 * KY 2026 figures (verify before relying):
 *   - Flat rate: 3.5% (HB 1 from 2025 session — DOWN from 4.0% in 2025)
 *   - Standard deduction: $3,370 (estimate; KY indexes annually for inflation)
 *   - No personal exemption (eliminated by 2018 reform)
 *
 * NO LOCAL TAXES handled here. Many KY localities (Louisville Metro, Lexington-Fayette, etc.)
 * have an Occupational License Tax. For v12 these are NOT calculated. If Greenreleaf operates
 * within such a locality, the calculator UNDERSTATES total withholding.
 */

const KY_RATE_2026 = 0.035;
const KY_STANDARD_DEDUCTION_2026 = 3_370;
const PERIODS_PER_YEAR_BIWEEKLY = 26;

export type KyWithholdingInput = {
  grossPayPerPeriod: number;
  // KY K-4 exemptions (not commonly used post-2018 reform; kept for completeness).
  // Each exemption typically reduces taxable wages by a small amount; for simplicity
  // we ignore unless > 0 and use a $2,690 per-exemption standard (verify with KY DOR).
  kyExemptionsAllowance: number;
};

export function computeKentuckyIncomeTax(input: KyWithholdingInput): number {
  const annualGross = input.grossPayPerPeriod * PERIODS_PER_YEAR_BIWEEKLY;

  // Subtract standard deduction
  let taxable = Math.max(0, annualGross - KY_STANDARD_DEDUCTION_2026);

  // Subtract per-exemption allowances (KY-specific; rarely used)
  if (input.kyExemptionsAllowance > 0) {
    const KY_EXEMPTION_VALUE = 2_690; // verify with KY DOR
    taxable = Math.max(0, taxable - input.kyExemptionsAllowance * KY_EXEMPTION_VALUE);
  }

  const annualTax = taxable * KY_RATE_2026;
  const perPeriodTax = annualTax / PERIODS_PER_YEAR_BIWEEKLY;

  return Math.round(perPeriodTax * 100) / 100;
}

export const KY_INFO = {
  rate: KY_RATE_2026,
  standardDeduction: KY_STANDARD_DEDUCTION_2026,
};
