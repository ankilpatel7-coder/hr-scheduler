/**
 * Last 8 weeks: bars for hours + line for cost. Server component.
 *
 *   <LaborWowChart tenantId={tenantId} />
 *
 * Layout: bar area + cost-line overlay sit in one relatively-positioned
 * container; labels live in a separate grid row underneath. This keeps the
 * SVG overlay aligned to the bar tops and prevents stray dots/lines from
 * leaking into the label area.
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

const SPARK_WEEKS = 8;
const CHART_HEIGHT = 140;

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default async function LaborWowChart({ tenantId }: { tenantId: string }) {
  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const eightWeeksAgo = subWeeks(thisWeekStart, SPARK_WEEKS - 1);
  const thisWeekEnd = endOfWeek(thisWeekStart, { weekStartsOn: 1 });

  const entries = await prisma.clockEntry.findMany({
    where: {
      tenantId,
      clockIn: { gte: eightWeeksAgo, lte: thisWeekEnd },
      NOT: { clockOut: null },
    },
    select: {
      clockIn: true,
      clockOut: true,
      user: { select: { hourlyWage: true } },
    },
  });

  const buckets: { weekStart: Date; hours: number; cost: number }[] = [];
  for (let i = SPARK_WEEKS - 1; i >= 0; i--) {
    const ws = subWeeks(thisWeekStart, i);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    let h = 0;
    let c = 0;
    for (const e of entries) {
      if (e.clockOut && e.clockIn >= ws && e.clockIn <= we) {
        const eh = durationHours(e.clockIn, e.clockOut);
        h += eh;
        c += eh * (e.user?.hourlyWage ?? 0);
      }
    }
    buckets.push({ weekStart: ws, hours: h, cost: c });
  }

  const maxHours = Math.max(0.0001, ...buckets.map((b) => b.hours));
  const maxCost = Math.max(0.0001, ...buckets.map((b) => b.cost));

  // Only build cost-line points for weeks with actual cost data — no dragging
  // the line down to $0 for empty weeks
  const nonZeroCost = buckets
    .map((b, i) => ({ idx: i, cost: b.cost, isCurrent: i === SPARK_WEEKS - 1 }))
    .filter((d) => d.cost > 0);

  // Bar centers as a fraction of total chart width: (i + 0.5) / SPARK_WEEKS
  function xOf(i: number): number {
    return ((i + 0.5) / SPARK_WEEKS) * 100;
  }
  function yOfCost(c: number): number {
    return 100 - (c / maxCost) * 90;
  }

  const costPoints = nonZeroCost
    .map((d) => `${xOf(d.idx).toFixed(2)},${yOfCost(d.cost).toFixed(2)}`)
    .join(" ");

  const thisWk = buckets[SPARK_WEEKS - 1];

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">Last 8 weeks</div>
          <h2 className="display text-2xl text-ink mt-0.5">Labor — hours &amp; cost</h2>
        </div>
        <div className="flex gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: "#b8551c" }} />
            Hours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ background: "#1a1a1a" }} />
            Cost
          </span>
        </div>
      </div>

      {/* Bar area + cost overlay */}
      <div className="relative" style={{ height: CHART_HEIGHT }}>
        {/* Bars */}
        <div
          className="absolute inset-0 grid items-end"
          style={{ gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`, gap: 12 }}
        >
          {buckets.map((b, i) => {
            const isCurrent = i === SPARK_WEEKS - 1;
            const heightPct = (b.hours / maxHours) * 100;
            return (
              <div
                key={i}
                className="w-full rounded-t"
                style={{
                  height: b.hours > 0 ? `${heightPct}%` : "2px",
                  background: "#b8551c",
                  opacity: isCurrent ? 1 : 0.55,
                }}
                title={`${format(b.weekStart, "MMM d")}: ${b.hours.toFixed(1)}h · $${Math.round(b.cost).toLocaleString()}`}
              />
            );
          })}
        </div>

        {/* Cost line + dots — only for weeks with actual cost data */}
        {nonZeroCost.length > 0 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 pointer-events-none"
          >
            {nonZeroCost.length >= 2 && (
              <polyline
                points={costPoints}
                fill="none"
                stroke="#1a1a1a"
                strokeWidth="0.6"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {nonZeroCost.map((d) => (
              <circle
                key={d.idx}
                cx={xOf(d.idx)}
                cy={yOfCost(d.cost)}
                r={d.isCurrent ? 1.4 : 0.9}
                fill={d.isCurrent ? "#b8551c" : "#1a1a1a"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}
      </div>

      {/* Labels row */}
      <div
        className="grid mt-2"
        style={{ gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`, gap: 12 }}
      >
        {buckets.map((b, i) => {
          const isCurrent = i === SPARK_WEEKS - 1;
          return (
            <span
              key={i}
              className="text-center font-mono"
              style={{
                fontSize: 9,
                color: isCurrent ? "#1a1a1a" : "#888",
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {format(b.weekStart, "MMM d")}
            </span>
          );
        })}
      </div>

      {/* This-week summary */}
      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-dust">
        <div>
          <div className="label-eyebrow">This week · hours</div>
          <div className="display text-2xl text-ink mt-1 tabular-nums">
            {thisWk.hours.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="label-eyebrow">This week · cost</div>
          <div className="display text-2xl text-ink mt-1 tabular-nums">
            ${Math.round(thisWk.cost).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
