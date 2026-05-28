"use client";

/**
 * Approval queue UI — grouped by date × employee with quick action buttons.
 *
 * Filters: date range, status, employee (passed as URL query params).
 * Actions: approve / reject / undo (per row). Bulk "Approve all visible".
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  Pencil,
  RotateCcw,
  ListChecks,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  User,
} from "lucide-react";
import { format } from "date-fns";
import EditEntryModal from "@/components/edit-entry-modal";

type BreakRow = {
  id: string;
  breakStart: string;
  breakEnd: string | null;
  breakType: "SHORT_15" | "MEAL_30" | "OTHER";
};

type Entry = {
  id: string;
  userId: string;
  userName: string;
  hourlyWage: number;
  clockIn: string;
  clockOut: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  addressIn: string | null;
  addressOut: string | null;
  breaks?: BreakRow[];
};

const BREAK_META = {
  SHORT_15: { target: 15, label: "15 min · paid", color: "#10b981" },
  MEAL_30:  { target: 30, label: "30 min · meal", color: "#6366f1" },
  OTHER:    { target: null as number | null, label: "Other", color: "#94a3b8" },
};

type Employee = { id: string; name: string };

const STATUS_META: Record<Entry["approvalStatus"], { color: string; bg: string; label: string }> = {
  PENDING:  { color: "#d97706", bg: "rgba(245,158,11,0.10)", label: "Pending" },
  APPROVED: { color: "#059669", bg: "rgba(16,185,129,0.10)", label: "Approved" },
  REJECTED: { color: "#dc2626", bg: "rgba(220,38,38,0.10)", label: "Rejected" },
};

function durationHours(a: Date, b: Date | null) {
  if (!b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 36e5);
}

export default function ApprovalQueue({
  tenantSlug,
  fromIso,
  toIso,
  statusFilter,
  employeeIdFilter,
  employees,
  entries,
  totals,
}: {
  tenantSlug: string;
  fromIso: string;
  toIso: string;
  statusFilter: "ALL" | "PENDING" | "APPROVED" | "REJECTED";
  employeeIdFilter: string | null;
  employees: Employee[];
  entries: Entry[];
  totals: { pending: number; approved: number; rejected: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function actOne(entryId: string, action: "approve" | "reject" | "reset") {
    setBusy(entryId);
    try {
      const method = action === "reset" ? "DELETE" : "POST";
      const url =
        action === "reject"
          ? `/api/clock-entries/${entryId}/reject`
          : `/api/clock-entries/${entryId}/approve`;
      const res = await fetch(url, { method });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function approveAllVisible() {
    if (!window.confirm(`Approve ${entries.filter((e) => e.approvalStatus === "PENDING").length} pending entries in current view?`)) return;
    setBusy("ALL");
    try {
      const res = await fetch("/api/clock-entries/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromIso,
          to: toIso,
          employeeIds: employeeIdFilter ? [employeeIdFilter] : undefined,
          onlyPending: true,
          action: "approve",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error || "Bulk approve failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  // Group by date (local day of clockIn)
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const day = format(new Date(e.clockIn), "yyyy-MM-dd");
    const list = groups.get(day) ?? [];
    list.push(e);
    groups.set(day, list);
  }
  const sortedDays = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));

  function fromYmd(d: string): string {
    return new Date(d).toISOString().slice(0, 10);
  }
  function toYmd(d: string): string {
    return new Date(d).toISOString().slice(0, 10);
  }

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <form className="card p-4 flex items-end gap-3 flex-wrap" action="" method="get">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">From</label>
          <input type="date" name="from" defaultValue={fromYmd(fromIso)} className="text-sm rounded border border-ink/10 px-3 py-2 bg-white" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">To</label>
          <input type="date" name="to" defaultValue={toYmd(toIso)} className="text-sm rounded border border-ink/10 px-3 py-2 bg-white" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">
            <Filter size={11} className="inline mr-1" /> Status
          </label>
          <select name="status" defaultValue={statusFilter} className="text-sm rounded border border-ink/10 px-3 py-2 bg-white">
            <option value="PENDING">Pending only</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">
            <User size={11} className="inline mr-1" /> Employee
          </label>
          <select name="employeeId" defaultValue={employeeIdFilter ?? ""} className="text-sm rounded border border-ink/10 px-3 py-2 bg-white">
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-rust">Apply</button>
      </form>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile count={totals.pending} label="Pending" color="#d97706" icon={<AlertCircle size={14} />} />
        <StatTile count={totals.approved} label="Approved" color="#059669" icon={<CheckCircle2 size={14} />} />
        <StatTile count={totals.rejected} label="Rejected" color="#dc2626" icon={<X size={14} />} />
      </div>

      {/* Bulk action bar */}
      {totals.pending > 0 && (
        <div
          className="card flex items-center gap-3 p-3 border-l-4"
          style={{ borderLeftColor: "#6366f1", background: "rgba(99,102,241,0.04)" }}
        >
          <ListChecks size={16} className="text-indigo-600" />
          <span className="text-sm text-ink flex-1">
            <strong>{totals.pending}</strong> entr{totals.pending === 1 ? "y" : "ies"} pending approval in the current view.
          </span>
          <button
            onClick={approveAllVisible}
            disabled={busy === "ALL"}
            className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check size={13} /> {busy === "ALL" ? "Approving…" : "Approve all visible"}
          </button>
        </div>
      )}

      {/* Grouped table */}
      {sortedDays.length === 0 ? (
        <div className="card p-8 text-center">
          <CheckCircle2 size={32} className="text-green-600 mx-auto mb-3" />
          <p className="text-sm text-ink">Nothing in this view.</p>
          {statusFilter === "PENDING" && (
            <p className="text-xs text-smoke mt-1">All caught up on pending approvals 🎉</p>
          )}
        </div>
      ) : (
        sortedDays.map((day) => {
          const dayEntries = groups.get(day) ?? [];
          const dayDate = new Date(day);
          return (
            <section key={day}>
              <div className="text-[11px] uppercase tracking-wider text-smoke font-semibold mb-2">
                {format(dayDate, "EEEE, MMMM d, yyyy")} · {dayEntries.length} {dayEntries.length === 1 ? "entry" : "entries"}
              </div>
              <div className="card divide-y divide-ink/5">
                {dayEntries.map((e) => {
                  const meta = STATUS_META[e.approvalStatus];
                  const start = new Date(e.clockIn);
                  const end = e.clockOut ? new Date(e.clockOut) : null;
                  const hrs = durationHours(start, end);
                  return (
                    <div key={e.id} className="p-4 flex items-center gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink">{e.userName}</span>
                          <span
                            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-smoke mt-0.5 flex items-center gap-3 flex-wrap font-mono">
                          <span>
                            <Clock size={10} className="inline mr-0.5" />
                            {format(start, "h:mma")}
                            {end ? `–${format(end, "h:mma")}` : " · open"}
                          </span>
                          <span className="font-semibold text-ink">{hrs.toFixed(2)} hrs</span>
                          {e.approvedByName && (
                            <span className="text-smoke">
                              {e.approvalStatus.toLowerCase()} by {e.approvedByName}
                              {e.approvedAt ? ` ${format(new Date(e.approvedAt), "MMM d, h:mma")}` : ""}
                            </span>
                          )}
                        </div>
                        {e.approvalNote && (
                          <div className="text-[11px] text-smoke mt-1 italic">
                            &ldquo;{e.approvalNote}&rdquo;
                          </div>
                        )}
                        {e.breaks && e.breaks.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {e.breaks.map((b, i) => {
                              const meta = BREAK_META[b.breakType];
                              const bStart = new Date(b.breakStart);
                              const bEnd = b.breakEnd ? new Date(b.breakEnd) : null;
                              const mins = bEnd
                                ? Math.round((bEnd.getTime() - bStart.getTime()) / 60000)
                                : null;
                              const overByMin =
                                mins !== null && meta.target !== null
                                  ? mins - meta.target
                                  : null;
                              const tone =
                                overByMin !== null && overByMin > 0
                                  ? "#dc2626"
                                  : overByMin !== null && overByMin >= -2
                                    ? "#d97706"
                                    : meta.color;
                              return (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium"
                                  style={{ background: `${tone}15`, color: tone }}
                                  title={`${meta.label} · started ${format(bStart, "h:mma")}${bEnd ? ` ended ${format(bEnd, "h:mma")}` : " (still on break)"}`}
                                >
                                  ☕ {mins === null ? "ongoing" : `${mins} min`}
                                  {meta.target !== null && (
                                    <span className="opacity-70">/ {meta.target}</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.approvalStatus === "PENDING" && (
                          <>
                            <button
                              onClick={() => setEditingId(e.id)}
                              disabled={busy === e.id}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-ink/10 hover:bg-ink/5 disabled:opacity-50"
                              title="Adjust clock-in/out before approving"
                            >
                              <Pencil size={11} /> Edit
                            </button>
                            <button
                              onClick={() => actOne(e.id, "approve")}
                              disabled={busy === e.id}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded text-white font-medium disabled:opacity-50"
                              style={{
                                background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
                                boxShadow: "0 1px 2px rgba(16, 185, 129, 0.3)",
                              }}
                            >
                              <Check size={11} /> Approve
                            </button>
                            <button
                              onClick={() => actOne(e.id, "reject")}
                              disabled={busy === e.id}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <X size={11} /> Reject
                            </button>
                          </>
                        )}
                        {(e.approvalStatus === "APPROVED" || e.approvalStatus === "REJECTED") && (
                          <button
                            onClick={() => actOne(e.id, "reset")}
                            disabled={busy === e.id}
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-ink/10 hover:bg-ink/5 disabled:opacity-50"
                          >
                            <RotateCcw size={11} /> Undo
                          </button>
                        )}
                        <Link
                          href={`/${tenantSlug}/timesheets?from=${day}&to=${day}&employeeIds=${e.userId}`}
                          className="text-[11px] text-rust hover:underline"
                          title="Open in timesheets"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      {editingId && (() => {
        const ent = entries.find((x) => x.id === editingId);
        if (!ent) return null;
        return (
          <EditEntryModal
            entryId={ent.id}
            displayName={ent.userName}
            clockIn={ent.clockIn}
            clockOut={ent.clockOut}
            breaks={(ent.breaks ?? []).map((b: any) => ({
              id: b.id,
              breakStart: b.breakStart,
              breakEnd: b.breakEnd,
              breakType: b.breakType,
              notes: b.notes ?? null,
            }))}
            onClose={() => setEditingId(null)}
            onSaved={() => {
              setEditingId(null);
              router.refresh();
            }}
          />
        );
      })()}
    </div>
  );
}

function StatTile({
  count,
  label,
  color,
  icon,
}: {
  count: number;
  label: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </span>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold">{label}</div>
        <div className="display text-2xl" style={{ color }}>{count}</div>
      </div>
    </div>
  );
}
