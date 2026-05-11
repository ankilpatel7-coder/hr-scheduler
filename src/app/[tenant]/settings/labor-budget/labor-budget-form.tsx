"use client";

/**
 * Labor budget form — 7 daily inputs + optional weekly override.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";

type BudgetState = {
  budgetMon: number;
  budgetTue: number;
  budgetWed: number;
  budgetThu: number;
  budgetFri: number;
  budgetSat: number;
  budgetSun: number;
  budgetWeekly: number;
};

const DAYS: { key: keyof BudgetState; label: string }[] = [
  { key: "budgetMon", label: "Monday" },
  { key: "budgetTue", label: "Tuesday" },
  { key: "budgetWed", label: "Wednesday" },
  { key: "budgetThu", label: "Thursday" },
  { key: "budgetFri", label: "Friday" },
  { key: "budgetSat", label: "Saturday" },
  { key: "budgetSun", label: "Sunday" },
];

export default function LaborBudgetForm({
  tenantSlug: _tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: BudgetState;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<keyof BudgetState, string>>({
    budgetMon: String(initial.budgetMon ?? 0),
    budgetTue: String(initial.budgetTue ?? 0),
    budgetWed: String(initial.budgetWed ?? 0),
    budgetThu: String(initial.budgetThu ?? 0),
    budgetFri: String(initial.budgetFri ?? 0),
    budgetSat: String(initial.budgetSat ?? 0),
    budgetSun: String(initial.budgetSun ?? 0),
    budgetWeekly: String(initial.budgetWeekly ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function set(key: keyof BudgetState, v: string) {
    setState((s) => ({ ...s, [key]: v }));
  }

  const dailySum = DAYS.reduce((s, d) => s + (parseFloat(state[d.key]) || 0), 0);
  const weeklyOverride = parseFloat(state.budgetWeekly) || 0;
  const effectiveWeekly = weeklyOverride > 0 ? weeklyOverride : dailySum;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const payload: BudgetState = {
        budgetMon: parseFloat(state.budgetMon) || 0,
        budgetTue: parseFloat(state.budgetTue) || 0,
        budgetWed: parseFloat(state.budgetWed) || 0,
        budgetThu: parseFloat(state.budgetThu) || 0,
        budgetFri: parseFloat(state.budgetFri) || 0,
        budgetSat: parseFloat(state.budgetSat) || 0,
        budgetSun: parseFloat(state.budgetSun) || 0,
        budgetWeekly: parseFloat(state.budgetWeekly) || 0,
      };
      const res = await fetch("/api/labor-budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setMsg({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="card p-5">
        <h2 className="display text-lg text-ink mb-3">Per-day caps (dollars)</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {DAYS.map((d) => (
            <div key={d.key}>
              <label className="block text-xs font-medium text-ink mb-1">{d.label}</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-smoke">$</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={state[d.key]}
                  onChange={(e) => set(d.key, e.target.value)}
                  className="w-full text-sm rounded border border-ink/10 pl-6 pr-3 py-2 bg-white font-mono"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-ink/10 mt-4 pt-3 text-xs">
          <div className="flex justify-between text-smoke">
            <span>Sum of daily caps:</span>
            <span className="font-mono text-ink">${dailySum.toLocaleString()}</span>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="display text-lg text-ink mb-1">Weekly override (optional)</h2>
        <p className="text-xs text-smoke mb-3">
          Leave at <strong>0</strong> to use the sum of daily caps. If set,
          this caps the entire week regardless of how the daily caps add up.
        </p>
        <label className="block text-xs font-medium text-ink mb-1">Weekly cap</label>
        <div className="relative max-w-xs">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-smoke">$</span>
          <input
            type="number"
            step="1"
            min="0"
            value={state.budgetWeekly}
            onChange={(e) => set("budgetWeekly", e.target.value)}
            className="w-full text-sm rounded border border-ink/10 pl-6 pr-3 py-2 bg-white font-mono"
          />
        </div>
        <div className="mt-3 text-xs text-smoke">
          Effective weekly cap:{" "}
          <span className="font-mono text-ink font-medium">
            ${effectiveWeekly.toLocaleString()}
          </span>
          {weeklyOverride === 0 && dailySum > 0 && (
            <span className="ml-1 italic">(from sum of daily caps)</span>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={busy}
          className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Save size={14} />
          {busy ? "Saving…" : "Save labor budget"}
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 text-sm rounded px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {msg.text}
        </div>
      )}
    </form>
  );
}
