"use client";

/**
 * Delete-pay-period button — works for DRAFT and (admin-only) FINALIZED.
 *
 * For DRAFT periods: simple confirmation modal (existing behavior).
 * For FINALIZED periods: stronger confirmation — must type the period
 * range to enable the delete button.
 *
 * Usage:
 *   <DeletePayPeriodButton periodId={p.id} label="Apr 20 – May 3, 2026"
 *     status={p.status} variant="icon" stubCount={5} />
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";

export default function DeletePayPeriodButton({
  periodId,
  label,
  status,
  stubCount,
  variant = "icon",
  redirectTo,
  onDeleted,
}: {
  periodId: string;
  label: string;
  status: "DRAFT" | "FINALIZED";
  stubCount?: number;
  variant?: "icon" | "button";
  redirectTo?: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isFinalized = status === "FINALIZED";
  // For FINALIZED, the user must type the period label exactly.
  const canSubmit = isFinalized ? confirmText.trim() === label.trim() : true;

  async function handleDelete() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/payroll/${periodId}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to delete pay period");
      setConfirming(false);
      setConfirmText("");
      if (redirectTo) router.push(redirectTo);
      else if (onDeleted) onDeleted();
      else router.refresh();
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
          className={`inline-flex items-center justify-center p-1.5 rounded transition ${
            isFinalized ? "text-red-700 hover:text-red-800" : "text-smoke hover:text-red-600"
          }`}
          title={isFinalized ? "Delete this finalized pay period (admin only)" : "Delete this draft pay period"}
          aria-label="Delete pay period"
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border ${
            isFinalized
              ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
              : "border-red-200 text-red-700 bg-white hover:bg-red-50"
          }`}
        >
          <Trash2 size={12} />
          Delete period
        </button>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            {isFinalized ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={20} className="text-red-600" />
                  <h3 className="text-lg font-medium text-red-700">
                    Delete FINALIZED pay period?
                  </h3>
                </div>
                <p className="text-sm text-ink/80 mb-2">
                  <strong>{label}</strong>
                </p>
                <p className="text-sm text-red-700 mb-1">
                  This is part of the financial record.
                </p>
                <ul className="text-xs text-ink/70 list-disc pl-5 mb-3 space-y-1">
                  <li>{stubCount ?? "All"} paystub{(stubCount ?? 0) === 1 ? "" : "s"} will be permanently deleted.</li>
                  <li>YTD wage calculations for affected employees will change.</li>
                  <li>If you've already given paychecks for these stubs, the records won't match.</li>
                  <li>If you've already filed quarterly 941 with these numbers, your filing is no longer in sync.</li>
                </ul>
                <p className="text-xs text-ink mb-1">
                  Consider <strong>un-finalizing</strong> instead (flips back to DRAFT, then you can edit + re-finalize).
                </p>
                <div className="border-t border-ink/10 my-3" />
                <p className="text-xs text-ink mb-1">
                  To confirm, type the period label below:
                </p>
                <p className="text-[11px] font-mono text-smoke mb-1.5">{label}</p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={label}
                  className="w-full text-sm font-mono rounded border border-red-300 px-3 py-2 mb-3 focus:outline-none focus:border-red-600"
                  autoFocus
                />
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-ink mb-2">Delete pay period?</h3>
                <p className="text-sm text-ink/70 mb-1">
                  <strong>{label}</strong>
                </p>
                <p className="text-sm text-ink/70 mb-3">
                  This will permanently delete this draft period
                  {typeof stubCount === "number" && stubCount > 0
                    ? ` and all ${stubCount} draft paystub${stubCount === 1 ? "" : "s"} in it`
                    : ""}
                  . This can&rsquo;t be undone.
                </p>
              </>
            )}

            {err && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                {err}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                  setErr(null);
                }}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded border border-ink/10 hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={busy || !canSubmit}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Deleting…" : isFinalized ? "Delete forever" : "Delete period"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
