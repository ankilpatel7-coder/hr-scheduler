/**
 * Premium overtime-risk widget — gradient stat tiles, gradient-text numbers,
 * animated shimmer progress bars.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek } from "date-fns";
import { ArrowRight, AlertTriangle, ShieldCheck, AlertCircle } from "lucide-react";

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default async function OvertimeRiskWidget({
  tenantId,
  tenantSlug,
  locationId,
}: {
  tenantId: string;
  tenantSlug: string;
  locationId?: string;
}) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const [employees, entries, scheduled] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId,
        active: true,
        role: "EMPLOYEE",
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: { id: true, name: true, email: true },
    }),
    prisma.clockEntry.findMany({
      where: {
        tenantId,
        clockIn: { gte: weekStart, lte: weekEnd },
        ...(locationId ? { user: { locations: { some: { locationId } } } } : {}),
      },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
    prisma.shift.findMany({
      where: {
        tenantId, published: true,
        startTime: { gte: now, lte: weekEnd },
        employee: { role: "EMPLOYEE" },
        ...(locationId ? { locationId } : {}),
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
    if (!s.employeeId) continue;
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

  function gradFor(h: number) {
    if (h >= 40) return { from: "#f87171", to: "#dc2626", tone: "#dc2626", glow: "rgba(220,38,38,0.35)" };
    if (h >= 32) return { from: "#fbbf24", to: "#f59e0b", tone: "#d97706", glow: "rgba(245,158,11,0.35)" };
    return { from: "#34d399", to: "#10b981", tone: "#059669", glow: "rgba(16,185,129,0.35)" };
  }

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">Projected hours · this week</div>
          <h2 className="display text-2xl text-ink mt-1">Overtime risk</h2>
        </div>
        <Link
          href={`/${tenantSlug}/projected-hours`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1 font-medium"
        >
          Full breakdown <ArrowRight size={11} />
        </Link>
      </div>

      {/* Three premium stat tiles */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <PremiumTile
          count={over}
          label="Over 40"
          icon={<AlertCircle size={12} />}
          fromColor="#f87171"
          toColor="#dc2626"
          glowColor="rgba(220, 38, 38, 0.25)"
          isAlert={over > 0}
        />
        <PremiumTile
          count={atRisk}
          label="At risk"
          icon={<AlertTriangle size={12} />}
          fromColor="#fbbf24"
          toColor="#f59e0b"
          glowColor="rgba(245, 158, 11, 0.25)"
          isAlert={atRisk > 0}
        />
        <PremiumTile
          count={onTrack}
          label="On track"
          icon={<ShieldCheck size={12} />}
          fromColor="#34d399"
          toColor="#10b981"
          glowColor="rgba(16, 185, 129, 0.25)"
          isAlert={false}
        />
      </div>

      {/* Top 3 progress bars */}
      {top.length > 0 ? (
        <div className="space-y-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-smoke font-semibold">
            Highest this week
          </div>
          {top.map((r) => {
            const g = gradFor(r.total);
            const clockedPct = Math.min(100, (r.clocked / SCALE) * 100);
            const schedPct = Math.min(Math.max(0, 100 - clockedPct), (r.scheduled / SCALE) * 100);
            const fortyPct = (40 / SCALE) * 100;
            return (
              <div key={r.id} className="group">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-medium text-ink truncate">{r.name}</span>
                  <span
                    className="font-mono text-sm font-semibold tabular-nums"
                    style={{ color: g.tone }}
                  >
                    {r.total.toFixed(1)}h
                  </span>
                </div>
                <div
                  className="relative h-2 rounded-full overflow-hidden"
                  style={{ background: "rgba(15, 23, 42, 0.05)" }}
                >
                  {/* Clocked portion — gradient solid */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-l-full transition-all duration-500"
                    style={{
                      width: `${clockedPct}%`,
                      background: `linear-gradient(90deg, ${g.from} 0%, ${g.to} 100%)`,
                      boxShadow: `0 0 8px ${g.glow}`,
                    }}
                  />
                  {/* Scheduled (future) portion — dashed gradient */}
                  <div
                    className="absolute inset-y-0 transition-all duration-500"
                    style={{
                      left: `${clockedPct}%`,
                      width: `${schedPct}%`,
                      background: `repeating-linear-gradient(135deg, ${g.to} 0 4px, transparent 4px 8px)`,
                      opacity: 0.75,
                    }}
                  />
                  {/* Shimmer overlay on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.5s linear infinite",
                    }}
                  />
                  {/* 40h marker */}
                  <div
                    className="absolute inset-y-0 w-px"
                    style={{
                      left: `${fortyPct}%`,
                      background: "rgba(15, 23, 42, 0.4)",
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-smoke mt-1 font-mono">
                  <span>
                    <span className="font-medium" style={{ color: g.tone }}>{r.clocked.toFixed(1)}</span> clocked
                    {r.scheduled > 0 && (
                      <> · <span className="font-medium">{r.scheduled.toFixed(1)}</span> upcoming</>
                    )}
                  </span>
                  <span>40h →</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-smoke italic text-center py-4">
          No active employees yet.
        </div>
      )}
    </div>
  );
}

function PremiumTile({
  count,
  label,
  icon,
  fromColor,
  toColor,
  glowColor,
  isAlert,
}: {
  count: number;
  label: string;
  icon: React.ReactNode;
  fromColor: string;
  toColor: string;
  glowColor: string;
  isAlert: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-3.5 transition-all hover:translate-y-[-2px] group"
      style={{
        background: `linear-gradient(135deg, ${fromColor}10 0%, ${toColor}18 100%)`,
        border: `1px solid ${toColor}30`,
        boxShadow: `0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 2px 6px -2px ${glowColor}, 0 8px 20px -8px ${glowColor}`,
      }}
    >
      {/* Top gradient strip */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${fromColor}, ${toColor})` }}
      />
      {/* Hover halo */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-30 group-hover:opacity-60 transition-opacity pointer-events-none"
        style={{ background: toColor }}
      />
      <div
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold relative z-10"
        style={{ color: toColor }}
      >
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded"
          style={{ background: `${toColor}25` }}
        >
          {icon}
        </span>
        {label}
      </div>
      <div
        className="display text-4xl mt-2 leading-none font-bold relative z-10"
        style={{
          background: `linear-gradient(135deg, ${fromColor} 0%, ${toColor} 100%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          display: "inline-block",
          paddingRight: "0.05em",
        }}
      >
        {count}
      </div>
      {isAlert && (
        <div
          className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full"
          style={{
            background: toColor,
            boxShadow: `0 0 8px ${toColor}, 0 0 4px ${toColor}`,
            animation: "pulse-glow 2s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
}
