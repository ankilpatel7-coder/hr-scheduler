/**
 * Nevada — no state income tax.
 *
 * NV does NOT have:
 *   - State income tax (so no withholding from employees)
 *   - Local income tax
 *
 * NV DOES have (employer-side only, NOT withheld from paychecks):
 *   - Modified Business Tax (MBT) — 1.378% on wages over $50,000/quarter
 *     (general business; financial institutions higher). Filed quarterly by
 *     employer, not on individual paystubs.
 *   - State Unemployment Insurance (SUI) — variable rate, employer-paid.
 *
 * For paystub purposes: federal + FICA only. This file exists as a
 * placeholder so the dispatcher's switch statement is symmetric and future
 * NV-specific employer reporting has a place to live.
 *
 * SOURCES:
 *   - Nevada Department of Taxation (tax.nv.gov)
 *   - Nevada Revised Statutes Chapter 363B (MBT)
 */

export type NvWithholdingInput = {
  // Even though NV has no income tax, accept the same shape as other states
  // so the dispatcher can call uniformly.
  grossPayPerPeriod: number;
};

export function computeNevadaIncomeTax(_input: NvWithholdingInput): number {
  return 0;
}

export const NV_INFO = {
  hasIncomeTax: false,
  notes: "Nevada has no state income tax. Employer-side MBT and SUI not withheld.",
};
