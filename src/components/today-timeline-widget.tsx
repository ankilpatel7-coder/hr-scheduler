/**
 * Compact Today's Roster timeline for the dashboard home page.
 *
 * Server component. Drop into the dashboard wherever the old "Today's Roster"
 * widget lived:
 *
 *   import TodayTimelineWidget from "@/components/today-timeline-widget";
 *   <TodayTimelineWidget tenantId={tenant.id} tenantSlug={tenant.slug} />
 *
 * Renders a Gantt-style bar chart of today's published shifts with a live
 * "Now" line. Links to /[tenant]/today for the full view.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { format, startOfDay, endOfDay } from "date-fns";
import { ArrowRight } from "lucide-react";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOURS_SPAN = DAY_END_HOUR - DAY_START_HOUR;

function pctOfDay(d: Date, dayBase: Date): number {
  const elapsedH = (d.getTime() - dayBase.getTime()) / 36e5;
  const fromStart = elapsedH - DAY_START_HOUR;
  return Math.max(0, Math.min(100, (fromStart / HOURS_SPAN) * 100));
}

export default async function TodayTimelineWidget({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const [shifts, openClockIns, todayDoneEntries] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        startTime: { gte: dayStart, lte: dayEnd },
        employee: { role: "EMPLOYEE" },
      },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: { tenantId, clockOut: null },
      select: { userId: true, clockIn: true },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId,
        clockIn: { gte: dayStart, lte: dayEnd },
        NOT: { clockOut: null },
      },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
  ]);

  const openByUser = new Map<string, Date>();
  for (const e of openClockIns) openByUser.set(e.userId, e.clockIn);

  const doneByUser = new Map<string, { in: Date; out: Date }>();
  for (const e of todayDoneEntries) {
    if (!e.clockOut) continue;
    const cur = doneByUser.get(e.userId);
    if (!cur) doneByUser.set(e.userId, { in: e.clockIn, out: e.clockOut });
  }

  const liveCount = shifts.filter((s) => openByUser.has(s.employee.id)).length;
  const endedCount = shifts.filter((s) => s.endTime < now).length;
  const upcomingCount = shifts.length - liveCount - endedCount;
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
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">Today's roster</div>
          <h2 className="display text-2xl text-ink mt-0.5">
            {format(now, "EEEE, MMM d")}
          </h2>
        </div>
        <Link
          href={`/${tenantSlug}/today`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1"
        >
          Full view <ArrowRight size={12} />
        </Link>
      </div>

      {/* Quick stats */}
      <div className="flex gap-2 mb-4 text-[11px] font-mono">
        <Stat n={liveCount} label="live" color="#10b981" />
        <Stat n={upcomingCount} label="upcoming" color="#6366f1" />
        <Stat n={endedCount} label="ended" color="#94a3b8" />
      </div>

      {/* Timeline */}
      {shifts.length === 0 ? (
        <div className="py-6 text-center text-smoke italic text-sm">
          No shifts scheduled for today.
        </div>
      ) : (
        <div className="flex gap-3">
          {/* Names column */}
          <div className="w-[100px] shrink-0">
            <div className="h-5" />
            {shifts.map((s) => (
              <div
                key={s.id}
                className="h-7 mt-1.5 flex items-center min-w-0 text-[12px] text-ink font-medium truncate"
              >
                {s.employee.name}
              </div>
            ))}
          </div>

          {/* Timeline column */}
          <div className="flex-1 relative min-w-0">
            {/* Hour ticks */}
            <div className="relative h-5 text-[9px] text-smoke font-mono">
              {ticks.map((t) => (
                <div
                  key={t.hour}
                  className="absolute top-0.5 -translate-x-1/2"
                  style={{ left: `${t.pct}%` }}
                >
                  {t.label}
                </div>
              ))}
            </div>

            {shifts.map((shift) => {
              const startPct = pctOfDay(shift.startTime, dayStart);
              const endPct = pctOfDay(shift.endTime, dayStart);
              const widthPct = Math.max(1, endPct - startPct);

              const hasOpen = openByUser.has(shift.employee.id);
              const done = doneByUser.get(shift.employee.id);
              const ended = shift.endTime < now;

              let color = "#6366f1";
              let stripe = true;
              let label: string | null = null;
              if (hasOpen) {
                color = "#10b981";
                stripe = false;
                label = "LIVE";
              } else if (done) {
                color = "#10b981";
                stripe = false;
                label = "Done";
              } else if (ended) {
                color = "#dc2626";
                stripe = true;
                label = "No-show";
              } else if (now >= shift.startTime) {
                color = "#d97706";
                stripe = true;
                label = "Late";
              }

              let solidStart: number | null = null;
              let solidWidth = 0;
              if (hasOpen) {
                const ci = openByUser.get(shift.employee.id)!;
                solidStart = Math.max(pctOfDay(ci, dayStart), startPct);
                solidWidth = Math.max(0, Math.min(nowPct, endPct + 3) - solidStart);
              } else if (done) {
                solidStart = Math.max(pctOfDay(done.in, dayStart), startPct);
                solidWidth = Math.max(0, Math.min(pctOfDay(done.out, dayStart), endPct) - solidStart);
              }

              return (
                <div
                  key={shift.id}
                  className="relative h-7 mt-1.5 rounded bg-ink/[0.04]"
                >
                  {ticks.map((t) => (
                    <div
                      key={t.hour}
                      className="absolute inset-y-0 w-px bg-ink/[0.06]"
                      style={{ left: `${t.pct}%` }}
                    />
                  ))}
                  <div
                    className="absolute inset-y-1 rounded"
                    style={{
                      left: `${startPct}%`,
                      width: `${widthPct}%`,
                      background: stripe
                        ? `repeating-linear-gradient(45deg, ${color}33 0 5px, ${color}11 5px 10px)`
                        : `${color}22`,
                      border: `1px solid ${color}55`,
                    }}
                  />
                  {solidStart !== null && solidWidth > 0 && (
                    <div
                      className="absolute top-1.5 bottom-1.5 rounded"
                      style={{
                        left: `${solidStart}%`,
                        width: `${solidWidth}%`,
                        background: color,
                        opacity: !hasOpen && done ? 0.7 : 1,
                      }}
                    />
                  )}
                  {label && (
                    <div
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-wider px-1 py-0.5 rounded font-medium pointer-events-none"
                      style={{
                        color,
                        background: "rgba(255,255,255,0.92)",
                        border: `1px solid ${color}33`,
                      }}
                    >
                      {label}
                    </div>
                  )}
                </div>
              );
            })}

            {/* "Now" vertical line */}
            <div
              className="absolute pointer-events-none"
              style={{ top: 0, bottom: 0, left: `${nowPct}%`, width: 0 }}
            >
              <div
                className="absolute top-5 bottom-0 w-px"
                style={{ background: "#e11d48", left: 0 }}
              />
              <div
                className="absolute -translate-x-1/2 text-[8px] font-mono font-medium px-1.5 py-0.5 rounded"
                style={{ top: 0, background: "#e11d48", color: "white", left: 0 }}
              >
                {format(now, "h:mma").toLowerCase()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded"
      style={{ background: `${color}14`, color }}
    >
      <span className="font-bold text-sm leading-none">{n}</span>
      <span className="uppercase tracking-wider text-[9px] opacity-80">{label}</span>
    </span>
  );
}
