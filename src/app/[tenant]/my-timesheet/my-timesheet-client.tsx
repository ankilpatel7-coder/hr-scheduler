"use client";

import Link from "next/link";
import { Clock, Coffee, Pencil, ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";

export type Entry = {
  id: string;
  dateIso: string;
  clockIn: string;
  clockOut: string | null;
  netHours: number;
  unpaidBreakMinutes: number;
  paidBreaks: number;
  unpaidBreaks: number;
  approvalStatus: string;
  wasEdited: boolean;
  editNote: string | null;
};

const STATUS: Record<string, { label: string; bg: string; text: string }> = {
  APPROVED: { label: "Approved", bg: "rgba(59, 109, 17, 0.10)", text: "#1F4708" },
  PENDING: { label: "Pending", bg: "rgba(201, 154, 44, 0.12)", text: "#3D2E08" },
  REJECTED: { label: "Rejected", bg: "rgba(163, 45, 45, 0.10)", text: "#501313" },
};

export default function MyTimesheetClient({
  tenantSlug,
  employeeName,
  days,
  validDays,
  entries,
  approvedHours,
  pendingHours,
}: {
  tenantSlug: string;
  employeeName: string;
  days: number;
  validDays: number[];
  entries: Entry[];
  approvedHours: number;
  pendingHours: number;
  timezone: string;
}) {
  // Group by calendar week for subtotals
  const weeks = new Map<string, Entry[]>();
  for (const e of entries) {
    const d = parseISO(e.dateIso);
    const monday = new Date(d);
    const dow = (d.getDay() + 6) % 7;
    monday.setDate(d.getDate() - dow);
    const key = format(monday, "yyyy-MM-dd");
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(e);
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-3xl mx-auto px-6 py-10">
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to dashboard
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Clock size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">My timesheet</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Your clock-in and clock-out history. Only you and your managers can
          see this.
        </p>

        {/* Range picker */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-[11px] text-smoke uppercase tracking-wider font-semibold">
            Period:
          </span>
          {validDays.map((d) => (
            <Link
              key={d}
              href={`/${tenantSlug}/my-timesheet?days=${d}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                days === d
                  ? "bg-rust text-gold-on border-transparent"
                  : "border-dust bg-paper text-ink hover:bg-steel"
              }`}
            >
              {d === 365 ? "1 year" : d === 180 ? "6 months" : `${d} days`}
            </Link>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-lg border border-dust bg-paper px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
              Approved hours
            </div>
            <div className="display text-3xl text-ink mt-0.5 tabular-nums">
              {approvedHours.toFixed(1)}
            </div>
          </div>
          <div className="rounded-lg border border-dust bg-paper px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
              Awaiting approval
            </div>
            <div
              className="display text-3xl mt-0.5 tabular-nums"
              style={{ color: pendingHours > 0 ? "#BA7517" : "#7A7872" }}
            >
              {pendingHours.toFixed(1)}
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="card p-8 text-center text-sm text-smoke italic">
            No clock entries in the last {days} days.
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from(weeks.entries()).map(([weekKey, weekEntries]) => {
              const weekTotal = weekEntries
                .filter((e) => e.approvalStatus !== "REJECTED")
                .reduce((a, e) => a + e.netHours, 0);
              return (
                <div key={weekKey}>
                  <div className="flex items-baseline justify-between mb-1.5 px-1">
                    <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
                      Week of {format(parseISO(weekKey), "MMM d")}
                    </div>
                    <div className="text-[11px] text-ink tabular-nums font-medium">
                      {weekTotal.toFixed(1)}h
                    </div>
                  </div>
                  <div className="card overflow-hidden">
                    <ul className="divide-y divide-dust">
                      {weekEntries.map((e) => {
                        const st = STATUS[e.approvalStatus] ?? {
                          label: e.approvalStatus,
                          bg: "rgba(122,120,114,0.10)",
                          text: "#444441",
                        };
                        return (
                          <li
                            key={e.id}
                            className="px-4 py-2.5 flex items-center gap-3"
                          >
                            <div className="w-[92px] shrink-0">
                              <div className="text-[13px] font-medium text-ink">
                                {format(parseISO(e.dateIso), "EEE MMM d")}
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] text-ink font-mono">
                                {e.clockIn} – {e.clockOut ?? "still open"}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span
                                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: st.bg, color: st.text }}
                                >
                                  {st.label}
                                </span>
                                {e.unpaidBreakMinutes > 0 && (
                                  <span className="text-[10px] text-smoke inline-flex items-center gap-1">
                                    <Coffee size={10} />
                                    {e.unpaidBreakMinutes}m unpaid
                                  </span>
                                )}
                                {e.paidBreaks > 0 && (
                                  <span className="text-[10px] text-smoke">
                                    {e.paidBreaks} paid break
                                    {e.paidBreaks === 1 ? "" : "s"}
                                  </span>
                                )}
                                {e.wasEdited && (
                                  <span
                                    className="text-[10px] text-smoke inline-flex items-center gap-1"
                                    title={e.editNote ?? "Adjusted by a manager"}
                                  >
                                    <Pencil size={9} /> adjusted
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="display text-lg text-ink tabular-nums">
                                {e.netHours.toFixed(2)}
                              </div>
                              <div className="text-[9px] text-smoke uppercase tracking-wider">
                                hrs
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-smoke mt-6 leading-relaxed">
          Hours shown are after unpaid break deductions. Short paid breaks are
          not deducted. If something looks wrong, talk to your manager — they
          can correct it and the change will be recorded.
        </p>
      </main>
    </div>
  );
}
