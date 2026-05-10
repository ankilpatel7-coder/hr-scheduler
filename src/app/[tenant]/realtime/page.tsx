/**
 * Realtime Schedule — horizontal Gantt view of who's working today,
 * color-coded by role, with a live "Now" line. Designed for at-a-glance
 * monitoring (e.g. on a back-room monitor).
 *
 * URL: /[tenant]/realtime  (defaults to today in the tenant's timezone)
 *      /[tenant]/realtime?date=YYYY-MM-DD
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import DateNav from "@/components/date-nav";
import RealtimeAutoRefresh from "./auto-refresh";
import PrintButtonClient from "./print-button";
import { parseISO, isValid } from "date-fns";
import { tzStartOfDay, tzEndOfDay, tzFormat, tzYmd, DEFAULT_TZ } from "@/lib/tz";
import { DEFAULT_ROLE_COLOR } from "@/lib/category-colors";

export const dynamic = "force-dynamic";

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 24;
const HOURS_SPAN = DAY_END_HOUR - DAY_START_HOUR;

function pctOfDay(d: Date, dayBase: Date): number {
  const elapsedH = (d.getTime() - dayBase.getTime()) / 36e5;
  const fromStart = elapsedH - DAY_START_HOUR;
  return Math.max(0, Math.min(100, (fromStart / HOURS_SPAN) * 100));
}

export default async function RealtimePage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { date?: string };
}) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/realtime`);
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant || tenant.id !== tenantId || !tenant.active) redirect("/login");

  const tz = tenant.timezone || DEFAULT_TZ;
  const now = new Date();
  const parsed = searchParams?.date ? parseISO(searchParams.date) : now;
  const targetDate = isValid(parsed) ? parsed : now;
  const isViewingToday = tzYmd(targetDate, tz) === tzYmd(now, tz);

  const dayStart = tzStartOfDay(targetDate, tz);
  const dayEnd = tzEndOfDay(targetDate, tz);

  const [shifts, openClockIns, roles] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        startTime: { gte: dayStart, lte: dayEnd },
        employee: { role: "EMPLOYEE", active: true },
      },
      include: {
        employee: { select: { id: true, name: true } },
        tag: true,
      },
      orderBy: [{ startTime: "asc" }, { employeeId: "asc" }],
    }),
    isViewingToday
      ? prisma.clockEntry.findMany({
          where: { tenantId: tenant.id, clockOut: null },
          select: { userId: true },
        })
      : Promise.resolve([] as { userId: string }[]),
    prisma.shiftRole.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const openSet = new Set(openClockIns.map((e) => e.userId));
  const roleColorMap = new Map(roles.map((r) => [r.name, r.color]));

  // Hour ticks every 2 hours
  const ticks: { hour: number; pct: number; label: string }[] = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h += 2) {
    const pct = ((h - DAY_START_HOUR) / HOURS_SPAN) * 100;
    const labelHour = h % 24;
    let display: string;
    if (labelHour === 0) display = "12a";
    else if (labelHour === 12) display = "12p";
    else if (labelHour > 12) display = `${labelHour - 12}p`;
    else display = `${labelHour}a`;
    ticks.push({ hour: h, pct, label: display });
  }

  const liveCount = shifts.filter((s) => openSet.has(s.employee.id)).length;
  const nowPct = isViewingToday ? pctOfDay(now, dayStart) : -1;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 py-10 space-y-6">
        <RealtimeAutoRefresh enabled={isViewingToday} />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label-eyebrow mb-1">Realtime schedule</div>
            <h1 className="display text-4xl text-ink">
              {tzFormat(targetDate, "EEEE, MMMM d", tz)}
            </h1>
            <p className="text-sm text-smoke mt-1">
              {shifts.length} scheduled
              {isViewingToday && (
                <>
                  {" · "}
                  <span style={{ color: liveCount > 0 ? "#059669" : "#888" }}>
                    {liveCount} clocked in now
                  </span>
                  {" · "}
                  {tzFormat(now, "h:mma", tz).toLowerCase()} {tz.split("/").pop()?.replace("_", " ")}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <DateNav paramName="date" current={tzYmd(targetDate, tz)} />
            <button
              onClick={undefined as any}
              className="btn btn-secondary !py-1.5 inline-flex items-center gap-1.5 print:hidden"
              style={{ pointerEvents: "auto" }}
            >
              <PrintButton />
            </button>
          </div>
        </div>

        {/* Role color legend */}
        {roles.length > 0 && (
          <div className="flex items-center gap-4 text-[11px] text-smoke flex-wrap">
            <span>Color by role:</span>
            {roles.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: r.color }} />
                {r.name}
              </span>
            ))}
          </div>
        )}

        {/* Gantt */}
        <div className="card p-5 print:p-2 print:shadow-none">
          {shifts.length === 0 ? (
            <div className="py-12 text-center text-smoke italic text-sm">
              No shifts scheduled.
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="w-[170px] shrink-0">
                <div className="h-6" />
                {shifts.map((s) => (
                  <div
                    key={s.id}
                    className="h-9 mt-1.5 flex items-center min-w-0 text-[13px] text-ink font-medium truncate"
                  >
                    {s.employee.name}
                  </div>
                ))}
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

                {shifts.map((shift) => {
                  const startPct = pctOfDay(shift.startTime, dayStart);
                  const endPct = pctOfDay(shift.endTime, dayStart);
                  const widthPct = Math.max(2, endPct - startPct);
                  const color = (shift.role && roleColorMap.get(shift.role)) || DEFAULT_ROLE_COLOR;
                  const isLive = openSet.has(shift.employee.id);
                  const tagName = shift.tag?.name;

                  return (
                    <div key={shift.id} className="relative h-9 mt-1.5">
                      {ticks.map((t) => (
                        <div
                          key={t.hour}
                          className="absolute inset-y-0 w-px bg-ink/[0.06]"
                          style={{ left: `${t.pct}%` }}
                        />
                      ))}
                      <div
                        className="absolute rounded-md flex items-center justify-between px-2.5 text-white"
                        style={{
                          left: `${startPct}%`,
                          width: `${widthPct}%`,
                          top: 4,
                          bottom: 4,
                          background: color,
                          fontSize: 11,
                          boxShadow: isLive
                            ? "0 0 0 2px rgba(16,185,129,0.55)"
                            : undefined,
                        }}
                      >
                        <span className="truncate">
                          <span className="font-medium">{shift.role ?? "—"}</span>
                          <span className="opacity-80 ml-2 font-mono">
                            {tzFormat(shift.startTime, "h:mma", tz).toLowerCase()}–
                            {tzFormat(shift.endTime, "h:mma", tz).toLowerCase()}
                          </span>
                        </span>
                        {(tagName || isLive) && (
                          <span className="flex gap-1.5 ml-2">
                            {tagName && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: "rgba(255,255,255,0.20)" }}
                              >
                                {tagName}
                              </span>
                            )}
                            {isLive && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                                style={{ background: "rgba(255,255,255,0.85)", color: "#059669" }}
                              >
                                LIVE
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isViewingToday && nowPct >= 0 && (
                  <div
                    className="absolute pointer-events-none"
                    style={{ top: 0, bottom: 0, left: `${nowPct}%`, width: 0 }}
                  >
                    <div
                      className="absolute top-6 bottom-0 w-0.5"
                      style={{ background: "#10b981", left: 0 }}
                    />
                    <div
                      className="absolute -translate-x-1/2 text-[10px] font-mono font-medium px-2 py-0.5 rounded"
                      style={{ top: 0, background: "#10b981", color: "white", left: 0 }}
                    >
                      NOW {tzFormat(now, "h:mma", tz).toLowerCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="text-[11px] text-smoke text-center print:hidden">
          {isViewingToday
            ? "Auto-refreshes every 30 seconds while viewing today."
            : "Historical view — auto-refresh disabled."}
        </div>
      </main>
    </div>
  );
}

function PrintButton() {
  return <PrintButtonClient />;
}
