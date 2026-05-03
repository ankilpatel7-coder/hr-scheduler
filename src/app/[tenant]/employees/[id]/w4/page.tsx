import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import W4Form from "./w4-form";

export const dynamic = "force-dynamic";

export default async function W4Page({ params }: { params: { id: string } }) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/employees/${params.id}/w4`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (role !== "ADMIN") redirect("/dashboard");
  if (!tenantId) redirect("/superadmin");

  const employee = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, tenantId: true,
      filingStatus: true, multipleJobsCheckbox: true,
      dependentsCredit: true, otherIncome: true,
      deductionsAdjustment: true, extraWithholding: true,
      kyExemptionsAllowance: true,
    },
  });
  if (!employee || employee.tenantId !== tenantId) notFound();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <Link href={`/employees/${employee.id}`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to employee profile
        </Link>
        <div>
          <div className="label-eyebrow mb-1">Payroll / W-4 settings</div>
          <h1 className="display text-3xl text-ink">{employee.name}</h1>
          <p className="text-sm text-smoke mt-1">
            These values come from the employee&apos;s federal W-4 form ({tenant?.state === "KY" ? "and KY DOR Form K-4" : "and applicable state withholding form"}). They directly affect tax withholding on every paystub.
          </p>
        </div>
        <W4Form employee={JSON.parse(JSON.stringify(employee))} state={tenant?.state ?? null} />
      </main>
    </div>
  );
}
