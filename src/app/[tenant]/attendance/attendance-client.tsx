"use client";

/**
 * Attendance client v3 — adds early-end, late-and-early-end statuses,
 * manager classification dropdown (sick call, absent, left early approved,
 * late excused, other), and excused-shift display.
 *
 * Managers cannot classify their own shifts — the dropdown becomes a
 * read-only badge on their own rows.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import LocationFilter from "@/components/location-filter";
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
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Award,
  ChevronDown,
} from "lucide-react";
import { format, addDays, addWeeks, addMonths, parseISO } from "date-fns";

export type ShiftStatus =
  | "on-time"
  | "early"
  | "late"
  | "early-end"
  | "late-and-early-end"
  | "missed";

export type AttendanceReason =
  | "SICK_CALL"
  | "ABSENT_NO_CALL"
  | "LEFT_EARLY_APPROVED"
  | "LATE_EXCUSED"
  | "OTHER";

export type Shift = {
  shiftId: string;
  id: string;
  employeeId: string;
  dateIso: string;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledHours: number;
  actualClockIn: string | null;
  actualClockOut: string | null;
  actualHoursWorked: number;
  status: ShiftStatus;
  deltaMin: number | null;
  earlyEndMin: number | null;
  attendanceReason: AttendanceReason | null;
  attendanceNote: string | null;
  attendanceSetByName: string | null;
  attendanceSetAtIso: string | null;
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
  earlyEndCount: number;
  excusedCount: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  score: number;
  grade: string;
  shifts: Shift[];
};

type Range = "day" | "week" | "month" | "custom";

function gradeColor(score: number): { bg: string; text: string; ring: string } {
  if (score >= 90)
    return { bg: "rgba(59, 109, 17, 0.10)", text: "#1F4708", ring: "#3B6D11" };
  if (score >= 80)
    return { bg: "rgba(201, 154, 44, 0.10)", text: "#3D2E08", ring: "#C99A2C" };
  if (score >= 70)
    return { bg: "rgba(186, 117, 23, 0.10)", text: "#633806", ring: "#BA7517" };
  return { bg: "rgba(163, 45, 45, 0.10)", text: "#501313", ring: "#A32D2D" };
}

const STATUS_META: Record<
  ShiftStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  "on-time":   { label: "Present",   bg: "rgba(59, 109, 17, 0.10)",  text: "#1F4708", border: "rgba(59, 109, 17, 0.35)" },
  early:       { label: "Early in",  bg: "rgba(122, 120, 114, 0.10)", text: "#5F5E5A", border: "rgba(122, 120, 114, 0.30)" },
  late:        { label: "Late",      bg: "rgba(186, 117, 23, 0.10)", text: "#633806", border: "rgba(186, 117, 23, 0.35)" },
  "early-end": { label: "Early end", bg: "rgba(186, 117, 23, 0.10)", text: "#633806", border: "rgba(186, 117, 23, 0.35)" },
  "late-and-early-end": { label: "Late + early end", bg: "rgba(163, 45, 45, 0.10)", text: "#501313", border: "rgba(163, 45, 45, 0.35)" },
  missed:      { label: "No-show",   bg: "rgba(163, 45, 45, 0.10)", text: "#501313", border: "rgba(163, 45, 45, 0.35)" },
};

const REASON_META: Record<
  AttendanceReason,
  { label: string; bg: string; text: string }
> = {
  SICK_CALL:           { label: "Sick call",          bg: "rgba(59, 109, 17, 0.10)",  text: "#1F4708" },
  ABSENT_NO_CALL:      { label: "Absent (no call)",   bg: "rgba(163, 45, 45, 0.10)",  text: "#501313" },
  LEFT_EARLY_APPROVED: { label: "Left early — appr.", bg: "rgba(59, 109, 17, 0.10)",  text: "#1F4708" },
  LATE_EXCUSED:        { label: "Late — excused",     bg: "rgba(59, 109, 17, 0.10)",  text: "#1F4708" },
  OTHER:               { label: "Other",              bg: "rgba(122, 120, 114, 0.10)", text: "#444441" },
};

const REASON_OPTIONS: { value: AttendanceReason | ""; label: string }[] = [
  { value: "", label: "— No reason —" },
  { value: "SICK_CALL", label: "Sick call" },
  { value: "ABSENT_NO_CALL", label: "Absent (no call)" },
  { value: "LEFT_EARLY_APPROVED", label: "Left early — approved" },
  { value: "LATE_EXCUSED", label: "Late — excused" },
  { value: "OTHER", label: "Other" },
];

export default function AttendanceClient({
  tenantSlug,
  range,
  anchorYmd,
  customFrom,
  customTo,
  locationId,
  viewerIsAdmin,
  viewerUserId,
  viewerRole,
  rows,
}: {
  tenantSlug: string;
  range: Range;
  anchorYmd: string;
  customFrom?: string | null;
  customTo?: string | null;
  locationId?: string | null;
  viewerIsAdmin?: boolean;
  viewerUserId: string;
  viewerRole: "ADMIN" | "MANAGER" | string;
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
    if (locationId) params.set("locationId", locationId);
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  function setCustomRange(f: string, t: string) {
    setUrl("custom", anchorYmd, f, t);
  }

  function jumpQuick(kind: "last-week" | "last-month" | "last-30" | "last-quarter" | "ytd") {
    const today = new Date();
    let from: Date, to: Date;
    switch (kind) {
      case "last-week": {
        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - today.getDay() - 7);
        const lastSat = new Date(lastSunday);
        lastSat.setDate(lastSunday.getDate() + 6);
        from = lastSunday; to = lastSat; break;
      }
      case "last-month": {
        const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1);
        from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        to = new Date(firstOfThis.getTime() - 1); break;
      }
      case "last-30": {
        from = new Date(today); from.setDate(today.getDate() - 30); to = today; break;
      }
      case "last-quarter": {
        from = new Date(today); from.setDate(today.getDate() - 90); to = today; break;
      }
      case "ytd": {
        from = new Date(today.getFullYear(), 0, 1); to = today; break;
      }
    }
    setUrl("custom", format(today, "yyyy-MM-dd"), format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
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
    rows.length > 0 ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 100;
  const totalMissed = rows.reduce((a, r) => a + r.missedCount, 0);
  const totalLate = rows.reduce((a, r) => a + r.lateCount, 0);
  const perfectCount = rows.filter((r) => r.shiftsScheduled > 0 && r.score === 100).length;

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
      ? `${format(parseISO(customFrom), "MMM d, yyyy")} — ${format(parseISO(customTo), "MMM d, yyyy")}`
      : range === "day"
        ? format(anchor, "EEEE, MMM d, yyyy")
        : range === "week"
          ? `Week of ${format(anchor, "MMM d, yyyy")}`
          : format(anchor, "MMMM yyyy");

  return (
    <>
      <Link href={`/${tenantSlug}/dashboard`} className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3">
        <ArrowLeft size={12} /> Back to dashboard
      </Link>

      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck size={22} className="text-rust" />
            <h1 className="display text-4xl text-ink">Attendance</h1>
          </div>
          <p className="text-sm text-smoke">
            Present, Late, Early end, or No-show — with reasons.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LocationFilter
            value={locationId ?? ""}
            onChange={(id) => {
              const params = new URLSearchParams(searchParams?.toString() ?? "");
              if (id) params.set("locationId", id); else params.delete("locationId");
              router.push(`${pathname}?${params.toString()}`);
              router.refresh();
            }}
          />
          {(["day", "week", "month", "custom"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                if (r === "custom") {
                  const today = new Date();
                  const past = new Date(today);
                  past.setDate(today.getDate() - 30);
                  setUrl("custom", format(today, "yyyy-MM-dd"), format(past, "yyyy-MM-dd"), format(today, "yyyy-MM-dd"));
                } else {
                  setUrl(r, anchorYmd);
                }
              }}
              className={`btn btn-secondary ${range === r ? "!bg-ink !text-paper !border-ink" : ""}`}
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
            <input type="date" value={customFrom ?? ""} onChange={(e) => e.target.value && customTo && setCustomRange(e.target.value, customTo)} className="text-[11px] border-0 bg-transparent w-[120px]" />
            <span className="text-smoke">to</span>
            <input type="date" value={customTo ?? ""} onChange={(e) => e.target.value && customFrom && setCustomRange(customFrom, e.target.value)} className="text-[11px] border-0 bg-transparent w-[120px]" />
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 border border-dust rounded-full px-1 py-0.5 bg-paper">
            <button onClick={() => navigate(-1)} className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition" aria-label="Previous">
              <ChevronLeft size={14} className="text-smoke" />
            </button>
            <span className="text-[11px] text-ink px-2">
              {range === "day" ? format(anchor, "MMM d") : range === "week" ? format(anchor, "MMM d") : format(anchor, "MMM yyyy")}
            </span>
            <button onClick={() => navigate(1)} className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition" aria-label="Next">
              <ChevronRight size={14} className="text-smoke" />
            </button>
            <span className="w-px h-4 bg-dust mx-0.5" />
            <input type="date" value={anchorYmd} onChange={(e) => e.target.value && setUrl(range, e.target.value)} className="text-[11px] border-0 bg-transparent w-[110px]" />
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
        <KpiCard label="Team avg score" value={`${teamAvgScore}`} suffix={`/ 100 · ${letter(teamAvgScore)}`} icon={<Award size={14} />} tone={teamAvgScore >= 90 ? "ok" : teamAvgScore >= 70 ? "warn" : "bad"} />
        <KpiCard label="Unexcused no-shows" value={`${totalMissed}`} icon={<AlertTriangle size={14} />} tone={totalMissed === 0 ? "ok" : "bad"} />
        <KpiCard label="Late ≥10 min" value={`${totalLate}`} icon={<Clock size={14} />} tone={totalLate === 0 ? "ok" : "warn"} />
        <KpiCard label="Perfect score" value={`${perfectCount}`} suffix={`of ${rows.length}`} icon={<CheckCircle2 size={14} />} tone="ok" />
      </div>

      {/* Bar chart */}
      {chartData.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold mb-3">Scheduled vs Actual Hours</div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DECF" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#7A7872" }} />
                <YAxis tick={{ fontSize: 11, fill: "#7A7872" }} unit="h" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5DECF", background: "#FFFFFF" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Scheduled" fill="#A6A39B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" fill="#C99A2C" radius={[4, 4, 0, 0]} />
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
            <thead className="bg-bone text-xs uppercase tracking-wider text-smoke">
              <tr>
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-3 py-2">Person</th>
                <th className="text-center px-3 py-2 w-20">Score</th>
                <th className="text-center px-3 py-2 w-14">Grade</th>
                <th className="text-right px-3 py-2 w-16">Shifts</th>
                <th className="text-right px-3 py-2 w-16">Missed</th>
                <th className="text-right px-3 py-2 w-16">Late</th>
                <th className="text-right px-3 py-2 w-20">Early end</th>
                <th className="text-right px-3 py-2 w-20">Excused</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-dust">
              {rows.map((r, idx) => {
                const c = gradeColor(r.score);
                const isOpen = expanded.has(r.userId);
                return (
                  <>
                    <tr key={r.userId} className="hover:bg-bone cursor-pointer" onClick={() => toggleRow(r.userId)}>
                      <td className="px-3 py-2 text-smoke tabular-nums">{idx + 1}.</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-ink">{r.name}</div>
                        <div className="text-[11px] text-smoke">{r.role.toLowerCase()}</div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full font-bold text-xs tabular-nums" style={{ background: c.bg, color: c.text, border: `1px solid ${c.ring}` }}>
                          {r.score}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-bold" style={{ color: c.ring }}>{r.grade}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.shiftsMatched}/{r.shiftsScheduled}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.missedCount > 0 ? "text-rose font-semibold" : "text-smoke"}`}>{r.missedCount || "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.lateCount > 0 ? "text-amber-700 font-medium" : "text-smoke"}`}>{r.lateCount || "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.earlyEndCount > 0 ? "text-amber-700" : "text-smoke"}`}>{r.earlyEndCount || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-smoke">{r.excusedCount || "—"}</td>
                      <td className="px-2 text-smoke">
                        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.userId}-detail`}>
                        <td colSpan={10} className="px-3 py-3 bg-bone/50">
                          <ShiftDetail
                            shifts={r.shifts}
                            viewerIsAdmin={viewerIsAdmin}
                            viewerUserId={viewerUserId}
                            viewerRole={viewerRole}
                            onRefresh={() => router.refresh()}
                          />
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
        Status: Present (clocked in/out within ±5 min) · Late (in ≥5 min after start) · Early end (out ≥5 min before end or worked short by ≥1 h) · No-show (no clock-in).
        Scoring: 100 − missed×15 − late×5 (≥10 min). Excused reasons (sick, late-excused, left-early-approved) skip the penalty. ABSENT_NO_CALL still counts.
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
  label, value, suffix, icon, tone,
}: {
  label: string; value: string; suffix?: string; icon: React.ReactNode; tone: "ok" | "warn" | "bad";
}) {
  const bg =
    tone === "ok" ? "rgba(59, 109, 17, 0.06)" :
    tone === "warn" ? "rgba(186, 117, 23, 0.06)" :
    "rgba(163, 45, 45, 0.06)";
  const border =
    tone === "ok" ? "rgba(59, 109, 17, 0.20)" :
    tone === "warn" ? "rgba(186, 117, 23, 0.25)" :
    "rgba(163, 45, 45, 0.25)";
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-smoke font-semibold">
        {icon}
        {label}
      </div>
      <div className="display text-2xl text-ink mt-1 tabular-nums">
        {value}
        {suffix && <span className="text-[11px] text-smoke font-normal ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function ShiftDetail({
  shifts, viewerIsAdmin, viewerUserId, viewerRole, onRefresh,
}: {
  shifts: Shift[];
  viewerIsAdmin?: boolean;
  viewerUserId: string;
  viewerRole: string;
  onRefresh: () => void;
}) {
  if (shifts.length === 0) return <div className="text-xs text-smoke italic">No shifts in range.</div>;
  return (
    <div className="text-xs">
      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wider text-smoke">
          <tr>
            <th className="text-left py-1.5">Date</th>
            <th className="text-left py-1.5">Scheduled</th>
            <th className="text-left py-1.5">In</th>
            <th className="text-left py-1.5">Out</th>
            <th className="text-right py-1.5">Hrs</th>
            <th className="text-left py-1.5">Status</th>
            <th className="text-left py-1.5">Reason</th>
            {viewerIsAdmin && <th className="text-right py-1.5 w-16">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-dust">
          {shifts.map((s) => (
            <StatusRow
              key={s.id}
              shift={s}
              viewerIsAdmin={viewerIsAdmin}
              viewerUserId={viewerUserId}
              viewerRole={viewerRole}
              onRefresh={onRefresh}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusRow({
  shift: s, viewerIsAdmin, viewerUserId, viewerRole, onRefresh,
}: {
  shift: Shift;
  viewerIsAdmin?: boolean;
  viewerUserId: string;
  viewerRole: string;
  onRefresh: () => void;
}) {
  const meta = STATUS_META[s.status];
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<AttendanceReason | "">(s.attendanceReason ?? "");
  const [note, setNote] = useState(s.attendanceNote ?? "");

  // Manager can't classify their own shifts
  const isOwnShift = s.employeeId === viewerUserId;
  const canClassify = viewerRole === "ADMIN" || (viewerRole === "MANAGER" && !isOwnShift);

  async function ignoreShift() {
    const r = window.prompt("Why ignore this shift? (e.g. 'New hire — onboarding day')") ?? "";
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shifts/${s.shiftId}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: r || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Failed: ${j.error ?? "unknown"}`);
      } else {
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function saveClassification(nextReason: AttendanceReason | "", nextNote: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/shifts/${s.shiftId}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: nextReason || null,
          note: nextReason ? (nextNote || null) : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Failed: ${j.error ?? "unknown"}`);
      } else {
        setEditing(false);
        onRefresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const reasonMeta = s.attendanceReason ? REASON_META[s.attendanceReason] : null;
  const setAt = s.attendanceSetAtIso ? new Date(s.attendanceSetAtIso) : null;
  const setRel = setAt
    ? `${format(setAt, "MMM d")} by ${s.attendanceSetByName ?? "—"}`
    : null;

  return (
    <tr>
      <td className="py-1.5 text-ink">{format(parseISO(s.dateIso), "EEE MMM d")}</td>
      <td className="py-1.5 text-smoke tabular-nums">{s.scheduledStart}–{s.scheduledEnd}</td>
      <td className="py-1.5 text-ink tabular-nums">{s.actualClockIn ?? "—"}</td>
      <td className="py-1.5 text-ink tabular-nums">{s.actualClockOut ?? "—"}</td>
      <td className="py-1.5 text-right tabular-nums text-ink">
        {s.actualHoursWorked > 0
          ? `${s.actualHoursWorked.toFixed(1)} / ${s.scheduledHours.toFixed(1)}`
          : `— / ${s.scheduledHours.toFixed(1)}`}
      </td>
      <td className="py-1.5">
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
        {s.deltaMin !== null && Math.abs(s.deltaMin) >= 1 && (
          <span className="ml-1 text-[10px] text-smoke tabular-nums">
            {s.deltaMin > 0 ? `+${s.deltaMin}m in` : `${s.deltaMin}m in`}
          </span>
        )}
        {s.earlyEndMin !== null && s.earlyEndMin >= 1 && (
          <span className="ml-1 text-[10px] text-smoke tabular-nums">
            {s.earlyEndMin}m short
          </span>
        )}
      </td>
      <td className="py-1.5">
        {editing ? (
          <div className="flex items-center gap-1">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as AttendanceReason | "")}
              className="text-[11px] !py-0.5 !px-1.5 !w-auto"
              disabled={busy}
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="text-[11px] !py-0.5 !px-1.5 w-32"
              disabled={busy || !reason}
            />
            <button
              type="button"
              onClick={() => saveClassification(reason, note)}
              disabled={busy}
              className="text-[10px] text-emerald-700 hover:underline disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setReason(s.attendanceReason ?? ""); setNote(s.attendanceNote ?? ""); }}
              disabled={busy}
              className="text-[10px] text-smoke hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : reasonMeta ? (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: reasonMeta.bg, color: reasonMeta.text }}
              title={s.attendanceNote ?? undefined}
            >
              {reasonMeta.label}
            </span>
            {setRel && <span className="text-[9px] text-smoke">{setRel}</span>}
            {canClassify && (
              <button type="button" onClick={() => setEditing(true)} className="text-[10px] text-smoke hover:text-rust hover:underline">
                Change
              </button>
            )}
          </div>
        ) : canClassify ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10px] text-smoke hover:text-rust hover:underline"
          >
            + Classify
          </button>
        ) : isOwnShift && viewerRole === "MANAGER" ? (
          <span className="text-[10px] text-smoke italic">Own shift — admin only</span>
        ) : (
          <span className="text-[10px] text-smoke">—</span>
        )}
      </td>
      {viewerIsAdmin && (
        <td className="py-1.5 text-right">
          <button
            type="button"
            onClick={ignoreShift}
            disabled={busy}
            className="text-[10px] text-smoke hover:text-rust hover:underline disabled:opacity-50"
            title="Exclude this shift from attendance scoring (e.g. onboarding)"
          >
            {busy ? "…" : "Ignore"}
          </button>
        </td>
      )}
    </tr>
  );
}
