/**
 * Root page — intelligent redirect based on session AND device.
 *
 * Mobile users get the PWA login at /m (PIN keypad).
 * Desktop users get the regular flow.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isMobileUA(ua: string): boolean {
  return /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|Windows Phone/i.test(ua);
}

export default async function RootPage() {
  const ua = headers().get("user-agent") ?? "";
  const mobile = isMobileUA(ua);

  const session = await getServerAuth();

  if (!session) {
    // Send mobile to PIN keypad, desktop to email/password
    redirect(mobile ? "/m/login" : "/login");
  }

  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");

  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) redirect(mobile ? "/m/login" : "/login");

  // Mobile users with a valid tenant go straight to clock screen
  if (mobile) redirect("/m");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, active: true },
  });
  if (!tenant || !tenant.active) redirect("/login");

  redirect(`/${tenant.slug}/dashboard`);
}
