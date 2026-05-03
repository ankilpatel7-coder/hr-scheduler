import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import TenantEditForm from "./tenant-edit-form";

export default async function TenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: { users: true, locations: true, shifts: true, clockEntries: true, payPeriods: true },
      },
      users: {
        where: { role: "ADMIN" },
        select: { id: true, name: true, email: true, active: true, superAdmin: true },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!tenant) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/superadmin/tenants" className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Back to businesses
      </Link>

      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow mb-1">Business</div>
          <h1 className="display text-4xl text-ink">{tenant.businessName}</h1>
          <div className="text-sm text-smoke mt-1">
            <code className="font-mono text-rust">/{tenant.slug}</code>
            {" · "}
            <span>{tenant.state}</span>
            {" · "}
            <span>Created {format(tenant.createdAt, "MMM d, yyyy")}</span>
          </div>
        </div>
        <Link href={`/${tenant.slug}`} target="_blank" className="btn btn-secondary">
          Open dashboard <ExternalLink size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Users" value={tenant._count.users} />
        <Stat label="Locations" value={tenant._count.locations} />
        <Stat label="Shifts" value={tenant._count.shifts} />
        <Stat label="Clock-ins" value={tenant._count.clockEntries} />
        <Stat label="Pay periods" value={tenant._count.payPeriods} />
      </div>

      <TenantEditForm tenant={JSON.parse(JSON.stringify(tenant))} />

      <div className="card p-6">
        <h2 className="display text-2xl text-ink mb-4">Admins ({tenant.users.length})</h2>
        {tenant.users.length === 0 ? (
          <div className="text-sm text-smoke italic">No admin users for this tenant. Use the &quot;Add admin&quot; button below.</div>
        ) : (
          <ul className="divide-y divide-dust">
            {tenant.users.map((u) => (
              <li key={u.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-ink text-sm">
                    {u.name}
                    {u.superAdmin && <span className="ml-2 chip" style={{ color: "#7c3aed", borderColor: "rgba(139,92,246,0.3)", background: "rgba(139,92,246,0.08)" }}>Super-admin</span>}
                    {!u.active && <span className="ml-2 chip" style={{ color: "#dc2626" }}>Inactive</span>}
                  </div>
                  <div className="text-xs text-smoke">{u.email}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 pt-4 border-t border-dust">
          <Link
            href={`/superadmin/tenants/${tenant.id}/admins/new`}
            className="text-sm text-rust hover:underline"
          >
            + Add another admin
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="label-eyebrow mb-1 text-[9px]">{label}</div>
      <div className="display text-2xl text-ink font-mono">{value}</div>
    </div>
  );
}
