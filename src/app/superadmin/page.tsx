import Link from "next/link";
import { prisma } from "@/lib/db";
import { Building2, Users, Plus } from "lucide-react";

export default async function AdminHome() {
  const [tenantCount, activeTenantCount, userCount, superAdminCount] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { active: true } }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.count({ where: { superAdmin: true } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <div className="label-eyebrow mb-1">Overview</div>
        <h1 className="display text-4xl text-ink">All businesses</h1>
        <p className="text-sm text-smoke mt-1">
          Manage every business hosted on Shiftwork from here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Active businesses" value={activeTenantCount} sub={`${tenantCount} total`} />
        <StatCard label="Active users" value={userCount} sub="across all businesses" />
        <StatCard label="Super admins" value={superAdminCount} sub="incl. you" />
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="display text-2xl text-ink">Quick actions</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/superadmin/tenants"
            className="border border-dust rounded p-4 hover:border-ink/30 hover:bg-ink/5 transition flex items-start gap-3"
          >
            <Building2 size={20} className="text-rust mt-0.5" />
            <div>
              <div className="font-medium text-ink">Manage businesses</div>
              <div className="text-xs text-smoke mt-0.5">View, edit, deactivate tenant accounts</div>
            </div>
          </Link>
          <Link
            href="/superadmin/tenants/new"
            className="border border-dust rounded p-4 hover:border-ink/30 hover:bg-ink/5 transition flex items-start gap-3"
          >
            <Plus size={20} className="text-rust mt-0.5" />
            <div>
              <div className="font-medium text-ink">Add new business</div>
              <div className="text-xs text-smoke mt-0.5">Create a new tenant + initial admin user</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="card p-5">
      <div className="label-eyebrow mb-2">{label}</div>
      <div className="display text-4xl text-ink">{value}</div>
      <div className="text-xs text-smoke mt-1">{sub}</div>
    </div>
  );
}
