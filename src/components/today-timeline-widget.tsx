/**
 * Compact "Today's Roster" timeline for the dashboard.
 *
 * Each row shows two stacked sub-bars:
 *   - Top: striped scheduled bar (when supposed to work)
 *   - Bottom: solid actual worked segments (one per clock entry)
 *
 * Filters out admins and inactive employees. Accepts an optional `date`
 * (YYYY-MM-DD) — defaults to today in the tenant's timezone.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { parseISO, isValid } from "date-fns";
import { ArrowRight } from "lucide-react";
import DateNav from "./date-nav";
import {
  tzStartOfDay,
  tzEndOfDay,
  tzFormat,
  tzYmd,
  DEFAULT_TZ,
} from "@/lib/tz";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOURS_SPAN = DAY_END_HOUR - DAY_START_HOUR;

function pctOfDay(d: Date, dayBase: Date): number {
  const elapsedH = (d.getTime() - dayBase.getTime()) / 36e5;
  const fromStart = elapsedH - DAY_START_HOUR;
  return Math.max(0, Math.min(100, (fromStart / HOURS_SPAN) * 100));
}

/**
 * Parse "YYYY-MM-DD" as noon UTC of that calendar date. Noon UTC sits
 * inside the same calendar day in every US timezone (UTC-5 to UTC-10),
 * so passing this Date into tzStartOfDay correctly yields midnight local
 * on the requested day. Avoids the parseISO(yyyy-mm-dd) gotcha where the
 * result is midnight UTC, which is the previous day in negative-offset tz.
 */
