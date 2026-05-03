"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Lock, Printer } from "lucide-react";

export default function PeriodActions({
  periodId,
  status,
  stubCount,
}: {
  periodId: string;
  status: string;
  stubCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!confirm("Generate paystubs for every active employee with hours in this period? This will replace any existing draft stubs.")) return;
    setBusy("generate"); setError(null);
    try {
      const res = await fetch(`/api/payroll/${periodId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      router.refresh();
      setBusy(null);
    } catch (e: any) {
      setError(e?.message ?? "Network error");
      setBusy(null);
    }
  }

  async function finalize() {
    if (!confirm("Finalize this period? After finalization, paystubs cannot be regenerated and will count toward year-to-date totals.")) return;
    setBusy("finalize"); setError(null);
    try {
      const res = await fetch(`/api/payroll/${periodId}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      router.refresh();
      setBusy(null);
    } catch (e: any) {
      setError(e?.message ?? "Network error");
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "DRAFT" && (
        <>
          <button onClick={generate} disabled={!!busy} className="btn btn-secondary">
            <Calculator size={14} /> {busy === "generate" ? "Generating…" : stubCount > 0 ? "Regenerate stubs" : "Generate stubs"}
          </button>
          {stubCount > 0 && (
            <button onClick={finalize} disabled={!!busy} className="btn btn-primary">
              <Lock size={14} /> {busy === "finalize" ? "Finalizing…" : "Finalize"}
            </button>
          )}
        </>
      )}
      {status === "FINALIZED" && stubCount > 0 && (
        <button onClick={() => window.print()} className="btn btn-secondary print:hidden">
          <Printer size={14} /> Print all stubs
        </button>
      )}
      {error && <div className="text-xs text-rose">{error}</div>}
    </div>
  );
}
