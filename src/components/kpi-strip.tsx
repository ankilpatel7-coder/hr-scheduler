/**
 * 5-card KPI strip for the dashboard. Server component.
 *
 *   <KpiStrip tenantId={tenantId} />
 *
 * Cards: Active employees, Hours (this week), Labor cost (this week),
 * OT projected (this week), Avg shift (last 4 weeks). Each shows a tiny
 * 8-week sparkline + WoW delta.
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

const SPARK_WEEKS = 8;

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default async function KpiStrip({ tenantId }: { tenantId: string }) {
  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(thisWeekStart, 1);
  const lastWeekEnd = subWeeks(thisWeekEnd, 1);
  const eightWeeksAgo = subWeeks(thisWeekStart, SPARK_WEEKS - 1);

  // Active employees count
  const activeCount = await prisma.user.count({
    where: { tenantId, active: true, role: { in: ["EMPLOYEE", "LEAD", "MANAGER"] } },
  });

  // Last-8-weeks clock entries to compute hours, cost, avg shift sparklines
  const allEntries = await prisma.clockEntry.findMany({
    where: {
      tenantId,
      clockIn: { gte: eightWeeksAgo, lte: thisWeekEnd },
    },
    select: {
      userId: true,
      clockIn: true,
      clockOut: true,
      user: { select: { hourlyWage: true } },
    },
  });

  // Bucket entries into weekly hours + cost
  const weekBuckets: { hours: number; cost: number; shiftCount: number }[] = [];
  for (let i = SPARK_WEEKS - 1; i >= 0; i--) {
    const ws = subWeeks(thisWeekStart, i);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    let h = 0;
    let c = 0;
    let sc = 0;
    for (const e of allEntries) {
      if (!e.clockOut) continue;
      if (e.clockIn >= ws && e.clockIn <= we) {
        const eh = durationHours(e.clockIn, e.clockOut);
        h += eh;
        c += eh * (e.user?.hourlyWage ?? 0);
        sc += 1;
      }
    }
    weekBuckets.push({ hours: h, cost: c, shiftCount: sc });
  }
  // weekBuckets[7] is current week, [6] is last week, etc.
  const thisWk = weekBuckets[SPARK_WEEKS - 1];
  const lastWk = weekBuckets[SPARK_WEEKS - 2];

  // OT projected: for each employee, sum clocked + scheduled this week → ≥ 40
  const scheduled = await prisma.shift.findMany({
    where: {
      tenantId,
      published: true,
      startTime: { gte: now, lte: thisWeekEnd },
      employee: { role: "EMPLOYEE", active: true },
    },
    select: { employeeId: true, startTime: true, endTime: true },
  });
  const projHrs = new Map<string, number>();
  for (const e of allEntries) {
    if (e.clockIn >= thisWeekStart && e.clockIn <= thisWeekEnd) {
      const end = e.clockOut ?? now;
      projHrs.set(e.userId, (projHrs.get(e.userId) ?? 0) + durationHours(e.clockIn, end));
    }
  }
  for (const s of scheduled) {
    if (!s.employeeId) continue; // skip house shifts
    projHrs.set(
      s.employeeId,
      (projHrs.get(s.employeeId) ?? 0) + durationHours(s.startTime, s.endTime),
    );
  }
  const otProjected = Array.from(projHrs.values()).filter((h) => h >= 40).length;
  // OT last week (for delta) — clocked only since the week is past
  let otLastWk = 0;
  {
    const lastWkHrs = new Map<string, number>();
    for (const e of allEntries) {
      if (!e.clockOut) continue;
      if (e.clockIn >= lastWeekStart && e.clockIn <= lastWeekEnd) {
        lastWkHrs.set(
          e.userId,
          (lastWkHrs.get(e.userId) ?? 0) + durationHours(e.clockIn, e.clockOut),
        );
      }
    }
    otLastWk = Array.from(lastWkHrs.values()).filter((h) => h >= 40).length;
  }

  // Avg shift length: average over last 4 weeks of clock entries
  const fourWkEntries = allEntries.filter(
    (e) => e.clockOut && e.clockIn >= subWeeks(thisWeekStart, 4),
  );
  const avgShift =
    fourWkEntries.length === 0
      ? 0
      : fourWkEntries.reduce((s, e) => s + durationHours(e.clockIn, e.clockOut!), 0) /
        fourWkEntries.length;

  // For active employees sparkline — show recent count history (we don't track
  // historical counts, so just render flat with current value)
  const activeSpark = Array(SPARK_WEEKS).fill(activeCount);
  const hoursSpark = weekBuckets.map((b) => b.hours);
  const costSpark = weekBuckets.map((b) => b.cost);
  const otSpark = weekBuckets.map((b, i) => (i === SPARK_WEEKS - 1 ? otProjected : 0));
  const avgShiftSpark = weekBuckets.map((b) => (b.shiftCount === 0 ? 0 : b.hours / b.shiftCount));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Active employees"
        value={activeCount.toString()}
        spark={activeSpark}
        delta={null}
      />
      <KpiCard
        label="Hours · this wk"
        value={thisWk.hours.toFixed(1)}
        spark={hoursSpark}
        delta={pctDelta(thisWk.hours, lastWk.hours)}
      />
      <KpiCard
        label="Labor cost · wk"
        value={`$${Math.round(thisWk.cost).toLocaleString()}`}
        spark={costSpark}
        delta={pctDelta(thisWk.cost, lastWk.cost)}
      />
      <KpiCard
        label="OT projected"
        value={otProjected.toString()}
        spark={otSpark}
        delta={otProjected - otLastWk === 0 ? null : `${otProjected > otLastWk ? "+" : ""}${otProjected - otLastWk}`}
        warn={otProjected > 0}
      />
      <KpiCard
        label="Avg shift"
        value={`${avgShift.toFixed(1)}h`}
        spark={avgShiftSpark}
        delta={null}
      />
    </div>
  );
}

function pctDelta(current: number, prev: number): string | null {
  if (prev === 0) return current === 0 ? null : "new";
  const pct = ((current - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return null;
  const sign = pct > 0 ? "▲" : "▼";
  return `${sign} ${Math.abs(pct).toFixed(0)}%`;
}

function KpiCard({
  label,
  value,
  spark,
  delta,
  warn,
}: {
  label: string;
  value: string;
  spark: number[];
  delta: string | null;
  warn?: boolean;
}) {
  const max = Math.max(0.0001, ...spark);
  const points = spark
    .map((v, i) => `${(i / (spark.length - 1)) * 100},${18 - (v / max) * 14}`)
    .join(" ");
  const accent = warn ? "#d97706" : "#b8551c";
  const deltaColor = delta?.startsWith("▲")
    ? warn
      ? "#d97706"
      : "#059669"
    : delta?.startsWith("▼")
      ? "#dc2626"
      : "#888";
  return (
    <div className={`kpi-tile min-w-0 ${warn ? "warn" : ""}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-smoke font-medium truncate">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1 flex-wrap">
        <div
          className="display text-3xl text-ink leading-none truncate"
          style={{ color: warn ? "#d97706" : undefined }}
        >
          {value}
        </div>
        {delta && (
          <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: deltaColor }}>
            {delta}
          </span>
        )}
      </div>
      <svg viewBox="0 0 100 18" preserveAspectRatio="none" className="w-full mt-2" style={{ height: 18 }}>
        <polyline points={points} fill="none" stroke={accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
