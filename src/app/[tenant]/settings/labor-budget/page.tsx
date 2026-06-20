/**
 * /[tenant]/settings/labor-budget
 *
 * Admin settings page for editing the per-day + weekly labor cost budget.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArrowLeft, DollarSign } from "lucide-react";
import LaborBudgetForm from "./labor-budget-form";

export const dynamic = "force-dynamic";

export default async function LaborBudgetSettingsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/settings/labor-budget`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const budget = (await prisma.laborBudget.findUnique({
    where: { tenantId },
  })) ?? {
    budgetMon: 0, budgetTue: 0, budgetWed: 0, budgetThu: 0,
    budgetFri: 0, budgetSat: 0, budgetSun: 0, budgetWeekly: 0,
  };

  return (
    <div className="min-h-screen"><main className="max-w-2xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/schedule`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} />
          Back to schedule
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <DollarSign size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Labor budget</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Set daily caps on labor cost. The schedule page shows projected cost
          vs. budget per day with green/amber/red indicators. Set any amount
          to <strong>0</strong> to disable the warning for that day.
        </p>

        <LaborBudgetForm
          tenantSlug={params.tenant}
          initial={{
            budgetMon: budget.budgetMon,
            budgetTue: budget.budgetTue,
            budgetWed: budget.budgetWed,
            budgetThu: budget.budgetThu,
            budgetFri: budget.budgetFri,
            budgetSat: budget.budgetSat,
            budgetSun: budget.budgetSun,
            budgetWeekly: budget.budgetWeekly,
          }}
        />
      </main>
    </div>
  );
}
