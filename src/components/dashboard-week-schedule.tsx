/**
 * Read-only weekly schedule for the dashboard.
 *
 * Server component — no client JS. Week navigation is plain links that set a
 * ?week=YYYY-MM-DD search param, so this can never interfere with the real
 * /schedule page's drag-and-drop editing.
 *
 * ACCESS SCOPING (important): a viewer only sees shifts at locations they are
 * assigned to, plus their own shifts anywhere (so a cross-location assignment
 * still shows up on their dashboard). Admins see everything, optionally
 * narrowed by the dashboard's location filter.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAY_MS = 86_400_000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Monday-start week containing `d`, as a UTC-noon anchor. */
function weekStartOf(d: Date): Date {
  const noon = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12),
  );
  const dow = (noon.getUTCDay() + 6) % 7; // Mon = 0
  return new Date(noon.getTime() - dow * DAY_MS);
}

function parseWeekParam(week?: string): Date {
  if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const [y, m, d] = week.split("-").map(Number);
    return weekStartOf(new Date(Date.UTC(y, m - 1, d, 12)));
  }
  return weekStartOf(new Date());
}

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(d)
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(":00", "");
}

function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default async function DashboardWeekSchedule({
  tenantId,
  tenantSlug,
  timezone,
  viewerId,
  viewerRole,
  week,
  locationId,
}: {
  tenantId: string;
  tenantSlug: string;
  timezone: string;
  viewerId: string;
  viewerRole: string;
  week?: string;
  locationId?: string;
}) {
  const tz = timezone || "America/New_York";
  const start = parseWeekParam(week);
  const end = new Date(start.getTime() + 7 * DAY_MS);

  // ---- Access scoping -------------------------------------------------
  // Admins see the whole tenant (respecting the dashboard location filter).
  // Everyone else is limited to locations they're assigned to, plus their
  // own shifts wherever those happen to be.
  const isAdmin = viewerRole === "ADMIN";
  let locationWhere: any = locationId ? { locationId } : {};

  if (!isAdmin) {
    const myLocations = await prisma.employeeLocation.findMany({
      where: { userId: viewerId },
      select: { locationId: true },
    });
    const allowedIds = myLocations.map((l) => l.locationId);

    locationWhere = {
      OR: [
        ...(allowedIds.length > 0 ? [{ locationId: { in: allowedIds } }] : []),
        { employeeId: viewerId },
      ],
    };
  }
  // ---------------------------------------------------------------------

  const [shifts, roles] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        startTime: { gte: start, lt: end },
        employee: { active: true, archivedAt: null },
        ...locationWhere,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        role: true,
        employee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.shiftRole.findMany({
      where: { tenantId, active: true },
      select: { name: true, color: true },
    }),
  ]);

  const colorByRole = new Map(roles.map((r) => [r.name, r.color]));
  const FALLBACK = "#C99A2C";

  // Bucket shifts into the seven day columns using tenant-local dates.
  const days: { date: Date; key: string; shifts: typeof shifts }[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start.getTime() + i * DAY_MS);
    days.push({ date, key: dayKeyInTz(date, tz), shifts: [] });
  }
  for (const s of shifts) {
    const k = dayKeyInTz(s.startTime, tz);
    const bucket = days.find((d) => d.key === k);
    if (bucket) bucket.shifts.push(s);
  }

  const prevWeek = ymd(new Date(start.getTime() - 7 * DAY_MS));
  const nextWeek = ymd(new Date(start.getTime() + 7 * DAY_MS));
  const todayKey = dayKeyInTz(new Date(), tz);
  const isCurrentWeek = weekStartOf(new Date()).getTime() === start.getTime();

  const rangeLabel = `${new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(start)} – ${new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(start.getTime() + 6 * DAY_MS))}`;

  const totalShifts = shifts.length;

  // Show which locations are represented, so it's clear the view is scoped.
  const locationNames = Array.from(
    new Set(shifts.map((s) => s.location?.name).filter(Boolean) as string[]),
  );

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">Team schedule</div>
          <h2 className="display text-2xl text-ink mt-0.5">{rangeLabel}</h2>
          {locationNames.length > 0 && (
            <div className="text-[11px] text-smoke mt-0.5">
              {locationNames.join(" · ")}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-smoke">
            {totalShifts} shift{totalShifts === 1 ? "" : "s"}
          </span>
          <div className="inline-flex items-center gap-1 border border-dust rounded-full px-1 py-0.5 bg-paper">
            <Link
              href={`/${tenantSlug}/dashboard?week=${prevWeek}`}
              className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
              aria-label="Previous week"
            >
              <ChevronLeft size={14} className="text-smoke" />
            </Link>
            {!isCurrentWeek && (
              <Link
                href={`/${tenantSlug}/dashboard`}
                className="text-[11px] text-smoke hover:text-ink px-2"
              >
                This week
              </Link>
            )}
            <Link
              href={`/${tenantSlug}/dashboard?week=${nextWeek}`}
              className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
              aria-label="Next week"
            >
              <ChevronRight size={14} className="text-smoke" />
            </Link>
          </div>
        </div>
      </div>

      {totalShifts === 0 ? (
        <div className="py-8 text-center text-sm text-smoke italic">
          No published shifts this week.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {days.map((d) => {
            const isToday = d.key === todayKey;
            return (
              <div
                key={d.key}
                className={`rounded-lg border p-2 min-h-[110px] ${
                  isToday
                    ? "border-rust/40 bg-rust/[0.04]"
                    : "border-dust bg-bone/40"
                }`}
              >
                <div className="flex items-baseline gap-1.5 mb-2">
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold ${
                      isToday ? "text-rust" : "text-smoke"
                    }`}
                  >
                    {DAY_NAMES[d.date.getUTCDay()]}
                  </span>
                  <span
                    className={`text-[11px] tabular-nums ${
                      isToday ? "text-ink font-medium" : "text-smoke"
                    }`}
                  >
                    {d.date.getUTCDate()}
                  </span>
                </div>

                {d.shifts.length === 0 ? (
                  <div className="text-[10px] text-smoke/60 italic">—</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {d.shifts.map((s) => {
                      const color = s.role
                        ? colorByRole.get(s.role) ?? FALLBACK
                        : FALLBACK;
                      const isMine = s.employee?.id === viewerId;
                      return (
                        <div
                          key={s.id}
                          className="rounded px-1.5 py-1 text-[10px] leading-tight"
                          style={{
                            background: `${color}14`,
                            borderLeft: `2px solid ${color}`,
                            outline: isMine ? `1px solid ${color}66` : undefined,
                          }}
                          title={`${s.employee?.name ?? "Unassigned"} · ${fmtTime(
                            s.startTime,
                            tz,
                          )}–${fmtTime(s.endTime, tz)}${
                            s.location ? ` · ${s.location.name}` : ""
                          }`}
                        >
                          <div
                            className={`truncate ${
                              isMine ? "font-semibold text-ink" : "font-medium text-ink"
                            }`}
                          >
                            {s.employee?.name?.split(" ")[0] ?? "Open"}
                          </div>
                          <div className="text-smoke font-mono text-[9px]">
                            {fmtTime(s.startTime, tz)}–{fmtTime(s.endTime, tz)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
