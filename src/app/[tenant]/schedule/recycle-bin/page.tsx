/**
 * /[tenant]/schedule/recycle-bin — restore recently deleted shifts.
 *
 * Admin only. Reads from the DeletedShift archive, so nothing here can leak
 * into the live schedule.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import RecycleBinClient from "./recycle-bin-client";

export const dynamic = "force-dynamic";

const RETAIN_DAYS = 30;

export default async function RecycleBinPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/schedule/recycle-bin`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN") redirect(`/${params.tenant}/schedule`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000);
  const deleted = await prisma.deletedShift.findMany({
    where: { tenantId, deletedAt: { gte: cutoff } },
    orderBy: { deletedAt: "desc" },
    take: 200,
  });

  const tz = tenant.timezone || "America/New_York";

  return (
    <RecycleBinClient
      tenantSlug={params.tenant}
      retainDays={RETAIN_DAYS}
      rows={deleted.map((d) => ({
        id: d.id,
        employeeName: d.employeeName,
        locationName: d.locationName,
        startIso: d.startTime.toISOString(),
        endIso: d.endTime.toISOString(),
        role: d.role,
        published: d.published,
        deletedByName: d.deletedByName,
        deletedAtIso: d.deletedAt.toISOString(),
        deleteReason: d.deleteReason,
      }))}
      timezone={tz}
    />
  );
}
