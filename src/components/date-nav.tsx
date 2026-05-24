"use client";

/**
 * Compact date navigation control: ◄ Today ► + calendar icon.
 *
 * Updates a single search param on the current URL via next/navigation,
 * which causes the parent server component to re-render with the new date.
 *
 *   <DateNav paramName="rosterDate" current={dateString} />
 *
 * `current` is a YYYY-MM-DD string. `paramName` is the search-param key
 * (e.g. "rosterDate" for the dashboard widget, "date" for the /today page).
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { format, addDays, parseISO, isValid } from "date-fns";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function DateNav({
  paramName,
  current,
  showLabel = true,
}: {
  paramName: string;
  current: string;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  function navigate(toDate: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (toDate === null) params.delete(paramName);
    else params.set(paramName, toDate);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  const cur = parseISO(current);
  const validCur = isValid(cur) ? cur : new Date();
  const todayStr = ymd(new Date());
  const isToday = current === todayStr;

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-1 border border-dust rounded-full px-1 py-0.5 bg-paper">
      <button
        onClick={() => navigate(ymd(addDays(validCur, -1)))}
        className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
        aria-label="Previous day"
      >
        <ChevronLeft size={14} className="text-smoke" />
      </button>
      {showLabel && (
        <button
          onClick={() => navigate(null)}
          disabled={isToday}
          className="text-[11px] text-ink px-1 hover:text-rust disabled:text-smoke disabled:hover:text-smoke transition"
        >
          {isToday ? "Today" : format(validCur, "MMM d")}
        </button>
      )}
      <button
        onClick={() => navigate(ymd(addDays(validCur, 1)))}
        className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
        aria-label="Next day"
      >
        <ChevronRight size={14} className="text-smoke" />
      </button>
      <span className="w-px h-4 bg-dust mx-0.5" />
      <button
        onClick={() => setPickerOpen((v) => !v)}
        className="w-7 h-7 rounded-full hover:bg-ink/5 flex items-center justify-center transition"
        aria-label="Pick date"
      >
        <CalendarIcon size={13} className="text-smoke" />
      </button>
      {pickerOpen && (
        <div className="absolute right-0 top-full mt-2 z-30 card p-3 shadow-lg" style={{ minWidth: 220 }}>
          <input
            type="date"
            value={current}
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                navigate(v);
                setPickerOpen(false);
              }
            }}
            className="text-sm border border-dust rounded px-2 py-1 w-full"
          />
          {!isToday && (
            <button
              onClick={() => {
                navigate(null);
                setPickerOpen(false);
              }}
              className="text-xs text-rust hover:underline mt-2 w-full text-left"
            >
              Jump back to today →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
