import Link from "next/link";
import { prisma } from "@/lib/db";
import { Plus, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export default async function TenantsListPage() {
  const tenants = await prisma.tenant.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: { users: true, locations: true, shifts: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow mb-1">All businesses</div>
          <h1 className="display text-4xl text-ink">Tenants</h1>
        </div>
        <Link href="/_admin/tenants/new" className="btn btn-primary">
          <Plus size={14} /> Add business
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dust bg-paper text-left">
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Business</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">URL slug</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">State</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Users</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium text-right">Locations</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Status</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Created</th>
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] text-smoke font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-smoke italic">
                  No businesses yet. <Link href="/_admin/tenants/new" className="text-rust underline">Add the first one →</Link>
                </td>
              </tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="border-b border-dust last:border-0 hover:bg-ink/5">
                <td className="px-4 py-3">
                  <Link href={`/_admin/tenants/${t.id}`} className="font-medium text-ink hover:underline">
                    {t.businessName}
                  </Link>
                  {t.legalName && t.legalName !== t.businessName && (
                    <div className="text-[11px] text-smoke">Legal: {t.legalName}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="font-mono text-xs text-rust">/{t.slug}</code>
                </td>
                <td className="px-4 py-3 text-smoke">{t.state}</td>
                <td className="px-4 py-3 text-right font-mono">{t._count.users}</td>
                <td className="px-4 py-3 text-right font-mono">{t._count.locations}</td>
                <td className="px-4 py-3">
                  {t.active ? (
                    <span className="chip" style={{ color: "#059669", borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.08)" }}>Active</span>
                  ) : (
                    <span className="chip" style={{ color: "#dc2626", borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-smoke font-mono">
                  {format(t.createdAt, "MMM d, yyyy")}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/${t.slug}`}
                    target="_blank"
                    title="Open this tenant's dashboard"
                    className="text-smoke hover:text-ink inline-flex items-center gap-1 text-xs"
                  >
                    Open <ExternalLink size={11} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
