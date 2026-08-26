/**
 * /[tenant]/my-timesheet — an employee's own punch history.
 *
 * SECURITY: userId comes from the session only. There is no employee
 * parameter, so there is no URL to tamper with — a user can only ever see
 * their own entries.
 *
 * Shows approved punches as the primary record, with pending and rejected
 * clearly badged. Hiding pending entries makes people think their hours
 * vanished; showing them answers the question before it's asked.
 *
 * Hours match the payroll rule: short paid breaks are not deducted, meal and
 * other unpaid breaks are.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MyTimesheetClient, { type Entry } from "./my-timesheet-client";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const VALID_DAYS = [14, 30, 60, 90, 180, 365];

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .toLowerCase()
    .replace(/\s/g, "");
}

/** Unpaid break minutes. SHORT_15 is paid and therefore not deducted. */
function unpaidBreakMinutes(
  breaks: { breakStart: Date; breakEnd: Date | null; breakType: string }[],
): number {
  let mins = 0;
  for (const b of breaks) {
    if (!b.breakEnd) continue;
    if (b.breakType === "SHORT_15") continue;
    mins += (b.breakEnd.getTime() - b.breakStart.getTime()) / 60_000;
  }
  return mins;
}

export default async function MyTimesheetPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { days?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/my-timesheet`);
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");
  const tz = tenant.timezone || "America/New_York";

  const daysRaw = Number(searchParams?.days ?? 30);
  const days = VALID_DAYS.includes(daysRaw) ? daysRaw : 30;
  const since = new Date(Date.now() - days * DAY_MS);

  const rows = await prisma.clockEntry.findMany({
    where: {
      tenantId,
      userId, // session-derived; never from the URL
      clockIn: { gte: since },
    },
    orderBy: { clockIn: "desc" },
    include: {
      breaks: {
        select: { breakStart: true, breakEnd: true, breakType: true },
        orderBy: { breakStart: "asc" },
      },
    },
  });

  const entries: Entry[] = rows.map((e) => {
    const grossMin = e.clockOut
      ? (e.clockOut.getTime() - e.clockIn.getTime()) / 60_000
      : 0;
    const unpaidMin = unpaidBreakMinutes(e.breaks);
    const netHours = Math.max(0, (grossMin - unpaidMin) / 60);
    const paidBreaks = e.breaks.filter((b) => b.breakType === "SHORT_15").length;
    const unpaidBreaks = e.breaks.length - paidBreaks;

    return {
      id: e.id,
      dateIso: e.clockIn.toISOString(),
      clockIn: fmtTime(e.clockIn, tz),
      clockOut: e.clockOut ? fmtTime(e.clockOut, tz) : null,
      netHours: Number(netHours.toFixed(2)),
      unpaidBreakMinutes: Math.round(unpaidMin),
      paidBreaks,
      unpaidBreaks,
      approvalStatus: String(e.approvalStatus),
      wasEdited: Boolean(e.editNote),
      editNote: e.editNote,
    };
  });

  const approvedHours = entries
    .filter((e) => e.approvalStatus === "APPROVED")
    .reduce((a, e) => a + e.netHours, 0);
  const pendingHours = entries
    .filter((e) => e.approvalStatus === "PENDING")
    .reduce((a, e) => a + e.netHours, 0);

  return (
    <MyTimesheetClient
      tenantSlug={params.tenant}
      employeeName={((session.user as any).name as string) || "You"}
      days={days}
      validDays={VALID_DAYS}
      entries={entries}
      approvedHours={Number(approvedHours.toFixed(2))}
      pendingHours={Number(pendingHours.toFixed(2))}
      timezone={tz}
    />
  );
}
