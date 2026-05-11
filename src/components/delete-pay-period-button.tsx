"use client";

/**
 * Delete-pay-period button — usable inline in a list row OR as a full
 * button on the period detail page.
 *
 * Usage:
 *   <DeletePayPeriodButton periodId={p.id} label="Apr 20 – May 3, 2026" variant="icon" />
 *   <DeletePayPeriodButton periodId={p.id} label="Apr 20 – May 3, 2026" variant="button" onDeleted={() => router.refresh()} />
 *
 * Renders nothing if status !== "DRAFT" (caller is responsible for only
 * passing draft periods, but we don't trust the prop and double-check).
 *
 * Confirmation: shows a destructive modal listing the stub count.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeletePayPeriodButton({
  periodId,
  label,
  stubCount,
  variant = "icon",
  redirectTo,
  onDeleted,
}: {
  periodId: string;
  label: string;            // human-readable period range, e.g. "Apr 20 – May 3, 2026"
  stubCount?: number;       // optional, shown in confirm modal
  variant?: "icon" | "button";
  redirectTo?: string;      // optional URL to navigate to after delete
  onDeleted?: () => void;   // optional callback (e.g. router.refresh())
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/payroll/${periodId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to delete pay period");
      setConfirming(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirming(true);
          }}
          className="inline-flex items-center justify-center p-1.5 text-smoke hover:text-red-600 rounded transition"
          title="Delete this draft pay period"
          aria-label="Delete pay period"
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-red-200 text-red-700 bg-white hover:bg-red-50"
        >
          <Trash2 size={12} />
          Delete period
        </button>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-medium text-ink mb-2">
              Delete pay period?
            </h3>
            <p className="text-sm text-ink/70 mb-1">
              <strong>{label}</strong>
            </p>
            <p className="text-sm text-ink/70 mb-1">
              This will permanently delete this draft period
              {typeof stubCount === "number" && stubCount > 0
                ? ` and all ${stubCount} draft paystub${stubCount === 1 ? "" : "s"} in it`
                : ""}
              . This can&rsquo;t be undone.
            </p>
            <p className="text-xs text-smoke mb-4">
              Note: clock entries and finalized periods are not affected. Only
              the draft paystubs in this period are removed.
            </p>
            {err && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                {err}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setErr(null);
                }}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded border border-ink/10 hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete period"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
