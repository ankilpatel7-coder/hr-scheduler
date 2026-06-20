/**
 * /[tenant]/timesheets/approvals
 *
 * Daily approval queue. Lists clock entries grouped by date + employee with
 * quick approve / reject controls. Bulk "Approve all visible" button.
 *
 * Defaults to "last 14 days, PENDING only". Filter by date, employee, status.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import ApprovalQueue from "@/components/approval-queue";

export const dynamic = "force-dynamic";

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

export default async function ClockApprovalsPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { from?: string; to?: string; status?: string; employeeId?: string; locationId?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/timesheets/approvals`);
  const role = (session.user as any).role;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect(`/${params.tenant}/dashboard`);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const now = new Date();
  const defaultFrom = startOfDay(subDays(now, 14));
  const defaultTo = endOfDay(now);
  const from = parseDate(searchParams.from, defaultFrom);
  const to = parseDate(searchParams.to, defaultTo);
  const statusFilter = (searchParams.status ?? "PENDING") as "ALL" | "PENDING" | "APPROVED" | "REJECTED";
  const employeeId = searchParams.employeeId || null;
  const locationId = searchParams.locationId || null;

  const where: any = {
    tenantId,
    clockIn: { gte: from, lte: to },
  };
  if (statusFilter !== "ALL") where.approvalStatus = statusFilter;
  if (employeeId) where.userId = employeeId;
  // Always exclude entries from archived/inactive users
  where.user = { active: true, archivedAt: null };
  if (locationId) {
    where.user.locations = { some: { locationId } };
  }

  const [entries, employees, locations] = await Promise.all([
    prisma.clockEntry.findMany({
      where,
      orderBy: [{ clockIn: "desc" }],
      include: {
        user: { select: { id: true, name: true, hourlyWage: true } },
        approvedBy: { select: { id: true, name: true } },
        breaks: { select: { id: true, breakStart: true, breakEnd: true, breakType: true }, orderBy: { breakStart: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: {
        tenantId,
        role: { not: "ADMIN" },
        active: true,
        archivedAt: null,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Stats
  const pendingCount = entries.filter((e) => e.approvalStatus === "PENDING").length;
  const approvedCount = entries.filter((e) => e.approvalStatus === "APPROVED").length;
  const rejectedCount = entries.filter((e) => e.approvalStatus === "REJECTED").length;

  return (
    <div className="min-h-screen"><main className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/timesheets`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to timesheets
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <ClipboardCheck size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Clock approval</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Approve or reject each employee&rsquo;s clock-in/out before it counts
          toward payroll. Default view: <strong>pending entries from the last 14 days</strong>.
        </p>

        <ApprovalQueue
          tenantSlug={params.tenant}
          fromIso={from.toISOString()}
          toIso={to.toISOString()}
          statusFilter={statusFilter}
          employeeIdFilter={employeeId}
          employees={employees}
          entries={entries.map((e) => ({
            id: e.id,
            userId: e.user.id,
            userName: e.user.name,
            hourlyWage: e.user.hourlyWage,
            clockIn: e.clockIn.toISOString(),
            clockOut: e.clockOut ? e.clockOut.toISOString() : null,
            approvalStatus: e.approvalStatus as "PENDING" | "APPROVED" | "REJECTED",
            approvedByName: e.approvedBy?.name ?? null,
            approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
            approvalNote: e.approvalNote,
            addressIn: e.addressIn,
            addressOut: e.addressOut,
            breaks: e.breaks.map((b: any) => ({
              id: b.id,
              breakStart: b.breakStart.toISOString(),
              breakEnd: b.breakEnd ? b.breakEnd.toISOString() : null,
              breakType: b.breakType as "SHORT_15" | "MEAL_30" | "OTHER",
            })),
          }))}
          locations={locations}
          locationIdFilter={locationId}
          tenantTimezone={tenant.timezone}
          totals={{ pending: pendingCount, approved: approvedCount, rejected: rejectedCount }}
        />
      </main>
    </div>
  );
}
