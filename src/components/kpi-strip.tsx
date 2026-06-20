/**
 * KPI strip — Cottage edition.
 *
 * Unified single-style cards. Differentiation comes from icon + label, not
 * from per-card accent colors. Sparkline in harvest gold for normal cards,
 * amber for cards flagged warn (OT projected > 0). Delta color is strictly
 * semantic — moss = positive, rose = negative, smoke = neutral.
 *
 * No more pink, cyan, indigo. No more rainbow top stripes.
 */

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { Users, Clock, DollarSign, AlertTriangle, Activity } from "lucide-react";

const SPARK_WEEKS = 8;

function durationHours(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default async function KpiStrip({
  tenantId,
  locationId,
}: {
  tenantId: string;
  locationId?: string;
}) {
  const now = new Date();
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(thisWeekStart, 1);
  const lastWeekEnd = subWeeks(thisWeekEnd, 1);
  const eightWeeksAgo = subWeeks(thisWeekStart, SPARK_WEEKS - 1);

  const activeCount = await prisma.user.count({
    where: {
      tenantId,
      active: true,
      role: { in: ["EMPLOYEE", "LEAD", "MANAGER"] },
      ...(locationId ? { locations: { some: { locationId } } } : {}),
    },
  });

  const allEntries = await prisma.clockEntry.findMany({
    where: {
      tenantId,
      clockIn: { gte: eightWeeksAgo, lte: thisWeekEnd },
      ...(locationId ? { user: { locations: { some: { locationId } } } } : {}),
    },
    select: {
      userId: true,
      clockIn: true,
      clockOut: true,
      user: { select: { hourlyWage: true } },
    },
  });

  const weekBuckets: { hours: number; cost: number; shiftCount: number }[] = [];
  for (let i = SPARK_WEEKS - 1; i >= 0; i--) {
    const ws = subWeeks(thisWeekStart, i);
    const we = endOfWeek(ws, { weekStartsOn: 1 });
    let h = 0,
      c = 0,
      sc = 0;
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
  const thisWk = weekBuckets[SPARK_WEEKS - 1];
  const lastWk = weekBuckets[SPARK_WEEKS - 2];

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
    if (!s.employeeId) continue;
    projHrs.set(
      s.employeeId,
      (projHrs.get(s.employeeId) ?? 0) + durationHours(s.startTime, s.endTime),
    );
  }
  const otProjected = Array.from(projHrs.values()).filter((h) => h >= 40).length;

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

  const fourWkEntries = allEntries.filter(
    (e) => e.clockOut && e.clockIn >= subWeeks(thisWeekStart, 4),
  );
  const avgShift =
    fourWkEntries.length === 0
      ? 0
      : fourWkEntries.reduce((s, e) => s + durationHours(e.clockIn, e.clockOut!), 0) /
        fourWkEntries.length;

  const activeSpark = Array(SPARK_WEEKS).fill(activeCount);
  const hoursSpark = weekBuckets.map((b) => b.hours);
  const costSpark = weekBuckets.map((b) => b.cost);
  const otSpark = weekBuckets.map((b, i) => (i === SPARK_WEEKS - 1 ? otProjected : 0));
  const avgShiftSpark = weekBuckets.map((b) => (b.shiftCount === 0 ? 0 : b.hours / b.shiftCount));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard
        label="Active employees"
        value={activeCount.toString()}
        spark={activeSpark}
        delta={null}
        icon={<Users size={13} />}
      />
      <KpiCard
        label="Hours · this wk"
        value={thisWk.hours.toFixed(1)}
        spark={hoursSpark}
        delta={pctDelta(thisWk.hours, lastWk.hours)}
        icon={<Clock size={13} />}
      />
      <KpiCard
        label="Labor cost · wk"
        value={`$${Math.round(thisWk.cost).toLocaleString()}`}
        spark={costSpark}
        delta={pctDelta(thisWk.cost, lastWk.cost)}
        icon={<DollarSign size={13} />}
      />
      <KpiCard
        label="OT projected"
        value={otProjected.toString()}
        spark={otSpark}
        delta={
          otProjected - otLastWk === 0
            ? null
            : `${otProjected > otLastWk ? "+" : ""}${otProjected - otLastWk}`
        }
        warn={otProjected > 0}
        icon={<AlertTriangle size={13} />}
      />
      <KpiCard
        label="Avg shift"
        value={`${avgShift.toFixed(1)}h`}
        spark={avgShiftSpark}
        delta={null}
        icon={<Activity size={13} />}
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
  icon,
}: {
  label: string;
  value: string;
  spark: number[];
  delta: string | null;
  warn?: boolean;
  icon?: React.ReactNode;
}) {
  // Cottage palette — one gold accent, with amber for warn cards.
  // Differentiation comes from icon + label, not from invented colors.
  const STROKE = warn ? "#BA7517" : "#C99A2C";
  const ICON_BG = warn ? "rgba(186, 117, 23, 0.10)" : "rgba(201, 154, 44, 0.10)";
  const ICON_COLOR = warn ? "#BA7517" : "#C99A2C";
  const VALUE_COLOR = warn ? "#BA7517" : "var(--text-primary)";

  const gradId = `kpi-grad-${warn ? "warn" : "gold"}-${label.replace(/[^a-z]/gi, "")}`;

  // Sparkline path
  const w = 100;
  const h = 36;
  const pad = 2;
  const max = Math.max(0.0001, ...spark);
  const min = Math.min(...spark);
  const range = max - min || 1;
  const pts = spark.map((v, i) => ({
    x: (i / Math.max(1, spark.length - 1)) * w,
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }));
  let linePath = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) linePath += ` L ${pts[i].x} ${pts[i].y}`;
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

  // Delta is semantic-only: positive trend = moss green, negative = rose, neutral = smoke
  const deltaColor = delta?.startsWith("▲")
    ? "var(--accent-moss)"
    : delta?.startsWith("▼")
    ? "var(--accent-rose)"
    : "var(--text-secondary)";

  return (
    <div className="kpi-tile group">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-smoke font-semibold truncate flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center rounded"
            style={{
              color: ICON_COLOR,
              width: 18,
              height: 18,
              background: ICON_BG,
            }}
          >
            {icon}
          </span>
          {label}
        </div>
        {delta && (
          <span
            className="text-[10px] font-mono whitespace-nowrap font-medium"
            style={{ color: deltaColor }}
          >
            {delta}
          </span>
        )}
      </div>

      <div
        className="display text-4xl leading-none truncate"
        style={{ color: VALUE_COLOR }}
      >
        {value}
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full mt-3"
        style={{ height: 36 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={STROKE} stopOpacity="0.28" />
            <stop offset="100%" stopColor={STROKE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={STROKE}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="1.75"
          fill={STROKE}
        />
      </svg>
    </div>
  );
}
