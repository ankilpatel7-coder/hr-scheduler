"use client";

/**
 * Break controls — fits on the clock page below the elapsed-time card.
 *
 * Two states:
 *   1. No break in progress: shows type picker (15 min / 30 min / other)
 *      + "Start break" button.
 *   2. Break in progress: live timer with target-vs-actual color coding,
 *      "End break" button.
 */

import { useEffect, useRef, useState } from "react";
import { Coffee, Play, Pause, Clock as ClockIcon, AlertCircle } from "lucide-react";

type BreakType = "SHORT_15" | "MEAL_30" | "OTHER";

type OpenBreak = {
  id: string;
  breakStart: string;
  breakType: BreakType;
};

const TYPE_META: Record<BreakType, { label: string; targetMin: number | null; color: string }> = {
  SHORT_15: { label: "15 min · paid", targetMin: 15, color: "#10b981" },
  MEAL_30:  { label: "30 min · meal (unpaid)", targetMin: 30, color: "#6366f1" },
  OTHER:    { label: "Other", targetMin: null, color: "#94a3b8" },
};

export default function BreakControls({ onChange }: { onChange?: () => void }) {
  const [openBreak, setOpenBreak] = useState<OpenBreak | null>(null);
  const [type, setType] = useState<BreakType>("SHORT_15");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const tickRef = useRef<any>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    fetch("/api/clock/break/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.openBreak) setOpenBreak(j.openBreak);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Tick timer while a break is open
  useEffect(() => {
    if (!openBreak) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    setNow(new Date());
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [openBreak]);

  async function startBreak() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/clock/break/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to start break");
      setOpenBreak({
        id: j.break.id,
        breakStart: j.break.breakStart,
        breakType: j.break.breakType,
      });
      onChange?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function endBreak() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/clock/break/end", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to end break");
      setOpenBreak(null);
      onChange?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Active break view
  if (openBreak) {
    const start = new Date(openBreak.breakStart);
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
    const elapsedMin = Math.floor(elapsedSec / 60);
    const elapsedS = elapsedSec % 60;
    const meta = TYPE_META[openBreak.breakType];
    const target = meta.targetMin;

    let tone = meta.color;
    let stateLabel = "On break";
    if (target !== null) {
      if (elapsedMin >= target) {
        tone = "#dc2626";
        stateLabel = `Over by ${elapsedMin - target} min`;
      } else if (elapsedMin >= target - 2) {
        tone = "#d97706";
        stateLabel = `Ending soon (${target - elapsedMin} min left)`;
      }
    }

    return (
      <div
        className="card p-5 mb-6"
        style={{
          background: `linear-gradient(180deg, ${tone}10 0%, ${tone}08 100%)`,
          borderColor: `${tone}40`,
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold mb-2"
              style={{ color: tone }}
            >
              <Pause size={11} />
              {stateLabel}
            </div>
            <div className="display text-4xl font-mono tabular-nums" style={{ color: tone }}>
              {String(elapsedMin).padStart(2, "0")}:{String(elapsedS).padStart(2, "0")}
            </div>
            <div className="text-[11px] text-smoke mt-1">
              {meta.label}
              {target !== null && (
                <>
                  {" · "}
                  <span className={elapsedMin >= target ? "text-red-700 font-semibold" : ""}>
                    {elapsedMin} of {target} min
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={endBreak}
            disabled={busy}
            className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play size={14} /> {busy ? "Ending…" : "Resume work"}
          </button>
        </div>
        {err && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3 inline-flex items-center gap-2">
            <AlertCircle size={13} /> {err}
          </div>
        )}
      </div>
    );
  }

  // Idle (no break) view
  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-smoke font-semibold mb-2">
            <Coffee size={11} />
            Take a break
          </div>
          <p className="text-sm text-ink">
            Use the break tracker instead of clocking out — we&rsquo;ll record actual vs.
            target duration on your timesheet.
          </p>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap mt-4">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-smoke font-semibold mb-1">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BreakType)}
            className="text-sm rounded border border-ink/10 px-3 py-2 bg-white min-w-[200px]"
          >
            <option value="SHORT_15">15 min · paid</option>
            <option value="MEAL_30">30 min · meal (unpaid)</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <button
          onClick={startBreak}
          disabled={busy}
          className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Pause size={14} /> {busy ? "Starting…" : "Start break"}
        </button>
      </div>

      {err && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mt-3 inline-flex items-center gap-2">
          <AlertCircle size={13} /> {err}
        </div>
      )}
    </div>
  );
}
