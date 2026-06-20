/**
 * /[tenant]/my-attendance — employee's own attendance scoreboard.
 *
 * Mirrors the admin attendance scoring (start at 100, missed -15, late -5,
 * early/on-time no penalty) but scoped to the logged-in user only.
 *
 * Read-only. No Ignore button. Defaults to last 14 days, options for 30/90/custom.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subDays,
  format,
} from "date-fns";
import MyAttendanceClient, { type MyRow, type MyShift } from "./my-attendance-client";

export const dynamic = "force-dynamic";

type Range = "14d" | "30d" | "90d" | "custom";
const LATE_MIN = 10;
const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

function fmtTimeInTz(d: Date, tz: string): string {
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

function letterGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "B+";
  if (score >= 80) return "B";
  if (score >= 75) return "C+";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function resolveRange(
  range: Range,
  from?: string,
  to?: string,
): { from: Date; to: Date } {
  const today = endOfDay(new Date());
  if (range === "custom" && from && to) {
    return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }
  const days = range === "14d" ? 14 : range === "30d" ? 30 : 90;
  return { from: startOfDay(subDays(today, days)), to: today };
}

export default async function MyAttendancePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { range?: Range; from?: string; to?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/my-attendance`);
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const range = (searchParams?.range as Range) ?? "14d";
  const { from, to } = resolveRange(range, searchParams?.from, searchParams?.to);

  const [shifts, clockEntries] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        employeeId: userId,
        startTime: { gte: from, lte: to },
        endTime: { lte: new Date() },
        attendanceIgnored: false,
      },
      select: { id: true, startTime: true, endTime: true },
      orderBy: { startTime: "desc" },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId,
        userId,
        clockIn: { gte: from, lte: to },
        approvalStatus: "APPROVED",
      },
      select: { id: true, clockIn: true, clockOut: true },
    }),
  ]);

  // Match shifts to clock entries + classify
  let scheduledHours = 0;
  let actualHours = 0;
  let missedCount = 0;
  let lateCount = 0;
  let earlyCount = 0;
  let onTimeCount = 0;
  let totalLateMin = 0;
  let totalEarlyMin = 0;
  const shiftDetails: MyShift[] = [];

  for (const s of shifts) {
    const hours = (s.endTime.getTime() - s.startTime.getTime()) / 3_600_000;
    scheduledHours += hours;

    let best: { ce: any; diff: number } | null = null;
    for (const ce of clockEntries) {
      const diff = Math.abs(ce.clockIn.getTime() - s.startTime.getTime());
      if (diff > MATCH_WINDOW_MS) continue;
      if (!best || diff < best.diff) best = { ce, diff };
    }

    let status: MyShift["status"];
    let deltaMin = 0;
    if (!best) {
      missedCount += 1;
      status = "missed";
    } else {
      deltaMin = (best.ce.clockIn.getTime() - s.startTime.getTime()) / 60_000;
      if (deltaMin <= -LATE_MIN) {
        earlyCount += 1;
        totalEarlyMin += -deltaMin;
        status = "early";
      } else if (deltaMin >= LATE_MIN) {
        lateCount += 1;
        totalLateMin += deltaMin;
        status = "late";
      } else {
        onTimeCount += 1;
        status = "on-time";
      }
    }

    shiftDetails.push({
      id: s.id,
      dateIso: s.startTime.toISOString(),
      scheduledStart: fmtTimeInTz(s.startTime, tenant.timezone),
      scheduledEnd: fmtTimeInTz(s.endTime, tenant.timezone),
      actualClockIn: best ? fmtTimeInTz(best.ce.clockIn, tenant.timezone) : null,
      status,
      deltaMin: best ? Math.round(deltaMin) : null,
    });
  }

  // Actual hours from all clock entries
  for (const ce of clockEntries) {
    if (!ce.clockOut) continue;
    actualHours += (ce.clockOut.getTime() - ce.clockIn.getTime()) / 3_600_000;
  }

  // Compute score
  let score = 100;
  score -= missedCount * 15;
  score -= lateCount * 5;
  score = Math.max(0, Math.round(score));

  // Streak: count consecutive most-recent shifts that are on-time or early (no late/missed)
  let streak = 0;
  for (const s of shiftDetails) {
    if (s.status === "on-time" || s.status === "early") streak += 1;
    else break;
  }

  const row: MyRow = {
    score,
    grade: letterGrade(score),
    scheduledHours,
    actualHours,
    shiftsScheduled: shifts.length,
    shiftsMatched: shifts.length - missedCount,
    missedCount,
    lateCount,
    earlyCount,
    onTimeCount,
    avgLateMin: lateCount > 0 ? Math.round(totalLateMin / lateCount) : 0,
    avgEarlyMin: earlyCount > 0 ? Math.round(totalEarlyMin / earlyCount) : 0,
    streak,
    shifts: shiftDetails,
  };

  return (
    <div className="min-h-screen"><main className="max-w-3xl mx-auto px-6 py-10">
        <MyAttendanceClient
          tenantSlug={params.tenant}
          range={range}
          customFrom={searchParams?.from ?? null}
          customTo={searchParams?.to ?? null}
          row={row}
          employeeName={(session.user as any).name as string}
        />
      </main>
    </div>
  );
}
