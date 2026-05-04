/**
 * Mobile home = the clock screen directly.
 * After PIN login, employee lands here. Big green/red button + selfie. Done.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MobileClockScreen from "./clock-screen";

export const dynamic = "force-dynamic";

export default async function MobileHome() {
  const session = await getServerAuth();
  if (!session) redirect("/m/login");

  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;

  if (isSuperAdmin) redirect("/superadmin");

  // Defensive: if logged in but no tenant context, force sign-out via NextAuth
  // route so the cookie clears, then back to login. This breaks the /m → /m/login
  // → /m bounce loop that "too many redirects" came from.
  if (!tenantId) {
    redirect("/api/auth/signout?callbackUrl=/m/login");
  }

  const open = await prisma.clockEntry.findFirst({
    where: { userId, tenantId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });

  return (
    <MobileClockScreen
      employeeName={(session.user as any).name ?? ""}
      initiallyClockedIn={!!open}
      clockedInAt={open?.clockIn?.toISOString() ?? null}
    />
  );
}
