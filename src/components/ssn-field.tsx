"use client";

/**
 * SSN input field — masked by default, admin can edit or clear.
 *
 * Plaintext SSN exists only briefly in the input state while the admin is
 * typing. Once saved (PATCH /api/employees/[id]/ssn), it's encrypted at
 * rest and only the last 4 digits come back. We never re-fetch the full
 * SSN to the browser.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Edit3, Trash2, Save, X } from "lucide-react";

export default function SsnField({
  employeeId,
  initialLast4,
}: {
  employeeId: string;
  initialLast4: string | null;
}) {
  const router = useRouter();
  const [last4, setLast4] = useState<string | null>(initialLast4);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/ssn`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssn: draft }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setLast4(draft.replace(/\D/g, "").slice(-4));
      setDraft("");
      setEditing(false);
      setMsg({ kind: "ok", text: "Saved (encrypted at rest)." });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  async function clear() {
    if (!window.confirm("Remove the stored SSN? This can't be recovered.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/ssn`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Clear failed");
      }
      setLast4(null);
      setMsg({ kind: "ok", text: "Cleared." });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  // Format as user types: 123-45-6789
  function formatInput(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }

  return (
    <section className="card p-5">
      <h2 className="display text-lg text-ink mb-1 flex items-center gap-2">
        <Lock size={16} className="text-rust" /> Social Security Number
      </h2>
      <p className="text-xs text-smoke mb-4">
        Required for W-2 / EFW2 generation. Encrypted at rest with AES-256-GCM.
        Plaintext is never sent to the browser after saving — only the last 4
        digits come back for display.
      </p>

      {!editing ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="font-mono text-sm">
            {last4 ? `***-**-${last4}` : <span className="text-smoke italic">Not set</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setDraft("");
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-ink/10 hover:bg-ink/5"
            >
              <Edit3 size={12} /> {last4 ? "Replace" : "Set SSN"}
            </button>
            {last4 && (
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-red-200 text-red-700 hover:bg-red-50"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(formatInput(e.target.value))}
            placeholder="XXX-XX-XXXX"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="flex-1 min-w-[180px] text-sm font-mono rounded border border-ink/10 px-3 py-2 bg-white"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || draft.replace(/\D/g, "").length !== 9}
            className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save size={12} /> {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft("");
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-ink/10 hover:bg-ink/5"
          >
            <X size={12} /> Cancel
          </button>
        </div>
      )}

      {msg && (
        <div
          className={`text-xs mt-3 rounded px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}
