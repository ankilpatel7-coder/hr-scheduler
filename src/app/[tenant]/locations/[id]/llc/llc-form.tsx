"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/timezones";

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
  lat: number | null;
  lng: number | null;
  geofenceRadiusMeters: number;
  timezone: string | null;
};

const METERS_PER_MILE = 1609.344;

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
    timezone: location.timezone ?? DEFAULT_TIMEZONE,
    geofenceRadiusMiles: (
      (location.geofenceRadiusMeters ?? 1609) / METERS_PER_MILE
    ).toFixed(2),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({
    lat: location.lat,
    lng: location.lng,
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setMsg(null);
    try {
      const radiusMeters = Math.round(
        (parseFloat(form.geofenceRadiusMiles) || 1) * METERS_PER_MILE,
      );
      const { geofenceRadiusMiles, ...rest } = form;
      const res = await fetch(`/api/locations/${location.id}/llc`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, geofenceRadiusMeters: radiusMeters }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      // PATCH response includes the updated location with new lat/lng if address changed
      if (data.location) {
        setCoords({ lat: data.location.lat, lng: data.location.lng });
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

  async function regeocode() {
    setGeocoding(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/locations/${location.id}/geocode`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setGeocoding(false);
        return;
      }
      setCoords({ lat: data.location.lat, lng: data.location.lng });
      const note = data.precisionNote ? ` (${data.precisionNote})` : "";
      setMsg(
        data.matched
          ? `Geocoded: ${data.matched}${note}`
          : "Geocoded." + note,
      );
      router.refresh();
      setGeocoding(false);
      setTimeout(() => setMsg(null), 8000);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setGeocoding(false);
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

      <div className="space-y-3 border-t border-dust pt-4">
        <div className="label-eyebrow">Local timezone</div>
        <p className="text-[11px] text-smoke -mt-1">
          Used for this location&apos;s schedule, today&apos;s roster, and any payroll
          cutoffs that depend on local time. Each location can be on a different
          timezone.
        </p>
        <div>
          <label>Timezone</label>
          <select value={form.timezone} onChange={(e) => update("timezone", e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 border-t border-dust pt-4">
        <div className="label-eyebrow">Geofencing</div>
        <p className="text-[11px] text-smoke -mt-1">
          The street address above is geocoded automatically when you save. Clock-ins beyond
          the radius below are flagged as &quot;Outside location&quot; in timesheets.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label>Radius (miles)</label>
            <input
              type="number"
              step="0.05"
              min="0.05"
              max="30"
              value={form.geofenceRadiusMiles}
              onChange={(e) => update("geofenceRadiusMiles", e.target.value)}
            />
          </div>
          <div>
            <label>Coordinates (auto)</label>
            <div className="text-sm text-ink font-mono px-3 py-2 rounded border border-dust bg-paper truncate">
              {coords.lat != null && coords.lng != null
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : "Not yet geocoded"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={regeocode}
          disabled={geocoding}
          className="text-xs text-rust hover:underline disabled:text-smoke"
        >
          {geocoding ? "Re-geocoding…" : "Re-geocode address now →"}
        </button>
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
