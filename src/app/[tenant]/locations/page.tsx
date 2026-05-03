"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import { MapPin, Plus, X, Pencil, Clock } from "lucide-react";

type DayHours = { open?: string; close?: string; closed?: boolean };
type Hours = {
  mon?: DayHours;
  tue?: DayHours;
  wed?: DayHours;
  thu?: DayHours;
  fri?: DayHours;
  sat?: DayHours;
  sun?: DayHours;
};

type Location = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  active: boolean;
  hours: Hours | null;
  _count: { employees: number };
};

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

const DEFAULT_HOURS: Hours = {
  mon: { open: "09:00", close: "21:00", closed: false },
  tue: { open: "09:00", close: "21:00", closed: false },
  wed: { open: "09:00", close: "21:00", closed: false },
  thu: { open: "09:00", close: "21:00", closed: false },
  fri: { open: "09:00", close: "21:00", closed: false },
  sat: { open: "09:00", close: "21:00", closed: false },
  sun: { open: "10:00", close: "18:00", closed: false },
};

export default function LocationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && (session?.user as any)?.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  async function load() {
    const res = await fetch("/api/locations");
    if (res.ok) {
      const data = await res.json();
      setLocations(data.locations);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(id: string, active: boolean) {
    await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    load();
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              Your operations
            </div>
            <h1 className="display text-5xl">Locations</h1>
          </div>
          <Link
            href={`/${params?.tenant}/locations/llc`}
            className="btn btn-secondary"
            title="Edit LLC / payroll-issuer info per location"
          >
            💼 Manage LLC info
          </Link>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">
            <Plus size={16} /> Add location
          </button>
        </div>

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : locations.length === 0 ? (
          <div className="card p-8 text-center text-smoke italic">
            No locations yet. Add your first location above.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {locations.map((l) => (
              <div
                key={l.id}
                className={`card p-5 ${!l.active ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin size={16} className="text-rust" />
                      <h3 className="display text-xl">{l.name}</h3>
                    </div>
                    {l.address && (
                      <div className="text-sm text-smoke">{l.address}</div>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-smoke">
                      <span>{l._count.employees} staff assigned</span>
                      <span className="w-1 h-1 rounded-full bg-smoke" />
                      <span>{l.timezone}</span>
                    </div>
                    {l.hours && <HoursPreview hours={l.hours} />}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <button
                      onClick={() => toggleActive(l.id, !l.active)}
                      className={`chip cursor-pointer ${
                        l.active ? "chip-moss" : "chip-rust"
                      }`}
                    >
                      {l.active ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => setEditing(l)}
                      className="btn btn-ghost !p-1.5"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAdd && (
        <AddLocationModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {editing && (
        <EditLocationModal
          location={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function HoursPreview({ hours }: { hours: Hours }) {
  return (
    <div className="mt-3 pt-3 border-t border-dust">
      <div className="text-[10px] uppercase tracking-[0.15em] text-smoke font-medium mb-1.5 flex items-center gap-1.5">
        <Clock size={10} /> Store hours
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] text-smoke">
        {DAYS.map((d) => {
          const h = hours[d.key];
          return (
            <div key={d.key} className="text-center">
              <div className="font-medium text-ink">{d.label.slice(0, 3)}</div>
              {h?.closed ? (
                <div className="text-rose">Closed</div>
              ) : h?.open && h?.close ? (
                <div className="font-mono">
                  {fmt(h.open)}–{fmt(h.close)}
                </div>
              ) : (
                <div className="text-smoke italic">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmt(t: string) {
  // 09:00 -> 9a, 21:00 -> 9p
  const [hh] = t.split(":");
  const n = parseInt(hh, 10);
  if (n === 0) return "12a";
  if (n === 12) return "12p";
  if (n < 12) return `${n}a`;
  return `${n - 12}p`;
}

function AddLocationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    address: "",
    timezone: "America/New_York",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      setSaving(false);
      return;
    }
    // After create, set default hours
    const created = await res.json();
    await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: created.location.id, hours: DEFAULT_HOURS }),
    });
    setSaving(false);
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">New site</div>
          <h2 className="display text-2xl text-ink">Add location</h2>
          <p className="text-sm text-smoke mt-1">
            Default hours (9 AM – 9 PM, Sun 10 AM – 6 PM) will be set; you can edit them after.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bedford store"
            />
          </div>
          <div>
            <label>Address</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label>Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              <option value="America/New_York">Eastern (NY)</option>
              <option value="America/Chicago">Central (Chicago)</option>
              <option value="America/Denver">Mountain (Denver)</option>
              <option value="America/Los_Angeles">Pacific (LA)</option>
              <option value="America/Phoenix">Arizona</option>
              <option value="America/Anchorage">Alaska</option>
              <option value="Pacific/Honolulu">Hawaii</option>
            </select>
          </div>
          {err && (
            <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
              {err}
            </div>
          )}
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Creating…" : "Create location"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditLocationModal({
  location,
  onClose,
  onSaved,
}: {
  location: Location;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: location.name,
    address: location.address ?? "",
    timezone: location.timezone,
  });
  const [hours, setHours] = useState<Hours>(location.hours ?? DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setDayField(dayKey: keyof Hours, field: "open" | "close" | "closed", value: any) {
    setHours((prev) => ({
      ...prev,
      [dayKey]: { ...(prev[dayKey] ?? {}), [field]: value },
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: location.id,
        name: form.name,
        address: form.address || null,
        timezone: form.timezone,
        hours,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6 relative my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Edit location</div>
          <h2 className="display text-2xl text-ink">{location.name}</h2>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <section>
            <div className="label-eyebrow mb-3">Details</div>
            <div className="space-y-3">
              <div>
                <label>Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label>Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div>
                <label>Timezone</label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                >
                  <option value="America/New_York">Eastern (NY)</option>
                  <option value="America/Chicago">Central (Chicago)</option>
                  <option value="America/Denver">Mountain (Denver)</option>
                  <option value="America/Los_Angeles">Pacific (LA)</option>
                  <option value="America/Phoenix">Arizona</option>
                  <option value="America/Anchorage">Alaska</option>
                  <option value="Pacific/Honolulu">Hawaii</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <div className="label-eyebrow mb-3 flex items-center gap-2">
              <Clock size={12} /> Store hours
            </div>
            <div className="space-y-2">
              {DAYS.map((d) => {
                const h = hours[d.key] ?? {};
                return (
                  <div
                    key={d.key}
                    className="grid grid-cols-[80px_auto_auto_auto] gap-3 items-center"
                  >
                    <div className="text-sm font-medium text-ink">{d.label}</div>
                    <label className="flex items-center gap-2 !mb-0 text-xs">
                      <input
                        type="checkbox"
                        checked={!!h.closed}
                        onChange={(e) => setDayField(d.key, "closed", e.target.checked)}
                      />
                      <span>Closed</span>
                    </label>
                    <input
                      type="time"
                      value={h.open ?? "09:00"}
                      onChange={(e) => setDayField(d.key, "open", e.target.value)}
                      disabled={!!h.closed}
                      className="!w-auto !py-1.5 !text-sm"
                    />
                    <input
                      type="time"
                      value={h.close ?? "21:00"}
                      onChange={(e) => setDayField(d.key, "close", e.target.value)}
                      disabled={!!h.closed}
                      className="!w-auto !py-1.5 !text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {err && (
            <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button disabled={saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
