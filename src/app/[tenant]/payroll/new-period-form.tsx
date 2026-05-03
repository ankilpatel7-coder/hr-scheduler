"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addDays, format } from "date-fns";

export default function NewPeriodForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default: most recent Sunday → +13 days, pay 5 days after period end
  const defaultStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 0) % 7) - 14); // 2 weeks ago Sunday
    return format(d, "yyyy-MM-dd");
  })();

  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(format(addDays(new Date(defaultStart), 13), "yyyy-MM-dd"));
  const [payDate, setPayDate] = useState(format(addDays(new Date(defaultStart), 18), "yyyy-MM-dd"));

  function onStartChange(v: string) {
    setPeriodStart(v);
    if (v) {
      const start = new Date(v);
      setPeriodEnd(format(addDays(start, 13), "yyyy-MM-dd"));
      setPayDate(format(addDays(start, 18), "yyyy-MM-dd"));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart, periodEnd, payDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      router.push(`/payroll/${data.period.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <Plus size={14} /> New pay period
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-4">
      <h2 className="display text-xl text-ink">New bi-weekly pay period</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label>Period start</label>
          <input type="date" required value={periodStart} onChange={(e) => onStartChange(e.target.value)} />
        </div>
        <div>
          <label>Period end</label>
          <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <div className="text-[11px] text-smoke mt-1">Auto-calculated as start + 13 days</div>
        </div>
        <div>
          <label>Pay date</label>
          <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <div className="text-[11px] text-smoke mt-1">When employees are paid</div>
        </div>
      </div>
      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>}
      <div className="flex justify-end gap-2 pt-2 border-t border-dust">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? "Creating…" : "Create period"}</button>
      </div>
    </form>
  );
}
