"use client";

/**
 * Labor budget bar — fits on top of the schedule page.
 *
 * Self-contained: fetches its own budget config + computes projected cost
 * from a `shifts` prop the schedule page passes in. Re-computes every time
 * `shifts` or the `weekStart` prop change.
 *
 * Usage:
 *   <LaborBudgetBar shifts={shifts} weekStart={weekStart} tenantSlug={...} />
 *
 * Per-day color thresholds:
 *   - 0% of budget = green ("Under")
 *   - 1-79% of budget = green
 *   - 80-99% of budget = amber
 *   - ≥ 100% of budget = red
 *   - No budget set (0) = neutral grey
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { Settings } from "lucide-react";

type Budget = {
  budgetMon: number; budgetTue: number; budgetWed: number; budgetThu: number;
  budgetFri: number; budgetSat: number; budgetSun: number; budgetWeekly: number;
};

type Shift = {
  startTime: string;
  endTime: string;
  employee: { hourlyWage: number } | null;
};

export default function LaborBudgetBar({
  shifts,
  weekStart,
  tenantSlug,
}: {
  shifts: Shift[];
  weekStart: Date;
  tenantSlug: string;
}) {
  const [budget, setBudget] = useState<Budget | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/labor-budget", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setBudget(j.budget ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!budget) return null;
  const dayKeys: (keyof Budget)[] = [
    "budgetMon", "budgetTue", "budgetWed", "budgetThu", "budgetFri", "budgetSat", "budgetSun",
  ];
  const allZero = dayKeys.every((k) => budget[k] === 0) && budget.budgetWeekly === 0;

  // Project cost per day from shifts: hours × hourly wage. House shifts
  // (no employee) get $0 wage contribution until assigned.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayCosts = days.map((d) => {
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    let cost = 0;
    let hours = 0;
    for (const s of shifts) {
      const sStart = new Date(s.startTime);
      if (sStart < start || sStart >= end) continue;
      const sEnd = new Date(s.endTime);
      const h = Math.max(0, (sEnd.getTime() - sStart.getTime()) / 3_600_000);
      hours += h;
      cost += h * (s.employee?.hourlyWage ?? 0);
    }
    return { date: d, cost, hours };
  });

  const weeklyCost = dayCosts.reduce((s, d) => s + d.cost, 0);
  const weeklyBudget =
    budget.budgetWeekly > 0
      ? budget.budgetWeekly
      : dayKeys.reduce((s, k) => s + budget[k], 0);

  function colorFor(cost: number, cap: number): { text: string; bg: string; ring: string; label: string } {
    if (cap === 0) return { text: "#5F5E5A", bg: "rgba(95,94,90,0.06)", ring: "rgba(95,94,90,0.20)", label: "—" };
    const pct = (cost / cap) * 100;
    if (pct >= 100) return { text: "#dc2626", bg: "rgba(220,38,38,0.08)", ring: "rgba(220,38,38,0.30)", label: `${Math.round(pct)}%` };
    if (pct >= 80) return { text: "#d97706", bg: "rgba(217,119,6,0.08)", ring: "rgba(217,119,6,0.30)", label: `${Math.round(pct)}%` };
    return { text: "#059669", bg: "rgba(5,150,105,0.06)", ring: "rgba(5,150,105,0.25)", label: `${Math.round(pct)}%` };
  }

  if (allZero) {
    return (
      <div className="card p-4 mb-4 print:hidden bg-paper">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-smoke">
            <strong className="text-ink">Labor budget:</strong> no caps set.
          </div>
          <Link
            href={`/${tenantSlug}/settings/labor-budget`}
            className="text-xs text-rust hover:underline inline-flex items-center gap-1"
          >
            <Settings size={12} /> Set budget →
          </Link>
        </div>
      </div>
    );
  }

  const weeklyColor = colorFor(weeklyCost, weeklyBudget);

  return (
    <div className="card p-4 mb-4 print:hidden">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">Weekly labor</div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="display text-2xl text-ink">${weeklyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-xs text-smoke font-mono">/ ${weeklyBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{ color: weeklyColor.text, background: weeklyColor.bg }}
              >
                {weeklyColor.label}
              </span>
            </div>
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/settings/labor-budget`}
          className="text-xs text-rust hover:underline inline-flex items-center gap-1"
        >
          <Settings size={12} /> Edit budget
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayCosts.map((d, i) => {
          const cap = budget[dayKeys[i]];
          const color = colorFor(d.cost, cap);
          return (
            <div
              key={i}
              className="rounded border px-2 py-1.5"
              style={{ borderColor: color.ring, background: color.bg }}
              title={cap > 0 ? `${d.hours.toFixed(1)} hrs · $${d.cost.toFixed(2)} of $${cap.toFixed(0)} budget` : `${d.hours.toFixed(1)} hrs · $${d.cost.toFixed(2)} (no budget set)`}
            >
              <div className="text-[9px] uppercase tracking-wider text-smoke font-medium">
                {format(d.date, "EEE")}
              </div>
              <div className="flex items-baseline justify-between gap-1 mt-0.5">
                <span
                  className="font-mono text-sm font-medium tabular-nums"
                  style={{ color: color.text }}
                >
                  ${Math.round(d.cost).toLocaleString()}
                </span>
                {cap > 0 && (
                  <span className="font-mono text-[10px] text-smoke">
                    /${Math.round(cap).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-smoke mt-0.5">
                {d.hours.toFixed(1)}h
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
