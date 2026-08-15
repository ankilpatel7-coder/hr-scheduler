"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Coffee,
} from "lucide-react";

type Row = {
  id: string;
  userName: string | null;
  clockInIso: string;
  clockOutIso: string | null;
  approvalStatus: string;
  breakCount: number;
  deletedByName: string | null;
  deletedAtIso: string;
  deleteReason: string | null;
};

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase()
    .replace(/\s/g, "");
}

function fmtDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function hours(a: string, b: string | null): string {
  if (!b) return "open";
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  return `${h.toFixed(1)}h`;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  APPROVED: { bg: "rgba(59, 109, 17, 0.10)", text: "#1F4708" },
  PENDING: { bg: "rgba(201, 154, 44, 0.10)", text: "#3D2E08" },
  REJECTED: { bg: "rgba(163, 45, 45, 0.10)", text: "#501313" },
};

export default function DeletedTimesheetsClient({
  tenantSlug,
  retainDays,
  timezone,
  rows,
}: {
  tenantSlug: string;
  retainDays: number;
  timezone: string;
  rows: Row[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function restore(id: string) {
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/clock-entries/deleted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Restore failed");
        return;
      }
      setNote(
        data.breaksRestored > 0
          ? `Restored with ${data.breaksRestored} break${data.breaksRestored === 1 ? "" : "s"}.`
          : "Entry restored.",
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function purge(id: string) {
    if (!confirm("Permanently delete this record? This cannot be undone."))
      return;
    setBusyId(id);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/clock-entries/deleted?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Delete failed");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link
          href={`/${tenantSlug}/timesheets`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to timesheets
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <Trash2 size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Deleted timesheet entries</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Punches removed in the last {retainDays} days. Restoring brings back
          the entry with its breaks, selfies and approval state intact.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-rose bg-rose/10 border border-rose/25 rounded px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {note && (
          <div className="mb-4 text-sm text-moss bg-moss/10 border border-moss/25 rounded px-3 py-2">
            {note}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-smoke italic">
            Nothing deleted in the last {retainDays} days.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-dust">
              {rows.map((r) => {
                const st = STATUS_STYLE[r.approvalStatus] ?? {
                  bg: "rgba(122,120,114,0.10)",
                  text: "#444441",
                };
                return (
                  <li
                    key={r.id}
                    className="px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink">
                          {r.userName ?? "Unknown"}
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                          style={{ background: st.bg, color: st.text }}
                        >
                          {r.approvalStatus}
                        </span>
                        {r.breakCount > 0 && (
                          <span className="text-[10px] text-smoke inline-flex items-center gap-1">
                            <Coffee size={10} /> {r.breakCount}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-smoke mt-0.5 font-mono">
                        {fmtDate(r.clockInIso, timezone)} ·{" "}
                        {fmtTime(r.clockInIso, timezone)}–
                        {r.clockOutIso ? fmtTime(r.clockOutIso, timezone) : "open"}{" "}
                        · {hours(r.clockInIso, r.clockOutIso)}
                      </div>
                      <div className="text-[11px] text-smoke mt-1">
                        Deleted by {r.deletedByName ?? "—"} ·{" "}
                        {fmtDateTime(r.deletedAtIso, timezone)}
                        {r.deleteReason ? ` — ${r.deleteReason}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => restore(r.id)}
                        disabled={busyId === r.id}
                        className="btn btn-secondary !py-1 !text-xs inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        {busyId === r.id ? "…" : "Restore"}
                      </button>
                      <button
                        type="button"
                        onClick={() => purge(r.id)}
                        disabled={busyId === r.id}
                        className="text-[11px] text-smoke hover:text-rose disabled:opacity-50"
                        title="Delete permanently"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
