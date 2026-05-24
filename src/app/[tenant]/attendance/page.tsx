/**
 * /[tenant]/attendance — admin attendance report.
 *
 * Per-person table for the selected date range showing:
 *   - Scheduled hours
 *   - Actual hours (sum of completed clock entries)
 *   - Missed shifts (had a published shift but no matching clock entry)
 *   - Early/late clock-ins (vs the matching scheduled shift start time)
 *
 * Matching: a clock entry is associated with a shift if both belong to
 * the same employee AND the clock-in time is within ±2h of the shift start.
 *
 * Includes everyone with shifts OR clock entries in the range — including
 * admins.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ArrowLeft,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";

export const dynamic = "force-dynamic";

type Range = "day" | "week" | "month";

function resolveRange(range: Range, anchor: Date): { from: Date; to: Date } {
  if (range === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (range === "week")
    return {
      from: startOfWeek(anchor, { weekStartsOn: 1 }),
      to: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
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
    select: { id: true, businessName: true },
  });
  if (!tenant || tenant.id !== tenantId) redirect("/login");

  const range = (searchParams?.range as Range) ?? "week";
  const anchor = searchParams?.date ? new Date(searchParams.date) : new Date();
  const { from, to } = resolveRange(range, anchor);

  // Pull published shifts + clock entries for the range.
  const [shifts, clockEntries, employees] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        employeeId: { not: null },
        startTime: { gte: from, lte: to },
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
      },
      select: {
        id: true,
        userId: true,
        clockIn: true,
        clockOut: true,
      },
      orderBy: { clockIn: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId, active: true, archivedAt: null },
      select: { id: true, name: true, role: true },
    }),
  ]);

  // Build per-employee aggregation.
  type Row = {
    userId: string;
    name: string;
    role: string;
    scheduledHours: number;
    actualHours: number;
    missedShifts: number;
    earlyMinutes: number; // sum of "early" across all matched shifts
    lateMinutes: number; // sum of "late" across all matched shifts
    shiftsCount: number;
    matchedCount: number;
  };
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
        missedShifts: 0,
        earlyMinutes: 0,
        lateMinutes: 0,
        shiftsCount: 0,
        matchedCount: 0,
      });
    }
    return rows.get(uid)!;
  };

  // Index clock entries by user for fast lookup.
  const ceByUser = new Map<string, typeof clockEntries>();
  for (const ce of clockEntries) {
    const list = ceByUser.get(ce.userId) ?? [];
    list.push(ce);
    ceByUser.set(ce.userId, list);
  }

  // Process shifts: aggregate scheduled + try to match to a clock entry.
  for (const s of shifts) {
    if (!s.employeeId) continue;
    const row = ensure(s.employeeId);
    const hours = (s.endTime.getTime() - s.startTime.getTime()) / 3_600_000;
    row.scheduledHours += hours;
    row.shiftsCount += 1;

    // Match: clock entry by same user with clockIn within ±2h of shift start.
    const candidates = ceByUser.get(s.employeeId) ?? [];
    const WINDOW = 2 * 60 * 60 * 1000;
    let best: { ce: any; diff: number } | null = null;
    for (const ce of candidates) {
      const diff = Math.abs(ce.clockIn.getTime() - s.startTime.getTime());
      if (diff > WINDOW) continue;
      if (!best || diff < best.diff) best = { ce, diff };
    }

    if (!best) {
      row.missedShifts += 1;
    } else {
      row.matchedCount += 1;
      const minDelta =
        (best.ce.clockIn.getTime() - s.startTime.getTime()) / 60_000;
      if (minDelta < 0) row.earlyMinutes += -minDelta;
      else row.lateMinutes += minDelta;
    }
  }

  // Add actual hours from ALL clock entries (matched or not).
  for (const ce of clockEntries) {
    if (!ce.clockOut) continue;
    const row = ensure(ce.userId);
    row.actualHours += (ce.clockOut.getTime() - ce.clockIn.getTime()) / 3_600_000;
  }

  // Sort: missed shifts desc, then name asc.
  const list = Array.from(rows.values()).sort((a, b) => {
    if (b.missedShifts !== a.missedShifts) return b.missedShifts - a.missedShifts;
    return a.name.localeCompare(b.name);
  });

  const totals = list.reduce(
    (acc, r) => ({
      scheduled: acc.scheduled + r.scheduledHours,
      actual: acc.actual + r.actualHours,
      missed: acc.missed + r.missedShifts,
    }),
    { scheduled: 0, actual: 0, missed: 0 },
  );

  const rangeLabel =
    range === "day"
      ? format(from, "EEEE, MMM d, yyyy")
      : range === "week"
        ? `Week of ${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
        : format(from, "MMMM yyyy");

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <Link
          href={`/${params.tenant}/dashboard`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to dashboard
        </Link>

        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck size={22} className="text-rust" />
              <h1 className="display text-4xl text-ink">Attendance</h1>
            </div>
            <p className="text-sm text-smoke">
              Scheduled vs. actual, missed shifts, early & late punches.
            </p>
          </div>
          <div className="flex gap-2">
            {(["day", "week", "month"] as Range[]).map((r) => (
              <Link
                key={r}
                href={`/${params.tenant}/attendance?range=${r}${
                  searchParams?.date ? `&date=${searchParams.date}` : ""
                }`}
                className={`btn btn-secondary ${
                  range === r ? "!bg-ink !text-paper !border-ink" : ""
                }`}
              >
                {r === "day" ? "Day" : r === "week" ? "Week" : "Month"}
              </Link>
            ))}
          </div>
        </div>

        <div className="text-sm text-smoke mb-6">{rangeLabel}</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard
            label="Scheduled"
            value={`${totals.scheduled.toFixed(1)}h`}
            icon={<Clock size={16} />}
          />
          <SummaryCard
            label="Actual"
            value={`${totals.actual.toFixed(1)}h`}
            icon={<CheckCircle2 size={16} />}
            tone={
              totals.actual < totals.scheduled * 0.95
                ? "warning"
                : totals.actual > totals.scheduled * 1.05
                  ? "warning"
                  : "ok"
            }
          />
          <SummaryCard
            label="Missed shifts"
            value={`${totals.missed}`}
            icon={<AlertTriangle size={16} />}
            tone={totals.missed > 0 ? "warning" : "ok"}
          />
        </div>

        {list.length === 0 ? (
          <div className="card p-8 text-center text-sm text-smoke italic">
            No scheduled shifts or clock entries in this {range}.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-smoke">
                <tr>
                  <th className="text-left px-4 py-2">Person</th>
                  <th className="text-right px-4 py-2">Scheduled</th>
                  <th className="text-right px-4 py-2">Actual</th>
                  <th className="text-right px-4 py-2">Δ</th>
                  <th className="text-right px-4 py-2">Missed</th>
                  <th className="text-right px-4 py-2">Early (min)</th>
                  <th className="text-right px-4 py-2">Late (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r) => {
                  const delta = r.actualHours - r.scheduledHours;
                  const deltaSign = delta > 0 ? "+" : "";
                  return (
                    <tr key={r.userId}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-ink">{r.name}</div>
                        <div className="text-[11px] text-smoke">
                          {r.role.toLowerCase()}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.scheduledHours.toFixed(1)}h
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.actualHours.toFixed(1)}h
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          Math.abs(delta) < 0.25
                            ? "text-smoke"
                            : delta < 0
                              ? "text-amber-700"
                              : "text-moss"
                        }`}
                      >
                        {deltaSign}
                        {delta.toFixed(1)}h
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          r.missedShifts > 0
                            ? "text-rust font-semibold"
                            : "text-smoke"
                        }`}
                      >
                        {r.missedShifts > 0 ? r.missedShifts : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-smoke">
                        {r.earlyMinutes > 0 ? Math.round(r.earlyMinutes) : "—"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          r.lateMinutes > 5
                            ? "text-amber-700 font-medium"
                            : "text-smoke"
                        }`}
                      >
                        {r.lateMinutes > 0 ? Math.round(r.lateMinutes) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 text-xs font-semibold text-ink">
                <tr>
                  <td className="px-4 py-2">Totals</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totals.scheduled.toFixed(1)}h
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totals.actual.toFixed(1)}h
                  </td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totals.missed}
                  </td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-smoke">
          Matching: a clock-in is associated with a scheduled shift if they
          belong to the same employee and the clock-in is within ±2 hours of
          the shift start. Outside that window the shift counts as missed.
        </p>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "ok",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "ok" | "warning";
}) {
  const cls =
    tone === "warning"
      ? "border-amber-300 bg-amber-50/40"
      : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl ring-1 ${cls} px-4 py-3`}>
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-smoke font-semibold">
        {icon}
        {label}
      </div>
      <div className="display text-2xl text-ink mt-1">{value}</div>
    </div>
  );
}
