/**
 * Tenant-prefixed W-4 / payroll-tax settings page.
 * URL: /[tenant]/employees/[id]/w4
 *
 * Replaces the legacy /employees/[id]/w4 path. Old path now redirects here
 * via redirectToTenant.
 */

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import W4Form from "./w4-form";

export const dynamic = "force-dynamic";

export default async function W4Page({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/employees/${params.id}/w4`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant || tenant.id !== tenantId || !tenant.active) redirect("/login");

  const employee = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      tenantId: true,
      filingStatus: true,
      multipleJobsCheckbox: true,
      dependentsCredit: true,
      otherIncome: true,
      deductionsAdjustment: true,
      extraWithholding: true,
      kyExemptionsAllowance: true,
    },
  });
  if (!employee || employee.tenantId !== tenantId) notFound();

  return (
    <div className="min-h-screen"><main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <Link
          href={`/${params.tenant}/employees/${employee.id}`}
          className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back to employee profile
        </Link>
        <div>
          <div className="label-eyebrow mb-1">Payroll / W-4 settings</div>
          <h1 className="display text-3xl text-ink">{employee.name}</h1>
          <p className="text-sm text-smoke mt-1">
            These values come from the employee&apos;s federal W-4 form
            {tenant.state === "KY" ? " (and KY DOR Form K-4)" : " (and applicable state withholding form)"}.
            They drive tax withholding on every paystub. If unset, payroll falls
            back to <span className="font-medium">Single, no adjustments</span> —
            the IRS-required default.
          </p>
        </div>
        <W4Form
          employee={JSON.parse(JSON.stringify(employee))}
          state={tenant.state ?? null}
        />
      </main>
    </div>
  );
}
