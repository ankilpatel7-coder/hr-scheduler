"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type Location = {
  id: string;
  name: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  locState: string | null;
  zip: string | null;
  phone: string | null;
  federalEIN: string | null;
  stateTaxId: string | null;
};

export default function LlcForm({ location }: { location: Location }) {
  const router = useRouter();
  const [form, setForm] = useState({
    legalName: location.legalName ?? "",
    addressLine1: location.addressLine1 ?? "",
    addressLine2: location.addressLine2 ?? "",
    city: location.city ?? "",
    locState: location.locState ?? "KY",
    zip: location.zip ?? "",
    phone: location.phone ?? "",
    federalEIN: location.federalEIN ?? "",
    stateTaxId: location.stateTaxId ?? "",
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
      const res = await fetch(`/api/locations/${location.id}/llc`, {
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
      <div className="space-y-3">
        <div className="label-eyebrow">Business identity</div>
        <div>
          <label>Legal name (LLC) *</label>
          <input
            type="text"
            value={form.legalName}
            onChange={(e) => update("legalName", e.target.value)}
            placeholder="Reed KY Dispensary LLC"
          />
        </div>
        <div>
          <label>Federal EIN (9 digits)</label>
          <input
            type="text"
            value={form.federalEIN}
            onChange={(e) => update("federalEIN", e.target.value.replace(/\D/g, ""))}
            placeholder="123456789"
            maxLength={9}
          />
        </div>
        <div>
          <label>State tax ID</label>
          <input
            type="text"
            value={form.stateTaxId}
            onChange={(e) => update("stateTaxId", e.target.value)}
            placeholder="KY withholding account number"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-dust pt-4">
        <div className="label-eyebrow">Mailing address</div>
        <div>
          <label>Street address</label>
          <input type="text" value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} placeholder="1900 Murphy Ave Ext" />
        </div>
        <div>
          <label>Address line 2 (optional)</label>
          <input type="text" value={form.addressLine2} onChange={(e) => update("addressLine2", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label>City</label>
            <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Ferguson" />
          </div>
          <div>
            <label>State</label>
            <select value={form.locState} onChange={(e) => update("locState", e.target.value)}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label>ZIP</label>
            <input type="text" value={form.zip} onChange={(e) => update("zip", e.target.value)} placeholder="42533" maxLength={10} />
          </div>
        </div>
        <div>
          <label>Phone</label>
          <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </div>
      </div>

      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">{error}</div>}
      {msg && <div className="text-sm" style={{ color: "#059669" }}>{msg}</div>}

      <div className="flex justify-end pt-2 border-t border-dust">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Saving…" : "Save LLC info"}
        </button>
      </div>
    </form>
  );
}
