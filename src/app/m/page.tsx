/**
 * Mobile home = the clock screen directly.
 * After PIN login, employee lands here. Big green/red button + selfie. Done.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MobileClockScreen from "./clock-screen";
import AutoSignout from "./auto-signout";

export const dynamic = "force-dynamic";

export default async function MobileHome() {
  const session = await getServerAuth();
  if (!session) redirect("/m/login");

  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;

  if (isSuperAdmin) redirect("/superadmin");

  // Stale/partial session (e.g. old JWT without tenantId field):
  // render the auto-signout recovery component instead of redirecting to
  // NextAuth's confirmation page. This silently clears the cookie and sends
  // the user to /m/login — no clicks needed.
  if (!tenantId) {
    return <AutoSignout />;
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
