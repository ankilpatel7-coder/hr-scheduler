"use client";

/**
 * Calendar events list + create/edit/delete UI.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";

type EventType = "HOLIDAY" | "MEETING" | "CLOSED" | "OTHER";

type Row = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startDate: string;  // YYYY-MM-DD
  endDate: string;
  color: string | null;
  createdByName: string;
};

const TYPE_COLORS: Record<EventType, string> = {
  HOLIDAY: "#059669",
  MEETING: "#1d4ed8",
  CLOSED: "#dc2626",
  OTHER: "#5F5E5A",
};

const TYPE_LABELS: Record<EventType, string> = {
  HOLIDAY: "Holiday",
  MEETING: "Meeting",
  CLOSED: "Closed",
  OTHER: "Other",
};

export default function CalendarEventsManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-xs text-smoke">
          {initial.length} event{initial.length === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn btn-rust inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> New event
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink/70 mb-1">No events yet.</p>
          <p className="text-xs text-smoke">
            Add a holiday or meeting and it&rsquo;ll show on the schedule as a banner.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-ink/5">
          {initial.map((e) => {
            const color = e.color ?? TYPE_COLORS[e.type];
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-ink/[0.02]"
              >
                <div
                  className="w-1 self-stretch rounded"
                  style={{ background: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink truncate">{e.title}</span>
                    <span
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                      style={{ color, background: `${color}15` }}
                    >
                      {TYPE_LABELS[e.type]}
                    </span>
                  </div>
                  <div className="text-[11px] text-smoke">
                    {e.startDate === e.endDate ? e.startDate : `${e.startDate} – ${e.endDate}`}
                    {e.description ? ` · ${e.description.slice(0, 60)}${e.description.length > 60 ? "…" : ""}` : ""}
                    {` · added by ${e.createdByName}`}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(e)}
                  className="p-1.5 text-smoke hover:text-ink rounded"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <DeleteButton
                  id={e.id}
                  title={e.title}
                  onDeleted={() => router.refresh()}
                />
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <EventModal
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DeleteButton({
  id,
  title,
  onDeleted,
}: {
  id: string;
  title: string;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!window.confirm(`Delete "${title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/calendar-events/${id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
      else alert((await res.json()).error || "Delete failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="p-1.5 text-smoke hover:text-red-600 rounded disabled:opacity-50"
      title="Delete"
    >
      <Trash2 size={13} />
    </button>
  );
}

function EventModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<EventType>(initial?.type ?? "HOLIDAY");
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? today);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        type,
        startDate,
        endDate,
        description: description.trim() || null,
      };
      const res = isEdit
        ? await fetch(`/api/calendar-events/${initial!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/calendar-events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-ink">
            {isEdit ? "Edit event" : "New event"}
          </h3>
          <button onClick={onClose} className="text-smoke hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Christmas Day"
              autoFocus
              className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EventType)}
              className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            >
              <option value="HOLIDAY">Holiday (paid)</option>
              <option value="MEETING">Meeting</option>
              <option value="CLOSED">Closed (shop closed)</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
            />
          </div>
        </div>

        {err && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3">
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded border border-ink/10 hover:bg-ink/5"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !title.trim()}
            className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save size={12} /> {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
