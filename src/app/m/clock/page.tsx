import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MobileClockForm from "./form";

export const dynamic = "force-dynamic";

export default async function MobileClockPage() {
  const session = await getServerAuth();
  if (!session) redirect("/m/login");
  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) redirect("/m/login");

  const open = await prisma.clockEntry.findFirst({
    where: { userId, tenantId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });

  return <MobileClockForm initiallyClockedIn={!!open} clockedInAt={open?.clockIn?.toISOString() ?? null} />;
}
