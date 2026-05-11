"use client";

/**
 * Calendar events banner — fits on top of the schedule page, between the
 * labor budget bar and the day-column grid. Shows any events that overlap
 * the current week.
 *
 * Fetches its own data from /api/calendar-events.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, format } from "date-fns";
import { Calendar, AlertCircle } from "lucide-react";

type EventType = "HOLIDAY" | "MEETING" | "CLOSED" | "OTHER";

type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startDate: string;  // ISO
  endDate: string;
  color: string | null;
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
  OTHER: "Event",
};

export default function CalendarEventsBanner({
  weekStart,
  tenantSlug,
}: {
  weekStart: Date;
  tenantSlug: string;
}) {
  const [events, setEvents] = useState<CalEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const weekEnd = addDays(weekStart, 7);
    fetch(
      `/api/calendar-events?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setEvents(j.events ?? []);
      })
      .catch(() => setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  if (events === null) return null; // loading, render nothing
  if (events.length === 0) return null; // no events this week

  // Sort: CLOSED first (highest impact), then HOLIDAY, then MEETING, then OTHER
  const order: Record<EventType, number> = { CLOSED: 0, HOLIDAY: 1, MEETING: 2, OTHER: 3 };
  const sorted = [...events].sort((a, b) => order[a.type] - order[b.type]);

  return (
    <div className="mb-4 print:hidden space-y-1.5">
      {sorted.map((e) => {
        const color = e.color ?? TYPE_COLORS[e.type];
        const start = new Date(e.startDate);
        const end = new Date(e.endDate);
        const dateLabel =
          start.toDateString() === end.toDateString()
            ? format(start, "EEE, MMM d")
            : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
        return (
          <div
            key={e.id}
            className="flex items-center gap-2 px-3 py-2 rounded border-l-4 text-xs"
            style={{ borderLeftColor: color, background: `${color}10` }}
          >
            {e.type === "CLOSED" ? (
              <AlertCircle size={14} style={{ color }} />
            ) : (
              <Calendar size={14} style={{ color }} />
            )}
            <span
              className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
              style={{ color, background: `${color}15` }}
            >
              {TYPE_LABELS[e.type]}
            </span>
            <span className="font-medium text-ink">{e.title}</span>
            <span className="text-smoke">·</span>
            <span className="font-mono text-smoke">{dateLabel}</span>
            {e.description && (
              <span className="text-smoke italic truncate ml-1">
                — {e.description}
              </span>
            )}
            <Link
              href={`/${tenantSlug}/calendar`}
              className="ml-auto text-smoke hover:text-ink text-[10px] underline"
            >
              edit
            </Link>
          </div>
        );
      })}
    </div>
  );
}
