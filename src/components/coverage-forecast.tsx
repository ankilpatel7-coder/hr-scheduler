/**
 * Premium coverage forecast — 7-day gradient bars, baseline indicator line,
 * today highlighted with a ring, hover lift.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay, addDays, subDays, format } from "date-fns";
import { ArrowRight, AlertTriangle } from "lucide-react";

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default async function CoverageForecast({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const now = new Date();
  const today = startOfDay(now);
  const next7End = endOfDay(addDays(today, 6));
  const past28Start = startOfDay(subDays(today, 28));

  const [forecast, history] = await Promise.all([
    prisma.shift.findMany({
      where: {
        tenantId, published: true,
        startTime: { gte: today, lte: next7End },
        employee: { role: "EMPLOYEE", active: true },
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.shift.findMany({
      where: {
        tenantId, published: true,
        startTime: { gte: past28Start, lt: today },
        employee: { role: "EMPLOYEE" },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const days: { date: Date; hours: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const ds = startOfDay(d);
    const de = endOfDay(d);
    let h = 0;
    for (const s of forecast) {
      if (s.startTime >= ds && s.startTime <= de) {
        h += durationHours(s.startTime, s.endTime);
      }
    }
    days.push({ date: d, hours: h });
  }

  const histDays = new Map<string, number>();
  for (let i = 0; i < 28; i++) {
    const d = startOfDay(subDays(today, i + 1));
    histDays.set(format(d, "yyyy-MM-dd"), 0);
  }
  for (const s of history) {
    const k = format(s.startTime, "yyyy-MM-dd");
    if (histDays.has(k)) {
      histDays.set(k, (histDays.get(k) ?? 0) + durationHours(s.startTime, s.endTime));
    }
  }
  const nonzero = Array.from(histDays.values()).filter((v) => v > 0);
  const baseline = nonzero.length > 0 ? nonzero.reduce((a, b) => a + b, 0) / nonzero.length : 8;

  function gradFor(h: number): { from: string; to: string; tone: string } {
    if (baseline <= 0) return { from: "#34d399", to: "#10b981", tone: "#059669" };
    const ratio = h / baseline;
    if (ratio < 0.4) return { from: "#f87171", to: "#dc2626", tone: "#dc2626" };
    if (ratio < 0.7) return { from: "#fbbf24", to: "#f59e0b", tone: "#d97706" };
    return { from: "#34d399", to: "#10b981", tone: "#059669" };
  }

  const maxBar = Math.max(0.0001, baseline, ...days.map((d) => d.hours));
  const flagged = days.filter((d) => d.hours / baseline < 0.7).length;
  const baselinePct = (baseline / maxBar) * 100;

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-1">
        <div>
          <div className="label-eyebrow">Next 7 days</div>
          <h3 className="display text-2xl text-ink mt-1">Coverage forecast</h3>
        </div>
        <Link
          href={`/${tenantSlug}/schedule`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1 font-medium"
        >
          Schedule <ArrowRight size={11} />
        </Link>
      </div>
      <div className="text-[11px] text-smoke mb-5 flex items-center gap-2 flex-wrap">
        <span>Baseline:</span>
        <span className="font-mono font-semibold text-ink">{baseline.toFixed(1)}h/day</span>
        <span className="text-dust">·</span>
        <span>4-week avg</span>
      </div>

      <div className="flex gap-2 items-end relative" style={{ height: 110 }}>
        {/* Baseline reference line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed pointer-events-none"
          style={{
            bottom: `${baselinePct}%`,
            borderColor: "rgba(15, 23, 42, 0.18)",
          }}
        >
          <span
            className="absolute -top-4 right-0 text-[9px] font-mono text-smoke"
            style={{ background: "white", padding: "0 4px" }}
          >
            baseline
          </span>
        </div>

        {days.map((d, i) => {
          const g = gradFor(d.hours);
          const heightPct = (d.hours / maxBar) * 100;
          const isToday = i === 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
            >
              <span
                className="text-[11px] font-mono tabular-nums font-semibold transition-all"
                style={{ color: g.tone }}
              >
                {d.hours > 0 ? d.hours.toFixed(0) : "—"}
              </span>
              <div
                className="w-full rounded-t-md relative transition-all duration-300 group-hover:translate-y-[-2px]"
                style={{
                  height: `${Math.max(heightPct, 3)}%`,
                  background: `linear-gradient(180deg, ${g.from} 0%, ${g.to} 100%)`,
                  opacity: d.hours > 0 ? 1 : 0.25,
                  boxShadow: d.hours > 0
                    ? `0 4px 12px -2px ${g.tone}50, inset 0 1px 0 rgba(255, 255, 255, 0.3)`
                    : "none",
                  outline: isToday ? `2px solid ${g.tone}40` : "none",
                  outlineOffset: 2,
                }}
                title={`${format(d.date, "EEE MMM d")}: ${d.hours.toFixed(1)}h scheduled`}
              />
              <span
                className="text-[10px] font-mono"
                style={{
                  color: isToday ? "#0f172a" : "#94a3b8",
                  fontWeight: isToday ? 600 : 500,
                }}
              >
                {format(d.date, "EEE")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-[12px] mt-5 pt-4 border-t border-dust flex items-center gap-2">
        {flagged === 0 ? (
          <>
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full"
              style={{ background: "rgba(16, 185, 129, 0.12)", color: "#059669" }}
            >
              ✓
            </span>
            <span className="text-ink">All 7 days look fully covered.</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} style={{ color: "#d97706" }} />
            <span className="text-ink">
              <span className="font-semibold" style={{ color: "#d97706" }}>
                {flagged}
              </span>{" "}
              day{flagged === 1 ? "" : "s"} flagged.
            </span>
            <Link
              href={`/${tenantSlug}/schedule`}
              className="text-rust hover:underline font-medium ml-auto"
            >
              Fix coverage →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
