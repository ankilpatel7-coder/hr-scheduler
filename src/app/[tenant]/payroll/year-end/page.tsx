/**
 * /[tenant]/payroll/year-end?year=2026
 *
 * Admin-only year-end review. Shows per-employee W-2 box totals and
 * per-quarter 941 totals derived from finalized PayStubs.
 *
 * Phase 1 (this page): data review only. PDFs + EFW2 export come next.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArrowLeft, AlertTriangle, FileText, Calendar } from "lucide-react";
import { computeW2Data, compute941Data } from "@/lib/payroll/year-end";

export const dynamic = "force-dynamic";

export default async function YearEndPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { year?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/payroll/year-end`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, businessName: true, legalName: true, federalEIN: true, state: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const yearParam = searchParams.year;
  const year = yearParam
    ? parseInt(yearParam, 10)
    : new Date().getFullYear();

  // Find employees with finalized stubs this year
  const employees = await prisma.user.findMany({
    where: {
      tenantId,
      payStubs: {
        some: {
          payPeriod: {
            tenantId,
            periodStart: {
              gte: new Date(year, 0, 1),
              lt: new Date(year + 1, 0, 1),
            },
            status: "FINALIZED",
          },
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const w2sRaw = await Promise.all(
    employees.map((e) => computeW2Data(tenantId, e.id, year)),
  );
  const w2s = w2sRaw.filter((w): w is NonNullable<typeof w> => w !== null);

  const quarters = await Promise.all(
    [1, 2, 3, 4].map((q) =>
      compute941Data(tenantId, year, q as 1 | 2 | 3 | 4),
    ),
  );

  const anyDraftWarnings =
    w2s.some((w) => w.hasDraftStubs) ||
    quarters.some((q) => q.hasDraftStubs);

  // Year selector — show a few years around current
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="min-h-screen"><main className="max-w-6xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/payroll`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} />
          Back to payroll
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Calendar size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Year-end · {year}</h1>
        </div>
        <p className="text-sm text-smoke mb-2">
          {tenant.businessName} · EIN {tenant.federalEIN || "(not set)"} · {tenant.state}
        </p>

        {/* Year selector */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <span className="text-xs text-smoke uppercase tracking-wider">Year:</span>
          {yearOptions.map((y) => (
            <Link
              key={y}
              href={`/${params.tenant}/payroll/year-end?year=${y}`}
              className={`px-2.5 py-1 rounded text-xs font-medium border ${
                y === year
                  ? "bg-rust text-white border-rust"
                  : "border-ink/10 hover:bg-ink/5"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        {anyDraftWarnings && (
          <div
            className="card flex items-start gap-3 p-4 border-l-4 mb-6"
            style={{ borderLeftColor: "#d97706", background: "rgba(245,158,11,0.06)" }}
          >
            <AlertTriangle size={18} style={{ color: "#d97706" }} className="mt-0.5 shrink-0" />
            <div className="text-sm text-ink">
              <div className="font-medium">Some pay periods are still in DRAFT</div>
              <div className="text-smoke text-xs mt-0.5">
                Draft periods are excluded from these totals. Finalize them on the{" "}
                <Link href={`/${params.tenant}/payroll`} className="text-rust hover:underline">
                  payroll page
                </Link>{" "}
                before filing.
              </div>
            </div>
          </div>
        )}

        {employees.length === 0 ? (
          <div className="card p-8 text-center">
            <FileText size={32} className="text-smoke mx-auto mb-3" />
            <p className="text-sm text-ink/70 mb-1">No finalized paystubs in {year}.</p>
            <p className="text-xs text-smoke">
              Run and finalize at least one pay period this year to see W-2 / 941 data.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* === W-2 SUMMARY TABLE === */}
            <section>
              <h2 className="display text-xl text-ink mb-3">
                W-2 totals · {employees.length} employee{employees.length === 1 ? "" : "s"}
              </h2>
              <div className="card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-ink/10 text-[10px] uppercase tracking-wider text-smoke font-medium">
                      <th className="px-3 py-2 text-left">Employee</th>
                      <th className="px-3 py-2 text-right" title="Box 1: Wages, tips, other comp">B1 Wages</th>
                      <th className="px-3 py-2 text-right" title="Box 2: Federal income tax withheld">B2 Fed IT</th>
                      <th className="px-3 py-2 text-right" title="Box 3: Social Security wages">B3 SS Wages</th>
                      <th className="px-3 py-2 text-right" title="Box 4: Social Security tax">B4 SS Tax</th>
                      <th className="px-3 py-2 text-right" title="Box 5: Medicare wages">B5 Med Wages</th>
                      <th className="px-3 py-2 text-right" title="Box 6: Medicare tax">B6 Med Tax</th>
                      <th className="px-3 py-2 text-right" title="Box 12 D: 401(k) traditional">B12-D 401k</th>
                      <th className="px-3 py-2 text-center">B15 St</th>
                      <th className="px-3 py-2 text-right">B16 St Wages</th>
                      <th className="px-3 py-2 text-right">B17 St Tax</th>
                      <th className="px-3 py-2 text-right">B19 Local Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w2s.map((w) => (
                      <tr key={w.employeeId} className="border-b border-ink/5 hover:bg-ink/[0.02]">
                        <td className="px-3 py-2 font-medium text-ink">
                          <Link
                            href={`/${params.tenant}/employees/${w.employeeId}`}
                            className="hover:underline"
                          >
                            {w.employeeName}
                          </Link>
                          <Link
                            href={`/${params.tenant}/payroll/w2/${w.employeeId}?year=${year}`}
                            className="block text-[10px] text-rust hover:underline mt-0.5"
                          >
                            View W-2 →
                          </Link>
                          {w.hasDraftStubs && (
                            <AlertTriangle
                              size={11}
                              className="inline ml-1 text-amber-600"
                              aria-label="Has draft paystubs in this year"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box1_wages)}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box2_federalIncomeTax)}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box3_ssWages)}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box4_ssTax)}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box5_medicareWages)}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box6_medicareTax)}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {w.box12_D_401kTraditional > 0 ? `$${fmt(w.box12_D_401kTraditional)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-center font-mono">
                          {w.box15_state || "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box16_stateWages)}</td>
                        <td className="px-3 py-2 text-right font-mono">${fmt(w.box17_stateIncomeTax)}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {w.box19_localIncomeTax > 0 ? `$${fmt(w.box19_localIncomeTax)}` : "—"}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="border-t-2 border-ink/20 bg-ink/[0.02] font-medium">
                      <td className="px-3 py-2 text-ink">Totals ({w2s.length})</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box1_wages"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box2_federalIncomeTax"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box3_ssWages"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box4_ssTax"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box5_medicareWages"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box6_medicareTax"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box12_D_401kTraditional"))}</td>
                      <td className="px-3 py-2 text-center text-smoke">—</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box16_stateWages"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box17_stateIncomeTax"))}</td>
                      <td className="px-3 py-2 text-right font-mono">${fmt(sum(w2s, "box19_localIncomeTax"))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-smoke italic mt-2">
                Hover column headers to see what each box maps to. PDF export and SSA EFW2 file coming in the next iteration.
              </p>
            </section>

            {/* === 941 QUARTERLY === */}
            <section>
              <h2 className="display text-xl text-ink mb-3">Form 941 · quarterly totals</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {quarters.map((q) => (
                  <div key={q.quarter} className="card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-medium text-ink uppercase tracking-wider">
                        {q.quarterLabel}
                      </h3>
                      {q.hasDraftStubs && (
                        <AlertTriangle size={12} className="text-amber-600" />
                      )}
                    </div>
                    <div className="space-y-1 text-xs">
                      <Row label="L1 Employees" value={q.line1_employeeCount.toString()} mono />
                      <Row label="L2 Total wages" value={`$${fmt(q.line2_totalWages)}`} mono />
                      <Row label="L3 Federal IT W/H" value={`$${fmt(q.line3_federalIncomeTax)}`} mono />
                      <Row label="L5a SS wages" value={`$${fmt(q.line5a_ssWages)}`} mono />
                      <Row label="L5a SS tax (12.4%)" value={`$${fmt(q.line5a_ssTax)}`} mono />
                      <Row label="L5c Medicare wages" value={`$${fmt(q.line5c_medicareWages)}`} mono />
                      <Row label="L5c Medicare tax (2.9%)" value={`$${fmt(q.line5c_medicareTax)}`} mono />
                      {q.line5d_additionalMedicareTax > 0 && (
                        <Row
                          label="L5d Add'l Medicare"
                          value={`$${fmt(q.line5d_additionalMedicareTax)}`}
                          mono
                        />
                      )}
                      <div className="border-t border-ink/10 pt-1 mt-1">
                        <Row
                          label="L6 Total taxes"
                          value={`$${fmt(q.line6_totalTaxesBeforeAdjustments)}`}
                          mono
                          bold
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-smoke italic mt-2">
                941 PDF generation coming next. For now, copy these numbers into your filing software.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-smoke ${bold ? "font-medium text-ink" : ""}`}>{label}</span>
      <span className={`${mono ? "font-mono tabular-nums" : ""} ${bold ? "font-semibold text-ink" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sum<T extends Record<string, any>>(arr: T[], key: keyof T): number {
  return arr.reduce((acc, r) => acc + (r[key] as number), 0);
}
