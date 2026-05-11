/**
 * /[tenant]/payroll/w2/[employeeId]?year=2026
 *
 * Renders an employee's W-2 in a printable layout. Admin-only.
 *
 * Layout note: this is a "Copy B/C/D" suitable for printing on plain paper.
 * Copy A (the red ink form for SSA) cannot be printed at home — for SSA
 * filing, use the EFW2 text file upload to BSO (coming in next iteration).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { ArrowLeft } from "lucide-react";
import { computeW2Data } from "@/lib/payroll/year-end";
import W2PdfButton from "@/components/w2-pdf-button";

export const dynamic = "force-dynamic";

export default async function W2Page({
  params,
  searchParams,
}: {
  params: { tenant: string; employeeId: string };
  searchParams: { year?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/payroll/w2/${params.employeeId}`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: {
      id: true,
      businessName: true,
      legalName: true,
      federalEIN: true,
      state: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      zip: true,
      stateTaxId: true,
    },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const employee = await prisma.user.findFirst({
    where: { id: params.employeeId, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      address: true,
      ssnLast4: true,
      primaryLocation: {
        select: {
          legalName: true,
          federalEIN: true,
          stateTaxId: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          locState: true,
          zip: true,
        },
      },
    },
  });
  if (!employee) redirect(`/${params.tenant}/employees`);

  const year = searchParams.year ? parseInt(searchParams.year, 10) : new Date().getFullYear();

  const w2 = await computeW2Data(tenantId, params.employeeId, year);
  if (!w2) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="max-w-3xl mx-auto px-6 py-10">
          <Link href={`/${params.tenant}/payroll/year-end?year=${year}`} className="text-xs text-rust hover:underline">
            ← Back to year-end
          </Link>
          <p className="text-sm text-smoke italic mt-6">No W-2 data for this employee in {year}.</p>
        </main>
      </div>
    );
  }

  // Resolve employer info (location LLC if set, otherwise tenant)
  const employer = {
    name: employee.primaryLocation?.legalName || tenant.legalName || tenant.businessName,
    ein: employee.primaryLocation?.federalEIN || tenant.federalEIN || "",
    stateTaxId: employee.primaryLocation?.stateTaxId || tenant.stateTaxId || "",
    addressLine1: employee.primaryLocation?.addressLine1 || tenant.addressLine1 || "",
    addressLine2: employee.primaryLocation?.addressLine2 || tenant.addressLine2 || "",
    city: employee.primaryLocation?.city || tenant.city || "",
    state: employee.primaryLocation?.locState || tenant.state,
    zip: employee.primaryLocation?.zip || tenant.zip || "",
  };

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link
            href={`/${params.tenant}/payroll/year-end?year=${year}`}
            className="inline-flex items-center gap-1 text-xs text-rust hover:underline"
          >
            <ArrowLeft size={12} />
            Back to year-end
          </Link>
          <W2PdfButton
            filename={`W2-${employee.name.replace(/\s+/g, "-")}-${year}.pdf`}
          />
        </div>

        {/* === W-2 form === */}
        <div
          id="w2-printable"
          className="bg-white border border-ink/20 p-8 text-xs"
          style={{ fontFamily: "'Courier New', monospace" }}
        >
          {/* Header banner */}
          <div className="text-center mb-2 pb-2 border-b-2 border-ink">
            <div className="text-base font-bold">Form W-2 — Wage and Tax Statement</div>
            <div className="text-[10px]">Tax year {year} · Copy B — To be filed with employee&rsquo;s federal tax return</div>
          </div>

          {/* Top grid: a (employee SSN) | b (employer EIN) | c (employer name/addr) */}
          <div className="grid grid-cols-12 gap-2 mb-2">
            <Field gridSpan={4} label="a — Employee's SSA number">
              {employee.ssnLast4 ? (
                <span className="font-mono">***-**-{employee.ssnLast4}</span>
              ) : (
                <span className="text-amber-700 italic text-[10px]">
                  Not set — required for W-2 filing
                </span>
              )}
            </Field>
            <Field gridSpan={4} label="b — Employer ID Number (EIN)">
              {employer.ein || "(not set)"}
            </Field>
            <Field gridSpan={4} label="OMB No. 1545-0008">
              <span className="text-smoke">—</span>
            </Field>
          </div>

          <div className="grid grid-cols-12 gap-2 mb-2">
            <Field gridSpan={6} label="c — Employer's name, address, ZIP code">
              <div className="leading-tight">
                <div className="font-medium">{employer.name}</div>
                {employer.addressLine1 && <div>{employer.addressLine1}</div>}
                {employer.addressLine2 && <div>{employer.addressLine2}</div>}
                {(employer.city || employer.state || employer.zip) && (
                  <div>
                    {employer.city}{employer.city && (employer.state || employer.zip) ? ", " : ""}
                    {employer.state} {employer.zip}
                  </div>
                )}
              </div>
            </Field>
            <Field gridSpan={6} label="d — Control number">
              <span className="text-smoke">—</span>
            </Field>
          </div>

          <div className="grid grid-cols-12 gap-2 mb-3">
            <Field gridSpan={6} label="e/f — Employee's name, address, ZIP">
              <div className="leading-tight">
                <div className="font-medium">{employee.name}</div>
                {employee.address && <div>{employee.address}</div>}
              </div>
            </Field>
            <Field gridSpan={6} label="">
              <span className="text-smoke italic">(continued)</span>
            </Field>
          </div>

          {/* Box 1-6 grid (the main earnings/tax boxes) */}
          <div className="grid grid-cols-12 gap-2 mb-2">
            <BoxField gridSpan={6} label="1 — Wages, tips, other compensation" value={fmt(w2.box1_wages)} />
            <BoxField gridSpan={6} label="2 — Federal income tax withheld" value={fmt(w2.box2_federalIncomeTax)} />
          </div>
          <div className="grid grid-cols-12 gap-2 mb-2">
            <BoxField gridSpan={6} label="3 — Social Security wages" value={fmt(w2.box3_ssWages)} />
            <BoxField gridSpan={6} label="4 — Social Security tax withheld" value={fmt(w2.box4_ssTax)} />
          </div>
          <div className="grid grid-cols-12 gap-2 mb-2">
            <BoxField gridSpan={6} label="5 — Medicare wages and tips" value={fmt(w2.box5_medicareWages)} />
            <BoxField gridSpan={6} label="6 — Medicare tax withheld" value={fmt(w2.box6_medicareTax)} />
          </div>
          <div className="grid grid-cols-12 gap-2 mb-2">
            <BoxField gridSpan={6} label="7 — Social Security tips" value="0.00" />
            <BoxField gridSpan={6} label="8 — Allocated tips" value="0.00" />
          </div>
          <div className="grid grid-cols-12 gap-2 mb-2">
            <BoxField gridSpan={6} label="10 — Dependent care benefits" value="0.00" />
            <BoxField gridSpan={6} label="11 — Nonqualified plans" value="0.00" />
          </div>

          {/* Box 12 codes */}
          <div className="grid grid-cols-12 gap-2 mb-2">
            <BoxField
              gridSpan={6}
              label="12a — Code"
              value={
                w2.box12_D_401kTraditional > 0
                  ? `D  ${fmt(w2.box12_D_401kTraditional)}`
                  : ""
              }
            />
            <BoxField
              gridSpan={6}
              label="12b — Code"
              value={w2.box12_W_hsa > 0 ? `W  ${fmt(w2.box12_W_hsa)}` : ""}
            />
          </div>
          <div className="grid grid-cols-12 gap-2 mb-3">
            <BoxField
              gridSpan={6}
              label="12c — Code"
              value={
                w2.box12_DD_employerHealthCoverage > 0
                  ? `DD ${fmt(w2.box12_DD_employerHealthCoverage)}`
                  : ""
              }
            />
            <BoxField gridSpan={6} label="12d — Code" value="" />
          </div>

          {/* Box 13 / 14 */}
          <div className="grid grid-cols-12 gap-2 mb-3">
            <Field gridSpan={6} label="13 — Statutory employee · Retirement plan · Third-party sick pay">
              <div className="text-[10px]">
                <span className="mr-3">[ ] Statutory employee</span>
                <span className="mr-3">
                  [{w2.box12_D_401kTraditional > 0 ? "X" : " "}] Retirement plan
                </span>
                <span>[ ] Third-party sick pay</span>
              </div>
            </Field>
            <Field gridSpan={6} label="14 — Other">
              <span className="text-smoke">—</span>
            </Field>
          </div>

          {/* State / Local row (Boxes 15-20) */}
          <div className="grid grid-cols-12 gap-1 text-[10px] mb-1 pt-2 border-t border-ink/30">
            <div className="col-span-2 font-medium">15 State</div>
            <div className="col-span-2 font-medium">15 Employer's state ID number</div>
            <div className="col-span-2 font-medium">16 State wages, tips</div>
            <div className="col-span-2 font-medium">17 State income tax</div>
            <div className="col-span-1 font-medium">18 Local wages</div>
            <div className="col-span-1 font-medium">19 Local income tax</div>
            <div className="col-span-2 font-medium">20 Locality name</div>
          </div>
          <div className="grid grid-cols-12 gap-1">
            <BoxValue gridSpan={2} value={w2.box15_state || "—"} />
            <BoxValue gridSpan={2} value={employer.stateTaxId || "—"} />
            <BoxValue gridSpan={2} value={fmt(w2.box16_stateWages)} />
            <BoxValue gridSpan={2} value={fmt(w2.box17_stateIncomeTax)} />
            <BoxValue gridSpan={1} value={w2.box18_localWages > 0 ? fmt(w2.box18_localWages) : "—"} />
            <BoxValue gridSpan={1} value={w2.box19_localIncomeTax > 0 ? fmt(w2.box19_localIncomeTax) : "—"} />
            <BoxValue gridSpan={2} value={w2.box20_localityName || "—"} />
          </div>

          {/* Footer */}
          <div className="mt-4 pt-2 border-t border-ink/20 text-[9px] text-smoke text-center leading-tight">
            This is Copy B — to be filed with the employee&rsquo;s federal income tax return.
            <br />
            Department of the Treasury — Internal Revenue Service.
            {w2.hasDraftStubs && (
              <div className="mt-2 text-amber-700 font-medium">
                ⚠ This W-2 excludes draft pay periods. Finalize them before filing.
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-smoke italic mt-3 print:hidden">
          Source: {w2.finalizedStubCount} finalized paystub{w2.finalizedStubCount === 1 ? "" : "s"} in {year}.
        </p>
      </main>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Static col-span lookup — Tailwind needs literal class names to compile,
// so `col-span-${n}` interpolation silently produces no CSS.
const COL_SPAN: Record<number, string> = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4",
  5: "col-span-5", 6: "col-span-6", 7: "col-span-7", 8: "col-span-8",
  9: "col-span-9", 10: "col-span-10", 11: "col-span-11", 12: "col-span-12",
};

function Field({
  gridSpan,
  label,
  children,
}: {
  gridSpan: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${COL_SPAN[gridSpan]} border border-ink/40 p-1.5 min-h-[36px]`}>
      {label && <div className="text-[9px] text-ink/60 uppercase tracking-wider mb-0.5">{label}</div>}
      <div className="text-xs">{children}</div>
    </div>
  );
}

function BoxField({
  gridSpan,
  label,
  value,
}: {
  gridSpan: number;
  label: string;
  value: string;
}) {
  return (
    <div className={`${COL_SPAN[gridSpan]} border border-ink/40 p-1.5 min-h-[36px]`}>
      <div className="text-[9px] text-ink/60 mb-0.5">{label}</div>
      <div className="text-sm font-mono text-right">{value || " "}</div>
    </div>
  );
}

function BoxValue({ gridSpan, value }: { gridSpan: number; value: string }) {
  return (
    <div className={`${COL_SPAN[gridSpan]} border border-ink/40 p-1.5 min-h-[28px]`}>
      <div className="text-xs font-mono text-center">{value}</div>
    </div>
  );
}
