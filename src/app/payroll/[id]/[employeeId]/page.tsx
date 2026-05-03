import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { ArrowLeft, Printer } from "lucide-react";
import { format } from "date-fns";
import PdfButton from "./pdf-button";

export const dynamic = "force-dynamic";

export default async function PaystubPage({
  params,
}: {
  params: { id: string; employeeId: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect("/login");
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  const userId = (session.user as any).id;

  // Allow ADMIN to view any stub, employee to view their own
  if (role !== "ADMIN" && userId !== params.employeeId) redirect("/dashboard");

  const stub = await prisma.payStub.findUnique({
    where: { payPeriodId_employeeId: { payPeriodId: params.id, employeeId: params.employeeId } },
    include: {
      payPeriod: { include: { tenant: true } },
      employee: { select: { id: true, name: true, email: true, address: true, hireDate: true } },
    },
  });
  if (!stub || stub.payPeriod.tenantId !== tenantId) notFound();

  const tenant = stub.payPeriod.tenant;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[800px] mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
          <Link href={`/payroll/${params.id}`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Back to period
          </Link>
          <div className="flex items-center gap-2">
            <PdfButton filename={`paystub-${stub.employee.name.replace(/\s+/g, "-")}-${format(stub.payPeriod.payDate, "yyyy-MM-dd")}.pdf`} />
          </div>
        </div>

        <div id="paystub-printable" className="card p-8 space-y-6 print:shadow-none print:border-0" style={{ background: "#ffffff" }}>
          {/* Header */}
          <div className="flex items-start justify-between border-b border-dust pb-4">
            <div>
              <div className="display text-2xl text-ink">{tenant.businessName}</div>
              {tenant.legalName && tenant.legalName !== tenant.businessName && (
                <div className="text-xs text-smoke">{tenant.legalName}</div>
              )}
              {tenant.addressLine1 && (
                <div className="text-xs text-smoke mt-1">
                  {tenant.addressLine1}<br />
                  {tenant.city}, {tenant.state} {tenant.zip}
                </div>
              )}
              {tenant.federalEIN && (
                <div className="text-[10px] text-smoke mt-1 font-mono">
                  EIN: {tenant.federalEIN.slice(0,2)}-{tenant.federalEIN.slice(2)}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="label-eyebrow">Pay stub</div>
              <div className="text-sm text-smoke">Pay date: {format(stub.payPeriod.payDate, "MMM d, yyyy")}</div>
              <div className="text-xs text-smoke font-mono mt-1">Stub #{stub.id.slice(-8)}</div>
            </div>
          </div>

          {/* Employee + period */}
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="label-eyebrow mb-1">Employee</div>
              <div className="font-medium text-ink">{stub.employee.name}</div>
              <div className="text-xs text-smoke">{stub.employee.email}</div>
              {stub.employee.address && <div className="text-xs text-smoke whitespace-pre-line mt-1">{stub.employee.address}</div>}
            </div>
            <div>
              <div className="label-eyebrow mb-1">Period</div>
              <div className="text-sm">
                {format(stub.payPeriod.periodStart, "MMM d")} – {format(stub.payPeriod.periodEnd, "MMM d, yyyy")}
              </div>
              <div className="text-xs text-smoke">Bi-weekly</div>
            </div>
          </div>

          {/* Earnings */}
          <div>
            <div className="label-eyebrow mb-2">Earnings</div>
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-dust text-left">
                  <th className="py-2 font-normal text-xs text-smoke">Description</th>
                  <th className="py-2 font-normal text-xs text-smoke text-right">Hours</th>
                  <th className="py-2 font-normal text-xs text-smoke text-right">Rate</th>
                  <th className="py-2 font-normal text-xs text-smoke text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1.5">Regular</td>
                  <td className="py-1.5 text-right">{stub.regularHours.toFixed(2)}</td>
                  <td className="py-1.5 text-right">${stub.hourlyRate.toFixed(2)}</td>
                  <td className="py-1.5 text-right">${stub.regularPay.toFixed(2)}</td>
                </tr>
                {stub.overtimeHours > 0 && (
                  <tr>
                    <td className="py-1.5">Overtime (1.5×)</td>
                    <td className="py-1.5 text-right">{stub.overtimeHours.toFixed(2)}</td>
                    <td className="py-1.5 text-right">${(stub.hourlyRate * 1.5).toFixed(2)}</td>
                    <td className="py-1.5 text-right">${stub.overtimePay.toFixed(2)}</td>
                  </tr>
                )}
                <tr className="border-t border-dust font-semibold">
                  <td className="py-2">Gross pay</td>
                  <td></td>
                  <td></td>
                  <td className="py-2 text-right">${stub.grossPay.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deductions */}
          <div>
            <div className="label-eyebrow mb-2">Deductions</div>
            <table className="w-full text-sm font-mono">
              <tbody>
                <DeductionRow label="Federal income tax" amount={stub.federalIncomeTax} />
                <DeductionRow label="Social Security (6.2%)" amount={stub.socialSecurityTax} />
                <DeductionRow label="Medicare (1.45%)" amount={stub.medicareTax} />
                {stub.additionalMedicareTax > 0 && (
                  <DeductionRow label="Additional Medicare (0.9%)" amount={stub.additionalMedicareTax} />
                )}
                {stub.stateIncomeTax > 0 && (
                  <DeductionRow label={`${tenant.state} state income tax`} amount={stub.stateIncomeTax} />
                )}
                {stub.extraWithholding > 0 && (
                  <DeductionRow label="Additional withholding (W-4 4c)" amount={stub.extraWithholding} />
                )}
                <tr className="border-t border-dust font-semibold">
                  <td className="py-2">Total deductions</td>
                  <td className="py-2 text-right text-rose">−${stub.totalDeductions.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net pay */}
          <div className="border-t-2 border-ink pt-4 flex items-baseline justify-between">
            <div className="display text-xl text-ink">Net pay</div>
            <div className="display text-3xl font-mono text-ink">${stub.netPay.toFixed(2)}</div>
          </div>

          {/* Disclaimer */}
          <div className="text-[10px] text-smoke italic border-t border-dust pt-3">
            This paystub is generated by Shiftwork using best-effort 2026 federal and state tax tables.
            Verify accuracy with your accountant before relying on these figures for tax filings.
            Pre-tax deductions (401k, HSA, health insurance) and local taxes are not included.
          </div>
        </div>
      </main>
    </div>
  );
}

function DeductionRow({ label, amount }: { label: string; amount: number }) {
  return (
    <tr>
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right text-rose">−${amount.toFixed(2)}</td>
    </tr>
  );
}
