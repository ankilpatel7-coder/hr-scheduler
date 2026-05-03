/**
 * Helper for legacy root-path redirect stubs (v11 → v12 path-based URL migration).
 *
 * v11 pages had hardcoded `Link href="/dashboard"` etc. After v12.2 moved
 * everything under `/[tenant]/`, those legacy URLs 404. Rather than editing
 * every Link in every page, we keep stub pages at the old root paths that
 * redirect to the user's tenant-prefixed equivalent.
 *
 * Usage in a stub page (server component):
 *   import { redirectToTenant } from "@/lib/redirect-to-tenant";
 *   export default async function Stub() { return redirectToTenant("/clock"); }
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function redirectToTenant(targetPath: string): Promise<never> {
  const session = await getServerAuth();
  if (!session) {
    redirect(`/login?from=${encodeURIComponent(targetPath)}`);
  }
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");

  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, active: true },
  });
  if (!tenant || !tenant.active) redirect("/login");

  redirect(`/${tenant.slug}${targetPath}`);
}
