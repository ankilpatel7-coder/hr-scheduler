"use client";

/**
 * Attendance client — KPI strip + bar chart + leaderboard with expandable
 * per-shift detail rows.
 *
 * State:
 *   - Expanded rows (Set of userIds)
 *   - Date arrows + date picker mutate URL search params so the server
 *     re-renders with the new range/date.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Award,
  ChevronDown,
} from "lucide-react";
import { format, addDays, addWeeks, addMonths, parseISO } from "date-fns";

export type Shift = {
  id: string;
  dateIso: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualClockIn: string | null;
  status: "on-time" | "early" | "late" | "missed";
  deltaMin: number | null;
};

export type Row = {
  userId: string;
  name: string;
  role: string;
  scheduledHours: number;
  actualHours: number;
  shiftsScheduled: number;
  shiftsMatched: number;
  missedCount: number;
  lateCount: number;
  earlyCount: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  score: number;
  grade: string;
  shifts: Shift[];
};

type Range = "day" | "week" | "month" | "custom";

function gradeColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 90)
    return { bg: "#dcfce7", text: "#166534", ring: "#16a34a" };
  if (score >= 80)
    return { bg: "#dbeafe", text: "#1e40af", ring: "#3b82f6" };
  if (score >= 70)
    return { bg: "#fef3c7", text: "#92400e", ring: "#d97706" };
  return { bg: "#fee2e2", text: "#991b1b", ring: "#dc2626" };
}

export default function AttendanceClient({
  tenantSlug,
  range,
  anchorYmd,
  customFrom,
  customTo,
  rows,
}: {
  tenantSlug: string;
  range: Range;
  anchorYmd: string;
  customFrom?: string | null;
  customTo?: string | null;
  rows: Row[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setUrl(
    nextRange: Range,
    nextDate: string,
    customFromParam?: string,
    customToParam?: string,
  ) {
    const params = new URLSearchParams();
    params.set("range", nextRange);
    params.set("date", nextDate);
    if (nextRange === "custom" && customFromParam && customToParam) {
      params.set("from", customFromParam);
      params.set("to", customToParam);
    }
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  function setCustomRange(f: string, t: string) {
    setUrl("custom", anchorYmd, f, t);
  }

  function jumpQuick(kind: "last-week" | "last-month" | "last-30" | "last-quarter" | "ytd") {
    const today = new Date();
    let from: Date, to: Date, useRange: Range;
    switch (kind) {
      case "last-week": {
        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - today.getDay() - 7);
        const lastSat = new Date(lastSunday);
        lastSat.setDate(lastSunday.getDate() + 6);
        from = lastSunday;
        to = lastSat;
        useRange = "custom";
        break;
      }
      case "last-month": {
        const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstOfLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        from = firstOfLast;
        to = new Date(firstOfThis.getTime() - 1);
        useRange = "custom";
        break;
      }
      case "last-30": {
        from = new Date(today);
        from.setDate(today.getDate() - 30);
        to = today;
        useRange = "custom";
        break;
      }
      case "last-quarter": {
        from = new Date(today);
        from.setDate(today.getDate() - 90);
        to = today;
        useRange = "custom";
        break;
      }
      case "ytd": {
        from = new Date(today.getFullYear(), 0, 1);
        to = today;
        useRange = "custom";
        break;
      }
    }
    setUrl(useRange, format(today, "yyyy-MM-dd"), format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
  }

  function navigate(direction: -1 | 1) {
    const cur = parseISO(anchorYmd);
    let next: Date;
    if (range === "day") next = addDays(cur, direction);
    else if (range === "week") next = addWeeks(cur, direction);
    else next = addMonths(cur, direction);
    setUrl(range, format(next, "yyyy-MM-dd"));
  }

  // KPIs
  const teamAvgScore =
    rows.length > 0
      ? Math.round(
          rows.reduce((a, r) => a + r.score, 0) / rows.length,
        )
      : 100;
  const totalMissed = rows.reduce((a, r) => a + r.missedCount, 0);
  const totalLate = rows.reduce((a, r) => a + r.lateCount, 0);
  const perfectCount = rows.filter(
    (r) => r.shiftsScheduled > 0 && r.score === 100,
  ).length;

  // Chart data
  const chartData = rows
    .filter((r) => r.shiftsScheduled > 0)
    .map((r) => ({
      name: r.name.split(" ")[0] || r.name,
      Scheduled: Number(r.scheduledHours.toFixed(1)),
      Actual: Number(r.actualHours.toFixed(1)),
    }));

  const anchor = parseISO(anchorYmd);
  const rangeLabel =
    range === "custom" && customFrom && customTo
      ? `${format(parseISO(customFrom), "MMM d, yyyy")} \u2014 ${format(parseISO(customTo), "MMM d, yyyy")}`
      : range === "day"
        ? format(anchor, "EEEE, MMM d, yyyy")
        : range === "week"
          ? `Week of ${format(anchor, "MMM d, yyyy")}`
          : format(anchor, "MMMM yyyy");

  return (
    <>
      <Link
        href={`/${tenantSlug}/dashboard`}
        className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
      >
        <ArrowLeft size={12} /> Back to dashboard
      </Link>

      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck size={22} className="text-rust" />
            <h1 className="display text-4xl text-ink">Attendance</h1>
          </div>
          <p className="text-sm text-smoke">
            Scoreboard for scheduled vs actual, missed shifts, and punctuality.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["day", "week", "month", "custom"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                if (r === "custom") {
                  // Default to last 30 days when entering custom mode
                  const today = new Date();
                  const past = new Date(today);
                  past.setDate(today.getDate() - 30);
                  setUrl("custom", format(today, "yyyy-MM-dd"), format(past, "yyyy-MM-dd"), format(today, "yyyy-MM-dd"));
                } else {
                  setUrl(r, anchorYmd);
                }
              }}
              className={`btn btn-secondary ${
                range === r ? "!bg-ink !text-paper !border-ink" : ""
              }`}
            >
              {r === "day" ? "Day" : r === "week" ? "Week" : r === "month" ? "Month" : "Custom"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-sm text-smoke">{rangeLabel}</div>
        {range === "custom" ? (
          <div className="inline-flex items-center gap-2 border border-dust rounded-full px-2 py-1 bg-paper text-[11px]">
            <span className="text-smoke">From</span>
            <input
              type="date"
              value={customFrom ?? ""}
              onChange={(e) => e.target.value && customTo && setCustomRange(e.target.value, customTo)}
              className="text-[11px] border-0 bg-transparent w-[120px]"
            />
            <span className="text-smoke">to</span>
            <input
              type="date"
              value={customTo ?? ""}
              onChange={(e) => e.target.value && customFrom && setCustomRange(customFrom, e.target.value)}
              className="text-[11px] border-0 bg-transparent w-[120px]"
            />
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 border border-dust rounded-full px-1 py-0.5 bg-paper">
            <button
              onClick={() => navigate(-1)}
              className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
              aria-label="Previous"
              title={range === "month" ? "Previous month" : range === "week" ? "Previous week" : "Previous day"}
            >
              <ChevronLeft size={14} className="text-smoke" />
            </button>
            <span className="text-[11px] text-ink px-2">
              {range === "day"
                ? format(anchor, "MMM d")
                : range === "week"
                  ? format(anchor, "MMM d")
                  : format(anchor, "MMM yyyy")}
            </span>
            <button
              onClick={() => navigate(1)}
              className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
              aria-label="Next"
              title={range === "month" ? "Next month" : range === "week" ? "Next week" : "Next day"}
            >
              <ChevronRight size={14} className="text-smoke" />
            </button>
            <span className="w-px h-4 bg-dust mx-0.5" />
            <input
              type="date"
              value={anchorYmd}
              onChange={(e) => e.target.value && setUrl(range, e.target.value)}
              className="text-[11px] border-0 bg-transparent w-[110px]"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap text-[11px] mb-6">
        <span className="text-smoke font-medium uppercase tracking-wider">Quick:</span>
        <button onClick={() => jumpQuick("last-week")} className="px-2 py-1 rounded-full border border-dust hover:bg-ink/5 text-ink">Last week</button>
        <button onClick={() => jumpQuick("last-month")} className="px-2 py-1 rounded-full border border-dust hover:bg-ink/5 text-ink">Last month</button>
        <button onClick={() => jumpQuick("last-30")} className="px-2 py-1 rounded-full border border-dust hover:bg-ink/5 text-ink">Last 30 days</button>
        <button onClick={() => jumpQuick("last-quarter")} className="px-2 py-1 rounded-full border border-dust hover:bg-ink/5 text-ink">Last 90 days</button>
        <button onClick={() => jumpQuick("ytd")} className="px-2 py-1 rounded-full border border-dust hover:bg-ink/5 text-ink">YTD</button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Team avg score"
          value={`${teamAvgScore}`}
          suffix={`/ 100 · ${letter(teamAvgScore)}`}
          icon={<Award size={14} />}
          tone={teamAvgScore >= 90 ? "ok" : teamAvgScore >= 70 ? "warn" : "bad"}
        />
        <KpiCard
          label="Missed shifts"
          value={`${totalMissed}`}
          icon={<AlertTriangle size={14} />}
          tone={totalMissed === 0 ? "ok" : "bad"}
        />
        <KpiCard
          label="Late ≥10 min"
          value={`${totalLate}`}
          icon={<Clock size={14} />}
          tone={totalLate === 0 ? "ok" : "warn"}
        />
        <KpiCard
          label="Perfect score"
          value={`${perfectCount}`}
          suffix={`of ${rows.length}`}
          icon={<CheckCircle2 size={14} />}
          tone="ok"
        />
      </div>

      {/* Bar chart: Scheduled vs Actual hours per person */}
      {chartData.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold mb-3">
            Scheduled vs Actual Hours
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit="h" />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Scheduled" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-smoke italic">
          No scheduled shifts or clock entries in this {range}.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-smoke">
              <tr>
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-3 py-2">Person</th>
                <th className="text-center px-3 py-2 w-20">Score</th>
                <th className="text-center px-3 py-2 w-14">Grade</th>
                <th className="text-right px-3 py-2 w-16">Shifts</th>
                <th className="text-right px-3 py-2 w-16">Missed</th>
                <th className="text-right px-3 py-2 w-16">Late</th>
                <th className="text-right px-3 py-2 w-16">Early</th>
                <th className="text-right px-3 py-2 w-20">Avg late</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, idx) => {
                const c = gradeColor(r.score);
                const isOpen = expanded.has(r.userId);
                const avgLate =
                  r.lateCount > 0 ? r.totalLateMinutes / r.lateCount : 0;
                return (
                  <>
                    <tr
                      key={r.userId}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleRow(r.userId)}
                    >
                      <td className="px-3 py-2 text-smoke tabular-nums">
                        {idx + 1}.
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{r.name}</div>
                        <div className="text-[11px] text-smoke">
                          {r.role.toLowerCase()}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full font-bold text-xs tabular-nums"
                          style={{
                            background: c.bg,
                            color: c.text,
                            border: `1px solid ${c.ring}`,
                          }}
                        >
                          {r.score}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2 text-center font-bold"
                        style={{ color: c.ring }}
                      >
                        {r.grade}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.shiftsMatched}/{r.shiftsScheduled}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          r.missedCount > 0
                            ? "text-rust font-semibold"
                            : "text-smoke"
                        }`}
                      >
                        {r.missedCount || "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          r.lateCount > 0 ? "text-amber-700 font-medium" : "text-smoke"
                        }`}
                      >
                        {r.lateCount || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-smoke">
                        {r.earlyCount || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-smoke">
                        {avgLate > 0 ? `${Math.round(avgLate)} min` : "—"}
                      </td>
                      <td className="px-2 text-smoke">
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.userId}-detail`}>
                        <td colSpan={10} className="px-3 py-3 bg-slate-50/50">
                          <ShiftDetail shifts={r.shifts} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-smoke">
        Scoring: start at 100. Missed shifts -15 each. Late by ≥10 min -5 each.
        Early or on-time (within ±10 min) has no penalty. Matching: a clock-in
        is associated with a shift if both belong to the same employee and the
        clock-in is within ±2 hours of scheduled start.
      </p>
    </>
  );
}

function letter(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "B+";
  if (score >= 80) return "B";
  if (score >= 75) return "C+";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function KpiCard({
  label,
  value,
  suffix,
  icon,
  tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: React.ReactNode;
  tone: "ok" | "warn" | "bad";
}) {
  const ring =
    tone === "ok"
      ? "ring-emerald-200 bg-emerald-50/40"
      : tone === "warn"
        ? "ring-amber-200 bg-amber-50/40"
        : "ring-rose-200 bg-rose-50/40";
  return (
    <div className={`rounded-2xl ring-1 ${ring} px-4 py-3`}>
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-smoke font-semibold">
        {icon}
        {label}
      </div>
      <div className="display text-2xl text-ink mt-1 tabular-nums">
        {value}
        {suffix && (
          <span className="text-[11px] text-smoke font-normal ml-1">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ShiftDetail({ shifts }: { shifts: Shift[] }) {
  if (shifts.length === 0)
    return <div className="text-xs text-smoke italic">No shifts in range.</div>;
  return (
    <div className="text-xs">
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wider text-smoke">
          <tr>
            <th className="text-left py-1.5">Date</th>
            <th className="text-left py-1.5">Scheduled</th>
            <th className="text-left py-1.5">Clock-in</th>
            <th className="text-left py-1.5">Status</th>
            <th className="text-right py-1.5">Δ minutes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {shifts.map((s) => (
            <StatusRow key={s.id} shift={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusRow({ shift: s }: { shift: Shift }) {
  const meta = STATUS_META[s.status];
  return (
    <tr>
      <td className="py-1.5 text-ink">
        {format(parseISO(s.dateIso), "EEE MMM d")}
      </td>
      <td className="py-1.5 text-smoke tabular-nums">
        {s.scheduledStart}–{s.scheduledEnd}
      </td>
      <td className="py-1.5 text-ink tabular-nums">
        {s.actualClockIn ?? "—"}
      </td>
      <td className="py-1.5">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: meta.bg, color: meta.text }}
        >
          <span>{meta.icon}</span>
          {meta.label}
        </span>
      </td>
      <td
        className="py-1.5 text-right tabular-nums"
        style={{ color: meta.text }}
      >
        {s.deltaMin === null
          ? "—"
          : s.deltaMin > 0
            ? `+${s.deltaMin}`
            : `${s.deltaMin}`}
      </td>
    </tr>
  );
}

const STATUS_META: Record<
  Shift["status"],
  { label: string; bg: string; text: string; icon: string }
> = {
  "on-time": { label: "On time", bg: "#dcfce7", text: "#166534", icon: "✓" },
  early: { label: "Early", bg: "#dbeafe", text: "#1e40af", icon: "↑" },
  late: { label: "Late", bg: "#fef3c7", text: "#92400e", icon: "⚠" },
  missed: { label: "Missed", bg: "#fee2e2", text: "#991b1b", icon: "✗" },
};
