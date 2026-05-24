/**
 * /[tenant]/attendance — admin attendance report v2.
 *
 * Server-side: pull shifts + clock entries for the range, match them, compute
 * per-person scoreboard rows + per-shift detail rows. Pass to the client
 * component which handles charts, sorting, expand/collapse, and date arrows.
 *
 * Scoring model (industry-standard "attendance points", inverted to a 0-100
 * reliability score so higher = better):
 *
 *   - Start at 100
 *   - Each missed shift:                 -15
 *   - Each shift late by >=10 minutes:    -5
 *   - Each shift early by >=10 minutes:    0 (no penalty, no bonus)
 *   - Each shift within +/-10 minutes:     0 (on time)
 *
 * Grade: A+ (95+), A (90+), B+ (85+), B (80+), C+ (75+), C (70+), D (60+), F.
 *
 * Threshold: shifts with no matching clock-in within ±2h of scheduled start
 * count as MISSED. Otherwise, the difference between actual clock-in and
 * scheduled start is bucketed into Early (>=10 min before), On-time
 * (within ±10 min), or Late (>=10 min after).
 */

import { redirect } from "next/navigation";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  addDays,
  format,
} from "date-fns";
import AttendanceClient, { type Row, type Shift } from "./attendance-client";

export const dynamic = "force-dynamic";

type Range = "day" | "week" | "month";

const LATE_MIN = 10; // minutes
const MATCH_WINDOW_MS = 2 * 60 * 60 * 1000; // ±2h to match clock entry to shift

function resolveRange(range: Range, anchor: Date) {
  if (range === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (range === "week")
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

function fmtTimeInTz(d: Date, tz: string): string {
  // "9:45am" / "1:45pm" — lowercase, no space, in the tenant's timezone.
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

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { range?: Range; date?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/attendance`);
  const role = (session.user as any).role;
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
  const { from, to } = resolveRange(range, anchor);

  const [shifts, clockEntries, employees] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        employeeId: { not: null },
        startTime: { gte: from, lte: to },
        // Only count shifts that have actually ended. Future and in-progress
        // shifts can't be evaluated yet, and including them makes new hires
        // (or anyone with upcoming shifts) appear "missed" before their
        // first actual workday.
        endTime: { lte: new Date() },
        // Exclude shifts whose assigned employee is inactive/archived so
        // stale shifts from ex-employees don't pollute attendance reports.
        employee: { active: true, archivedAt: null },
      },
      select: {
        id: true,
        employeeId: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId,
        clockIn: { gte: from, lte: to },
        // Exclude clock entries from archived/inactive users so they don't
        // appear as "Unknown 0/0" on the leaderboard.
        user: { active: true, archivedAt: null },
      },
      select: { id: true, userId: true, clockIn: true, clockOut: true },
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
    let best: { ce: any; diff: number } | null = null;
    for (const ce of candidates) {
      const diff = Math.abs(ce.clockIn.getTime() - s.startTime.getTime());
      if (diff > MATCH_WINDOW_MS) continue;
      if (!best || diff < best.diff) best = { ce, diff };
    }

    let status: Shift["status"];
    let deltaMin = 0;
    if (!best) {
      row.missedCount += 1;
      status = "missed";
    } else {
      row.shiftsMatched += 1;
      deltaMin =
        (best.ce.clockIn.getTime() - s.startTime.getTime()) / 60_000;
      if (deltaMin <= -LATE_MIN) {
        row.earlyCount += 1;
        row.totalEarlyMinutes += -deltaMin;
        status = "early";
      } else if (deltaMin >= LATE_MIN) {
        row.lateCount += 1;
        row.totalLateMinutes += deltaMin;
        status = "late";
      } else {
        status = "on-time";
      }
    }

    row.shifts.push({
      id: s.id,
      dateIso: s.startTime.toISOString(),
      scheduledStart: fmtTimeInTz(s.startTime, tenant.timezone),
      scheduledEnd: fmtTimeInTz(s.endTime, tenant.timezone),
      actualClockIn: best ? fmtTimeInTz(best.ce.clockIn, tenant.timezone) : null,
      status,
      deltaMin: best ? Math.round(deltaMin) : null,
    });
  }

  // Sum actual hours from ALL clock entries (matched or not).
  for (const ce of clockEntries) {
    if (!ce.clockOut) continue;
    const row = ensure(ce.userId);
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

  // Date for the date picker URL state.
  const anchorYmd = format(anchor, "yyyy-MM-dd");

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <AttendanceClient
          tenantSlug={params.tenant}
          range={range}
          anchorYmd={anchorYmd}
          rows={list}
        />
      </main>
    </div>
  );
}
