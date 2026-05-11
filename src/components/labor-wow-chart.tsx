/**
 * Premium 8-week labor chart — gradient bars, today emphasis, smooth animations.
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";

const SPARK_WEEKS = 8;
const CHART_HEIGHT = 180;
const LABEL_AREA_PX = 22;

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
      clockIn: true, clockOut: true,
      user: { select: { hourlyWage: true } },
    },
  });

  const buckets: { weekStart: Date; hours: number; cost: number }[] = [];
  for (let i = SPARK_WEEKS - 1; i >= 0; i--) {
    const ws = subWeeks(thisWeekStart, i);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    let h = 0, c = 0;
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

  // Compute trend vs. prior week
  const lastWk = buckets[SPARK_WEEKS - 2];
  const wowHours = lastWk.hours > 0 ? ((thisWk.hours - lastWk.hours) / lastWk.hours) * 100 : 0;
  const wowCost = lastWk.cost > 0 ? ((thisWk.cost - lastWk.cost) / lastWk.cost) * 100 : 0;

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow">Last 8 weeks</div>
          <h2 className="display text-3xl text-ink mt-1">Labor — hours &amp; cost</h2>
        </div>
        <div className="flex gap-4 text-[11px] items-center">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 h-3 rounded-sm"
              style={{ background: "linear-gradient(180deg, #818cf8, #6366f1)" }}
            />
            Hours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-4 h-3 rounded-sm"
              style={{ background: "linear-gradient(180deg, #f472b6, #ec4899)" }}
            />
            Current week
          </span>
        </div>
      </div>

      <div
        className="grid items-end relative"
        style={{
          gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`,
          gap: 14,
          height: CHART_HEIGHT,
        }}
      >
        {buckets.map((b, i) => {
          const isCurrent = i === SPARK_WEEKS - 1;
          const heightPct = (b.hours / maxHours) * 100;
          return (
            <div
              key={i}
              className="flex flex-col items-stretch justify-end h-full relative group"
              style={{ minWidth: 0 }}
              title={`${format(b.weekStart, "MMM d")}: ${b.hours.toFixed(1)}h · $${Math.round(b.cost).toLocaleString()}`}
            >
              {/* Cost label above bar */}
              <div
                className="text-center font-mono transition-all"
                style={{
                  fontSize: 11,
                  color: isCurrent ? "#ec4899" : "#94a3b8",
                  fontWeight: isCurrent ? 600 : 500,
                  marginBottom: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {compactCost(b.cost)}
              </div>
              {/* Bar with gradient + shadow */}
              <div
                className="w-full rounded-t-md transition-all duration-300 group-hover:translate-y-[-2px]"
                style={{
                  height: b.hours > 0 ? `${heightPct}%` : "2px",
                  background: isCurrent
                    ? "linear-gradient(180deg, #f472b6 0%, #ec4899 100%)"
                    : "linear-gradient(180deg, #818cf8 0%, #6366f1 100%)",
                  boxShadow: isCurrent
                    ? "0 4px 12px -2px rgba(236, 72, 153, 0.4), 0 2px 4px rgba(236, 72, 153, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
                    : "0 2px 8px -2px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
                  opacity: 1,
                }}
              />
              {/* Hover halo */}
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120%] h-2 rounded-full blur-md opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none"
                style={{
                  background: isCurrent ? "#ec4899" : "#6366f1",
                }}
              />
            </div>
          );
        })}
      </div>

      <div
        className="grid mt-3"
        style={{
          gridTemplateColumns: `repeat(${SPARK_WEEKS}, 1fr)`,
          gap: 14,
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
                fontSize: 10,
                color: isCurrent ? "#0f172a" : "#94a3b8",
                fontWeight: isCurrent ? 600 : 500,
              }}
            >
              {format(b.weekStart, "MMM d")}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-6 mt-6 pt-5 border-t border-dust">
        <div>
          <div className="label-eyebrow flex items-center gap-2">
            This week · hours
            {Math.abs(wowHours) >= 1 && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  color: wowHours > 0 ? "#059669" : "#dc2626",
                  background: wowHours > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(220, 38, 38, 0.1)",
                }}
              >
                {wowHours > 0 ? "▲" : "▼"} {Math.abs(wowHours).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="display text-4xl mt-1 tabular-nums">
            <span className="text-gradient-cool">{thisWk.hours.toFixed(1)}</span>
          </div>
        </div>
        <div>
          <div className="label-eyebrow flex items-center gap-2">
            This week · cost
            {Math.abs(wowCost) >= 1 && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  color: wowCost > 0 ? "#dc2626" : "#059669",
                  background: wowCost > 0 ? "rgba(220, 38, 38, 0.1)" : "rgba(16, 185, 129, 0.1)",
                }}
              >
                {wowCost > 0 ? "▲" : "▼"} {Math.abs(wowCost).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="display text-4xl mt-1 tabular-nums">
            <span className="text-gradient">${Math.round(thisWk.cost).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
