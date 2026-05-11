/**
 * Year-end payroll aggregations: W-2 box values per employee + Form 941
 * line values per quarter.
 *
 * Source of truth: PayStub rows where the parent PayPeriod.status = "FINALIZED".
 * Draft periods are intentionally excluded — they shouldn't affect tax filings
 * until the admin finalizes them.
 *
 * IMPORTANT box semantics (W-2):
 *   Box 1  (Wages, tips)        = grossPay - preTax401k - section125
 *   Box 2  (Federal IT W/H)     = federalIncomeTax (+ extraWithholding)
 *   Box 3  (SS wages)           = (grossPay - section125) capped at SS_WAGE_BASE
 *   Box 4  (SS tax W/H)         = socialSecurityTax
 *   Box 5  (Medicare wages)     = grossPay - section125 (no cap)
 *   Box 6  (Medicare tax W/H)   = medicareTax + additionalMedicareTax
 *   Box 12 codes:
 *     D  = preTax401k (traditional 401(k) contribution)
 *     W  = preTaxHsa (HSA via cafeteria plan)
 *     DD = preTaxHealth (employer-sponsored health coverage value, INFORMATIONAL —
 *          we approximate as the employee's premium contribution; a full impl
 *          would also include the employer share)
 *   Box 14 (Other)              = currently empty; future: union dues, etc.
 *   Box 16 (State wages)        = grossPay - preTax401k - section125 (KY follows fed)
 *   Box 17 (State IT W/H)       = stateIncomeTax
 *   Box 18 (Local wages)        = grossPay (Louisville Metro doesn't honor pre-tax)
 *   Box 19 (Local IT W/H)       = localIncomeTax
 *   Box 20 (Locality name)      = derived from localTaxJurisdiction code
 *
 * IMPORTANT line semantics (Form 941):
 *   Line 1  (# employees)       = headcount on the last pay period of quarter
 *   Line 2  (Total wages, tips) = sum of Box 1 across employees
 *   Line 3  (Federal IT W/H)    = sum of Box 2 across employees
 *   Line 5a (SS wages × 12.4%)  = sum of Box 3 × 0.124 (employer + employee combined)
 *   Line 5c (Medicare × 2.9%)   = sum of Box 5 × 0.029
 *   Line 5d (Add'l Medicare)    = sum of additionalMedicareTax × 1 (employee only;
 *                                 employer doesn't owe matching add'l Medicare)
 *   Line 6  (Total taxes)       = line 3 + 5a + 5c + 5d
 */

import { prisma } from "@/lib/db";
import { SS_WAGE_BASE_2026 } from "@/lib/payroll/federal";
import { localTaxLabel } from "@/lib/payroll/local-tax";

// ───────────────────────────────────────────────────────────────────────────
// W-2 (per employee per year)
// ───────────────────────────────────────────────────────────────────────────

export type W2Data = {
  employeeId: string;
  employeeName: string;
  year: number;

  // Earnings
  box1_wages: number;
  box2_federalIncomeTax: number;
  box3_ssWages: number;
  box4_ssTax: number;
  box5_medicareWages: number;
  box6_medicareTax: number;

  // Box 12 codes
  box12_D_401kTraditional: number;
  box12_W_hsa: number;
  box12_DD_employerHealthCoverage: number;

  // State
  box15_state: string | null;
  box16_stateWages: number;
  box17_stateIncomeTax: number;

  // Local
  box18_localWages: number;
  box19_localIncomeTax: number;
  box20_localityName: string | null;

  // Audit / source
  stubCount: number;
  finalizedStubCount: number;
  hasDraftStubs: boolean;
};

