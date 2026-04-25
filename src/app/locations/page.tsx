"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { MapPin, Plus, X } from "lucide-react";

type Location = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  active: boolean;
  _count: { employees: number };
};

export default function LocationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

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
                  </div>
                  <button
                    onClick={() => toggleActive(l.id, !l.active)}
                    className={`chip cursor-pointer ${
                      l.active ? "chip-moss" : "chip-rust"
                    }`}
                  >
                    {l.active ? "Active" : "Inactive"}
                  </button>
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
    </div>
  );
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
    setErr(null);
    setSaving(true);
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            New location
          </div>
          <h2 className="display text-2xl">Add a location</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Name</label>
            <input
              required
              placeholder="e.g. Main Street Store"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label>Address (optional)</label>
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
              <option value="America/New_York">Eastern (New York)</option>
              <option value="America/Chicago">Central (Chicago)</option>
              <option value="America/Denver">Mountain (Denver)</option>
              <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
              <option value="America/Anchorage">Alaska</option>
              <option value="Pacific/Honolulu">Hawaii</option>
            </select>
          </div>
          {err && (
            <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
              {err}
            </div>
          )}
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Create location"}
          </button>
        </form>
      </div>
    </div>
  );
}
