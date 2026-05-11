"use client";

/**
 * Per-employee payroll setup form. Drives:
 *   - primaryLocationId  → determines paystub LLC (legalName, EIN) +
 *                           tax state (locState)
 *   - localTaxJurisdiction → e.g. LOUISVILLE_METRO (2.20% occupational tax)
 *   - pre-tax deductions  → 401(k) %, 401(k) $, health, HSA, FSA
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";

type LocationOption = {
  id: string;
  name: string;
  locState: string | null;
  legalName: string | null;
};

type JurisdictionOption = { code: string; label: string; state: string };

type Initial = {
  primaryLocationId: string | null;
  primaryLocationLabel: string | null;
  primaryLocationState: string | null;
  localTaxJurisdiction: string | null;
  preTax401kPercent: number;
  preTax401kAmount: number;
  preTaxHealthPremium: number;
  preTaxHsaAmount: number;
  preTaxFsaAmount: number;
};

export default function PayrollSetupForm({
  employeeId,
  tenantSlug,
  tenantState,
  locations,
  jurisdictions,
  initial,
}: {
  employeeId: string;
  tenantSlug: string;
  tenantState: string;
  locations: LocationOption[];
  jurisdictions: JurisdictionOption[];
  initial: Initial;
}) {
  const router = useRouter();
  const [primaryLocationId, setPrimaryLocationId] = useState<string | "">(
    initial.primaryLocationId ?? "",
  );
  const [localTaxJurisdiction, setLocalTaxJurisdiction] = useState<string | "">(
    initial.localTaxJurisdiction ?? "",
  );
  const [preTax401kPercent, setPreTax401kPercent] = useState(
    String(initial.preTax401kPercent ?? 0),
  );
  const [preTax401kAmount, setPreTax401kAmount] = useState(
    String(initial.preTax401kAmount ?? 0),
  );
  const [preTaxHealth, setPreTaxHealth] = useState(
    String(initial.preTaxHealthPremium ?? 0),
  );
  const [preTaxHsa, setPreTaxHsa] = useState(String(initial.preTaxHsaAmount ?? 0));
  const [preTaxFsa, setPreTaxFsa] = useState(String(initial.preTaxFsaAmount ?? 0));

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Derive the effective tax state preview based on selected primary location
  const selectedLoc = locations.find((l) => l.id === primaryLocationId);
  const effectiveState = selectedLoc?.locState ?? tenantState;

  // Filter jurisdictions to those matching the effective state, plus a "None" option
  const availableJurisdictions = jurisdictions.filter(
    (j) => j.state === effectiveState,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/payroll-setup`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryLocationId: primaryLocationId || null,
          localTaxJurisdiction: localTaxJurisdiction || null,
          preTax401kPercent: parseFloat(preTax401kPercent) || 0,
          preTax401kAmount: parseFloat(preTax401kAmount) || 0,
          preTaxHealthPremium: parseFloat(preTaxHealth) || 0,
          preTaxHsaAmount: parseFloat(preTaxHsa) || 0,
          preTaxFsaAmount: parseFloat(preTaxFsa) || 0,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setMsg({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* === Primary location + tax state === */}
      <section className="card p-5">
        <h2 className="display text-lg text-ink mb-1">Paystub issuer &amp; tax state</h2>
        <p className="text-xs text-smoke mb-4">
          Pick the location whose LLC issues this employee&rsquo;s paystub. The
          location&rsquo;s state determines which state taxes apply.
        </p>

        <label className="block text-xs font-medium text-ink mb-1">
          Primary location
        </label>
        <select
          value={primaryLocationId}
          onChange={(e) => {
            setPrimaryLocationId(e.target.value);
            // Clear local jurisdiction if it doesn't match the new state
            const newLoc = locations.find((l) => l.id === e.target.value);
            const newState = newLoc?.locState ?? tenantState;
            const stillValid = jurisdictions.some(
              (j) => j.code === localTaxJurisdiction && j.state === newState,
            );
            if (!stillValid) setLocalTaxJurisdiction("");
          }}
          className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
        >
          <option value="">(none — fall back to tenant defaults)</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.locState ? ` · ${l.locState}` : ""}
              {l.legalName ? ` · ${l.legalName}` : ""}
            </option>
          ))}
        </select>

        <div className="mt-3 text-xs text-smoke">
          <span className="font-medium text-ink">Effective tax state:</span>{" "}
          <span className="font-mono">{effectiveState}</span>
          {!selectedLoc && (
            <span className="ml-2 italic">(from tenant default)</span>
          )}
        </div>
      </section>

      {/* === Local tax jurisdiction === */}
      <section className="card p-5">
        <h2 className="display text-lg text-ink mb-1">Local / city tax</h2>
        <p className="text-xs text-smoke mb-4">
          Some cities and counties levy an occupational or local income tax in
          addition to state withholding. Only jurisdictions matching the
          effective state ({effectiveState}) are shown.
        </p>

        <label className="block text-xs font-medium text-ink mb-1">
          Local tax jurisdiction
        </label>
        <select
          value={localTaxJurisdiction}
          onChange={(e) => setLocalTaxJurisdiction(e.target.value)}
          className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
          disabled={availableJurisdictions.length === 0}
        >
          <option value="">None</option>
          {availableJurisdictions.map((j) => (
            <option key={j.code} value={j.code}>
              {j.label}
            </option>
          ))}
        </select>
        {availableJurisdictions.length === 0 && (
          <p className="text-[11px] text-smoke italic mt-2">
            No local jurisdictions configured for {effectiveState} yet.
          </p>
        )}
      </section>

      {/* === Pre-tax deductions === */}
      <section className="card p-5">
        <h2 className="display text-lg text-ink mb-1">Pre-tax deductions</h2>
        <p className="text-xs text-smoke mb-4">
          All amounts are <strong>per pay period</strong> (biweekly). 401(k) percent
          takes precedence over the fixed amount when both are set.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              401(k) percent of gross
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={preTax401kPercent}
                onChange={(e) => setPreTax401kPercent(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white pr-7"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-smoke">
                %
              </span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              401(k) fixed amount per period
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-smoke">
                $
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={preTax401kAmount}
                onChange={(e) => setPreTax401kAmount(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 pl-6 pr-3 py-2 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Health insurance premium (Section 125)
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-smoke">
                $
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={preTaxHealth}
                onChange={(e) => setPreTaxHealth(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 pl-6 pr-3 py-2 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              HSA contribution
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-smoke">
                $
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={preTaxHsa}
                onChange={(e) => setPreTaxHsa(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 pl-6 pr-3 py-2 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              FSA contribution
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-smoke">
                $
              </span>
              <input
                type="number"
                step="1"
                min="0"
                value={preTaxFsa}
                onChange={(e) => setPreTaxFsa(e.target.value)}
                className="w-full text-sm rounded border border-ink/10 pl-6 pr-3 py-2 bg-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-smoke leading-relaxed">
          <strong className="text-ink">Tax flow:</strong> 401(k) traditional reduces
          federal &amp; state taxable wages but not FICA. Section&nbsp;125 deductions
          (health, HSA, FSA) reduce federal, FICA, and state taxable wages.
        </div>
      </section>

      <div className="flex items-center justify-between">
        <a
          href={`/${tenantSlug}/employees/${employeeId}`}
          className="text-xs text-smoke hover:underline"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={busy}
          className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Save size={14} />
          {busy ? "Saving…" : "Save payroll setup"}
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