export async function computeW2Data(
  tenantId: string,
  employeeId: string,
  year: number,
): Promise<W2Data | null> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const employee = await prisma.user.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true, name: true, primaryLocation: { select: { locState: true } } },
  });
  if (!employee) return null;

  // All stubs in year for this employee, regardless of finalize status (used
  // to flag draft warnings).
  const allStubs = await prisma.payStub.findMany({
    where: {
      employeeId,
      payPeriod: {
        tenantId,
        periodStart: { gte: yearStart, lt: yearEnd },
      },
    },
    select: {
      grossPay: true,
      federalIncomeTax: true,
      socialSecurityTax: true,
      medicareTax: true,
      additionalMedicareTax: true,
      stateIncomeTax: true,
      localIncomeTax: true,
      preTax401k: true,
      preTaxHealth: true,
      preTaxHsa: true,
      preTaxFsa: true,
      extraWithholding: true,
      taxState: true,
      localTaxJurisdiction: true,
      payPeriod: { select: { status: true } },
    },
  });

  const finalized = allStubs.filter((s) => s.payPeriod.status === "FINALIZED");
  const draftCount = allStubs.length - finalized.length;

  // Aggregate
  let grossSum = 0;
  let federalIT = 0;
  let extraWH = 0;
  let ssWagesUncapped = 0;
  let ssTax = 0;
  let medicareWages = 0;
  let medicareTax = 0;
  let additionalMedicare = 0;
  let stateIT = 0;
  let localIT = 0;
  let pretax401k = 0;
  let pretaxHealth = 0;
  let pretaxHsa = 0;
  let pretaxFsa = 0;

  let taxState: string | null = null;
  let localTaxJurisdiction: string | null = null;

  for (const s of finalized) {
    const section125 = s.preTaxHealth + s.preTaxHsa + s.preTaxFsa;
    grossSum += s.grossPay;
    federalIT += s.federalIncomeTax;
    extraWH += s.extraWithholding;
    ssWagesUncapped += s.grossPay - section125;
    ssTax += s.socialSecurityTax;
    medicareWages += s.grossPay - section125;
    medicareTax += s.medicareTax;
    additionalMedicare += s.additionalMedicareTax;
    stateIT += s.stateIncomeTax;
    localIT += s.localIncomeTax;
    pretax401k += s.preTax401k;
    pretaxHealth += s.preTaxHealth;
    pretaxHsa += s.preTaxHsa;
    pretaxFsa += s.preTaxFsa;
    if (!taxState && s.taxState) taxState = s.taxState;
    if (!localTaxJurisdiction && s.localTaxJurisdiction) {
      localTaxJurisdiction = s.localTaxJurisdiction;
    }
  }

  const section125Total = pretaxHealth + pretaxHsa + pretaxFsa;

  const box1 = grossSum - pretax401k - section125Total;
  const box3 = Math.min(ssWagesUncapped, SS_WAGE_BASE_2026);
  const box5 = medicareWages;
  const box16 = box1; // KY follows federal
  const box18 = grossSum; // Louisville Metro doesn't honor pre-tax

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    year,

    box1_wages: round(box1),
    box2_federalIncomeTax: round(federalIT + extraWH),
    box3_ssWages: round(box3),
    box4_ssTax: round(ssTax),
    box5_medicareWages: round(box5),
    box6_medicareTax: round(medicareTax + additionalMedicare),

    box12_D_401kTraditional: round(pretax401k),
    box12_W_hsa: round(pretaxHsa),
    // DD is informational and represents employer health coverage value.
    // We don't track employer share separately — surface employee premium
    // as a placeholder. A real impl would add the employer-paid portion.
    box12_DD_employerHealthCoverage: round(pretaxHealth),

    box15_state: taxState ?? employee.primaryLocation?.locState ?? null,
    box16_stateWages: round(box16),
    box17_stateIncomeTax: round(stateIT),

    box18_localWages: localTaxJurisdiction ? round(box18) : 0,
    box19_localIncomeTax: round(localIT),
    box20_localityName: localTaxJurisdiction
      ? localTaxLabel(localTaxJurisdiction).split(" (")[0]
      : null,

    stubCount: allStubs.length,
    finalizedStubCount: finalized.length,
    hasDraftStubs: draftCount > 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Form 941 (per quarter)
// ───────────────────────────────────────────────────────────────────────────

