/**
 * v12.2 root page — intelligent redirect based on session.
 *
 * Not logged in → /login
 * Super-admin → /superadmin
 * Tenant user → /<tenant-slug>/dashboard
 * Tenant user but no slug found → /login (degenerate; should never happen)
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getServerAuth();
  if (!session) redirect("/login");

  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");

  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) redirect("/login"); // shouldn't happen

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, active: true },
  });
  if (!tenant || !tenant.active) redirect("/login");

  redirect(`/${tenant.slug}/dashboard`);
}
