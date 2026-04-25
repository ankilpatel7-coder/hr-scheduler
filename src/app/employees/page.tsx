"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { UserPlus, X, Settings2 } from "lucide-react";

type LocationRef = { id: string; name: string };

type Employee = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  department: string | null;
  active: boolean;
  hourlyWage: number;
  isTipped: boolean;
  createdAt: string;
  locations: { location: LocationRef }[];
};

type Location = { id: string; name: string; active: boolean };

export default function EmployeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  async function load() {
    const [eRes, lRes] = await Promise.all([
      fetch("/api/employees"),
      fetch("/api/locations"),
    ]);
    if (eRes.ok) setEmployees((await eRes.json()).employees);
    if (lRes.ok) setLocations((await lRes.json()).locations.filter((l: Location) => l.active));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const isAdmin = (session?.user as any)?.role === "ADMIN";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              People
            </div>
            <h1 className="display text-5xl">Employees</h1>
          </div>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)} className="btn btn-primary">
              <UserPlus size={16} /> Add employee
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-dust/30">
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-smoke">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Dept</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Wage</th>
                  <th className="px-4 py-3 font-medium">Locations</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-dust">
                {employees.map((e) => (
                  <tr key={e.id} className="text-sm">
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3 text-smoke font-mono text-xs">
                      {e.email}
                    </td>
                    <td className="px-4 py-3 text-smoke">{e.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="chip">{e.role}</span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      ${e.hourlyWage.toFixed(2)}
                      {e.isTipped && <span className="text-xs text-smoke ml-1">T</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {e.locations.length === 0 ? (
                        <span className="text-smoke italic">none</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {e.locations.map((l) => (
                            <span key={l.location.id} className="chip text-[10px]">
                              {l.location.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`chip ${e.active ? "chip-moss" : "chip-rust"}`}
                      >
                        {e.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEditing(e)}
                          className="btn btn-ghost !p-1.5"
                          title="Edit"
                        >
                          <Settings2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 && (
              <div className="p-8 text-center text-sm text-smoke italic">
                No employees yet.
              </div>
            )}
          </div>
        )}
      </main>

      {showAdd && (
        <AddEmployeeModal
          locations={locations}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
      {editing && (
        <EditEmployeeModal
          employee={editing}
          locations={locations}
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

function AddEmployeeModal({
  locations,
  onClose,
  onCreated,
}: {
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
    department: "",
    hourlyWage: "15.00",
    isTipped: false,
    locationIds: [] as string[],
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hourlyWage: parseFloat(form.hourlyWage) || 0,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    onCreated();
  }

  function toggleLoc(id: string) {
    setForm((f) => ({
      ...f,
      locationIds: f.locationIds.includes(id)
        ? f.locationIds.filter((x) => x !== id)
        : [...f.locationIds, id],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6 overflow-y-auto">
      <div className="card w-full max-w-md p-6 relative my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            New hire
          </div>
          <h2 className="display text-2xl">Add employee</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label>Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label>Temporary password</label>
            <input
              type="text"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label>Department</label>
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Hourly wage</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.hourlyWage}
                onChange={(e) => setForm({ ...form, hourlyWage: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 !mb-0">
                <input
                  type="checkbox"
                  checked={form.isTipped}
                  onChange={(e) =>
                    setForm({ ...form, isTipped: e.target.checked })
                  }
                  className="!w-auto"
                />
                <span>Tipped employee</span>
              </label>
            </div>
          </div>
          {locations.length > 0 && (
            <div>
              <label>Locations they can work at</label>
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLoc(l.id)}
                    className={`chip cursor-pointer ${
                      form.locationIds.includes(l.id) ? "chip-moss" : ""
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {err && (
            <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
              {err}
            </div>
          )}
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Creating…" : "Create employee"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EditEmployeeModal({
  employee,
  locations,
  onClose,
  onSaved,
}: {
  employee: Employee;
  locations: Location[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    role: employee.role,
    department: employee.department ?? "",
    hourlyWage: employee.hourlyWage.toString(),
    isTipped: employee.isTipped,
    active: employee.active,
    locationIds: employee.locations.map((l) => l.location.id),
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: employee.id,
        ...form,
        hourlyWage: parseFloat(form.hourlyWage) || 0,
      }),
    });
    setSaving(false);
    onSaved();
  }

  function toggleLoc(id: string) {
    setForm((f) => ({
      ...f,
      locationIds: f.locationIds.includes(id)
        ? f.locationIds.filter((x) => x !== id)
        : [...f.locationIds, id],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6 overflow-y-auto">
      <div className="card w-full max-w-md p-6 relative my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            Edit employee
          </div>
          <h2 className="display text-2xl">{employee.name}</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as any })}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label>Department</label>
              <input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Hourly wage</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.hourlyWage}
                onChange={(e) => setForm({ ...form, hourlyWage: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 !mb-0">
                <input
                  type="checkbox"
                  checked={form.isTipped}
                  onChange={(e) =>
                    setForm({ ...form, isTipped: e.target.checked })
                  }
                  className="!w-auto"
                />
                <span>Tipped</span>
              </label>
            </div>
          </div>
          {locations.length > 0 && (
            <div>
              <label>Locations they can work at</label>
              <div className="flex flex-wrap gap-2">
                {locations.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLoc(l.id)}
                    className={`chip cursor-pointer ${
                      form.locationIds.includes(l.id) ? "chip-moss" : ""
                    }`}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 !mb-0">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="!w-auto"
              />
              <span>Active (can log in)</span>
            </label>
          </div>
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
