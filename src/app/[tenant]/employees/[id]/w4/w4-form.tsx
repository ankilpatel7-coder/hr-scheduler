"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Employee = {
  id: string;
  name: string;
  filingStatus: "SINGLE" | "MARRIED_JOINT" | "MARRIED_SEPARATE" | "HEAD_OF_HOUSEHOLD";
  multipleJobsCheckbox: boolean;
  dependentsCredit: number;
  otherIncome: number;
  deductionsAdjustment: number;
  extraWithholding: number;
  kyExemptionsAllowance: number | null;
};

export default function W4Form({ employee, state }: { employee: Employee; state: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    filingStatus: employee.filingStatus,
    multipleJobsCheckbox: employee.multipleJobsCheckbox,
    dependentsCredit: employee.dependentsCredit,
    otherIncome: employee.otherIncome,
    deductionsAdjustment: employee.deductionsAdjustment,
    extraWithholding: employee.extraWithholding,
    kyExemptionsAllowance: employee.kyExemptionsAllowance ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setMsg(null);
    try {
      const res = await fetch(`/api/employees/${employee.id}/w4`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      setMsg("Saved. Future paystubs will use these values.");
      router.refresh();
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5">
      <div>
        <div className="label-eyebrow mb-2">Federal W-4 (post-2020 form)</div>
        <div className="space-y-4">
          <div>
            <label>Step 1c — Filing status *</label>
            <select value={form.filingStatus} onChange={(e) => update("filingStatus", e.target.value as any)}>
              <option value="SINGLE">Single or Married filing separately</option>
              <option value="MARRIED_JOINT">Married filing jointly (or Qualifying surviving spouse)</option>
              <option value="MARRIED_SEPARATE">Married filing separately</option>
              <option value="HEAD_OF_HOUSEHOLD">Head of household</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.multipleJobsCheckbox}
                onChange={(e) => update("multipleJobsCheckbox", e.target.checked)}
                className="!w-auto"
              />
              <span>Step 2c — Multiple jobs / spouse works</span>
            </label>
            <div className="text-[11px] text-smoke mt-1 ml-6">
              Check if employee has more than one job, OR is married filing jointly and spouse also works. Increases withholding.
            </div>
          </div>

          <div>
            <label>Step 3 — Dependents credit (annual $)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.dependentsCredit}
              onChange={(e) => update("dependentsCredit", parseFloat(e.target.value) || 0)}
            />
            <div className="text-[11px] text-smoke mt-1">
              $2,000 per qualifying child under 17, plus $500 for each other dependent. Total per year.
            </div>
          </div>

          <div>
            <label>Step 4a — Other income (annual $)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.otherIncome}
              onChange={(e) => update("otherIncome", parseFloat(e.target.value) || 0)}
            />
            <div className="text-[11px] text-smoke mt-1">
              Income not from jobs (interest, dividends, retirement). Increases withholding.
            </div>
          </div>

          <div>
            <label>Step 4b — Deductions adjustment (annual $)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.deductionsAdjustment}
              onChange={(e) => update("deductionsAdjustment", parseFloat(e.target.value) || 0)}
            />
            <div className="text-[11px] text-smoke mt-1">
              Itemized deductions over the standard deduction. Reduces withholding.
            </div>
          </div>

          <div>
            <label>Step 4c — Extra withholding per pay period ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.extraWithholding}
              onChange={(e) => update("extraWithholding", parseFloat(e.target.value) || 0)}
            />
            <div className="text-[11px] text-smoke mt-1">
              Additional flat amount to withhold each pay period (bi-weekly). Direct dollars added to federal withholding.
            </div>
          </div>
        </div>
      </div>

      {state === "KY" && (
        <div className="border-t border-dust pt-5">
          <div className="label-eyebrow mb-2">Kentucky K-4 (state withholding)</div>
          <div>
            <label>K-4 exemption allowances (number)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.kyExemptionsAllowance}
              onChange={(e) => update("kyExemptionsAllowance", parseInt(e.target.value) || 0)}
            />
            <div className="text-[11px] text-smoke mt-1">
              Number of exemptions claimed on KY DOR Form K-4. Most employees enter 0 (post-2018 reform eliminated personal exemption); set higher only if employee has filed Form K-4 claiming dependent exemptions. Each allowance reduces KY taxable wages by ~$2,690/year.
            </div>
          </div>
        </div>
      )}

      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>}
      {msg && <div className="text-sm" style={{ color: "#059669" }}>{msg}</div>}

      <div className="flex justify-end pt-2 border-t border-dust">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : "Save W-4 settings"}
        </button>
      </div>
    </form>
  );
}
