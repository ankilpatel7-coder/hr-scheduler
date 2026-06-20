/**
 * Compact "Today's Roster" timeline for the dashboard.
 *
 *   Top sub-bar: striped scheduled bar (when supposed to work)
 *   Bottom sub-bar: solid actual worked segments (one per clock entry)
 *
 * Rows are the UNION of (scheduled today at this location) ∪
 * (clocked in today, in scope for this location). Cross-location workers
 * scheduled here still appear; people assigned elsewhere and clocked in
 * elsewhere do not.
 *
 * Cottage palette throughout — gold for upcoming, moss for live/done,
 * amber for late, rose for no-show.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { isValid } from "date-fns";
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

// Cottage palette
const GOLD = "#C99A2C";
const GOLD_DARK = "#A87F1E";
const MOSS = "#3B6D11";
const MOSS_BRIGHT = "#5A8527";
const AMBER = "#BA7517";
const ROSE = "#A32D2D";
const SMOKE = "#7A7872";
const INK = "#2C2C2A";

function pctOfDay(d: Date, dayBase: Date): number {
  const elapsedH = (d.getTime() - dayBase.getTime()) / 36e5;
  const fromStart = elapsedH - DAY_START_HOUR;
  return Math.max(0, Math.min(100, (fromStart / HOURS_SPAN) * 100));
}

function parseYmdNoonUtc(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

type Entry = { in: Date; out: Date | null };
type ShiftRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  employee: { id: string; name: string | null } | null;
};
type Row = {
  userId: string;
  name: string;
  shifts: ShiftRow[];
  entries: Entry[];
  primaryShift: ShiftRow | null;
};

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
  const parsed = date ? parseYmdNoonUtc(date) : null;
  const targetDate = parsed && isValid(parsed) ? parsed : now;
  const isViewingToday = tzYmd(targetDate, tz) === tzYmd(now, tz);

  const dayStart = tzStartOfDay(targetDate, tz);
  const dayEnd = tzEndOfDay(targetDate, tz);

  // Shifts: filter by location directly on shift.locationId.
  // Drop the role filter — managers, leads, and admins also work shifts.
  const [shifts, allDayEntries] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        startTime: { gte: dayStart, lte: dayEnd },
        ...(locationId ? { locationId } : {}),
        employee: { active: true },
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

  // Shift users (already filtered by location via shift.locationId)
  const scheduledIds = new Set(
    shifts.map((s) => s.employee?.id).filter(Boolean) as string[],
  );

  // Determine which user IDs are in scope for THIS location view.
  // For location-filtered view: users assigned to this location OR who have a
  // shift here today (cross-location workers). For tenant-wide view: no limit.
  let inScopeUserIds: Set<string> | null = null;
  if (locationId) {
    const locUsers = await prisma.user.findMany({
      where: { tenantId, active: true, locations: { some: { locationId } } },
      select: { id: true },
    });
    inScopeUserIds = new Set(locUsers.map((u) => u.id));
    for (const id of scheduledIds) inScopeUserIds.add(id);
  }

  // Filter clock entries by scope
  const entriesByUser = new Map<string, Entry[]>();
  for (const e of allDayEntries) {
    if (inScopeUserIds && !inScopeUserIds.has(e.userId)) continue;
    const list = entriesByUser.get(e.userId) ?? [];
    list.push({ in: e.clockIn, out: e.clockOut });
    entriesByUser.set(e.userId, list);
  }

  // Group shifts by user
  const shiftsByUser = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    if (!s.employee) continue;
    const list = shiftsByUser.get(s.employee.id) ?? [];
    list.push(s as ShiftRow);
    shiftsByUser.set(s.employee.id, list);
  }

  // UNION: rows = (scheduled here) ∪ (clocked in, in scope)
  const clockedInIds = Array.from(entriesByUser.keys());
  const extraIds = clockedInIds.filter((id) => !scheduledIds.has(id));
  const extras = extraIds.length
    ? await prisma.user.findMany({
        where: { id: { in: extraIds }, tenantId, active: true },
        select: { id: true, name: true },
      })
    : [];

  const rows: Row[] = [];
  for (const [userId, userShifts] of shiftsByUser.entries()) {
    rows.push({
      userId,
      name: userShifts[0].employee?.name || "Unnamed",
      shifts: userShifts,
      entries: entriesByUser.get(userId) ?? [],
      primaryShift: userShifts[0],
    });
  }
  for (const u of extras) {
    rows.push({
      userId: u.id,
      name: u.name || "Unnamed",
      shifts: [],
      entries: entriesByUser.get(u.id) ?? [],
      primaryShift: null,
    });
  }
  rows.sort((a, b) => {
    const aTime = a.primaryShift?.startTime?.getTime() ?? a.entries[0]?.in?.getTime() ?? 0;
    const bTime = b.primaryShift?.startTime?.getTime() ?? b.entries[0]?.in?.getTime() ?? 0;
    return aTime - bTime;
  });

  // Stats — derived from displayed rows
  const liveCount = isViewingToday
    ? rows.filter((r) => r.entries.some((e) => e.out === null)).length
    : 0;
  const endedCount = isViewingToday
    ? rows.filter((r) => {
        const allDone = r.entries.length > 0 && r.entries.every((e) => e.out !== null);
        const shiftEnded = !!r.primaryShift && r.primaryShift.endTime < now;
        return allDone || shiftEnded;
      }).length
    : 0;
  const upcomingCount = Math.max(0, rows.length - liveCount - endedCount);
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

      {/* Pills */}
      <div className="flex gap-2 mb-5">
        {isViewingToday && (
          <Pill
            n={liveCount}
            label="LIVE"
            color={MOSS}
            fillColor={`rgba(59, 109, 17, ${liveCount > 0 ? 0.12 : 0.04})`}
            borderColor={`rgba(59, 109, 17, ${liveCount > 0 ? 0.35 : 0.18})`}
            textColor={liveCount > 0 ? MOSS : SMOKE}
            pulse={liveCount > 0}
          />
        )}
        <Pill
          n={upcomingCount}
          label="UPCOMING"
          color={GOLD}
          fillColor={`rgba(201, 154, 44, ${upcomingCount > 0 ? 0.12 : 0.04})`}
          borderColor={`rgba(201, 154, 44, ${upcomingCount > 0 ? 0.35 : 0.18})`}
          textColor={upcomingCount > 0 ? GOLD_DARK : SMOKE}
        />
        <Pill
          n={endedCount}
          label="ENDED"
          color={SMOKE}
          fillColor="rgba(122, 120, 114, 0.06)"
          borderColor="rgba(122, 120, 114, 0.20)"
          textColor={SMOKE}
        />
      </div>

      {/* Legend */}
      <div className="flex gap-3 text-[10px] text-smoke mb-2 ml-[100px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-3 h-1.5 rounded-sm"
            style={{
              background:
                "repeating-linear-gradient(45deg, rgba(201, 154, 44, 0.28) 0 4px, rgba(201, 154, 44, 0.10) 4px 8px)",
              border: "1px solid rgba(201, 154, 44, 0.40)",
            }}
          />
          Scheduled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-sm" style={{ background: MOSS }} />
          Worked
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-6 text-center text-smoke italic text-sm">
          No shifts scheduled and no one clocked in.
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="w-[100px] shrink-0">
            <div className="h-5" />
            {rows.map((r) => (
              <div
                key={r.userId}
                className="mt-1.5 flex flex-col justify-center min-w-0"
                style={{ height: 40 }}
              >
                <div className="text-[12px] text-ink font-medium truncate">{r.name}</div>
                <div className="text-[9px] text-smoke font-mono whitespace-nowrap">
                  {r.primaryShift
                    ? `${tzFormat(r.primaryShift.startTime, "h:mma", tz).toLowerCase()}–${tzFormat(r.primaryShift.endTime, "h:mma", tz).toLowerCase()}`
                    : "Unscheduled"}
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
                  style={{ left: `${t.pct}%`, fontSize: 10, color: SMOKE }}
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
                      background: GOLD,
                      boxShadow: `0 0 0 2px white, 0 0 6px rgba(201, 154, 44, 0.45)`,
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
                  width: 1,
                  background: "rgba(201, 154, 44, 0.55)",
                }}
              />
            )}

            {rows.map((r) => {
              const userEntries = r.entries;
              const hasOpen = userEntries.some((e) => e.out === null);
              const hasAny = userEntries.length > 0;
              const shift = r.primaryShift;
              const ended = shift ? shift.endTime < now : false;

              let scheduledColor = GOLD;
              let statusLabel: string | null = null;
              if (hasOpen) {
                scheduledColor = MOSS;
                statusLabel = "LIVE";
              } else if (hasAny && (ended || !isViewingToday)) {
                scheduledColor = MOSS;
                statusLabel = "Done";
              } else if (!hasAny && shift && ended && isViewingToday) {
                scheduledColor = ROSE;
                statusLabel = "No-show";
              } else if (!hasAny && shift && now >= shift.startTime && isViewingToday) {
                scheduledColor = AMBER;
                statusLabel = "Late";
              } else if (!shift && hasAny) {
                scheduledColor = MOSS;
                statusLabel = hasOpen ? "LIVE" : "Done";
              }

              const shiftStartPct = shift ? pctOfDay(shift.startTime, dayStart) : 0;
              const shiftEndPct = shift ? pctOfDay(shift.endTime, dayStart) : 0;
              const shiftWidthPct = shift ? Math.max(1, shiftEndPct - shiftStartPct) : 0;

              return (
                <div
                  key={r.userId}
                  className="relative mt-1.5 rounded-md bg-ink/[0.03] hover:bg-ink/[0.05] transition-colors group/row"
                  style={{ height: 40 }}
                >
                  {ticks.map((t) => (
                    <div
                      key={t.hour}
                      className="absolute inset-y-0 w-px bg-ink/[0.06]"
                      style={{ left: `${t.pct}%` }}
                    />
                  ))}

                  {shift && (
                    <div
                      className="absolute"
                      style={{
                        left: `${shiftStartPct}%`,
                        width: `${shiftWidthPct}%`,
                        top: 5,
                        height: 12,
                        background: `repeating-linear-gradient(135deg, ${scheduledColor}26 0 6px, ${scheduledColor}10 6px 12px)`,
                        border: `1px solid ${scheduledColor}55`,
                        borderRadius: 4,
                      }}
                      title={`Scheduled ${tzFormat(shift.startTime, "h:mma", tz).toLowerCase()}–${tzFormat(shift.endTime, "h:mma", tz).toLowerCase()}`}
                    />
                  )}

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
                          background: isOpen ? MOSS_BRIGHT : MOSS,
                          borderRadius: 4,
                          boxShadow: isOpen
                            ? `0 0 0 2px rgba(90, 133, 39, 0.20)`
                            : "none",
                        }}
                        title={`Worked ${tzFormat(segIn, "h:mma", tz).toLowerCase()}–${seg.out ? tzFormat(seg.out, "h:mma", tz).toLowerCase() : "now"}`}
                      />
                    );
                  })}

                  {statusLabel && (
                    <div
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium pointer-events-none"
                      style={{
                        color: scheduledColor,
                        background: "rgba(255, 255, 255, 0.94)",
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
                  className="absolute -translate-x-1/2 text-[8px] font-mono font-medium px-1.5 py-0.5 rounded"
                  style={{
                    top: 0,
                    background: GOLD,
                    color: "#3D2E08",
                    left: 0,
                  }}
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

function Pill({
  n,
  label,
  fillColor,
  borderColor,
  textColor,
  pulse,
}: {
  n: number;
  label: string;
  color: string;
  fillColor: string;
  borderColor: string;
  textColor: string;
  pulse?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide"
      style={{
        background: fillColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {pulse && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: textColor, animation: "pulse-glow 1.8s ease-in-out infinite" }}
        />
      )}
      {n} {label}
    </span>
  );
}
