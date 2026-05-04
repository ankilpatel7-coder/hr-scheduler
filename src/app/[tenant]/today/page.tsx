/**
 * Today's Roster — live timeline.
 *
 * Horizontal Gantt-style chart of every published shift starting today.
 * Each row is one shift. The bar shows the scheduled window (striped); a
 * solid overlay shows the time the employee was actually clocked in. A
 * vertical "Now" line crosses the chart so you can see at a glance who
 * should be working right now.
 *
 * Status colors:
 *   LIVE         green solid    currently clocked in
 *   DONE         green faded    shift ended, clocked out cleanly
 *   UPCOMING     indigo stripes shift hasn't started yet
 *   MISSED-START amber stripes  shift started, employee not clocked in
 *   NO-SHOW      red stripes    shift ended, employee never clocked in
 *   FORGOT-OUT   amber solid    shift ended, still clocked in
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { format, startOfDay, endOfDay } from "date-fns";

export const dynamic = "force-dynamic";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOURS_SPAN = DAY_END_HOUR - DAY_START_HOUR;

function pctOfDay(d: Date, dayBase: Date): number {
  const elapsedH = (d.getTime() - dayBase.getTime()) / 36e5;
  const fromStart = elapsedH - DAY_START_HOUR;
  return Math.max(0, Math.min(100, (fromStart / HOURS_SPAN) * 100));
}

type Status =
  | "LIVE"
  | "DONE"
  | "UPCOMING"
  | "MISSED-START"
  | "NO-SHOW"
  | "FORGOT-OUT";

function statusFor(args: {
  now: Date;
  shiftStart: Date;
  shiftEnd: Date;
  hasOpen: boolean;
  doneIn: Date | null;
  doneOut: Date | null;
}): Status {
  const { now, shiftStart, shiftEnd, hasOpen, doneIn, doneOut } = args;
  if (hasOpen) {
    if (now > shiftEnd) return "FORGOT-OUT";
    return "LIVE";
  }
  if (doneIn && doneOut) return "DONE";
  if (now < shiftStart) return "UPCOMING";
  if (now >= shiftStart && now < shiftEnd) return "MISSED-START";
  return "NO-SHOW";
}

const STATUS_STYLE: Record<Status, { color: string; label: string; tone: "solid" | "stripe" }> = {
  LIVE:           { color: "#10b981", label: "Live",      tone: "solid"  },
  DONE:           { color: "#10b981", label: "Done",      tone: "solid"  },
  UPCOMING:       { color: "#6366f1", label: "Upcoming",  tone: "stripe" },
  "MISSED-START": { color: "#d97706", label: "Late?",     tone: "stripe" },
  "NO-SHOW":      { color: "#dc2626", label: "No-show",   tone: "stripe" },
  "FORGOT-OUT":   { color: "#d97706", label: "Forgot out", tone: "solid"  },
};

export default async function TodayPage({ params }: { params: { tenant: string } }) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/today`);
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant || tenant.id !== tenantId || !tenant.active) redirect("/login");

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const [shifts, openClockIns, todayEntries] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        startTime: { gte: dayStart, lte: dayEnd },
        employee: { role: "EMPLOYEE" },
      },
      include: {
        employee: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: { tenantId: tenant.id, clockOut: null },
      select: { userId: true, clockIn: true, user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId: tenant.id,
        clockIn: { gte: dayStart, lte: dayEnd },
        NOT: { clockOut: null },
      },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
  ]);

  const openByUser = new Map<string, Date>();
  for (const e of openClockIns) openByUser.set(e.userId, e.clockIn);

  const doneByUser = new Map<string, { in: Date; out: Date }>();
  for (const e of todayEntries) {
    if (!e.clockOut) continue;
    const cur = doneByUser.get(e.userId);
    if (!cur) {
      doneByUser.set(e.userId, { in: e.clockIn, out: e.clockOut });
    } else {
      doneByUser.set(e.userId, {
        in: e.clockIn < cur.in ? e.clockIn : cur.in,
        out: e.clockOut > cur.out ? e.clockOut : cur.out,
      });
    }
  }

  const scheduledUserIds = new Set(shifts.map((s) => s.employee.id));
  const walkIns = openClockIns.filter((e) => !scheduledUserIds.has(e.userId));

  const liveCount = openClockIns.length;
  const scheduledCount = shifts.length;
  const endedCount = shifts.filter((s) => s.endTime < now).length;

  const nowPct = pctOfDay(now, dayStart);

  const ticks: { hour: number; pct: number; label: string }[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 3) {
    const pct = ((h - DAY_START_HOUR) / HOURS_SPAN) * 100;
    const labelHour = h % 24;
    let display: string;
    if (labelHour === 0) display = "12a";
    else if (labelHour === 12) display = "12p";
    else if (labelHour > 12) display = `${labelHour - 12}p`;
    else display = `${labelHour}a`;
    ticks.push({ hour: h, pct, label: display });
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-6">
        {/* Header */}
        <div>
          <div className="label-eyebrow mb-1">Today's roster</div>
          <h1 className="display text-4xl text-ink">{format(now, "EEEE, MMMM d")}</h1>
          <p className="text-sm text-smoke mt-1">
            {scheduledCount} scheduled · {liveCount} clocked in now · {endedCount} shift{endedCount === 1 ? "" : "s"} ended
          </p>
        </div>

        {/* Quick status tiles */}
        <div className="grid grid-cols-3 gap-3">
          <Tile count={liveCount} label="Clocked in now" color="#059669" bg="rgba(16,185,129,0.06)" />
          <Tile count={scheduledCount - endedCount - liveCount} label="Upcoming" color="#4f46e5" bg="rgba(99,102,241,0.06)" />
          <Tile count={endedCount} label="Ended" color="#64748b" bg="rgba(100,116,139,0.06)" />
        </div>

        {/* Timeline */}
        <div className="card p-5">
          <div className="flex gap-3">
            {/* Names column */}
            <div className="w-[140px] shrink-0">
              <div className="h-6" />
              {shifts.map((s) => (
                <div key={s.id} className="h-9 mt-2 flex flex-col justify-center min-w-0">
                  <div className="font-medium text-sm text-ink truncate">{s.employee.name}</div>
                  <div className="text-[10px] text-smoke font-mono whitespace-nowrap">
                    {format(s.startTime, "h:mma").toLowerCase()}–{format(s.endTime, "h:mma").toLowerCase()}
                  </div>
                </div>
              ))}
            </div>

            {/* Timeline column */}
            <div className="flex-1 relative min-w-0">
              {/* Hour ticks */}
              <div className="relative h-6 text-[10px] text-smoke font-mono">
                {ticks.map((t) => (
                  <div
                    key={t.hour}
                    className="absolute top-1 -translate-x-1/2"
                    style={{ left: `${t.pct}%` }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>

              {/* Shift rows */}
              {shifts.length === 0 ? (
                <div className="py-12 text-center text-smoke italic text-sm">
                  No shifts scheduled for today.
                </div>
              ) : (
                shifts.map((shift) => {
                  const startPct = pctOfDay(shift.startTime, dayStart);
                  const endPct = pctOfDay(shift.endTime, dayStart);
                  const widthPct = Math.max(1, endPct - startPct);

                  const hasOpen = openByUser.has(shift.employee.id);
                  const done = doneByUser.get(shift.employee.id);
                  const status = statusFor({
                    now,
                    shiftStart: shift.startTime,
                    shiftEnd: shift.endTime,
                    hasOpen,
                    doneIn: done?.in ?? null,
                    doneOut: done?.out ?? null,
                  });
                  const sty = STATUS_STYLE[status];

                  // Solid overlay range — only when there's actual clock data
                  let solidStart: number | null = null;
                  let solidWidth = 0;
                  if (hasOpen) {
                    const ci = openByUser.get(shift.employee.id)!;
                    solidStart = Math.max(pctOfDay(ci, dayStart), startPct);
                    solidWidth = Math.max(0, Math.min(nowPct, endPct + 5) - solidStart);
                  } else if (done) {
                    solidStart = Math.max(pctOfDay(done.in, dayStart), startPct);
                    solidWidth = Math.max(0, Math.min(pctOfDay(done.out, dayStart), endPct) - solidStart);
                  }

                  const fadedScheduled = status === "DONE" ? 0.3 : 1;

                  return (
                    <div key={shift.id} className="relative h-9 mt-2 rounded-md bg-ink/[0.04]">
                      {/* hour grid lines */}
                      {ticks.map((t) => (
                        <div
                          key={t.hour}
                          className="absolute inset-y-0 w-px bg-ink/[0.06]"
                          style={{ left: `${t.pct}%` }}
                        />
                      ))}

                      {/* scheduled bar */}
                      <div
                        className="absolute inset-y-1 rounded"
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          opacity: fadedScheduled,
                          background:
                            sty.tone === "stripe"
                              ? `repeating-linear-gradient(45deg, ${sty.color}33 0 6px, ${sty.color}11 6px 12px)`
                              : `${sty.color}22`,
                          border: `1px solid ${sty.color}55`,
                        }}
                      />

                      {/* solid clocked-in overlay */}
                      {solidStart !== null && solidWidth > 0 && (
                        <div
                          className="absolute top-1.5 bottom-1.5 rounded"
                          style={{
                            left: `${solidStart}%`,
                            width: `${solidWidth}%`,
                            background: sty.color,
                            opacity: status === "DONE" ? 0.7 : 1,
                          }}
                        />
                      )}

                      {/* status pill */}
                      <div
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium pointer-events-none"
                        style={{
                          color: sty.color,
                          background: "rgba(255,255,255,0.92)",
                          border: `1px solid ${sty.color}33`,
                        }}
                      >
                        {sty.label}
                      </div>
                    </div>
                  );
                })
              )}

              {/* "Now" vertical line — overlaid on the whole timeline column */}
              <div
                className="absolute pointer-events-none"
                style={{
                  top: 0,
                  bottom: 0,
                  left: `${nowPct}%`,
                  width: 0,
                }}
              >
                <div
                  className="absolute top-6 bottom-0 w-px"
                  style={{ background: "#e11d48", left: 0 }}
                />
                <div
                  className="absolute -translate-x-1/2 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded"
                  style={{
                    top: 0,
                    background: "#e11d48",
                    color: "white",
                    left: 0,
                  }}
                >
                  NOW {format(now, "h:mma").toLowerCase()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Walk-ins (clocked in but no shift today) */}
        {walkIns.length > 0 && (
          <div className="card p-5">
            <div className="label-eyebrow mb-2">Clocked in without a scheduled shift</div>
            <div className="space-y-2">
              {walkIns.map((e) => (
                <div key={e.userId} className="flex items-center justify-between text-sm">
                  <span className="text-ink font-medium">{e.user.name}</span>
                  <span className="font-mono text-xs text-smoke">
                    in at {format(e.clockIn, "h:mma").toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="text-[11px] text-smoke flex items-center gap-4 flex-wrap">
          <LegendChip color="#10b981" label="Clocked in (live or done)" />
          <LegendChip color="#6366f1" label="Upcoming" stripe />
          <LegendChip color="#d97706" label="Late or forgot to clock out" stripe />
          <LegendChip color="#dc2626" label="No-show" stripe />
          <span className="inline-flex items-center gap-1.5">
            <span className="w-px h-3" style={{ background: "#e11d48" }} /> Now
          </span>
        </div>
      </main>
    </div>
  );
}

function Tile({
  count,
  label,
  color,
  bg,
}: {
  count: number;
  label: string;
  color: string;
  bg: string;
}) {
  const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
  return (
    <div
      className="card p-5 border-l-4"
      style={{ borderLeftColor: color, background: bg }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color }}>
        {label}
      </div>
      <div className="display text-4xl mt-1" style={{ color }}>
        {safeCount}
      </div>
    </div>
  );
}

function LegendChip({
  color,
  label,
  stripe = false,
}: {
  color: string;
  label: string;
  stripe?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-4 h-2 rounded-sm"
        style={{
          background: stripe
            ? `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />{" "}
      {label}
    </span>
  );
}
