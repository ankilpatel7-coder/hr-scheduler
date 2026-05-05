"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type Tenant = {
  id: string;
  slug: string;
  businessName: string;
  legalName: string | null;
  state: string;
  timezone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  federalEIN: string | null;
  stateTaxId: string | null;
  active: boolean;
};

export default function TenantEditForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    businessName: tenant.businessName,
    legalName: tenant.legalName ?? "",
    state: tenant.state,
    timezone: tenant.timezone ?? DEFAULT_TIMEZONE,
    addressLine1: tenant.addressLine1 ?? "",
    addressLine2: tenant.addressLine2 ?? "",
    city: tenant.city ?? "",
    zip: tenant.zip ?? "",
    phone: tenant.phone ?? "",
    federalEIN: tenant.federalEIN ?? "",
    stateTaxId: tenant.stateTaxId ?? "",
    active: tenant.active,
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenant.id}`, {
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
      setMsg("Saved.");
      setSaving(false);
      router.refresh();
      setTimeout(() => setMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSaving(false);
    }
  }

  async function onToggleActive() {
    if (!confirm(form.active ? "Deactivate this tenant? Users won't be able to log in until reactivated." : "Reactivate this tenant?")) return;
    update("active", !form.active);
    // Save immediately
    setSaving(true);
    try {
      await fetch(`/api/superadmin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !form.active }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="card p-6 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-2xl text-ink">Edit details</h2>
        <button
          type="button"
          onClick={onToggleActive}
          className={form.active ? "text-rose hover:underline text-sm" : "text-emerald-600 hover:underline text-sm"}
        >
          {form.active ? "Deactivate tenant" : "Reactivate tenant"}
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label>Business name</label>
          <input type="text" value={form.businessName} onChange={(e) => update("businessName", e.target.value)} required />
        </div>
        <div>
          <label>Legal name</label>
          <input type="text" value={form.legalName} onChange={(e) => update("legalName", e.target.value)} />
        </div>
        <div>
          <label>State</label>
          <select value={form.state} onChange={(e) => update("state", e.target.value)}>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>Timezone</label>
          <select value={form.timezone} onChange={(e) => update("timezone", e.target.value)}>
            {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
          </select>
          <div className="text-[11px] text-smoke mt-1">
            Used for &quot;today&quot;, week boundaries, payroll cutoffs. Stored as IANA tz; current value: <code className="font-mono">{form.timezone}</code>
          </div>
        </div>
        <div>
          <label>Street address</label>
          <input type="text" value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label>City</label>
            <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <label>ZIP</label>
            <input type="text" value={form.zip} onChange={(e) => update("zip", e.target.value)} maxLength={10} />
          </div>
        </div>
        <div>
          <label>Phone</label>
          <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </div>
        <div>
          <label>Federal EIN</label>
          <input type="text" value={form.federalEIN} onChange={(e) => update("federalEIN", e.target.value.replace(/\D/g, ""))} maxLength={9} />
        </div>
        <div>
          <label>State tax ID</label>
          <input type="text" value={form.stateTaxId} onChange={(e) => update("stateTaxId", e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>
      )}
      {msg && (
        <div className="text-sm" style={{ color: "#059669" }}>{msg}</div>
      )}

      <div className="flex justify-end pt-2 border-t border-dust">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