function parseYmdNoonUtc(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

type Entry = { in: Date; out: Date | null };

export default async function TodayTimelineWidget({
  tenantId,
  tenantSlug,
  timezone,
  date,
  locationId,
}: {
  tenantId: string;
  tenantSlug: string;
  timezone?: string;
  date?: string;
  locationId?: string;
}) {
  const tz = timezone || DEFAULT_TZ;
  const now = new Date();
  // Resolve target date in the tenant's tz — default to today
  const parsed = date ? parseYmdNoonUtc(date) : null;
  const targetDate = parsed && isValid(parsed) ? parsed : now;
  const isViewingToday = tzYmd(targetDate, tz) === tzYmd(now, tz);

  const dayStart = tzStartOfDay(targetDate, tz);
  const dayEnd = tzEndOfDay(targetDate, tz);

  const [shifts, dayEntries] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        startTime: { gte: dayStart, lte: dayEnd },
        ...(locationId ? { locationId } : {}),
        employee: { role: "EMPLOYEE", active: true },
      },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId,
        clockIn: { gte: dayStart, lte: dayEnd },
      },
      select: { userId: true, clockIn: true, clockOut: true },
      orderBy: { clockIn: "asc" },
    }),
  ]);

  const entriesByUser = new Map<string, Entry[]>();
  for (const e of dayEntries) {
    const list = entriesByUser.get(e.userId) ?? [];
    list.push({ in: e.clockIn, out: e.clockOut });
    entriesByUser.set(e.userId, list);
  }

  const liveCount = isViewingToday
    ? Array.from(entriesByUser.values()).filter((es) => es.some((e) => e.out === null)).length
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

  const fullViewHref = isViewingToday
    ? `/${tenantSlug}/today`
    : `/${tenantSlug}/today?date=${tzYmd(targetDate, tz)}`;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">{isViewingToday ? "Today's roster" : "Roster"}</div>
          <h2 className="display text-2xl text-ink mt-0.5">
            {tzFormat(targetDate, "EEEE, MMM d", tz)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <DateNav paramName="rosterDate" current={tzYmd(targetDate, tz)} />
          <Link
            href={fullViewHref}
            className="text-xs text-rust hover:underline inline-flex items-center gap-1"
          >
            Full view <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {/* premium-today-v1 */}
        {isViewingToday && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
            style={{
              background: liveCount > 0
                ? "linear-gradient(135deg, #34d399 0%, #10b981 100%)"
                : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
              color: liveCount > 0 ? "white" : "#94a3b8",
              boxShadow: liveCount > 0
                ? "0 2px 8px -2px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)"
                : "inset 0 1px 0 rgba(255,255,255,0.6)",
              border: liveCount > 0 ? "none" : "1px solid #e2e8f0",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: liveCount > 0 ? "white" : "#cbd5e1",
                boxShadow: liveCount > 0 ? "0 0 6px rgba(255,255,255,0.8)" : "none",
                animation: liveCount > 0 ? "pulse-glow 1.5s ease-in-out infinite" : "none",
              }}
            />
            {liveCount} LIVE
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
          style={{
            background: upcomingCount > 0
              ? "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)"
              : "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            color: upcomingCount > 0 ? "white" : "#94a3b8",
            boxShadow: upcomingCount > 0
              ? "0 2px 8px -2px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)"
              : "inset 0 1px 0 rgba(255,255,255,0.6)",
            border: upcomingCount > 0 ? "none" : "1px solid #e2e8f0",
          }}
        >
          {upcomingCount} UPCOMING
        </span>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
          style={{
            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
            color: endedCount > 0 ? "#475569" : "#94a3b8",
            border: "1px solid #e2e8f0",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
          }}
        >
          {endedCount} ENDED
        </span>
      </div>

      <div className="flex gap-3 text-[10px] text-smoke mb-2 ml-[100px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-3 h-1.5 rounded-sm"
            style={{
              background:
                "repeating-linear-gradient(45deg, rgba(99,102,241,0.30) 0 4px, rgba(99,102,241,0.10) 4px 8px)",
              border: "1px solid rgba(99,102,241,0.45)",
            }}
          />
          Scheduled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-sm" style={{ background: "#10b981" }} />
          Worked
        </span>
      </div>

      {shifts.length === 0 ? (
        <div className="py-6 text-center text-smoke italic text-sm">
          No shifts scheduled.
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="w-[100px] shrink-0">
            <div className="h-5" />
            {shifts.map((s) => (
              <div
                key={s.id}
                className="mt-1.5 flex flex-col justify-center min-w-0"
                style={{ height: 40 }}
              >
                <div className="text-[12px] text-ink font-medium truncate">{s.employee!.name}</div>
                <div className="text-[9px] text-smoke font-mono whitespace-nowrap">
                  {tzFormat(s.startTime, "h:mma", tz).toLowerCase()}–
                  {tzFormat(s.endTime, "h:mma", tz).toLowerCase()}
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 relative min-w-0">
            <div className="relative h-5 text-[9px] text-smoke font-mono">
              {ticks.map((t) => (
                <div
                  key={t.hour}
                  className="absolute top-0.5 -translate-x-1/2 font-semibold"
                  style={{ left: `${t.pct}%`, fontSize: 10, color: "#64748b" }}
                >
                  {t.label}
                </div>
              ))}
              {nowPct >= 0 && (
                <div
                  className="absolute top-3 -translate-x-1/2 z-10 pointer-events-none"
                  style={{ left: `${nowPct}%` }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: "linear-gradient(135deg, #ec4899, #f43f5e)",
                      boxShadow: "0 0 0 2px white, 0 0 8px rgba(236, 72, 153, 0.5)",
                    }}
                  />
                </div>
              )}
            </div>
            {nowPct >= 0 && (
              <div
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${nowPct}%`,
                  top: 18,
                  bottom: 0,
                  width: 2,
                  background: "linear-gradient(180deg, rgba(236, 72, 153, 0.6), rgba(244, 63, 94, 0.1))",
                  boxShadow: "0 0 4px rgba(236, 72, 153, 0.4)",
                }}
              />
            )}

            {shifts.map((shift) => {
              const startPct = pctOfDay(shift.startTime, dayStart);
              const endPct = pctOfDay(shift.endTime, dayStart);
              const widthPct = Math.max(1, endPct - startPct);

              const userEntries = entriesByUser.get(shift.employee!.id) ?? [];
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

              return (
                <div
                  key={shift.id}
                  className="relative mt-1.5 rounded-md bg-ink/[0.03] hover:bg-ink/[0.06] transition-colors group/row"
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
                      height: 12,
                      background: `linear-gradient(180deg, ${scheduledColor}28 0%, ${scheduledColor}18 100%), repeating-linear-gradient(135deg, ${scheduledColor}1f 0 6px, transparent 6px 12px)`,
                      border: `1px solid ${scheduledColor}55`,
                      borderRadius: 4,
                      boxShadow: `inset 0 1px 0 ${scheduledColor}22`,
                    }}
                    title={`Scheduled ${tzFormat(shift.startTime, "h:mma", tz).toLowerCase()}–${tzFormat(shift.endTime, "h:mma", tz).toLowerCase()}`}
                  />

                  {userEntries.map((seg, i) => {
                    const segIn = seg.in;
                    const segOut = seg.out ?? (isViewingToday ? now : tzEndOfDay(targetDate, tz));
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
                          top: 23,
                          height: 12,
                          background: isOpen
                              ? "linear-gradient(180deg, #34d399 0%, #10b981 100%)"
                              : "linear-gradient(180deg, rgba(52,211,153,0.95) 0%, rgba(16,185,129,0.9) 100%)",
                          borderRadius: 4,
                          boxShadow: isOpen
                            ? "0 0 12px rgba(16, 185, 129, 0.5), 0 0 4px rgba(16, 185, 129, 0.8), inset 0 1px 0 rgba(255,255,255,0.3)"
                            : "0 1px 3px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255,255,255,0.25)",
                        }}
                        title={`Worked ${tzFormat(segIn, "h:mma", tz).toLowerCase()}–${seg.out ? tzFormat(seg.out, "h:mma", tz).toLowerCase() : "now"}`}
                      />
                    );
                  })}

                  {statusLabel && (
                    <div
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-wider px-1 py-0.5 rounded font-medium pointer-events-none"
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
              );
            })}

            {isViewingToday && (
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
                  {tzFormat(now, "h:mma", tz).toLowerCase()}
                </div>
              </div>
            )}
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
