"use client";

/**
 * Settings panel: toggle for tenant.requireClockApproval.
 * When OFF, clock entries auto-approve and skip the approval queue.
 */

import { useEffect, useState } from "react";
import { ClipboardCheck, Check, AlertCircle, Loader2 } from "lucide-react";

export default function ClockApprovalPanel() {
  const [requireApproval, setRequireApproval] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/tenant/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (typeof j?.tenant?.requireClockApproval === "boolean") {
          setRequireApproval(j.tenant.requireClockApproval);
        }
      })
      .catch(() => setRequireApproval(true));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tenant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireClockApproval: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Update failed");
      setRequireApproval(next);
      setMsg({
        kind: "ok",
        text: next
          ? "Approval queue enabled. New clock entries will start as PENDING."
          : "Auto-approve enabled. New clock entries flow straight to timesheets.",
      });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  if (requireApproval === null) {
    return (
      <div className="card p-6 flex items-center gap-2 text-smoke text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading clock approval settings…
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-start gap-3 mb-4">
        <ClipboardCheck size={20} className="text-rust shrink-0 mt-1" />
        <div>
          <h2 className="display text-xl text-ink">Clock approval workflow</h2>
          <p className="text-sm text-smoke mt-1">
            Choose whether admin/manager approval is required before clock-in/out
            entries count toward timesheets and payroll.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => !busy && requireApproval !== true && toggle(true)}
          disabled={busy}
          className="text-left p-4 rounded-lg border-2 transition disabled:opacity-50"
          style={{
            borderColor: requireApproval ? "#6366f1" : "rgba(15,23,42,0.08)",
            background: requireApproval ? "rgba(99,102,241,0.04)" : "white",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm text-ink">Require approval</span>
            {requireApproval && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full"
                style={{ background: "#6366f1" }}
              >
                <Check size={12} className="text-white" />
              </span>
            )}
          </div>
          <p className="text-xs text-smoke leading-snug">
            Every clock-in/out starts as <strong>PENDING</strong>. Admin must approve
            before it shows in timesheets or counts in payroll. Best for larger or
            regulated teams.
          </p>
        </button>

        <button
          type="button"
          onClick={() => !busy && requireApproval !== false && toggle(false)}
          disabled={busy}
          className="text-left p-4 rounded-lg border-2 transition disabled:opacity-50"
          style={{
            borderColor: !requireApproval ? "#10b981" : "rgba(15,23,42,0.08)",
            background: !requireApproval ? "rgba(16,185,129,0.04)" : "white",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm text-ink">Auto-approve</span>
            {!requireApproval && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full"
                style={{ background: "#10b981" }}
              >
                <Check size={12} className="text-white" />
              </span>
            )}
          </div>
          <p className="text-xs text-smoke leading-snug">
            Clock-ins/outs are <strong>APPROVED on save</strong> and flow directly to
            timesheets + payroll. No queue. Best for small or trusted teams.
          </p>
        </button>
      </div>

      <div className="mt-4 text-[11px] text-smoke italic">
        Note: switching this only affects <strong>new</strong> entries. Historical
        PENDING entries stay in the approval queue until you approve them.
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 text-sm rounded px-3 py-2 mt-3 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}
    </div>
  );
}