export type Form941Data = {
  tenantId: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  quarterLabel: string;        // "Q1 2026 (Jan–Mar)"

  // Line 1
  line1_employeeCount: number;

  // Line 2-3
  line2_totalWages: number;          // Sum of W-2 box 1 contribution this quarter
  line3_federalIncomeTax: number;    // Sum of Box 2 contribution

  // Line 5 (SS + Medicare combined employer + employee shares)
  line5a_ssWages: number;
  line5a_ssTax: number;              // 12.4% of 5a
  line5c_medicareWages: number;
  line5c_medicareTax: number;        // 2.9% of 5c
  line5d_additionalMedicareWages: number;  // wages > $200k threshold
  line5d_additionalMedicareTax: number;    // 0.9% (employee only — no employer match)

  // Line 6
  line6_totalTaxesBeforeAdjustments: number;

  // Audit
  hasDraftStubs: boolean;
  draftStubCount: number;
};

const SS_RATE_BOTH_SHARES = 0.124;       // 6.2% employee + 6.2% employer
const MEDICARE_RATE_BOTH_SHARES = 0.029; // 1.45% employee + 1.45% employer

export async function compute941Data(
  tenantId: string,
  year: number,
  quarter: 1 | 2 | 3 | 4,
): Promise<Form941Data> {
  const qStartMonth = (quarter - 1) * 3;          // Q1 → 0 (Jan), Q2 → 3 (Apr), …
  const qStart = new Date(year, qStartMonth, 1);
  const qEnd = new Date(year, qStartMonth + 3, 1);

  const allStubs = await prisma.payStub.findMany({
    where: {
      payPeriod: {
        tenantId,
        periodStart: { gte: qStart, lt: qEnd },
      },
    },
    select: {
      employeeId: true,
      grossPay: true,
      federalIncomeTax: true,
      extraWithholding: true,
      preTax401k: true,
      preTaxHealth: true,
      preTaxHsa: true,
      preTaxFsa: true,
      additionalMedicareTax: true,
      payPeriod: { select: { status: true } },
    },
  });

  const finalized = allStubs.filter((s) => s.payPeriod.status === "FINALIZED");
  const draftCount = allStubs.length - finalized.length;

  let totalWages = 0;
  let federalIT = 0;
  let ssWages = 0;
  let medicareWages = 0;
  let additionalMedicare = 0;
  let additionalMedicareWages = 0;
  const employeeIds = new Set<string>();

  for (const s of finalized) {
    const section125 = s.preTaxHealth + s.preTaxHsa + s.preTaxFsa;
    totalWages += s.grossPay - s.preTax401k - section125;     // Box 1 contribution
    federalIT += s.federalIncomeTax + s.extraWithholding;
    ssWages += s.grossPay - section125;                       // Box 3 contribution (uncapped per quarter)
    medicareWages += s.grossPay - section125;                 // Box 5 contribution
    additionalMedicare += s.additionalMedicareTax;
    if (s.additionalMedicareTax > 0) {
      // Approximate the wages over $200k that triggered additional Medicare
      additionalMedicareWages += s.additionalMedicareTax / 0.009;
    }
    employeeIds.add(s.employeeId);
  }

  const line5aSsTax = round(ssWages * SS_RATE_BOTH_SHARES);
  const line5cMedicareTax = round(medicareWages * MEDICARE_RATE_BOTH_SHARES);
  const line6 = round(federalIT + line5aSsTax + line5cMedicareTax + additionalMedicare);

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const qLabel = `Q${quarter} ${year} (${monthLabels[qStartMonth]}–${monthLabels[qStartMonth + 2]})`;

  return {
    tenantId,
    year,
    quarter,
    quarterLabel: qLabel,
    line1_employeeCount: employeeIds.size,
    line2_totalWages: round(totalWages),
    line3_federalIncomeTax: round(federalIT),
    line5a_ssWages: round(ssWages),
    line5a_ssTax: line5aSsTax,
    line5c_medicareWages: round(medicareWages),
    line5c_medicareTax: line5cMedicareTax,
    line5d_additionalMedicareWages: round(additionalMedicareWages),
    line5d_additionalMedicareTax: round(additionalMedicare),
    line6_totalTaxesBeforeAdjustments: line6,
    hasDraftStubs: draftCount > 0,
    draftStubCount: draftCount,
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
