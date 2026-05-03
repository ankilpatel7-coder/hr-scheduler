import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import LlcForm from "./llc-form";

export const dynamic = "force-dynamic";

export default async function LlcSettingsPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/locations/${params.id}/llc`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);

  const location = await prisma.location.findUnique({ where: { id: params.id } });
  if (!location || location.tenantId !== tenantId) notFound();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <Link href={`/${params.tenant}/locations`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to locations
        </Link>
        <div>
          <div className="label-eyebrow mb-1">Payroll-issuer / LLC info</div>
          <h1 className="display text-3xl text-ink">{location.name}</h1>
          <p className="text-sm text-smoke mt-1">
            These fields appear on every paystub generated for employees assigned to this location.
            Each location can be a distinct LLC. Required before running payroll if you operate as an LLC.
          </p>
        </div>
        <LlcForm location={JSON.parse(JSON.stringify(location))} />
      </main>
    </div>
  );
}
