/**
 * Coverage forecast for the next 7 days — bar chart of scheduled hours,
 * color-coded against the average day's coverage over the last 4 weeks.
 *
 *   <CoverageForecast tenantId={tenantId} tenantSlug={slug} />
 *
 * Heuristic without an explicit "target hours" field:
 *   - baseline = avg scheduled hours per day over the last 4 weeks (only days
 *     that had any shifts, to avoid dragging the avg down by closures)
 *   - red:    < 40% of baseline
 *   - amber:  40% – 70% of baseline
 *   - green:  ≥ 70% of baseline
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay, addDays, subDays, format } from "date-fns";
import { ArrowRight } from "lucide-react";

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
        tenantId,
        published: true,
        startTime: { gte: today, lte: next7End },
        employee: { role: "EMPLOYEE", active: true },
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.shift.findMany({
      where: {
        tenantId,
        published: true,
        startTime: { gte: past28Start, lt: today },
        employee: { role: "EMPLOYEE" },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  // Bucket forecast into 7 days
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

  // Compute baseline = avg hours per day over last 28 days, ignoring zero-hour days
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

  function colorFor(h: number) {
    if (baseline <= 0) return "#10b981";
    const ratio = h / baseline;
    if (ratio < 0.4) return "#dc2626";
    if (ratio < 0.7) return "#d97706";
    return "#10b981";
  }

  const maxBar = Math.max(0.0001, baseline, ...days.map((d) => d.hours));
  const flagged = days.filter((d) => d.hours / baseline < 0.7).length;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="display text-lg text-ink">Coverage · next 7 days</h3>
        <Link
          href={`/${tenantSlug}/schedule`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1"
        >
          Schedule <ArrowRight size={11} />
        </Link>
      </div>
      <div className="text-[11px] text-smoke mb-3">
        Baseline: {baseline.toFixed(1)}h/day (last 4 weeks avg)
      </div>

      <div className="flex gap-1.5 items-end" style={{ height: 80 }}>
        {days.map((d, i) => {
          const c = colorFor(d.hours);
          const heightPct = (d.hours / maxBar) * 100;
          const isToday = i === 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <span className="text-[10px] font-mono tabular-nums" style={{ color: c }}>
                {d.hours > 0 ? d.hours.toFixed(0) : "—"}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${Math.max(heightPct, 3)}%`,
                  background: c,
                  opacity: d.hours > 0 ? 1 : 0.25,
                }}
                title={`${d.hours.toFixed(1)}h scheduled`}
              />
              <span
                className="text-[10px] font-mono"
                style={{
                  color: isToday ? "#1a1a1a" : "#888",
                  fontWeight: isToday ? 500 : 400,
                }}
              >
                {format(d.date, "EEE")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-smoke mt-3">
        {flagged === 0 ? (
          "All 7 days look fully covered."
        ) : (
          <>
            <span className="text-rose font-medium" style={{ color: "#d97706" }}>
              {flagged}
            </span>{" "}
            day{flagged === 1 ? "" : "s"} flagged for low coverage.{" "}
            <Link href={`/${tenantSlug}/schedule`} className="text-rust hover:underline">
              Open schedule →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
