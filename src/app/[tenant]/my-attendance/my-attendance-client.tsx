"use client";

/**
 * Employee attendance scoreboard — read-only, gamified.
 *
 *   - Big score card with letter grade + color
 *   - Star + "Perfect attendance" badge if score=100
 *   - Streak counter for consecutive on-time/early shifts
 *   - Per-shift history with status icons
 *   - Range tabs: 14d / 30d / 90d / Custom
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Sparkles,
  Flame,
  Award,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

export type MyShift = {
  id: string;
  dateIso: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualClockIn: string | null;
  status: "on-time" | "early" | "late" | "missed";
  deltaMin: number | null;
};

export type MyRow = {
  score: number;
  grade: string;
  scheduledHours: number;
  actualHours: number;
  shiftsScheduled: number;
  shiftsMatched: number;
  missedCount: number;
  lateCount: number;
  earlyCount: number;
  onTimeCount: number;
  avgLateMin: number;
  avgEarlyMin: number;
  streak: number;
  shifts: MyShift[];
};

type Range = "14d" | "30d" | "60d" | "90d" | "custom";

const STATUS_META: Record<
  MyShift["status"],
  { label: string; bg: string; text: string; icon: string }
> = {
  "on-time": { label: "On time", bg: "#dcfce7", text: "#166534", icon: "✓" },
  early: { label: "Early", bg: "#dbeafe", text: "#1e40af", icon: "↑" },
  late: { label: "Late", bg: "#fef3c7", text: "#92400e", icon: "⚠" },
  missed: { label: "Missed", bg: "#fee2e2", text: "#991b1b", icon: "✗" },
};

function gradeColor(score: number): { bg: string; text: string; ring: string; glow: string } {
  if (score >= 90)
    return { bg: "#dcfce7", text: "#166534", ring: "#16a34a", glow: "rgba(22,163,74,0.3)" };
  if (score >= 80)
    return { bg: "#dbeafe", text: "#1e40af", ring: "#3b82f6", glow: "rgba(59,130,246,0.3)" };
  if (score >= 70)
    return { bg: "#fef3c7", text: "#92400e", ring: "#d97706", glow: "rgba(217,119,6,0.3)" };
  return { bg: "#fee2e2", text: "#991b1b", ring: "#dc2626", glow: "rgba(220,38,38,0.3)" };
}

export default function MyAttendanceClient({
  tenantSlug,
  range,
  customFrom,
  customTo,
  row,
  employeeName,
}: {
  tenantSlug: string;
  range: Range;
  customFrom?: string | null;
  customTo?: string | null;
  row: MyRow;
  employeeName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setRange(r: Range, from?: string, to?: string) {
    const params = new URLSearchParams();
    params.set("range", r);
    if (r === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  const c = gradeColor(row.score);
  const isPerfect = row.score === 100 && row.shiftsScheduled > 0;
  const firstName = employeeName.split(" ")[0] || employeeName;

  return (
    <>
      <Link
        href={`/${tenantSlug}/dashboard`}
        className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
      >
        <ArrowLeft size={12} /> Back to dashboard
      </Link>

      <div className="mb-2">
        <div className="label-eyebrow mb-2">My Attendance</div>
        <h1 className="display text-4xl text-ink">Hi {firstName}.</h1>
        <p className="text-sm text-smoke mt-1">
          Your punctuality scoreboard. Be on time, keep your streak alive.
        </p>
      </div>

      {/* Range tabs */}
      <div className="flex gap-2 mt-4 mb-6">
        {(["14d", "30d", "90d"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`btn btn-secondary ${
              range === r ? "!bg-ink !text-paper !border-ink" : ""
            }`}
          >
            {r === "14d" ? "Last 14 days" : r === "30d" ? "Last 30 days" : "Last 90 days"}
          </button>
        ))}
      </div>

      {/* Big score card */}
      <div
        className="rounded-3xl p-8 mb-6 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${c.bg} 0%, white 100%)`,
          border: `2px solid ${c.ring}`,
          boxShadow: `0 8px 32px ${c.glow}`,
        }}
      >
        {isPerfect && (
          <div className="absolute top-4 right-4 animate-pulse">
            <Sparkles className="text-amber-400" size={28} fill="currentColor" />
          </div>
        )}
        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">
              Reliability score
            </div>
            <div
              className="display text-7xl font-bold tabular-nums"
              style={{ color: c.ring }}
            >
              {row.score}
            </div>
            <div className="text-xs text-smoke">out of 100</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">
              Grade
            </div>
            <div
              className="display text-7xl font-bold"
              style={{ color: c.ring }}
            >
              {row.grade}
            </div>
            {isPerfect && (
              <div className="text-xs font-semibold text-amber-700 mt-1 inline-flex items-center gap-1">
                <Sparkles size={11} /> Perfect attendance!
              </div>
            )}
          </div>

          {/* Streak counter */}
          {row.streak > 0 && (
            <div className="ml-auto text-right">
              <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">
                Streak
              </div>
              <div className="display text-5xl font-bold text-orange-600 inline-flex items-center gap-1">
                <Flame size={32} fill="currentColor" /> {row.streak}
              </div>
              <div className="text-xs text-smoke">
                consecutive on-time shifts
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-200/60">
          <StatTile
            label="Shifts worked"
            value={`${row.shiftsMatched}/${row.shiftsScheduled}`}
            icon={<TrendingUp size={12} />}
            tone="neutral"
          />
          <StatTile
            label="On time"
            value={`${row.onTimeCount}`}
            icon={<CheckCircle2 size={12} />}
            tone={row.onTimeCount > 0 ? "good" : "neutral"}
          />
          <StatTile
            label="Late ≥10m"
            value={`${row.lateCount}`}
            icon={<Clock size={12} />}
            tone={row.lateCount > 0 ? "warn" : "neutral"}
          />
          <StatTile
            label="Missed"
            value={`${row.missedCount}`}
            icon={<AlertTriangle size={12} />}
            tone={row.missedCount > 0 ? "bad" : "neutral"}
          />
        </div>
      </div>

      {/* Per-shift history */}
      <div className="card">
        <div className="px-5 py-3 border-b border-ink/10">
          <h2 className="font-semibold text-ink inline-flex items-center gap-2">
            <Award size={16} /> Recent shifts
          </h2>
        </div>
        {row.shifts.length === 0 ? (
          <div className="p-8 text-center text-sm text-smoke italic">
            No completed shifts in this range yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-smoke">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Scheduled</th>
                <th className="text-left px-4 py-2">Clock-in</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Δ min</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {row.shifts.map((s) => {
                const meta = STATUS_META[s.status];
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-ink">
                      {format(parseISO(s.dateIso), "EEE MMM d")}
                    </td>
                    <td className="px-4 py-2 text-smoke tabular-nums">
                      {s.scheduledStart}–{s.scheduledEnd}
                    </td>
                    <td className="px-4 py-2 text-ink tabular-nums">
                      {s.actualClockIn ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                        style={{ background: meta.bg, color: meta.text }}
                      >
                        <span>{meta.icon}</span>
                        {meta.label}
                      </span>
                    </td>
                    <td
                      className="px-4 py-2 text-right tabular-nums"
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
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-6 text-xs text-smoke">
        Scoring: start at 100 each period. −15 per missed shift. −5 per shift
        more than 10 minutes late. Early or on-time = no penalty. Be on time to
        keep your score high.
      </p>
    </>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const colors = {
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rust",
    neutral: "text-ink",
  };
  return (
    <div className="bg-white/70 rounded-xl px-3 py-2 ring-1 ring-slate-200/60">
      <div className="text-[9px] uppercase tracking-wider text-smoke font-semibold inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`display text-xl font-bold tabular-nums ${colors[tone]}`}>
        {value}
      </div>
    </div>
  );
}
