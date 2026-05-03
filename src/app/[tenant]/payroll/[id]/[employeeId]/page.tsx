/**
 * Paystub view — redesigned in v12.2 to match check-stub style.
 * Pulls payer info from the employee's primary location's LLC fields,
 * falling back to tenant info if the location LLC fields aren't set.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import PdfButton from "./pdf-button";
import { amountToWords, asteriskAmount } from "@/lib/number-to-words";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join("").slice(0, 4);
}

export default async function PaystubPage({
  params,
}: {
  params: { tenant: string; id: string; employeeId: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect("/login");
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  const userId = (session.user as any).id;
  const isSuperAdmin = (session.user as any).superAdmin === true;

  if (role !== "ADMIN" && userId !== params.employeeId && !isSuperAdmin) redirect(`/${params.tenant}/dashboard`);

  const stub = await prisma.payStub.findUnique({
    where: { payPeriodId_employeeId: { payPeriodId: params.id, employeeId: params.employeeId } },
    include: {
      payPeriod: { include: { tenant: true } },
      employee: {
        select: {
          id: true, name: true, email: true, address: true, hireDate: true,
          locations: {
            include: { location: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!stub) notFound();
  if (!isSuperAdmin && stub.payPeriod.tenantId !== tenantId) notFound();

  const tenant = stub.payPeriod.tenant;
  const empLoc = stub.employee.locations[0]?.location;

  // Payer info: prefer location LLC fields, fall back to tenant
  const payer = {
    legalName: empLoc?.legalName || tenant.legalName || tenant.businessName,
    addressLine1: empLoc?.addressLine1 || tenant.addressLine1 || "",
    addressLine2: empLoc?.addressLine2 || tenant.addressLine2 || "",
    city: empLoc?.city || tenant.city || "",
    state: empLoc?.locState || tenant.state,
    zip: empLoc?.zip || tenant.zip || "",
    federalEIN: empLoc?.federalEIN || tenant.federalEIN || "",
  };

  // YTD totals (sum of all FINALIZED stubs in calendar year, including this one if finalized)
  const periodYear = stub.payPeriod.periodStart.getFullYear();
  const yearStart = new Date(periodYear, 0, 1);
  const ytdStubs = await prisma.payStub.findMany({
    where: {
      employeeId: stub.employeeId,
      payPeriod: {
        tenantId: stub.payPeriod.tenantId,
        periodEnd: { gte: yearStart, lte: stub.payPeriod.periodEnd },
        OR: [{ status: "FINALIZED" }, { id: stub.payPeriodId }],
      },
    },
    select: {
      regularHours: true, overtimeHours: true, regularPay: true, overtimePay: true, grossPay: true,
      federalIncomeTax: true, socialSecurityTax: true, medicareTax: true, additionalMedicareTax: true,
      stateIncomeTax: true, totalDeductions: true, netPay: true,
    },
  });
  const ytd = ytdStubs.reduce((acc, s) => ({
    regularHours: acc.regularHours + s.regularHours,
    overtimeHours: acc.overtimeHours + s.overtimeHours,
    regularPay: acc.regularPay + s.regularPay,
    overtimePay: acc.overtimePay + s.overtimePay,
    grossPay: acc.grossPay + s.grossPay,
    federalIncomeTax: acc.federalIncomeTax + s.federalIncomeTax,
    socialSecurityTax: acc.socialSecurityTax + s.socialSecurityTax,
    medicareTax: acc.medicareTax + s.medicareTax,
    additionalMedicareTax: acc.additionalMedicareTax + s.additionalMedicareTax,
    stateIncomeTax: acc.stateIncomeTax + s.stateIncomeTax,
    totalDeductions: acc.totalDeductions + s.totalDeductions,
    netPay: acc.netPay + s.netPay,
  }), {
    regularHours: 0, overtimeHours: 0, regularPay: 0, overtimePay: 0, grossPay: 0,
    federalIncomeTax: 0, socialSecurityTax: 0, medicareTax: 0, additionalMedicareTax: 0,
    stateIncomeTax: 0, totalDeductions: 0, netPay: 0,
  });

  const checkDate = stub.payPeriod.payDate;
  const empInitials = initials(stub.employee.name);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[850px] mx-auto px-6 py-10 space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/${params.tenant}/payroll/${params.id}`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Back to period
          </Link>
          <PdfButton filename={`paystub-${stub.employee.name.replace(/\s+/g, "_")}_${format(stub.payPeriod.periodStart, "MM.dd.yyyy")}_${format(stub.payPeriod.periodEnd, "MM.dd.yyyy")}.pdf`} />
        </div>

        <div id="paystub-printable" className="bg-white text-black p-10 font-mono text-[11px] leading-tight" style={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" }}>
          <Stub
            payer={payer}
            employee={stub.employee}
            empInitials={empInitials}
            checkDate={checkDate}
            periodStart={stub.payPeriod.periodStart}
            periodEnd={stub.payPeriod.periodEnd}
            current={{
              regularHours: stub.regularHours, overtimeHours: stub.overtimeHours,
              regularPay: stub.regularPay, overtimePay: stub.overtimePay, grossPay: stub.grossPay,
              federalIncomeTax: stub.federalIncomeTax,
              socialSecurityTax: stub.socialSecurityTax, medicareTax: stub.medicareTax,
              additionalMedicareTax: stub.additionalMedicareTax,
              stateIncomeTax: stub.stateIncomeTax, totalDeductions: stub.totalDeductions, netPay: stub.netPay,
            }}
            ytd={ytd}
          />
        </div>

        <div className="text-[10px] text-smoke italic print:hidden">
          Tip: Use &quot;Download PDF&quot; for a clean letter-sized export. Direct deposit detail is shown when configured per employee (v12.3+).
        </div>
      </main>
    </div>
  );
}

function Stub({
  payer, employee, empInitials, checkDate, periodStart, periodEnd, current, ytd,
}: any) {
  return (
    <>
      {/* Top "check" section */}
      <div className="border border-black p-4 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="font-bold text-[13px]">{payer.legalName}</div>
            {payer.addressLine1 && <div>{payer.addressLine1}</div>}
            {payer.addressLine2 && <div>{payer.addressLine2}</div>}
            {(payer.city || payer.state || payer.zip) && (
              <div>{[payer.city, payer.state].filter(Boolean).join(", ")} {payer.zip}</div>
            )}
          </div>
          <div className="text-right">
            <span>Check date:</span> <span className="ml-3">{format(checkDate, "MM/dd/yy")}</span>
          </div>
        </div>

        <div className="flex items-baseline gap-3 mb-2">
          <span>Pay to the order of:</span>
          <span className="font-bold">{employee.name}</span>
          <span className="ml-auto">$</span>
          <span className="font-bold tabular-nums">{asteriskAmount(current.netPay, 14)}</span>
        </div>
        <div className="border-t border-black pt-1 mb-6 text-[10px]">
          ** {amountToWords(current.netPay)} {"*".repeat(Math.max(0, 80 - amountToWords(current.netPay).length))}
        </div>

        <div className="ml-2">
          <div>{employee.name}</div>
          {employee.address && <div className="whitespace-pre-line">{employee.address}</div>}
        </div>
      </div>

      {/* Current period section */}
      <PeriodTable
        title=""
        empInitials={empInitials}
        empName={employee.name}
        checkDate={checkDate}
        periodStart={periodStart}
        periodEnd={periodEnd}
        data={current}
        payer={payer}
        showFooter
        net={current.netPay}
      />

      {/* YTD section */}
      <div className="mt-6 mb-2 text-center font-bold">Year to Date</div>
      <PeriodTable
        title=""
        empInitials={empInitials}
        empName={employee.name}
        checkDate={null}
        periodStart={null}
        periodEnd={null}
        data={ytd}
        payer={payer}
        showFooter
        net={ytd.netPay}
        ytd
      />
    </>
  );
}

