/**
 * Last 8 weeks: bars for hours, cost shown as a small label above each bar.
 *
 *   <LaborWowChart tenantId={tenantId} />
 *
 * Previous version used an SVG cost-line overlay; that caused stroke
 * overflow on browsers that don't clip SVG paths by default. Switched to
 * pure HTML — no overflow weirdness.
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

const SPARK_WEEKS = 8;
const CHART_HEIGHT = 160;
const LABEL_AREA_PX = 20;

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
  const thisWk = buckets[SPARK_WEEKS - 1];

  function compactCost(c: number) {
    if (c === 0) return "—";
    if (c >= 10000) return `$${Math.round(c / 1000)}k`;
    if (c >= 1000) return `$${(c / 1000).toFixed(1)}k`;
    return `$${Math.round(c)}`;
  }

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
            Hours (bar)
          </span>
          <span className="inline-flex items-center gap-1.5 text-smoke">
            $X · cost above bar
          </span>
        </div>
      </div>

      {/* Chart area */}
      <div
        className="grid items-end"
        style={{
          gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`,
          gap: 12,
          height: CHART_HEIGHT,
        }}
      >
        {buckets.map((b, i) => {
          const isCurrent = i === SPARK_WEEKS - 1;
          const heightPct = (b.hours / maxHours) * 100;
          const labelColor = isCurrent ? "#b8551c" : "#888";
          return (
            <div
              key={i}
              className="flex flex-col items-stretch justify-end h-full relative"
              style={{ minWidth: 0 }}
              title={`${format(b.weekStart, "MMM d")}: ${b.hours.toFixed(1)}h · $${Math.round(b.cost).toLocaleString()}`}
            >
              {/* Cost label above bar */}
              <div
                className="text-center font-mono"
                style={{
                  fontSize: 10,
                  color: labelColor,
                  fontWeight: isCurrent ? 600 : 400,
                  marginBottom: 4,
                  whiteSpace: "nowrap",
                  overflow: "visible",
                }}
              >
                {compactCost(b.cost)}
              </div>
              <div
                className="w-full rounded-t"
                style={{
                  height: b.hours > 0 ? `${heightPct}%` : "2px",
                  background: "#b8551c",
                  opacity: isCurrent ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Labels row */}
      <div
        className="grid mt-2"
        style={{
          gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`,
          gap: 12,
          height: LABEL_AREA_PX,
        }}
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
