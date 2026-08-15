/**
 * /[tenant]/timesheets/deleted — restore deleted timesheet punches.
 *
 * Admin only. Reads the DeletedClockEntry archive, so nothing here can leak
 * into payroll or the live timesheet.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DeletedTimesheetsClient from "./deleted-client";

export const dynamic = "force-dynamic";

const RETAIN_DAYS = 30;

export default async function DeletedTimesheetsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/timesheets/deleted`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN") redirect(`/${params.tenant}/timesheets`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000);
  const rows = await prisma.deletedClockEntry.findMany({
    where: { tenantId, deletedAt: { gte: cutoff } },
    orderBy: { deletedAt: "desc" },
    take: 200,
    select: {
      id: true,
      userName: true,
      clockIn: true,
      clockOut: true,
      approvalStatus: true,
      breakCount: true,
      deletedByName: true,
      deletedAt: true,
      deleteReason: true,
    },
  });

  return (
    <DeletedTimesheetsClient
      tenantSlug={params.tenant}
      retainDays={RETAIN_DAYS}
      timezone={tenant.timezone || "America/New_York"}
      rows={rows.map((r) => ({
        id: r.id,
        userName: r.userName,
        clockInIso: r.clockIn.toISOString(),
        clockOutIso: r.clockOut ? r.clockOut.toISOString() : null,
        approvalStatus: r.approvalStatus,
        breakCount: r.breakCount,
        deletedByName: r.deletedByName,
        deletedAtIso: r.deletedAt.toISOString(),
        deleteReason: r.deleteReason,
      }))}
    />
  );
}
