"use client";

/**
 * Shared "adjust clock entry" modal — v2 with break editing.
 *
 * Lets admins:
 *   - Edit clock-in / clock-out
 *   - Edit, delete, or add breaks (type, start, end)
 *   - Provide a reason note for the entry adjustment
 *
 * Save flow: PATCH entry first; then for each break change fire the right
 * API call in parallel (POST new, PATCH modified, DELETE removed).
 * If any break call fails, the entry's clock-in/out is still saved and the
 * specific error is shown.
 */

import { useState } from "react";
import { format } from "date-fns";
import { X, Plus, Trash2, Coffee } from "lucide-react";

type BreakType = "SHORT_15" | "MEAL_30" | "OTHER";

export type EditableBreak = {
  // id present for existing breaks; absent for newly-added ones
  id?: string;
  breakStart: string; // ISO
  breakEnd: string | null; // ISO or null
  breakType: BreakType;
  notes?: string | null;
};

const BREAK_LABELS: Record<BreakType, string> = {
  SHORT_15: "10 min · paid",
  MEAL_30: "30 min · meal (unpaid)",
  OTHER: "Other",
};

export default function EditEntryModal({
  entryId,
  displayName,
  clockIn,
  clockOut,
  breaks: initialBreaks = [],
  onClose,
  onSaved,
}: {
  entryId: string;
  displayName: string;
  clockIn: string;
  clockOut: string | null;
  breaks?: EditableBreak[];
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

  // Working copy of breaks. Track deletions separately so we can DELETE them.
  type EditBreakRow = EditableBreak & { _localId: string; _deleted?: boolean };
  const [breakRows, setBreakRows] = useState<EditBreakRow[]>(() =>
    initialBreaks.map((b, i) => ({
      ...b,
      _localId: b.id ?? `new-${i}-${Date.now()}`,
    })),
  );

  function updateBreak(localId: string, patch: Partial<EditableBreak>) {
    setBreakRows((rows) =>
      rows.map((r) => (r._localId === localId ? { ...r, ...patch } : r)),
    );
  }

  function addBreak() {
    setBreakRows((rows) => [
      ...rows,
      {
        _localId: `new-${rows.length}-${Date.now()}`,
        breakStart: ci || new Date().toISOString(),
        breakEnd: null,
        breakType: "SHORT_15",
      },
    ]);
  }

  function removeBreak(localId: string) {
    setBreakRows((rows) =>
      rows
        .map((r) => (r._localId === localId ? { ...r, _deleted: true } : r))
        // newly-added (no id) can be dropped from state directly
        .filter((r) => !(r._deleted && !r.id)),
    );
  }

  function toIso(localDt: string): string | null {
    if (!localDt) return null;
    return new Date(localDt).toISOString();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      // 1. Update the clock entry's times + note
      const entryRes = await fetch("/api/clock-entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: entryId,
          clockIn: new Date(ci).toISOString(),
          clockOut: co ? new Date(co).toISOString() : null,
          editNote: note,
        }),
      });
      if (!entryRes.ok) {
        const j = await entryRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to save entry");
      }

      // 2. Handle breaks: parallel POST/PATCH/DELETE
      const ops = breakRows.map(async (r) => {
        // Deleted existing break
        if (r._deleted && r.id) {
          const res = await fetch(`/api/breaks/${r.id}`, { method: "DELETE" });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error ?? "Delete break failed");
          }
          return;
        }
        if (r._deleted) return;

        const payload = {
          breakStart: toIso(r.breakStart) ?? r.breakStart,
          breakEnd: r.breakEnd ? toIso(r.breakEnd) : null,
          breakType: r.breakType,
          notes: r.notes ?? null,
        };

        if (r.id) {
          // Existing break → PATCH
          const res = await fetch(`/api/breaks/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error ?? "Update break failed");
          }
        } else {
          // New break → POST
          const res = await fetch(`/api/breaks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clockEntryId: entryId, ...payload }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error ?? "Add break failed");
          }
        }
      });

      await Promise.all(ops);
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const visibleBreaks = breakRows.filter((r) => !r._deleted);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6 overflow-y-auto">
      <div className="card w-full max-w-lg p-6 relative my-8">
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

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
            </div>
          </div>
          <div className="text-xs text-smoke -mt-2">
            Leave clock-out blank if employee is still clocked in.
          </div>

          {/* Breaks section */}
          <div className="border-t border-ink/10 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="label-eyebrow inline-flex items-center gap-1">
                <Coffee size={11} /> Breaks ({visibleBreaks.length})
              </div>
              <button
                type="button"
                onClick={addBreak}
                className="inline-flex items-center gap-1 text-xs text-rust hover:underline"
              >
                <Plus size={12} /> Add break
              </button>
            </div>

            {visibleBreaks.length === 0 ? (
              <div className="text-xs text-smoke italic px-2 py-3 bg-ink/[0.02] rounded">
                No breaks recorded. Click + Add break to log one.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleBreaks.map((b) => (
                  <div
                    key={b._localId}
                    className="border border-ink/10 rounded-lg p-3 space-y-2 bg-paper"
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={b.breakType}
                        onChange={(e) =>
                          updateBreak(b._localId, {
                            breakType: e.target.value as BreakType,
                          })
                        }
                        className="text-xs rounded border border-ink/10 px-2 py-1 bg-white flex-1"
                      >
                        {(["SHORT_15", "MEAL_30", "OTHER"] as BreakType[]).map(
                          (t) => (
                            <option key={t} value={t}>
                              {BREAK_LABELS[t]}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeBreak(b._localId)}
                        className="text-rust hover:bg-rust/10 p-1 rounded"
                        title="Delete this break"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
                          Start
                        </label>
                        <input
                          type="datetime-local"
                          value={format(
                            new Date(b.breakStart),
                            "yyyy-MM-dd'T'HH:mm",
                          )}
                          onChange={(e) =>
                            updateBreak(b._localId, {
                              breakStart: new Date(e.target.value).toISOString(),
                            })
                          }
                          required
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-smoke font-semibold">
                          End
                        </label>
                        <input
                          type="datetime-local"
                          value={
                            b.breakEnd
                              ? format(
                                  new Date(b.breakEnd),
                                  "yyyy-MM-dd'T'HH:mm",
                                )
                              : ""
                          }
                          onChange={(e) =>
                            updateBreak(b._localId, {
                              breakEnd: e.target.value
                                ? new Date(e.target.value).toISOString()
                                : null,
                            })
                          }
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
