/**
 * Today's Roster — full-page timeline view.
 *
 * URL: /[tenant]/today (defaults to today)
 *      /[tenant]/today?date=YYYY-MM-DD (any other day)
 *
 * Each row: striped scheduled bar (top) + solid worked segments (bottom),
 * with all clock entries shown including breaks. Plus a per-row summary
 * line below: "Sched 9a–5p (8h) · Worked 9:55a–3:23p, 3:55p–now (6h so far)".
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import DateNav from "@/components/date-nav";
import { format, startOfDay, endOfDay, parseISO, isValid } from "date-fns";

export const dynamic = "force-dynamic";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOURS_SPAN = DAY_END_HOUR - DAY_START_HOUR;

function pctOfDay(d: Date, dayBase: Date): number {
  const elapsedH = (d.getTime() - dayBase.getTime()) / 36e5;
  const fromStart = elapsedH - DAY_START_HOUR;
  return Math.max(0, Math.min(100, (fromStart / HOURS_SPAN) * 100));
}

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

function fmt(t: Date) {
  return format(t, "h:mma").toLowerCase().replace(":00", "");
}

type Entry = { in: Date; out: Date | null };

export default async function TodayPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { date?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/today`);
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant || tenant.id !== tenantId || !tenant.active) redirect("/login");

  const now = new Date();
  const parsed = searchParams?.date ? parseISO(searchParams.date) : now;
  const targetDate = isValid(parsed) ? parsed : now;
  const isViewingToday = ymd(targetDate) === ymd(now);

  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  const [shifts, dayEntries] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        startTime: { gte: dayStart, lte: dayEnd },
        employee: { role: "EMPLOYEE", active: true },
      },
      include: {
        employee: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId: tenant.id,
        clockIn: { gte: dayStart, lte: dayEnd },
      },
      select: {
        userId: true,
        clockIn: true,
        clockOut: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { clockIn: "asc" },
    }),
  ]);

  const entriesByUser = new Map<string, Entry[]>();
  for (const e of dayEntries) {
    const list = entriesByUser.get(e.userId) ?? [];
    list.push({ in: e.clockIn, out: e.clockOut });
    entriesByUser.set(e.userId, list);
  }

  // Walk-ins: clocked in users without a scheduled shift today
  const scheduledUserIds = new Set(shifts.map((s) => s.employee.id));
  const walkIns: { userId: string; name: string; entries: Entry[] }[] = [];
  for (const e of dayEntries) {
    if (scheduledUserIds.has(e.userId)) continue;
    const existing = walkIns.find((w) => w.userId === e.userId);
    if (existing) {
      existing.entries.push({ in: e.clockIn, out: e.clockOut });
    } else {
      walkIns.push({
        userId: e.userId,
        name: e.user?.name ?? e.user?.email ?? e.userId,
        entries: [{ in: e.clockIn, out: e.clockOut }],
      });
    }
  }

  const liveCount = isViewingToday
    ? Array.from(entriesByUser.values()).filter((es) => es.some((e) => e.out === null)).length +
      walkIns.filter((w) => w.entries.some((e) => e.out === null)).length
    : 0;
  const endedCount = isViewingToday ? shifts.filter((s) => s.endTime < now).length : 0;
  const upcomingCount = Math.max(0, shifts.length - liveCount - endedCount);
  const nowPct = isViewingToday ? pctOfDay(now, dayStart) : -1;

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label-eyebrow mb-1">Roster</div>
            <h1 className="display text-4xl text-ink">{format(targetDate, "EEEE, MMMM d")}</h1>
            <p className="text-sm text-smoke mt-1">
              {shifts.length} scheduled
              {isViewingToday && ` · ${liveCount} clocked in now · ${endedCount} ended`}
            </p>
          </div>
          <DateNav paramName="date" current={ymd(targetDate)} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Tile count={liveCount} label="Clocked in now" color="#059669" bg="rgba(16,185,129,0.06)" />
          <Tile count={upcomingCount} label="Upcoming" color="#4f46e5" bg="rgba(99,102,241,0.06)" />
          <Tile count={endedCount} label="Ended" color="#64748b" bg="rgba(100,116,139,0.06)" />
        </div>

        {/* Legend */}
        <div className="flex gap-5 text-[11px] text-smoke">
          <span className="inline-flex items-center gap-2">
            <span
              className="w-4 h-2 rounded-sm"
              style={{
                background:
                  "repeating-linear-gradient(45deg, rgba(99,102,241,0.30) 0 5px, rgba(99,102,241,0.10) 5px 10px)",
                border: "1px solid rgba(99,102,241,0.45)",
              }}
            />
            Scheduled (when supposed to work)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-2 rounded-sm" style={{ background: "#10b981" }} />
            Worked (each clock-in/out segment)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-px h-3" style={{ background: "#e11d48" }} />
            Now
          </span>
        </div>

        {/* Timeline */}
        <div className="card p-5">
          <div className="flex gap-4">
            <div className="w-[160px] shrink-0">
              <div className="h-6" />
              {shifts.map((s) => {
                const userEntries = entriesByUser.get(s.employee.id) ?? [];
                return (
                  <div
                    key={s.id}
                    className="mt-2 flex flex-col justify-center min-w-0"
                    style={{ height: 56 }}
                  >
                    <div className="font-medium text-sm text-ink truncate">{s.employee.name}</div>
                    <div className="text-[10px] text-smoke font-mono whitespace-nowrap">
                      Sched {fmt(s.startTime)}–{fmt(s.endTime)}
                    </div>
                    {userEntries.length > 0 && (
                      <div className="text-[10px] font-mono whitespace-nowrap" style={{ color: "#059669" }}>
                        {userEntries.length} {userEntries.length === 1 ? "entry" : "entries"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex-1 relative min-w-0">
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

              {shifts.length === 0 ? (
                <div className="py-12 text-center text-smoke italic text-sm">
                  No shifts scheduled for this day.
                </div>
              ) : (
                shifts.map((shift) => {
                  const startPct = pctOfDay(shift.startTime, dayStart);
                  const endPct = pctOfDay(shift.endTime, dayStart);
                  const widthPct = Math.max(1, endPct - startPct);

                  const userEntries = entriesByUser.get(shift.employee.id) ?? [];
                  const hasOpen = userEntries.some((e) => e.out === null);
                  const hasAny = userEntries.length > 0;
                  const ended = shift.endTime < now;

                  let scheduledColor = "#6366f1";
                  let statusLabel: string | null = null;
                  if (hasOpen) {
                    scheduledColor = "#10b981";
                    statusLabel = "LIVE";
                  } else if (hasAny && (ended || !isViewingToday)) {
                    scheduledColor = "#10b981";
                    statusLabel = "Done";
                  } else if (!hasAny && ended && isViewingToday) {
                    scheduledColor = "#dc2626";
                    statusLabel = "No-show";
                  } else if (!hasAny && now >= shift.startTime && isViewingToday) {
                    scheduledColor = "#d97706";
                    statusLabel = "Late";
                  }

                  // Compute totals for inline summary
                  const schedHours = durationHours(shift.startTime, shift.endTime);
                  let workedH = 0;
                  for (const e of userEntries) {
                    workedH += durationHours(e.in, e.out ?? (isViewingToday ? now : endOfDay(targetDate)));
                  }

                  return (
                    <div key={shift.id} className="mt-2">
                      <div
                        className="relative rounded-md bg-ink/[0.04]"
                        style={{ height: 40 }}
                      >
                        {ticks.map((t) => (
                          <div
                            key={t.hour}
                            className="absolute inset-y-0 w-px bg-ink/[0.06]"
                            style={{ left: `${t.pct}%` }}
                          />
                        ))}

                        <div
                          className="absolute"
                          style={{
                            left: `${startPct}%`,
                            width: `${widthPct}%`,
                            top: 5,
                            height: 13,
                            background: `repeating-linear-gradient(45deg, ${scheduledColor}33 0 6px, ${scheduledColor}11 6px 12px)`,
                            border: `1px solid ${scheduledColor}55`,
                            borderRadius: 3,
                          }}
                          title={`Scheduled ${fmt(shift.startTime)}–${fmt(shift.endTime)} (${schedHours.toFixed(1)}h)`}
                        />

                        {userEntries.map((seg, i) => {
                          const segIn = seg.in;
                          const segOut =
                            seg.out ?? (isViewingToday ? now : endOfDay(targetDate));
                          const segStartPct = pctOfDay(segIn, dayStart);
                          const segEndPct = pctOfDay(segOut, dayStart);
                          const segWidthPct = Math.max(0.5, segEndPct - segStartPct);
                          const isOpen = seg.out === null;
                          return (
                            <div
                              key={i}
                              className="absolute"
                              style={{
                                left: `${segStartPct}%`,
                                width: `${segWidthPct}%`,
                                top: 22,
                                height: 13,
                                background: isOpen ? "#10b981" : "rgba(16,185,129,0.85)",
                                borderRadius: 3,
                              }}
                              title={`Worked ${fmt(segIn)}–${seg.out ? fmt(seg.out) : "now"} (${durationHours(segIn, segOut).toFixed(2)}h)`}
                            />
                          );
                        })}

                        {statusLabel && (
                          <div
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium pointer-events-none"
                            style={{
                              color: scheduledColor,
                              background: "rgba(255,255,255,0.92)",
                              border: `1px solid ${scheduledColor}33`,
                            }}
                          >
                            {statusLabel}
                          </div>
                        )}
                      </div>

                      {/* Inline summary line */}
                      <div className="text-[10px] text-smoke font-mono mt-1 ml-1">
                        <span>
                          Sched {fmt(shift.startTime)}–{fmt(shift.endTime)} ({schedHours.toFixed(1)}h)
                        </span>
                        {userEntries.length > 0 ? (
                          <>
                            <span className="mx-1.5">·</span>
                            <span style={{ color: "#059669" }}>
                              Worked{" "}
                              {userEntries
                                .map(
                                  (e) =>
                                    `${fmt(e.in)}–${e.out ? fmt(e.out) : "now"}`,
                                )
                                .join(", ")}{" "}
                              ({workedH.toFixed(2)}h{hasOpen ? " so far" : ""})
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="mx-1.5">·</span>
                            <span style={{ color: "#888" }}>No clock entries yet</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {isViewingToday && (
                <div
                  className="absolute pointer-events-none"
                  style={{ top: 0, bottom: 0, left: `${nowPct}%`, width: 0 }}
                >
                  <div
                    className="absolute top-6 bottom-0 w-px"
                    style={{ background: "#e11d48", left: 0 }}
                  />
                  <div
                    className="absolute -translate-x-1/2 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded"
                    style={{ top: 0, background: "#e11d48", color: "white", left: 0 }}
                  >
                    NOW {format(now, "h:mma").toLowerCase()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {walkIns.length > 0 && (
          <div className="card p-5">
            <div className="label-eyebrow mb-2">Clocked in without a scheduled shift</div>
            <div className="space-y-2">
              {walkIns.map((w) => {
                let workedH = 0;
                for (const e of w.entries) {
                  workedH += durationHours(
                    e.in,
                    e.out ?? (isViewingToday ? now : endOfDay(targetDate)),
                  );
                }
                return (
                  <div key={w.userId} className="flex items-center justify-between text-sm gap-2">
                    <span className="text-ink font-medium">{w.name}</span>
                    <span className="font-mono text-[11px] text-smoke">
                      {w.entries
                        .map((e) => `${fmt(e.in)}–${e.out ? fmt(e.out) : "now"}`)
                        .join(", ")}{" "}
                      ({workedH.toFixed(2)}h)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
  return (
    <div
      className="card p-5 border-l-4"
      style={{ borderLeftColor: color, background: bg }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] font-medium" style={{ color }}>
        {label}
      </div>
      <div className="display text-4xl mt-1" style={{ color }}>
        {count}
      </div>
    </div>
  );
}
