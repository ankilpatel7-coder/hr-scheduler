/**
 * /[tenant]/employees/[id]/payroll-setup
 *
 * Server component — auth + initial data load. Renders PayrollSetupForm.
 * Mirrors the W-4 page pattern.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArrowLeft, Coins } from "lucide-react";
import { LOCAL_TAX_JURISDICTIONS } from "@/lib/payroll/local-tax";
import PayrollSetupForm from "./payroll-form";

export const dynamic = "force-dynamic";

export default async function PayrollSetupPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/employees/${params.id}/payroll-setup`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect(`/${params.tenant}/dashboard`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, state: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const employee = await prisma.user.findFirst({
    where: { id: params.id, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      primaryLocationId: true,
      primaryLocation: { select: { id: true, name: true, locState: true, legalName: true } },
      localTaxJurisdiction: true,
      preTax401kPercent: true,
      preTax401kAmount: true,
      preTaxHealthPremium: true,
      preTaxHsaAmount: true,
      preTaxFsaAmount: true,
    },
  });
  if (!employee) redirect(`/${params.tenant}/employees`);

  const locations = await prisma.location.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true, locState: true, legalName: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/employees/${employee.id}`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} />
          Back to {employee.name}
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <Coins size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Payroll setup</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Per-employee payroll configuration. Drives which LLC issues this
          employee&rsquo;s paystub, which state&rsquo;s taxes apply, and any
          pre-tax deductions (401(k), Section&nbsp;125).
        </p>

        <PayrollSetupForm
          employeeId={employee.id}
          tenantSlug={params.tenant}
          tenantState={tenant.state}
          locations={locations}
          jurisdictions={LOCAL_TAX_JURISDICTIONS}
          initial={{
            primaryLocationId: employee.primaryLocationId,
            primaryLocationLabel: employee.primaryLocation?.name ?? null,
            primaryLocationState: employee.primaryLocation?.locState ?? null,
            localTaxJurisdiction: employee.localTaxJurisdiction,
            preTax401kPercent: employee.preTax401kPercent,
            preTax401kAmount: employee.preTax401kAmount,
            preTaxHealthPremium: employee.preTaxHealthPremium,
            preTaxHsaAmount: employee.preTaxHsaAmount,
            preTaxFsaAmount: employee.preTaxFsaAmount,
          }}
        />
      </main>
    </div>
  );
}
