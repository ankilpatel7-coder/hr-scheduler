/**
 * /[tenant]/attendance — admin attendance report v3.
 *
 * Adds:
 *   - Early-end detection (clocked out >5 min early OR worked short by >=1h)
 *   - Combined late-and-early-end status
 *   - Manager-applied attendance reason (sick call, excused, etc.)
 *   - Excused reasons (SICK_CALL, LATE_EXCUSED, LEFT_EARLY_APPROVED) don't
 *     penalize the score; ABSENT_NO_CALL still counts as missed.
 *
 * Scoring (unchanged formula, but excused shifts skip the penalty):
 *   - Start at 100
 *   - Each MISSED unexcused shift:    -15
 *   - Each LATE unexcused shift (>=10 min): -5
 *   - Early-end: 0 (no penalty in score)
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
} from "date-fns";
import AttendanceClient, { type Row, type Shift } from "./attendance-client";

export const dynamic = "force-dynamic";

type Range = "day" | "week" | "month" | "custom";

const LATE_SCORE_MIN = 10;       // late threshold for SCORING penalty
const LATE_DISPLAY_MIN = 5;      // late threshold for displayed status
const EARLY_END_DISPLAY_MIN = 5; // clocked out X min before scheduled end
const EARLY_END_HOURS_SHORT = 1; // OR total worked short by 1+ hour

function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function resolveRange(
  range: Range,
  anchor: Date,
  customFrom?: string,
  customTo?: string,
): { from: Date; to: Date } {
  if (range === "custom" && customFrom && customTo) {
    return {
      from: startOfDay(new Date(customFrom)),
      to: endOfDay(new Date(customTo)),
    };
  }
  if (range === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (range === "week")
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

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

// Excused reasons skip the score penalty. ABSENT_NO_CALL is NOT excused.
const EXCUSED = new Set(["SICK_CALL", "LATE_EXCUSED", "LEFT_EARLY_APPROVED"]);

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { range?: Range; date?: string; from?: string; to?: string; locationId?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/attendance`);
  const role = (session.user as any).role;
  const userId = (session.user as any).id as string;
  const tenantId = (session.user as any).tenantId as string | null;
  if (!tenantId) redirect("/login");
  if (role !== "ADMIN" && role !== "MANAGER")
    redirect(`/${params.tenant}/dashboard`);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, businessName: true, timezone: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const range = (searchParams?.range as Range) ?? "week";
  const anchor = searchParams?.date ? new Date(searchParams.date) : new Date();
  const { from, to } = resolveRange(range, anchor, searchParams?.from, searchParams?.to);

  const [shifts, clockEntries, employees] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        employeeId: { not: null },
        startTime: { gte: from, lte: to },
        attendanceIgnored: false,
        ...(searchParams?.locationId ? { locationId: searchParams.locationId } : {}),
        endTime: { lte: new Date() },
        employee: { active: true, archivedAt: null },
      },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        attendanceReason: true,
        attendanceNote: true,
        attendanceSetAt: true,
        attendanceSetBy: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId,
        clockIn: { gte: from, lte: to },
// Don't filter by user.locations — Cross-location workers (e.g. assigned
        // to Ferguson, scheduled at Elizabethtown) need their entries to match
        // their shifts here. Phantom "Unknown" rows are prevented further down.
                user: {
          active: true,
          archivedAt: null,
        },
        approvalStatus: { not: "REJECTED" },
      },
      select: { id: true, userId: true, clockIn: true, clockOut: true, approvalStatus: true },
      orderBy: { clockIn: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId, active: true, archivedAt: null },
      select: { id: true, name: true, role: true },
    }),
  ]);

  // Aggregate per employee.
  const rows = new Map<string, Row>();
  const ensure = (uid: string) => {
    if (!rows.has(uid)) {
      const u = employees.find((e) => e.id === uid);
      rows.set(uid, {
        userId: uid,
        name: u?.name ?? "Unknown",
        role: u?.role ?? "—",
        scheduledHours: 0,
        actualHours: 0,
        shiftsScheduled: 0,
        shiftsMatched: 0,
        missedCount: 0,
        lateCount: 0,
        earlyCount: 0,
        earlyEndCount: 0,
        excusedCount: 0,
        totalLateMinutes: 0,
        totalEarlyMinutes: 0,
        score: 100,
        grade: "A+",
        shifts: [],
      });
    }
    return rows.get(uid)!;
  };

  const ceByUser = new Map<string, typeof clockEntries>();
  for (const ce of clockEntries) {
    const list = ceByUser.get(ce.userId) ?? [];
    list.push(ce);
    ceByUser.set(ce.userId, list);
  }

  // Iterate every published shift; match + classify.
  for (const s of shifts) {
    if (!s.employeeId) continue;
    const row = ensure(s.employeeId);
    const schedHrs = (s.endTime.getTime() - s.startTime.getTime()) / 3_600_000;
    row.scheduledHours += schedHrs;
    row.shiftsScheduled += 1;

    const candidates = ceByUser.get(s.employeeId) ?? [];
    const shiftDay = dayKeyInTz(s.startTime, tenant.timezone);
    let best: { ce: typeof clockEntries[0]; diff: number } | null = null;
    for (const ce of candidates) {
      if (dayKeyInTz(ce.clockIn, tenant.timezone) !== shiftDay) continue;
      const diff = Math.abs(ce.clockIn.getTime() - s.startTime.getTime());
      if (!best || diff < best.diff) best = { ce, diff };
    }

    const reason = s.attendanceReason ?? null;
    const excused = reason !== null && EXCUSED.has(reason);

    let status: Shift["status"];
    let deltaMin = 0;
    let earlyEndMin = 0;
    let actualClockOut: string | null = null;
    let actualHoursWorked = 0;

    if (!best) {
      // No clock-in at all → MISSED
      // ABSENT_NO_CALL counts toward missed; SICK_CALL/etc. doesn't
      if (!excused) row.missedCount += 1;
      status = "missed";
    } else {
      row.shiftsMatched += 1;
      deltaMin = (best.ce.clockIn.getTime() - s.startTime.getTime()) / 60_000;

      // Compute early-end / hours worked
      if (best.ce.clockOut) {
        actualClockOut = fmtTimeInTz(best.ce.clockOut, tenant.timezone);
        actualHoursWorked =
          (best.ce.clockOut.getTime() - best.ce.clockIn.getTime()) / 3_600_000;
        earlyEndMin =
          (s.endTime.getTime() - best.ce.clockOut.getTime()) / 60_000;
      }

      const isLateDisplay = deltaMin >= LATE_DISPLAY_MIN;
      const isLateScore = deltaMin >= LATE_SCORE_MIN;
      const isEarlyIn = deltaMin <= -LATE_DISPLAY_MIN;
      const isEarlyEnd =
        best.ce.clockOut !== null &&
        (earlyEndMin >= EARLY_END_DISPLAY_MIN ||
          (schedHrs - actualHoursWorked) >= EARLY_END_HOURS_SHORT);

      if (isLateScore && !excused) {
        row.lateCount += 1;
        row.totalLateMinutes += deltaMin;
      }
      if (isEarlyIn) {
        row.earlyCount += 1;
        row.totalEarlyMinutes += -deltaMin;
      }
      if (isEarlyEnd) {
        row.earlyEndCount += 1;
      }

      // Choose displayed status — combined cases get a compound label
      if (isLateDisplay && isEarlyEnd) status = "late-and-early-end";
      else if (isLateDisplay) status = "late";
      else if (isEarlyEnd) status = "early-end";
      else if (isEarlyIn) status = "early";
      else status = "on-time";
    }

    if (excused) row.excusedCount += 1;

    row.shifts.push({
      shiftId: s.id,
      id: s.id,
      employeeId: s.employeeId,
      dateIso: s.startTime.toISOString(),
      scheduledStart: fmtTimeInTz(s.startTime, tenant.timezone),
      scheduledEnd: fmtTimeInTz(s.endTime, tenant.timezone),
      scheduledHours: Number(schedHrs.toFixed(2)),
      actualClockIn: best ? fmtTimeInTz(best.ce.clockIn, tenant.timezone) : null,
      actualClockOut,
      actualHoursWorked: Number(actualHoursWorked.toFixed(2)),
      status,
      deltaMin: best ? Math.round(deltaMin) : null,
      earlyEndMin: best && best.ce.clockOut ? Math.round(earlyEndMin) : null,
      attendanceReason: reason,
      attendanceNote: s.attendanceNote ?? null,
      attendanceSetByName: s.attendanceSetBy?.name ?? null,
      attendanceSetAtIso: s.attendanceSetAt?.toISOString() ?? null,
    });
  }

  // Sum actual hours from APPROVED clock entries only.
  // Only count for users who already have a row (i.e. have shifts in this
  // view). Prevents clock-entry-only users from appearing as "Unknown 0/0".
  for (const ce of clockEntries) {
    if (!ce.clockOut) continue;
    if ((ce as any).approvalStatus !== "APPROVED") continue;
    if (!rows.has(ce.userId)) continue;
    const row = rows.get(ce.userId)!;
    row.actualHours += (ce.clockOut.getTime() - ce.clockIn.getTime()) / 3_600_000;
  }

  // Compute scores + grades, sort shifts within each row by date desc.
  for (const r of rows.values()) {
    let s = 100;
    s -= r.missedCount * 15;
    s -= r.lateCount * 5;
    r.score = Math.max(0, Math.round(s));
    r.grade = letterGrade(r.score);
    r.shifts.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  }

  const list = Array.from(rows.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  const anchorYmd = format(anchor, "yyyy-MM-dd");

  return (
    <div className="min-h-screen"><main className="max-w-6xl mx-auto px-6 py-10">
        <AttendanceClient
          tenantSlug={params.tenant}
          range={range}
          anchorYmd={anchorYmd}
          customFrom={searchParams?.from ?? null}
          customTo={searchParams?.to ?? null}
          locationId={searchParams?.locationId ?? null}
          viewerIsAdmin={role === "ADMIN"}
          viewerUserId={userId}
          viewerRole={role}
          rows={list}
        />
      </main>
    </div>
  );
}
