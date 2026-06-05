"use client";

/**
 * Manual time entry modal v2.
 *
 * Changes from v1:
 *   - Cascading filters: pick Location first, then Employee dropdown
 *     filters to staff at that location
 *   - Breaks section: add one or more breaks at creation time
 *   - Manual entries auto-approve (driven by API change)
 */

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { X, Plus, Trash2, Coffee, MapPin } from "lucide-react";

type Employee = {
  id: string;
  name: string;
  locations?: { location: { id: string; name: string } }[];
};

type Location = { id: string; name: string };

type BreakType = "SHORT_15" | "MEAL_30" | "OTHER";
type BreakRow = {
  localId: string;
  breakStart: string; // "HH:MM"
  breakEnd: string; // "HH:MM" or ""
  breakType: BreakType;
};

const BREAK_LABELS: Record<BreakType, string> = {
  SHORT_15: "10 min · paid",
  MEAL_30: "30 min · meal (unpaid)",
  OTHER: "Other",
};

export default function ManualEntryModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [userId, setUserId] = useState("");
  const [clockInDate, setClockInDate] = useState(today);
  const [clockInTime, setClockInTime] = useState("09:00");
  const [clockOutDate, setClockOutDate] = useState(today);
  const [clockOutTime, setClockOutTime] = useState("17:00");
  const [hasOut, setHasOut] = useState(true);
  const [note, setNote] = useState("Added manually by admin");
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch locations on mount
  useEffect(() => {
    fetch("/api/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => {
        const active = (d.locations ?? []).filter((l: any) => l.active);
        setLocations(active);
        // Default to first location (mirrors LocationFilter behavior)
        try {
          const stored = localStorage.getItem("shiftwork:lastLocationId");
          const pick =
            stored && active.some((l: Location) => l.id === stored)
              ? stored
              : active[0]?.id ?? "";
          setLocationId(pick);
        } catch {
          if (active[0]) setLocationId(active[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Employees filtered by selected location — fetched server-side so we
  // get only employees actually assigned to this location (the prop from
  // parent may or may not include nested location data).
  useEffect(() => {
    if (!locationId) {
      setFilteredEmployees([]);
      return;
    }
    let cancelled = false;
    setLoadingEmployees(true);
    fetch(`/api/employees?locationId=${encodeURIComponent(locationId)}`)
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((d) => {
        if (cancelled) return;
        const list = (d.employees ?? []).filter(
          (e: any) => e.active && !e.archivedAt && e.role !== "ADMIN"
        );
        setFilteredEmployees(list);
        setLoadingEmployees(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFilteredEmployees([]);
        setLoadingEmployees(false);
      });
    return () => { cancelled = true; };
  }, [locationId]);

  // Reset userId if it's no longer in filtered list
  useEffect(() => {
    if (userId && !filteredEmployees.some((e) => e.id === userId)) {
      setUserId("");
    }
  }, [userId, filteredEmployees]);

  function addBreak() {
    setBreaks((arr) => [
      ...arr,
      {
        localId: `new-${arr.length}-${Date.now()}`,
        breakStart: "12:00",
        breakEnd: "12:30",
        breakType: "MEAL_30",
      },
    ]);
  }
  function removeBreak(localId: string) {
    setBreaks((arr) => arr.filter((b) => b.localId !== localId));
  }
  function updateBreak(localId: string, patch: Partial<BreakRow>) {
    setBreaks((arr) =>
      arr.map((b) => (b.localId === localId ? { ...b, ...patch } : b)),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userId) {
      setErr("Pick an employee");
      return;
    }
    const inIso = new Date(`${clockInDate}T${clockInTime}`).toISOString();
    const outIso = hasOut
      ? new Date(`${clockOutDate}T${clockOutTime}`).toISOString()
      : null;
    if (outIso && new Date(outIso) <= new Date(inIso)) {
      setErr("Clock out must be after clock in");
      return;
    }

    setSaving(true);
    try {
      // Create the entry
      const res = await fetch("/api/clock-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          clockIn: inIso,
          clockOut: outIso,
          editNote: note,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      const j = await res.json();
      const entryId = j.entry?.id;

      // Create the breaks (if any)
      if (entryId && breaks.length > 0) {
        const breakOps = breaks.map(async (b) => {
          const bStartIso = new Date(`${clockInDate}T${b.breakStart}`).toISOString();
          const bEndIso = b.breakEnd
            ? new Date(`${clockInDate}T${b.breakEnd}`).toISOString()
            : null;
          const r = await fetch("/api/breaks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clockEntryId: entryId,
              breakStart: bStartIso,
              breakEnd: bEndIso,
              breakType: b.breakType,
            }),
          });
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error ?? "Break create failed");
          }
        });
        await Promise.all(breakOps);
      }

      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

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
          <div className="label-eyebrow mb-1">Manual time entry</div>
          <h2 className="display text-2xl text-ink">Add clock-in / out</h2>
          <p className="text-sm text-smoke mt-2">
            For when an employee forgot to clock in or you&apos;re entering
            paper records.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="inline-flex items-center gap-1">
              <MapPin size={11} /> Location
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              <option value="">Select location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Employee</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              disabled={!locationId}
            >
              <option value="">
                {!locationId
                  ? "Pick a location first…"
                  : loadingEmployees
                    ? "Loading employees…"
                    : filteredEmployees.length === 0
                      ? "No employees at this location"
                      : "Select an employee…"}
              </option>
              {filteredEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Clock in date</label>
              <input
                type="date"
                value={clockInDate}
                onChange={(e) => setClockInDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Clock in time</label>
              <input
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 !mb-2">
              <input
                type="checkbox"
                checked={hasOut}
                onChange={(e) => setHasOut(e.target.checked)}
              />
              <span className="!text-xs">
                Add clock out (uncheck if still on shift)
              </span>
            </label>
            {hasOut && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="date"
                    value={clockOutDate}
                    onChange={(e) => setClockOutDate(e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="time"
                    value={clockOutTime}
                    onChange={(e) => setClockOutTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Breaks */}
          <div className="border-t border-ink/10 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="label-eyebrow inline-flex items-center gap-1">
                <Coffee size={11} /> Breaks ({breaks.length})
              </div>
              <button
                type="button"
                onClick={addBreak}
                className="inline-flex items-center gap-1 text-xs text-rust hover:underline"
              >
                <Plus size={12} /> Add break
              </button>
            </div>
            {breaks.length === 0 ? (
              <div className="text-xs text-smoke italic px-2 py-2 bg-ink/[0.02] rounded">
                No breaks. Click + Add break to log one.
              </div>
            ) : (
              <div className="space-y-2">
                {breaks.map((b) => (
                  <div
                    key={b.localId}
                    className="border border-ink/10 rounded-lg p-3 space-y-2 bg-paper"
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={b.breakType}
                        onChange={(e) =>
                          updateBreak(b.localId, {
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
                        onClick={() => removeBreak(b.localId)}
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
                          type="time"
                          value={b.breakStart}
                          onChange={(e) =>
                            updateBreak(b.localId, { breakStart: e.target.value })
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
                          type="time"
                          value={b.breakEnd}
                          onChange={(e) =>
                            updateBreak(b.localId, { breakEnd: e.target.value })
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
            <label>Note</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
          </div>

          {err && (
            <div className="text-xs text-rust bg-rust/10 px-3 py-2 rounded">
              {err}
            </div>
          )}

          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Add entry"}
          </button>
        </form>
      </div>
    </div>
  );
}
