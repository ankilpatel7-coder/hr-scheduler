/**
 * Last 8 weeks: bars for hours + line for cost. Server component.
 *
 *   <LaborWowChart tenantId={tenantId} />
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

const SPARK_WEEKS = 8;

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

  // Build cost line points relative to a 0..100 svg viewBox
  const costPoints = buckets
    .map((b, i) => {
      const x = (i / (SPARK_WEEKS - 1)) * 100;
      const y = 100 - (b.cost / maxCost) * 90;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

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

      <div className="relative" style={{ height: 160 }}>
        <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`, gap: 12, alignItems: "end" }}>
          {buckets.map((b, i) => {
            const isCurrent = i === SPARK_WEEKS - 1;
            const heightPct = (b.hours / maxHours) * 100;
            return (
              <div key={i} className="flex flex-col items-center gap-1 h-full justify-end relative">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${heightPct}%`,
                    background: "#b8551c",
                    opacity: isCurrent ? 1 : 0.55,
                    minHeight: 2,
                  }}
                  title={`${b.hours.toFixed(1)}h · $${Math.round(b.cost).toLocaleString()}`}
                />
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    color: isCurrent ? "#1a1a1a" : "#888",
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {format(b.weekStart, "MMM d")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Cost line, overlaid */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 pointer-events-none"
          style={{ paddingBottom: 18 }}
        >
          <polyline
            points={costPoints}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth="0.6"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {buckets.map((b, i) => {
            const x = (i / (SPARK_WEEKS - 1)) * 100;
            const y = 100 - (b.cost / maxCost) * 90;
            const isCurrent = i === SPARK_WEEKS - 1;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={isCurrent ? 1.5 : 1}
                fill={isCurrent ? "#b8551c" : "#1a1a1a"}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      </div>

      {/* This-week summary */}
      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-dust">
        <div>
          <div className="label-eyebrow">This week · hours</div>
          <div className="display text-2xl text-ink mt-1 tabular-nums">
            {buckets[SPARK_WEEKS - 1].hours.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="label-eyebrow">This week · cost</div>
          <div className="display text-2xl text-ink mt-1 tabular-nums">
            ${Math.round(buckets[SPARK_WEEKS - 1].cost).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
