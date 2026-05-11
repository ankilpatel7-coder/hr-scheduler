/**
 * /[tenant]/payroll/941?year=2026&quarter=2
 *
 * Renders Form 941 (Employer's Quarterly Federal Tax Return) for download.
 *
 * v1 scope (Part 1, no COVID credits, no fractions adjustment):
 *   Lines 1, 2, 3, 5a, 5c, 5d, 5e, 6, 10, 12, 13a, 14/15
 *
 * Out of scope for v1: Schedule B (semi-weekly depositors), Part 2 deposit
 * schedule, Part 3 optional info, COVID-era credits (lines 11a-g, 13c-i),
 * sick pay / tips adjustments (lines 7-9). These can be added later if
 * needed — the calculator already returns the underlying numbers.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { ArrowLeft } from "lucide-react";
import { compute941Data } from "@/lib/payroll/year-end";
import Form941PdfButton from "@/components/form941-pdf-button";

export const dynamic = "force-dynamic";

export default async function Form941Page({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { year?: string; quarter?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/payroll/941`);
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
    },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const year = searchParams.year ? parseInt(searchParams.year, 10) : new Date().getFullYear();
  const qParam = searchParams.quarter ? parseInt(searchParams.quarter, 10) : currentQuarter();
  const quarter = (qParam >= 1 && qParam <= 4 ? qParam : 1) as 1 | 2 | 3 | 4;

  const data = await compute941Data(tenantId, year, quarter);

  const employer = {
    name: tenant.legalName || tenant.businessName,
    ein: tenant.federalEIN || "",
    addressLine1: tenant.addressLine1 || "",
    addressLine2: tenant.addressLine2 || "",
    city: tenant.city || "",
    state: tenant.state,
    zip: tenant.zip || "",
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
          <div className="flex items-center gap-2">
            {/* Quarter selector */}
            <div className="inline-flex border border-ink/10 rounded overflow-hidden text-xs">
              {[1, 2, 3, 4].map((q) => (
                <Link
                  key={q}
                  href={`/${params.tenant}/payroll/941?year=${year}&quarter=${q}`}
                  className={`px-2.5 py-1 font-medium ${
                    q === quarter ? "bg-rust text-white" : "hover:bg-ink/5"
                  }`}
                >
                  Q{q}
                </Link>
              ))}
            </div>
            <Form941PdfButton
              filename={`Form941-${tenant.businessName.replace(/\s+/g, "-")}-${year}-Q${quarter}.pdf`}
            />
          </div>
        </div>

        {/* === 941 form === */}
        <div
          id="form941-printable"
          className="bg-white border border-ink/20 p-8 text-xs"
          style={{ fontFamily: "'Courier New', monospace" }}
        >
          {/* Header */}
          <div className="text-center mb-3 pb-2 border-b-2 border-ink">
            <div className="text-base font-bold">Form 941 — Employer&rsquo;s Quarterly Federal Tax Return</div>
            <div className="text-[10px]">{data.quarterLabel}</div>
          </div>

          {/* Employer info */}
          <div className="grid grid-cols-12 gap-2 mb-3">
            <Field gridSpan={4} label="EIN">
              <span className="font-mono">{employer.ein || "(not set)"}</span>
            </Field>
            <Field gridSpan={4} label="Name (not your trade name)">
              {employer.name}
            </Field>
            <Field gridSpan={4} label="Trade name (if any)">
              {tenant.businessName !== employer.name ? tenant.businessName : "—"}
            </Field>
          </div>

          <div className="grid grid-cols-12 gap-2 mb-4">
            <Field gridSpan={12} label="Address">
              <div className="leading-tight">
                {employer.addressLine1 && <div>{employer.addressLine1}</div>}
                {employer.addressLine2 && <div>{employer.addressLine2}</div>}
                {(employer.city || employer.state || employer.zip) && (
                  <div>
                    {employer.city}
                    {employer.city && (employer.state || employer.zip) ? ", " : ""}
                    {employer.state} {employer.zip}
                  </div>
                )}
              </div>
            </Field>
          </div>

          {/* Report for this quarter checkboxes */}
          <div className="mb-4 border border-ink/40 p-2">
            <div className="text-[10px] mb-1">
              <strong>Report for this quarter of {year}</strong>
            </div>
            <div className="text-xs">
              {[1, 2, 3, 4].map((q) => {
                const monthRange =
                  q === 1 ? "Jan, Feb, Mar" :
                  q === 2 ? "Apr, May, Jun" :
                  q === 3 ? "Jul, Aug, Sep" : "Oct, Nov, Dec";
                return (
                  <span key={q} className="mr-4 inline-block">
                    [{q === quarter ? "X" : " "}] {q}: {monthRange}
                  </span>
                );
              })}
            </div>
          </div>

          {/* PART 1 */}
          <div className="text-center text-sm font-bold border-b border-ink mb-2 pb-1">
            Part 1: Answer these questions for this quarter
          </div>

          <Line
            num="1"
            label={`Number of employees who received wages, tips, or other compensation for the pay period including: Mar 12 (Q1), June 12 (Q2), Sept 12 (Q3), Dec 12 (Q4)`}
            value={data.line1_employeeCount.toString()}
            integer
          />
          <Line
            num="2"
            label="Wages, tips, and other compensation"
            value={fmt(data.line2_totalWages)}
          />
          <Line
            num="3"
            label="Federal income tax withheld from wages, tips, and other compensation"
            value={fmt(data.line3_federalIncomeTax)}
          />
          <Line
            num="4"
            label="If no wages, tips, and other compensation are subject to social security or Medicare tax — check and go to line 6"
            value=""
            checkbox={data.line2_totalWages === 0}
          />

          {/* Line 5 — taxable wages × rate */}
          <div className="border-t border-ink/30 mt-2 pt-2">
            <div className="text-[11px] font-medium mb-1">5. Taxable social security and Medicare wages and tips</div>

            <Line5Row
              label="5a Taxable social security wages"
              col1={fmt(data.line5a_ssWages)}
              rate="× 0.124"
              col3={fmt(data.line5a_ssTax)}
            />
            <Line5Row
              label="5b Taxable social security tips"
              col1="0.00"
              rate="× 0.124"
              col3="0.00"
            />
            <Line5Row
              label="5c Taxable Medicare wages and tips"
              col1={fmt(data.line5c_medicareWages)}
              rate="× 0.029"
              col3={fmt(data.line5c_medicareTax)}
            />
            <Line5Row
              label="5d Taxable wages & tips subject to Additional Medicare Tax withholding"
              col1={fmt(data.line5d_additionalMedicareWages)}
              rate="× 0.009"
              col3={fmt(data.line5d_additionalMedicareTax)}
            />
            <Line
              num="5e"
              label="Add Column 2 from lines 5a, 5b, 5c, and 5d"
              value={fmt(
                data.line5a_ssTax + 0 + data.line5c_medicareTax + data.line5d_additionalMedicareTax,
              )}
            />
            <Line
              num="5f"
              label="Section 3121(q) Notice and Demand — Tax due on unreported tips"
              value="0.00"
            />
          </div>

          {/* Line 6 — Total before adjustments */}
          <Line
            num="6"
            label="Total taxes before adjustments (line 3 + line 5e + line 5f)"
            value={fmt(data.line6_totalTaxesBeforeAdjustments)}
            bold
          />

          {/* Lines 7-9 — Adjustments (placeholders) */}
          <Line num="7" label="Current quarter's adjustment for fractions of cents" value="0.00" />
          <Line num="8" label="Current quarter's sick pay adjustment" value="0.00" />
          <Line
            num="9"
            label="Current quarter's adjustments for tips and group-term life insurance"
            value="0.00"
          />

          {/* Line 10 — total after adjustments */}
          <Line
            num="10"
            label="Total taxes after adjustments (combine lines 6 through 9)"
            value={fmt(data.line6_totalTaxesBeforeAdjustments)}
            bold
          />

          {/* Lines 11 — Credits (skipped for v1) */}
          <Line
            num="11"
            label="Qualified small business payroll tax credit + COVID credits (Forms 8974, 7200) — see instructions"
            value="0.00"
          />

          {/* Line 12 — total after credits */}
          <Line
            num="12"
            label="Total taxes after adjustments and credits (line 10 − line 11)"
            value={fmt(data.line6_totalTaxesBeforeAdjustments)}
            bold
          />

          {/* Lines 13-15 — Deposits + Balance */}
          <Line
            num="13a"
            label="Total deposits for this quarter (including overpayment applied from prior quarter)"
            value="0.00"
            highlight="manual"
          />
          <Line
            num="14"
            label="Balance due (line 12 − line 13a). Pay with this return."
            value={fmt(data.line6_totalTaxesBeforeAdjustments)}
            bold
            highlight="manual"
          />
          <Line num="15" label="Overpayment (line 13a − line 12)" value="0.00" />

          {/* Footer / disclaimers */}
          <div className="mt-4 pt-2 border-t border-ink/20 text-[9px] text-smoke leading-tight">
            <div>
              <strong>Note:</strong> This is a draft Form 941 generated by Shiftwork. Verify all amounts
              against your records before filing. Lines marked &ldquo;manual&rdquo; (13a, 14) require deposit data
              that Shiftwork doesn&rsquo;t track yet — fill in your actual EFTPS deposit total from your bank.
            </div>
            {data.hasDraftStubs && (
              <div className="mt-2 text-amber-700 font-medium">
                ⚠ This 941 excludes {data.draftStubCount} draft paystub
                {data.draftStubCount === 1 ? "" : "s"}. Finalize them before filing.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function currentQuarter(): number {
  const m = new Date().getMonth();
  return Math.floor(m / 3) + 1;
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
      <div className="text-[9px] text-ink/60 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function Line({
  num,
  label,
  value,
  bold,
  integer,
  checkbox,
  highlight,
}: {
  num: string;
  label: string;
  value: string;
  bold?: boolean;
  integer?: boolean;
  checkbox?: boolean;
  highlight?: "manual";
}) {
  return (
    <div
      className={`flex items-baseline gap-2 py-1 border-b border-ink/10 ${bold ? "border-ink/40 font-medium" : ""}`}
    >
      <div className="font-mono text-[10px] w-8 shrink-0">{num}.</div>
      <div className={`flex-1 text-[10px] leading-snug ${bold ? "font-medium" : ""}`}>{label}</div>
      <div
        className={`shrink-0 text-right font-mono ${integer ? "text-sm" : "text-xs"} ${
          bold ? "font-bold" : ""
        }`}
      >
        {checkbox ? (
          <span className="border border-ink/60 inline-block px-1 text-center w-5">{checkbox ? "X" : " "}</span>
        ) : (
          <span
            className={`border-b border-ink min-w-[80px] inline-block pb-0.5 ${
              highlight === "manual" ? "bg-amber-50" : ""
            }`}
          >
            {value || " "}
          </span>
        )}
      </div>
    </div>
  );
}

function Line5Row({
  label,
  col1,
  rate,
  col3,
}: {
  label: string;
  col1: string;
  rate: string;
  col3: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1 text-[10px]">
      <div className="flex-1 leading-snug">{label}</div>
      <div className="font-mono text-right border-b border-ink min-w-[80px] inline-block pb-0.5">
        {col1}
      </div>
      <div className="font-mono text-[10px] text-smoke">{rate}</div>
      <div className="font-mono text-right border-b border-ink min-w-[80px] inline-block pb-0.5">
        {col3}
      </div>
    </div>
  );
}
