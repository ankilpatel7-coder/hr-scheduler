"use client";

/**
 * Shared "adjust clock entry" modal — used by timesheets page and the
 * approvals queue. Mirrors the existing timesheets EditEntryModal's API
 * (PATCH /api/clock-entries) but takes a minimal prop shape so callers
 * don't need to share an exact Entry type.
 */

import { useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";

export default function EditEntryModal({
  entryId,
  displayName,
  clockIn,
  clockOut,
  onClose,
  onSaved,
}: {
  entryId: string;
  displayName: string;
  clockIn: string;
  clockOut: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ci, setCi] = useState(
    format(new Date(clockIn), "yyyy-MM-dd'T'HH:mm"),
  );
  const [co, setCo] = useState(
    clockOut ? format(new Date(clockOut), "yyyy-MM-dd'T'HH:mm") : "",
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/clock-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entryId,
          clockIn: new Date(ci).toISOString(),
          clockOut: co ? new Date(co).toISOString() : null,
          editNote: note,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Save failed");
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 btn btn-ghost !p-1.5"
        >
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Adjust entry</div>
          <h2 className="display text-2xl text-ink">{displayName}</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Clock in</label>
            <input
              type="datetime-local"
              value={ci}
              onChange={(e) => setCi(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Clock out</label>
            <input
              type="datetime-local"
              value={co}
              onChange={(e) => setCo(e.target.value)}
            />
            <div className="text-xs text-smoke mt-1">
              Leave blank if employee is still clocked in.
            </div>
          </div>
          <div>
            <label>Reason for adjustment</label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Forgot to clock out — verified shift end with manager"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30">
            ⚠️ This will be marked as an edited entry on payroll exports.
          </div>
          {err && (
            <div className="text-xs text-rust bg-rust/10 px-3 py-2 rounded">
              {err}
            </div>
          )}
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Save adjustment"}
          </button>
        </form>
      </div>
    </div>
  );
}
