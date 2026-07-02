"use client";

/**
 * CalendarView — monthly grid + upcoming list + create modal.
 *
 * Everyone sees the grid and can click into event details.
 * Admins/managers get "+ New event" button and delete controls.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Paperclip, X, ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns";

type EventType = "HOLIDAY" | "MEETING" | "CLOSED" | "EVENT" | "OTHER";

type Event = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startDate: string; // "yyyy-MM-dd"
  endDate: string;
  color: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  createdByName: string;
};

const TYPE_COLORS: Record<EventType, string> = {
  HOLIDAY: "#3B6D11",   // moss
  MEETING: "#3D5C8C",   // indigo (accent — used sparingly for meetings)
  CLOSED:  "#A32D2D",   // rose
  EVENT:   "#C99A2C",   // gold
  OTHER:   "#7A7872",   // smoke
};

const TYPE_LABELS: Record<EventType, string> = {
  HOLIDAY: "Holiday",
  MEETING: "Meeting",
  CLOSED:  "Closed",
  EVENT:   "Event",
  OTHER:   "Other",
};

export default function CalendarView({
  tenantSlug,
  canManage,
  monthAnchorIso,
  events,
}: {
  tenantSlug: string;
  canManage: boolean;
  monthAnchorIso: string;
  events: Event[];
}) {
  const router = useRouter();
  const anchor = useMemo(() => new Date(monthAnchorIso), [monthAnchorIso]);
  const [showForm, setShowForm] = useState(false);

  // Build the 6-week grid centered on the anchor month
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  // Index events by date key
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const start = parseISO(e.startDate);
      const end = parseISO(e.endDate);
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const k = format(d, "yyyy-MM-dd");
        const list = map.get(k) ?? [];
        list.push(e);
        map.set(k, list);
      }
    }
    return map;
  }, [events]);

  // Upcoming events (start date >= today, sorted)
  const upcoming = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return events
      .filter((e) => e.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [events]);

  function navigateMonth(dir: -1 | 1) {
    const next = addMonths(anchor, dir);
    const monthParam = format(next, "yyyy-MM");
    router.push(`?month=${monthParam}`);
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this event? Attached PDF will be removed too.")) return;
    const r = await fetch(`/api/calendar-events/${id}`, { method: "DELETE" });
    if (!r.ok) {
      alert("Delete failed");
      return;
    }
    router.refresh();
  }

  const monthLabel = format(anchor, "MMMM yyyy");

  return (
    <>
      {/* Header — nav + create */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="inline-flex items-center gap-1 border border-dust rounded-full px-1 py-0.5 bg-paper">
          <button
            onClick={() => navigateMonth(-1)}
            className="w-8 h-8 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} className="text-smoke" />
          </button>
          <span className="text-sm font-medium text-ink px-3 tabular-nums">{monthLabel}</span>
          <button
            onClick={() => navigateMonth(1)}
            className="w-8 h-8 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
            aria-label="Next month"
          >
            <ChevronRight size={15} className="text-smoke" />
          </button>
          <button
            onClick={() => router.push("")}
            className="text-[11px] text-smoke hover:text-ink px-2"
            title="Jump to today"
          >
            Today
          </button>
        </div>

        {canManage && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary inline-flex items-center gap-1"
          >
            <Plus size={14} /> New event
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-smoke mb-3">
        {(Object.keys(TYPE_LABELS) as EventType[]).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ background: TYPE_COLORS[t] }}
            />
            {TYPE_LABELS[t]}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-bone text-[10px] uppercase tracking-wider text-smoke font-semibold border-b border-dust">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1.5 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, anchor);
            const isToday = format(new Date(), "yyyy-MM-dd") === key;
            return (
              <div
                key={key}
                className={`min-h-[90px] border-b border-r border-dust p-1.5 relative ${
                  inMonth ? "bg-paper" : "bg-bone/50"
                }`}
              >
                <div
                  className={`text-[11px] font-medium tabular-nums mb-1 ${
                    isToday
                      ? "text-gold-on inline-flex items-center justify-center w-5 h-5 rounded-full bg-rust"
                      : inMonth
                        ? "text-ink"
                        : "text-smoke"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((e) => {
                    const color = e.color || TYPE_COLORS[e.type];
                    return (
                      <Link
                        key={e.id}
                        href={`/${tenantSlug}/calendar/${e.id}`}
                        className="block text-[10px] truncate px-1 py-0.5 rounded hover:opacity-90"
                        style={{
                          background: `${color}18`,
                          color: color,
                          borderLeft: `2px solid ${color}`,
                        }}
                        title={e.title}
                      >
                        {e.attachmentUrl && (
                          <Paperclip size={9} className="inline mr-0.5" />
                        )}
                        {e.title}
                      </Link>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-[9px] text-smoke pl-1">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming list */}
      {upcoming.length > 0 && (
        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-wider text-smoke font-semibold mb-2">
            Upcoming
          </div>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-dust">
              {upcoming.slice(0, 10).map((e) => {
                const color = e.color || TYPE_COLORS[e.type];
                const singleDay = e.startDate === e.endDate;
                return (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-bone/50">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/${tenantSlug}/calendar/${e.id}`}
                        className="text-sm font-medium text-ink hover:text-rust inline-flex items-center gap-1.5"
                      >
                        {e.title}
                        {e.attachmentUrl && <Paperclip size={12} className="text-smoke" />}
                      </Link>
                      <div className="text-[11px] text-smoke mt-0.5">
                        {singleDay
                          ? format(parseISO(e.startDate), "EEE MMM d, yyyy")
                          : `${format(parseISO(e.startDate), "MMM d")} – ${format(parseISO(e.endDate), "MMM d, yyyy")}`}
                        {" · "}
                        <span style={{ color }}>{TYPE_LABELS[e.type]}</span>
                        {" · added by "}
                        {e.createdByName}
                      </div>
                      {e.description && (
                        <div className="text-[12px] text-smoke mt-1 line-clamp-2">
                          {e.description}
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <button
                        onClick={() => onDelete(e.id)}
                        className="text-[11px] text-smoke hover:text-rose inline-flex items-center gap-1"
                        title="Delete event"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showForm && canManage && (
        <EventFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// =============================================================
// Create form modal
// =============================================================
function EventFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<EventType>("EVENT");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title required");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be after start date");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", description);
      fd.append("type", type);
      fd.append("startDate", startDate);
      fd.append("endDate", endDate);
      if (file) fd.append("file", file);

      const r = await fetch("/api/calendar-events", {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || "Save failed");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(44, 44, 42, 0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-xl w-full max-w-lg overflow-hidden border border-dust"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow:
            "0 10px 20px -8px rgba(60, 40, 20, 0.15), 0 20px 40px -12px rgba(60, 40, 20, 0.20)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-dust">
          <div className="text-sm font-medium text-ink">New event</div>
          <button onClick={onClose} className="text-smoke hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Patient Drive"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
                {(Object.keys(TYPE_LABELS) as EventType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div />
            <div>
              <label>Starts</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Ends</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label>Details</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What is this event? Any instructions employees should know?"
              className="text-sm"
            />
          </div>
          <div>
            <label>PDF attachment (optional)</label>
            <div className="flex items-center gap-2">
              <label className="btn btn-secondary inline-flex items-center gap-1 cursor-pointer !py-1.5 !text-xs">
                <Upload size={12} /> {file ? "Change file" : "Choose PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {file && (
                <span className="text-[11px] text-smoke truncate flex-1">
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </span>
              )}
            </div>
            <div className="text-[10px] text-smoke mt-1">Max 15 MB. PDF only.</div>
          </div>

          {error && (
            <div className="text-xs text-rose bg-rose/10 border border-rose/25 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-dust">
            <button type="button" onClick={onClose} className="btn btn-secondary" disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
