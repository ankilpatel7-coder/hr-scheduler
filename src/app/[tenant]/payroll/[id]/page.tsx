import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { ArrowLeft, FileText } from "lucide-react";
import { format } from "date-fns";
import PeriodActions from "./period-actions";

export const dynamic = "force-dynamic";

export default async function PeriodDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerAuth();
  if (!session) redirect("/login");
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  if (role !== "ADMIN") redirect("/dashboard");

  const period = await prisma.payPeriod.findUnique({
    where: { id: params.id },
    include: {
      payStubs: {
        include: { employee: { select: { id: true, name: true, email: true, department: true } } },
        orderBy: { employee: { name: "asc" } },
      },
    },
  });
  if (!period || period.tenantId !== tenantId) notFound();

  const totals = period.payStubs.reduce(
    (acc, s) => ({
      gross: acc.gross + s.grossPay,
      net: acc.net + s.netPay,
      fed: acc.fed + s.federalIncomeTax,
      state: acc.state + s.stateIncomeTax,
      fica: acc.fica + s.socialSecurityTax + s.medicareTax + s.additionalMedicareTax,
    }),
    { gross: 0, net: 0, fed: 0, state: 0, fica: 0 }
  );

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-6 py-10 space-y-6">
        <Link href="/payroll" className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> All periods
        </Link>

        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <div className="label-eyebrow mb-1">Pay period</div>
            <h1 className="display text-4xl text-ink">
              {format(period.periodStart, "MMM d")} – {format(period.periodEnd, "MMM d, yyyy")}
            </h1>
            <div className="text-sm text-smoke mt-1">
              Pay date: {format(period.payDate, "MMM d, yyyy")}
              {" · "}
              {period.status === "FINALIZED" ? (
                <span style={{ color: "#059669" }}>Finalized {period.finalizedAt && format(period.finalizedAt, "MMM d, h:mm a")}</span>
              ) : (
                <span style={{ color: "#d97706" }}>Draft</span>
              )}
            </div>
          </div>
          <PeriodActions periodId={period.id} status={period.status} stubCount={period.payStubs.length} />
        </div>

        {period.payStubs.length === 0 ? (
          <div className="card p-8 text-center text-smoke">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm mb-2">No paystubs generated yet for this period.</p>
            <p className="text-xs">Click <strong>Generate stubs</strong> above to compute pay for every active employee with hours in this period.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Total gross" value={`$${totals.gross.toFixed(2)}`} />
              <Stat label="Federal w/h" value={`$${totals.fed.toFixed(2)}`} />
              <Stat label="State w/h" value={`$${totals.state.toFixed(2)}`} />
              <Stat label="FICA + Medicare" value={`$${totals.fica.toFixed(2)}`} />
              <Stat label="Total net" value={`$${totals.net.toFixed(2)}`} />
            </div>

            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dust bg-paper text-left">
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Employee</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Reg hrs</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">OT hrs</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Gross</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Fed</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">FICA</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">State</th>
                    <th className="px-3 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Net</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[13px]">
                  {period.payStubs.map((s) => (
                    <tr key={s.id} className="border-b border-dust last:border-0 hover:bg-ink/5">
                      <td className="px-3 py-3 font-sans">
                        <div className="font-medium text-ink">{s.employee.name}</div>
                        <div className="text-[11px] text-smoke">{s.employee.email}</div>
                      </td>
                      <td className="px-3 py-3 text-right">{s.regularHours.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right">{s.overtimeHours.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right">${s.grossPay.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-rose">${s.federalIncomeTax.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-rose">${(s.socialSecurityTax + s.medicareTax + s.additionalMedicareTax).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-rose">${s.stateIncomeTax.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">${s.netPay.toFixed(2)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/payroll/${period.id}/${s.employeeId}`} className="text-rust hover:underline text-xs font-sans">
                          View stub
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="label-eyebrow mb-1 text-[9px]">{label}</div>
      <div className="display text-xl text-ink font-mono">{value}</div>
    </div>
  );
}
