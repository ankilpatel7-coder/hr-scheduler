/**
 * Compact Projected Overtime widget for the dashboard home page.
 *
 * Server component. Drop into the dashboard wherever the old "At/near 40 hrs"
 * card lived:
 *
 *   import OvertimeRiskWidget from "@/components/overtime-risk-widget";
 *   <OvertimeRiskWidget tenantId={tenant.id} tenantSlug={tenant.slug} />
 *
 * Renders 3 colored stat tiles (Over 40 / At risk / On track) plus the top 3
 * highest-projected employees with mini progress bars. Links to the full
 * /[tenant]/projected-hours page.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek } from "date-fns";
import { ArrowRight } from "lucide-react";

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default async function OvertimeRiskWidget({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const [employees, entries, scheduled] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, active: true, role: "EMPLOYEE" },
      select: { id: true, name: true, email: true },
    }),
    prisma.clockEntry.findMany({
      where: { tenantId, clockIn: { gte: weekStart, lte: weekEnd } },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        startTime: { gte: now, lte: weekEnd },
        employee: { role: "EMPLOYEE" },
      },
      select: { employeeId: true, startTime: true, endTime: true },
    }),
  ]);

  const clockedMap = new Map<string, number>();
  const schedMap = new Map<string, number>();
  for (const e of entries) {
    const end = e.clockOut ?? now;
    clockedMap.set(e.userId, (clockedMap.get(e.userId) ?? 0) + durationHours(e.clockIn, end));
  }
  for (const s of scheduled) {
    schedMap.set(s.employeeId, (schedMap.get(s.employeeId) ?? 0) + durationHours(s.startTime, s.endTime));
  }

  const rows = employees
    .map((e) => {
      const c = clockedMap.get(e.id) ?? 0;
      const s = schedMap.get(e.id) ?? 0;
      return { id: e.id, name: e.name || e.email, clocked: c, scheduled: s, total: c + s };
    })
    .sort((a, b) => b.total - a.total);

  const over = rows.filter((r) => r.total >= 40).length;
  const atRisk = rows.filter((r) => r.total >= 32 && r.total < 40).length;
  const onTrack = rows.length - over - atRisk;
  const top = rows.slice(0, 3);

  const SCALE = 50;

  function colorFor(h: number) {
    if (h >= 40) return "#dc2626";
    if (h >= 32) return "#d97706";
    return "#059669";
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">Projected hours · this week</div>
          <h2 className="display text-2xl text-ink mt-0.5">Overtime risk</h2>
        </div>
        <Link
          href={`/${tenantSlug}/projected-hours`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1"
        >
          Full breakdown <ArrowRight size={12} />
        </Link>
      </div>

      {/* Three colored stat tiles */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Tile count={over} label="Over 40" color="#dc2626" bg="rgba(239,68,68,0.08)" />
        <Tile count={atRisk} label="At risk" color="#d97706" bg="rgba(245,158,11,0.08)" />
        <Tile count={onTrack} label="On track" color="#059669" bg="rgba(16,185,129,0.08)" />
      </div>

      {/* Top 3 with mini bars */}
      {top.length > 0 ? (
        <div className="space-y-2.5">
          <div className="text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">
            Highest this week
          </div>
          {top.map((r) => {
            const color = colorFor(r.total);
            const clockedPct = Math.min(100, (r.clocked / SCALE) * 100);
            const schedPct = Math.min(Math.max(0, 100 - clockedPct), (r.scheduled / SCALE) * 100);
            const fortyPct = (40 / SCALE) * 100;
            return (
              <div key={r.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium text-ink truncate">{r.name}</span>
                  <span
                    className="font-mono text-xs font-medium tabular-nums"
                    style={{ color }}
                  >
                    {r.total.toFixed(1)}h
                  </span>
                </div>
                <div className="relative h-1.5 rounded-full bg-ink/[0.05] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${clockedPct}%`, background: color }}
                  />
                  <div
                    className="absolute inset-y-0"
                    style={{
                      left: `${clockedPct}%`,
                      width: `${schedPct}%`,
                      background: `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)`,
                      opacity: 0.7,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 w-px bg-ink/40"
                    style={{ left: `${fortyPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-smoke italic text-center py-2">
          No active employees yet.
        </div>
      )}
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
      className="border-l-4 px-3 py-2.5 rounded"
      style={{ borderLeftColor: color, background: bg }}
    >
      <div
        className="text-[9px] uppercase tracking-[0.18em] font-medium leading-none"
        style={{ color }}
      >
        {label}
      </div>
      <div className="display text-2xl mt-1 leading-none" style={{ color }}>
        {count}
      </div>
    </div>
  );
}
