"use client";

/**
 * Single signature row on the admin per-document detail page.
 *
 * Renders:
 *   - Employee name + status pill
 *   - For SIGNED: link to signed copy + signed at timestamp
 *   - For WAIVED: who waived + reason
 *   - For PENDING (admin only): Waive button with reason prompt
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, X, AlertTriangle } from "lucide-react";

type Status = "PENDING" | "SIGNED" | "WAIVED";

export default function DocumentSignatureRow({
  signatureId,
  employeeId,
  employeeName,
  employeeActive,
  status,
  signedAt,
  signedFileUrl,
  waivedByName,
  waivedAt,
  waiveReason,
  isAdmin,
  tenantSlug,
}: {
  signatureId: string;
  employeeId: string;
  employeeName: string;
  employeeActive: boolean;
  status: Status;
  signedAt: string | null;
  signedFileUrl: string | null;
  waivedByName: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  isAdmin: boolean;
  tenantSlug: string;
}) {
  const router = useRouter();
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const statusStyle: Record<Status, { bg: string; color: string; label: string }> = {
    SIGNED: { bg: "rgba(16,185,129,0.10)", color: "#059669", label: "Signed" },
    PENDING: { bg: "rgba(245,158,11,0.10)", color: "#d97706", label: "Pending" },
    WAIVED: { bg: "rgba(99,102,241,0.10)", color: "#6366f1", label: "Waived" },
  };
  const st = statusStyle[status];

  async function waive() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/documents/signatures/${signatureId}/waive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Waive failed");
      setWaiveModalOpen(false);
      setReason("");
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function unwaive() {
    if (!window.confirm(`Restore signature requirement for ${employeeName}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/signatures/${signatureId}/waive`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Unwaive failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="p-4 hover:bg-ink/[0.02] flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/${tenantSlug}/employees/${employeeId}`}
              className="text-sm font-medium text-ink hover:underline truncate"
            >
              {employeeName}
            </Link>
            {!employeeActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/5 text-smoke">Inactive</span>
            )}
            <span
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
              style={{ background: st.bg, color: st.color }}
            >
              {st.label}
            </span>
          </div>
          <div className="text-[11px] text-smoke mt-0.5">
            {status === "SIGNED" && signedAt && (
              <>Signed {signedAt}</>
            )}
            {status === "WAIVED" && (
              <>
                Waived{waivedAt ? ` ${waivedAt}` : ""}
                {waivedByName ? ` by ${waivedByName}` : ""}
                {waiveReason ? ` — "${waiveReason}"` : ""}
              </>
            )}
            {status === "PENDING" && <>Awaiting signature</>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {status === "SIGNED" && signedFileUrl && (
            <a
              href={signedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-rust hover:underline inline-flex items-center gap-1"
            >
              View signed <ExternalLink size={11} />
            </a>
          )}
          {isAdmin && status === "PENDING" && (
            <button
              onClick={() => setWaiveModalOpen(true)}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded border border-ink/10 hover:bg-ink/5 disabled:opacity-50"
            >
              Waive
            </button>
          )}
          {isAdmin && status === "WAIVED" && (
            <button
              onClick={unwaive}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded border border-ink/10 hover:bg-ink/5 disabled:opacity-50"
            >
              Unwaive
            </button>
          )}
        </div>
      </div>

      {waiveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-medium text-ink">
                  Waive signature for {employeeName}?
                </h3>
                <p className="text-xs text-smoke mt-1">
                  This excuses them from signing this document. They&rsquo;ll be able
                  to clock in without it. You can unwaive later.
                </p>
              </div>
              <button
                onClick={() => {
                  setWaiveModalOpen(false);
                  setReason("");
                  setErr(null);
                }}
                disabled={busy}
                className="text-smoke hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <label className="block text-xs font-medium text-ink mb-1">
              Reason (optional but recommended)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Acknowledged in person on May 11"
              className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            />

            {err && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
                {err}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setWaiveModalOpen(false);
                  setReason("");
                  setErr(null);
                }}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded border border-ink/10 hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                onClick={waive}
                disabled={busy}
                className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? "Waiving…" : "Waive signature"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
