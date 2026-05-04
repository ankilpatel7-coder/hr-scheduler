/**
 * Projected Hours — weekly OT-risk view.
 *
 * Shows each employee's combined (clocked + scheduled) hours for the current
 * Mon–Sun week, sorted highest first. Linked from the dashboard's
 * "Projected >= 40 hrs" warning card.
 *
 * Status bands:
 *   - OVER     >= 40 hrs (red)
 *   - AT RISK  32 - 39.99 hrs (amber)
 *   - ON TRACK < 32 hrs (green)
 *
 * Open clock-ins (no clockOut) are counted up to "now" and surfaced in a
 * banner so totals make sense.
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Navbar from "@/components/navbar";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { AlertTriangle, Clock, CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

type Status = { color: string; bg: string; label: string };
function statusFor(h: number): Status {
  if (h >= 40) return { color: "#dc2626", bg: "rgba(239,68,68,0.10)", label: "OVER" };
  if (h >= 32) return { color: "#d97706", bg: "rgba(245,158,11,0.10)", label: "AT RISK" };
  return { color: "#059669", bg: "rgba(16,185,129,0.10)", label: "ON TRACK" };
}

export default async function ProjectedHoursPage({ params }: { params: { tenant: string } }) {
  const session = await getServerAuth();
  if (!session) redirect(`/login?from=/${params.tenant}/projected-hours`);
  const tenantId = (session.user as any).tenantId as string | null;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin) redirect("/superadmin");
  if (!tenantId) redirect("/login");

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant || tenant.id !== tenantId || !tenant.active) redirect("/login");

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const [employees, entries, scheduled] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: tenant.id, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.clockEntry.findMany({
      where: { tenantId: tenant.id, clockIn: { gte: weekStart, lte: weekEnd } },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
    prisma.shift.findMany({
      where: {
        tenantId: tenant.id,
        published: true,
        startTime: { gte: now, lte: weekEnd },
      },
      select: { employeeId: true, startTime: true, endTime: true },
    }),
  ]);

  const clockedMap = new Map<string, number>();
  const schedMap = new Map<string, number>();
  let openCount = 0;
  const openByUser = new Set<string>();

  for (const e of entries) {
    const end = e.clockOut ?? now;
    if (!e.clockOut) {
      openCount++;
      openByUser.add(e.userId);
    }
    clockedMap.set(e.userId, (clockedMap.get(e.userId) ?? 0) + durationHours(e.clockIn, end));
  }
  for (const s of scheduled) {
    schedMap.set(
      s.employeeId,
      (schedMap.get(s.employeeId) ?? 0) + durationHours(s.startTime, s.endTime),
    );
  }

  const rows = employees
    .map((e) => {
      const c = clockedMap.get(e.id) ?? 0;
      const s = schedMap.get(e.id) ?? 0;
      return {
        id: e.id,
        name: e.name || e.email,
        role: e.role,
        clocked: c,
        scheduled: s,
        total: c + s,
        open: openByUser.has(e.id),
      };
    })
    .sort((a, b) => b.total - a.total);

  const over = rows.filter((r) => r.total >= 40).length;
  const atRisk = rows.filter((r) => r.total >= 32 && r.total < 40).length;
  const onTrack = rows.length - over - atRisk;

  // bar scale: 50 hrs spans the full width
  const SCALE = 50;
  const fortyPct = (40 / SCALE) * 100;
  const fmt = (h: number) => h.toFixed(1);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-6">
        {/* Header */}
        <div>
          <div className="label-eyebrow mb-1">Projected hours</div>
          <h1 className="display text-4xl text-ink">This week's overtime risk</h1>
          <p className="text-sm text-smoke mt-1">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")} · clocked + scheduled
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard count={over} label="Over 40" color="#dc2626" bg="rgba(239,68,68,0.06)" />
          <StatCard count={atRisk} label="At risk (32–40)" color="#d97706" bg="rgba(245,158,11,0.06)" />
          <StatCard count={onTrack} label="On track" color="#059669" bg="rgba(16,185,129,0.06)" />
        </div>

        {/* Open clock-ins banner */}
        {openCount > 0 && (
          <div
            className="card flex items-start gap-3 p-4 border-l-4"
            style={{ borderLeftColor: "#d97706", background: "rgba(245,158,11,0.06)" }}
          >
            <AlertTriangle size={18} style={{ color: "#d97706" }} className="mt-0.5 shrink-0" />
            <div className="text-sm text-ink">
              <div className="font-medium">
                {openCount} {openCount === 1 ? "person is" : "people are"} still clocked in
              </div>
              <div className="text-smoke text-xs mt-0.5">
                Their hours are counted up to right now and will keep growing until they clock out.
              </div>
            </div>
          </div>
        )}

        {/* Employee rows */}
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr,auto] items-center gap-4 px-5 py-3 bg-paper border-b border-dust text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">
            <span>Employee · projected hours this week</span>
            <span>Total</span>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-12 text-center text-smoke italic text-sm">
              No active employees yet.
            </div>
          ) : (
            rows.map((r) => {
              const st = statusFor(r.total);
              const clockedPct = Math.min(100, (r.clocked / SCALE) * 100);
              const schedPct = Math.min(Math.max(0, 100 - clockedPct), (r.scheduled / SCALE) * 100);
              return (
                <div key={r.id} className="border-b border-dust last:border-0 px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-ink truncate">{r.name}</span>
                      <span
                        className="text-[10px] uppercase tracking-[0.12em] font-medium px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: st.color, background: st.bg }}
                      >
                        {st.label}
                      </span>
                      {r.open && (
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                          style={{ color: "#d97706", background: "rgba(245,158,11,0.10)" }}
                        >
                          • clocked in
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-lg font-medium leading-none" style={{ color: st.color }}>
                        {fmt(r.total)}h
                      </div>
                      <div className="text-[11px] text-smoke font-mono mt-1">
                        <Clock size={10} className="inline mr-0.5" />
                        {fmt(r.clocked)} clocked
                        <span className="mx-1.5 text-dust">+</span>
                        <CalendarClock size={10} className="inline mr-0.5" />
                        {fmt(r.scheduled)} scheduled
                      </div>
                    </div>
                  </div>

                  {/* Progress bar with 40-hr marker */}
                  <div className="relative h-2.5 rounded-full bg-ink/5 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 transition-all"
                      style={{ width: `${clockedPct}%`, background: st.color }}
                    />
                    <div
                      className="absolute inset-y-0 transition-all"
                      style={{
                        left: `${clockedPct}%`,
                        width: `${schedPct}%`,
                        background: `repeating-linear-gradient(45deg, ${st.color} 0 4px, transparent 4px 8px)`,
                        opacity: 0.7,
                      }}
                    />
                    {/* 40-hr threshold marker */}
                    <div
                      className="absolute inset-y-0 w-px bg-ink/40"
                      style={{ left: `${fortyPct}%` }}
                      title="40-hour overtime threshold"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Legend */}
        <div className="text-[11px] text-smoke flex items-center gap-5 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-2 rounded-sm bg-ink/40" /> Clocked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 h-2 rounded-sm"
              style={{
                background:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.4) 0 3px, transparent 3px 6px)",
              }}
            />{" "}
            Scheduled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-px h-3 bg-ink/40" /> 40-hour threshold
          </span>
          <span className="text-dust">·</span>
          <span>Bar scale: 0 – 50 hrs</span>
        </div>
      </main>
    </div>
  );
}

function StatCard({
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
    <div className="card p-5 border-l-4" style={{ borderLeftColor: color, background: bg }}>
      <div
        className="text-[10px] uppercase tracking-[0.18em] font-medium"
        style={{ color }}
      >
        {label}
      </div>
      <div className="display text-4xl mt-1" style={{ color }}>
        {count}
      </div>
    </div>
  );
}
