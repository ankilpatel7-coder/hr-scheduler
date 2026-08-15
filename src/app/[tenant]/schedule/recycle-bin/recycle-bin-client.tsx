"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle } from "lucide-react";

type Row = {
  id: string;
  employeeName: string | null;
  locationName: string | null;
  startIso: string;
  endIso: string;
  role: string | null;
  published: boolean;
  deletedByName: string | null;
  deletedAtIso: string;
  deleteReason: string | null;
};

function fmt(iso: string, tz: string, withTime = true): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(new Date(iso));
}

function fmtTimeOnly(iso: string, tz: string): string {
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

export default function RecycleBinClient({
  tenantSlug,
  retainDays,
  rows,
  timezone,
}: {
  tenantSlug: string;
  retainDays: number;
  rows: Row[];
  timezone: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function restore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/shifts/deleted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Restore failed");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function purge(id: string) {
    if (
      !confirm(
        "Permanently delete this record? It can't be restored after this.",
      )
    )
      return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/shifts/deleted?id=${id}`, {
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
          href={`/${tenantSlug}/schedule`}
          className="inline-flex items-center gap-1 text-xs text-rust hover:underline mb-3"
        >
          <ArrowLeft size={12} /> Back to schedule
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <Trash2 size={20} className="text-rust" />
          <h1 className="display text-3xl text-ink">Deleted shifts</h1>
        </div>
        <p className="text-sm text-smoke mb-6">
          Shifts removed in the last {retainDays} days. Restoring puts the shift
          back exactly as it was.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-rose bg-rose/10 border border-rose/25 rounded px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-smoke italic">
            Nothing deleted in the last {retainDays} days.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-dust">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">
                        {r.employeeName ?? "Unassigned"}
                      </span>
                      {r.role && (
                        <span className="chip text-[10px]">{r.role}</span>
                      )}
                      {!r.published && (
                        <span className="chip text-[10px]">Draft</span>
                      )}
                    </div>
                    <div className="text-[12px] text-smoke mt-0.5 font-mono">
                      {fmt(r.startIso, timezone, false)} ·{" "}
                      {fmtTimeOnly(r.startIso, timezone)}–
                      {fmtTimeOnly(r.endIso, timezone)}
                      {r.locationName ? ` · ${r.locationName}` : ""}
                    </div>
                    <div className="text-[11px] text-smoke mt-1">
                      Deleted by {r.deletedByName ?? "—"} ·{" "}
                      {fmt(r.deletedAtIso, timezone)}
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
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-smoke mt-4">
          Records older than {retainDays} days are hidden and can be cleared
          permanently.
        </p>
      </main>
    </div>
  );
}
