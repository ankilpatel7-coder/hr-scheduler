/**
 * Admin settings — manage Roles + Tags for shift scheduling.
 * URL: /[tenant]/settings/shift-categories
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import CategoriesManager from "./categories-manager";

export const dynamic = "force-dynamic";

export default async function ShiftCategoriesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/settings/shift-categories`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);
  if (!tenantId) redirect("/login");

  const [roles, tags] = await Promise.all([
    prisma.shiftRole.findMany({
      where: { tenantId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.shiftTag.findMany({
      where: { tenantId, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <Link
          href={`/${params.tenant}/dashboard`}
          className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </Link>

        <div>
          <div className="label-eyebrow mb-1">Settings</div>
          <h1 className="display text-4xl text-ink">Shift categories</h1>
          <p className="text-sm text-smoke mt-2 max-w-xl">
            Roles group shifts on the schedule (e.g. <code>Budtender</code>, <code>Lead</code>,{" "}
            <code>Management</code>). Tags add a colored pill to individual shifts (e.g.{" "}
            <code>Delivery</code>, <code>Sales</code>). Both are admin-managed and tenant-specific.
          </p>
        </div>

        <CategoriesManager
          initialRoles={JSON.parse(JSON.stringify(roles))}
          initialTags={JSON.parse(JSON.stringify(tags))}
        />
      </main>
    </div>
  );
}
