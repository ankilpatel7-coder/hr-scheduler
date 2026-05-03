/**
 * v12.2: Tenant layout — validates the [tenant] URL segment.
 *
 * Every page under src/app/[tenant]/ is wrapped by this layout. It:
 *   - Looks up the tenant by slug from the URL
 *   - Verifies the requesting user belongs to that tenant (or is super-admin)
 *   - 404s if tenant doesn't exist; redirects to /superadmin if user is wrong tenant
 */

import { notFound, redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, slug: true, businessName: true, active: true },
  });
  if (!tenant || !tenant.active) notFound();

  const userTenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;

  // Super-admins can view any tenant. Regular users only their own.
  if (!isSuperAdmin && userTenantId !== tenant.id) {
    // If they have a tenant, send them to their tenant's dashboard
    if (userTenantId) {
      const ownTenant = await prisma.tenant.findUnique({ where: { id: userTenantId }, select: { slug: true } });
      if (ownTenant) redirect(`/${ownTenant.slug}/dashboard`);
    }
    // Otherwise (no tenant), send to superadmin (if super-admin) or login
    redirect("/login");
  }

  return <>{children}</>;
}
