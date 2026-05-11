/**
 * Local (city/county/municipal) income tax dispatcher.
 *
 * Adding a new local jurisdiction:
 *   1. Add a `case "JURISDICTION_CODE": return ...` here
 *   2. Document rate + base in the comment
 *   3. (Optional) seed it as an option in the employee profile UI
 *
 * Convention: codes are SHOUT_SNAKE_CASE, e.g. LOUISVILLE_METRO,
 * LEXINGTON_FAYETTE, NYC_RESIDENT.
 */

export type LocalTaxInput = {
  // gross pay for the period — most local taxes apply to gross without
  // honoring federal pre-tax deductions (Louisville Metro is one such case).
  grossPay: number;
};

/**
 * Louisville/Jefferson County Metro Government Occupational License Tax.
 *
 * Rate: 2.20% of gross compensation paid to employees working within
 *       Louisville Metro (Jefferson County, KY).
 * Base: Gross wages — Louisville does NOT honor federal Section 125 or
 *       401(k) pre-tax exclusions. Verify against actual paystubs.
 * Source: Louisville Metro Revenue Commission Form OL-D, Section 110.
 *
 * NOTE: There's also a 0.75% transit tax (TARC) folded into the 2.20% by
 * most withholding setups. If your prior provider broke them out separately,
 * we can split this into two line items.
 */
const LOUISVILLE_METRO_RATE = 0.0220;

export function computeLocalIncomeTax(
  jurisdiction: string | null,
  grossPay: number,
): number {
  if (!jurisdiction) return 0;
  switch (jurisdiction) {
    case "LOUISVILLE_METRO":
      return Math.round(grossPay * LOUISVILLE_METRO_RATE * 100) / 100;
    // Future Kentucky cities (each has its own rate):
    //   case "LEXINGTON_FAYETTE": return ... (2.25% as of 2025)
    //   case "BOONE_COUNTY":      return ... (0.80% capped)
    //   case "KENTON_COUNTY":     return ... (~0.7097% with cap)
    default:
      return 0;
  }
}

/**
 * Human-readable display label for a jurisdiction code.
 */
export function localTaxLabel(jurisdiction: string | null): string {
  if (!jurisdiction) return "";
  switch (jurisdiction) {
    case "LOUISVILLE_METRO":
      return "Louisville/Jefferson Co. Occupational Tax (2.20%)";
    default:
      return jurisdiction;
  }
}

/**
 * List of all supported local jurisdictions for the employee-profile dropdown.
 */
export const LOCAL_TAX_JURISDICTIONS: { code: string; label: string; state: string }[] = [
  { code: "LOUISVILLE_METRO", label: "Louisville/Jefferson Co. (2.20%)", state: "KY" },
];