function PeriodTable({ empInitials, empName, checkDate, periodStart, periodEnd, data, ytd, net }: any) {
  return (
    <div className="border-t border-b border-black">
      {checkDate && (
        <div className="flex items-baseline justify-between border-b border-black/40 pb-1 mb-1 px-1">
          <div><span className="font-bold mr-2">{empInitials}</span><span>{empName}</span></div>
          <div className="text-right">
            <div>Check date: <span className="ml-2">{format(checkDate, "MM/dd/yy")}</span></div>
            <div>Period begin: <span className="ml-2">{format(periodStart, "MM/dd/yy")}</span> &nbsp; Period end: <span className="ml-2">{format(periodEnd, "MM/dd/yy")}</span></div>
          </div>
        </div>
      )}

      <table className="w-full">
        <thead>
          <tr className="border-b border-black/40">
            <th className="text-left py-1 px-1 font-normal w-[18%]">Wages</th>
            <th className="text-right py-1 px-1 font-normal w-[8%]">Total Hrs</th>
            <th className="text-right py-1 px-1 font-normal w-[10%]">Amount</th>
            <th className="text-left py-1 px-1 font-normal w-[18%]">Withholdings</th>
            <th className="text-right py-1 px-1 font-normal w-[10%]">Amount</th>
            <th className="text-left py-1 px-1 font-normal w-[18%]">Deductions</th>
            <th className="text-right py-1 px-1 font-normal w-[10%]">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-1 py-0.5">Hourly</td>
            <td className="px-1 py-0.5 text-right tabular-nums">{(data.regularHours + data.overtimeHours).toFixed(2)}</td>
            <td className="px-1 py-0.5 text-right tabular-nums">{(data.regularPay + data.overtimePay).toFixed(2)}</td>
            <td className="px-1 py-0.5">FICA-SS</td>
            <td className="px-1 py-0.5 text-right tabular-nums">{data.socialSecurityTax.toFixed(2)}</td>
            <td className="px-1 py-0.5"></td>
            <td className="px-1 py-0.5"></td>
          </tr>
          <tr>
            <td className="px-1 py-0.5">{data.overtimeHours > 0 ? "Overtime (1.5x)" : ""}</td>
            <td className="px-1 py-0.5 text-right tabular-nums">{data.overtimeHours > 0 ? data.overtimeHours.toFixed(2) : ""}</td>
            <td className="px-1 py-0.5 text-right tabular-nums">{data.overtimeHours > 0 ? data.overtimePay.toFixed(2) : ""}</td>
            <td className="px-1 py-0.5">FICA-MED</td>
            <td className="px-1 py-0.5 text-right tabular-nums">{data.medicareTax.toFixed(2)}</td>
            <td className="px-1 py-0.5"></td>
            <td className="px-1 py-0.5"></td>
          </tr>
          {data.additionalMedicareTax > 0 && (
            <tr>
              <td></td><td></td><td></td>
              <td className="px-1 py-0.5">FICA-MED Add&apos;l</td>
              <td className="px-1 py-0.5 text-right tabular-nums">{data.additionalMedicareTax.toFixed(2)}</td>
              <td></td><td></td>
            </tr>
          )}
          {data.federalIncomeTax > 0 && (
            <tr>
              <td></td><td></td><td></td>
              <td className="px-1 py-0.5">Federal Income Tax</td>
              <td className="px-1 py-0.5 text-right tabular-nums">{data.federalIncomeTax.toFixed(2)}</td>
              <td></td><td></td>
            </tr>
          )}
          {data.stateIncomeTax > 0 && (
            <tr>
              <td></td><td></td><td></td>
              <td className="px-1 py-0.5">Kentucky SIT</td>
              <td className="px-1 py-0.5 text-right tabular-nums">{data.stateIncomeTax.toFixed(2)}</td>
              <td></td><td></td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-black/40 font-bold">
            <td className="px-1 py-1">Totals</td>
            <td className="px-1 py-1 text-right tabular-nums">{(data.regularHours + data.overtimeHours).toFixed(2)}</td>
            <td className="px-1 py-1 text-right tabular-nums">{(data.regularPay + data.overtimePay).toFixed(2)}</td>
            <td></td>
            <td className="px-1 py-1 text-right tabular-nums">{data.totalDeductions.toFixed(2)}</td>
            <td></td>
            <td className="px-1 py-1 text-right tabular-nums">0.00</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex items-start justify-between border-t border-black/40 px-1 py-2 text-[10px]">
        <div>
          <div>{ytd ? "Accruable benefits available:" : "Accruable benefits used this check:"}</div>
        </div>
        <div>
          <div>Direct deposit detail:</div>
        </div>
        <div className="text-right">
          <div>Net Check: <span className="tabular-nums ml-3">{net.toFixed(2)}</span></div>
          <div>Direct Deposit: <span className="tabular-nums ml-3">0.00</span></div>
          <div className="font-bold">Total Pay: <span className="tabular-nums ml-3">{net.toFixed(2)}</span></div>
        </div>
      </div>
    </div>
  );
}
