/**
 * Pay periods list page.
 *
 * NOTE: Lives at /payroll for v12.0 (single-tenant URL routing).
 * In v12.1 this becomes /[tenant]/payroll.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { Plus, FileText } from "lucide-react";
import { format } from "date-fns";
import NewPeriodForm from "./new-period-form";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const session = await getServerAuth();
  if (!session) redirect("/login?from=/payroll");
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  if (role !== "ADMIN") redirect("/dashboard");
  if (!tenantId) redirect("/superadmin");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/superadmin");

  const periods = await prisma.payPeriod.findMany({
    where: { tenantId },
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { payStubs: true } } },
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-6 py-10 space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <div className="label-eyebrow mb-1">Payroll</div>
            <h1 className="display text-4xl text-ink">Pay periods</h1>
            <p className="text-sm text-smoke mt-1">
              Bi-weekly pay periods for {tenant.businessName} ({tenant.state}).
            </p>
          </div>
        </div>

        <NewPeriodForm />

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dust bg-paper text-left">
                <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Period</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Pay date</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Status</th>
                <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Stubs</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-smoke italic">No pay periods yet. Create your first one above.</td></tr>
              )}
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-dust last:border-0 hover:bg-ink/5">
                  <td className="px-4 py-3">
                    <Link href={`/payroll/${p.id}`} className="font-medium text-ink hover:underline">
                      {format(p.periodStart, "MMM d")} – {format(p.periodEnd, "MMM d, yyyy")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-smoke">{format(p.payDate, "MMM d, yyyy")}</td>
                  <td className="px-4 py-3">
                    {p.status === "FINALIZED" ? (
                      <span className="chip" style={{ color: "#059669", borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)" }}>Finalized</span>
                    ) : (
                      <span className="chip" style={{ color: "#d97706", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)" }}>Draft</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{p._count.payStubs}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/payroll/${p.id}`} className="text-rust hover:underline text-xs inline-flex items-center gap-1">
                      <FileText size={11} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
