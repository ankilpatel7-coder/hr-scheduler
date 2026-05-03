/**
 * Locations LLC overview — lists every location in the tenant with a quick link
 * to edit each one's LLC / payroll-issuer info. Easier UX than knowing each
 * location's ID upfront.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MapPin, FileText, Check, AlertCircle } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";

export const dynamic = "force-dynamic";

export default async function LocationsLlcOverview({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/locations/llc`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (role !== "ADMIN") redirect(`/${params.tenant}/dashboard`);

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant || tenant.id !== tenantId) redirect(`/${params.tenant}/dashboard`);

  const locations = await prisma.location.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Link href={`/${params.tenant}/locations`} className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to locations
        </Link>
        <div>
          <div className="label-eyebrow mb-1">LLC / Payroll-issuer info</div>
          <h1 className="display text-3xl text-ink">Per-location LLC settings</h1>
          <p className="text-sm text-smoke mt-1">
            Each location can be a distinct LLC. The legal name + address + EIN you set here appear on every paystub for employees assigned to that location.
          </p>
        </div>

        <div className="card overflow-hidden">
          {locations.length === 0 ? (
            <div className="p-8 text-center text-smoke italic">No locations yet. Add a location first via /{params.tenant}/locations.</div>
          ) : (
            <ul className="divide-y divide-dust">
              {locations.map((loc) => {
                const hasLlc = !!loc.legalName && !!loc.addressLine1;
                return (
                  <li key={loc.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <MapPin size={16} className="text-smoke mt-1 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-ink truncate">{loc.name}</div>
                        {hasLlc ? (
                          <div className="text-xs text-smoke truncate">
                            <span className="text-moss inline-flex items-center gap-1"><Check size={11} /> LLC: {loc.legalName}</span>
                            {loc.federalEIN && <span className="ml-3 font-mono">EIN {loc.federalEIN.slice(0,2)}-{loc.federalEIN.slice(2)}</span>}
                          </div>
                        ) : (
                          <div className="text-xs text-amber-700 inline-flex items-center gap-1">
                            <AlertCircle size={11} /> No LLC info — paystubs will use tenant fallback
                          </div>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/${params.tenant}/locations/${loc.id}/llc`}
                      className="btn btn-secondary text-xs shrink-0"
                    >
                      <FileText size={12} /> Edit LLC info
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
