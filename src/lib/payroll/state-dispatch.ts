/**
 * State income tax dispatcher.
 *
 * Adding a new state:
 *   1. Create src/lib/payroll/state-XX.ts with a `computeXxIncomeTax(input)` fn
 *   2. Add a `case "XX": return computeXxIncomeTax(...)` here
 *   3. Update STATES_WITH_INCOME_TAX if needed
 *
 * States with NO income tax (return 0): AK, FL, NV, NH, SD, TN, TX, WA, WY
 */

import { computeKentuckyIncomeTax } from "./state-ky";

export type StateTaxInput = {
  stateTaxableWages: number;     // already adjusted for pre-tax 401k + Section 125
  kyExemptionsAllowance: number; // KY-specific; ignored for other states
};

const NO_INCOME_TAX_STATES = new Set([
  "AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY",
]);

export function computeStateIncomeTax(state: string, input: StateTaxInput): number {
  if (NO_INCOME_TAX_STATES.has(state)) return 0;

  switch (state) {
    case "KY":
      return computeKentuckyIncomeTax({
        grossPayPerPeriod: input.stateTaxableWages,
        kyExemptionsAllowance: input.kyExemptionsAllowance,
      });
    // Future: case "CA": case "NY": etc.
    default:
      // Unimplemented state — return 0 and warn in dev. In production this
      // would understate withholding; payroll UI should refuse to finalize
      // a period containing employees in states without a calculator.
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[payroll] No state tax calculator for ${state}; returning 0`);
      }
      return 0;
  }
}

/**
 * Returns true if we have a tax calculator (or confirmed no-tax) for the state.
 * UI uses this to block finalization for unsupported states.
 */
export function isStateSupported(state: string): boolean {
  if (NO_INCOME_TAX_STATES.has(state)) return true;
  return state === "KY";
}
