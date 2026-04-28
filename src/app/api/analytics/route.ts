import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireAuth,
  getScopedEmployeeIds,
  getScopedLocationIds,
  isStaff,
} from "@/lib/guards";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subWeeks,
  format,
  addDays,
} from "date-fns";

function durationHours(a: Date, b: Date | null) {
  if (!b) return 0;
  return (b.getTime() - a.getTime()) / 3_600_000;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (isStaff(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const locationFilter = searchParams.get("locationId") || null;
  const isAdmin = auth.role === "ADMIN";

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Manager scope: which employees can they see?
  const scopedEmployeeIds =
    auth.role === "MANAGER"
      ? await getScopedEmployeeIds(auth.userId, "MANAGER")
      : null;
  const scopedLocationIds =
    auth.role === "MANAGER"
      ? await getScopedLocationIds(auth.userId, "MANAGER")
      : null;

  // Build the location filter combining user's scope + their UI selection
  const locationWhere = (() => {
    if (locationFilter) {
      // If manager, ensure the chosen location is in their scope
      if (
        scopedLocationIds &&
        !scopedLocationIds.includes(locationFilter)
      ) {
        return { id: "__none__" };
      }
      return { id: locationFilter };
    }
    if (scopedLocationIds) {
      return { id: { in: scopedLocationIds } };
    }
    return undefined;
  })();

  // ────────────── Today's Roster ──────────────
  // Show all shifts (drafts + published) — admins/managers manage their team and need to see drafts too.
  // Employees see only published shifts via /api/shifts (this endpoint is admin/manager only via the role check above).
  const todayShiftsRaw = await prisma.shift.findMany({
    where: {
      startTime: { gte: todayStart, lte: todayEnd },
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(locationFilter ? { locationId: locationFilter } : {}),
      ...(scopedLocationIds && !locationFilter
        ? { locationId: { in: scopedLocationIds } }
        : {}),
    },
    orderBy: { startTime: "asc" },
    include: {
      employee: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          department: true,
        },
      },
      location: { select: { id: true, name: true } },
    },
  });

  // Get current clock state for each employee in roster
  const empIds = todayShiftsRaw.map((s) => s.employeeId);
  const openClockIns =
    empIds.length > 0
      ? await prisma.clockEntry.findMany({
          where: {
            userId: { in: empIds },
            clockOut: null,
          },
        })
      : [];
  const recentClockOuts =
    empIds.length > 0
      ? await prisma.clockEntry.findMany({
          where: {
            userId: { in: empIds },
            clockOut: { gte: todayStart },
          },
        })
      : [];

  const openByUser = new Map(openClockIns.map((e) => [e.userId, e]));
  const completedByUser = new Map<string, Date>();
  for (const e of recentClockOuts) {
    if (e.clockOut) completedByUser.set(e.userId, e.clockOut);
  }

  const roster = todayShiftsRaw.map((s) => {
    const open = openByUser.get(s.employeeId);
    const completed = completedByUser.get(s.employeeId);
    let status: "scheduled" | "clocked_in" | "completed" | "no_show";
    if (open) status = "clocked_in";
    else if (completed) status = "completed";
    else if (s.startTime < now) status = "no_show";
    else status = "scheduled";
    return {
      shiftId: s.id,
      employee: s.employee,
      location: s.location,
      startTime: s.startTime,
      endTime: s.endTime,
      role: s.role,
      status,
      clockedInAt: open?.clockIn ?? null,
    };
  });

  // ────────────── Weekly Hours (sched vs actual, by day) ──────────────
  const scheduledThisWeek = await prisma.shift.findMany({
    where: {
      startTime: { gte: weekStart, lte: weekEnd },
      published: true,
      ...(scopedEmployeeIds ? { employeeId: { in: scopedEmployeeIds } } : {}),
      ...(locationFilter ? { locationId: locationFilter } : {}),
      ...(scopedLocationIds && !locationFilter
        ? { locationId: { in: scopedLocationIds } }
        : {}),
    },
    select: {
      startTime: true,
      endTime: true,
      employeeId: true,
      employee: { select: { hourlyWage: true } },
      locationId: true,
    },
  });

  const actualThisWeek = await prisma.clockEntry.findMany({
    where: {
      clockIn: { gte: weekStart, lte: weekEnd },
      ...(scopedEmployeeIds ? { userId: { in: scopedEmployeeIds } } : {}),
    },
    include: { user: { select: { hourlyWage: true } } },
  });

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const weeklyByDay = days.map((d) => {
    const label = format(d, "EEE");
    const dayStart = startOfDay(d);
    const dayEnd = endOfDay(d);
    const sched = scheduledThisWeek
      .filter((s) => s.startTime >= dayStart && s.startTime <= dayEnd)
      .reduce((acc, s) => acc + durationHours(s.startTime, s.endTime), 0);
    const actual = actualThisWeek
      .filter((e) => e.clockIn >= dayStart && e.clockIn <= dayEnd)
      .reduce((acc, e) => acc + durationHours(e.clockIn, e.clockOut), 0);
    return { day: label, scheduled: Number(sched.toFixed(1)), actual: Number(actual.toFixed(1)) };
  });

  // ────────────── 8-week labor cost trend (admin only) ──────────────
  let trend: Array<{ week: string; cost: number; hours: number }> = [];
  if (isAdmin) {
    const weeks: Date[] = [];
    for (let i = 7; i >= 0; i--) {
      weeks.push(startOfWeek(subWeeks(now, i), { weekStartsOn: 1 }));
    }
    const oldestStart = weeks[0];
    const trendEntries = await prisma.clockEntry.findMany({
      where: {
        clockIn: { gte: oldestStart, lte: weekEnd },
        ...(scopedEmployeeIds ? { userId: { in: scopedEmployeeIds } } : {}),
      },
      include: { user: { select: { hourlyWage: true } } },
    });
    trend = weeks.map((wStart) => {
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1 });
      const inWeek = trendEntries.filter(
        (e) => e.clockIn >= wStart && e.clockIn <= wEnd
      );
      const hours = inWeek.reduce(
        (acc, e) => acc + durationHours(e.clockIn, e.clockOut),
        0
      );
      const cost = inWeek.reduce(
        (acc, e) =>
          acc + durationHours(e.clockIn, e.clockOut) * (e.user.hourlyWage ?? 0),
        0
      );
      return {
        week: format(wStart, "MMM d"),
        hours: Number(hours.toFixed(1)),
        cost: Number(cost.toFixed(2)),
      };
    });
  }

  // ────────────── Location comparison (this week, admin only) ──────────────
  let locationComparison: Array<{
    locationId: string;
    locationName: string;
    hours: number;
    cost: number;
  }> = [];
  if (isAdmin) {
    const allLocations = await prisma.location.findMany({
      where: { active: true, ...locationWhere },
      select: { id: true, name: true },
    });
    const locShifts = await prisma.shift.findMany({
      where: {
        startTime: { gte: weekStart, lte: weekEnd },
        published: true,
        locationId: { not: null },
      },
      include: { employee: { select: { hourlyWage: true } } },
    });
    locationComparison = allLocations.map((l) => {
      const inLoc = locShifts.filter((s) => s.locationId === l.id);
      const hours = inLoc.reduce(
        (acc, s) => acc + durationHours(s.startTime, s.endTime),
        0
      );
      const cost = inLoc.reduce(
        (acc, s) =>
          acc +
          durationHours(s.startTime, s.endTime) *
            (s.employee.hourlyWage ?? 0),
        0
      );
      return {
        locationId: l.id,
        locationName: l.name,
        hours: Number(hours.toFixed(1)),
        cost: Number(cost.toFixed(2)),
      };
    });
  }

  // Available locations for the filter dropdown.
  // Always show all locations the user has access to (their scope) — NOT the currently-selected
  // location, otherwise the dropdown would shrink to one option after a selection and disappear.
  const filterableLocations = await prisma.location.findMany({
    where: scopedLocationIds
      ? { active: true, id: { in: scopedLocationIds } }
      : { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    today: {
      roster,
      total: roster.length,
      clockedIn: roster.filter((r) => r.status === "clocked_in").length,
      completed: roster.filter((r) => r.status === "completed").length,
      noShow: roster.filter((r) => r.status === "no_show").length,
    },
    weeklyByDay,
    trend, // 8-week labor cost
    locationComparison,
    filterableLocations,
    viewerRole: auth.role,
  });
}
