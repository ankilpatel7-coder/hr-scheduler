"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import LocationFilter from "@/components/location-filter";
import { UserPlus, X, Settings2, KeyRound, Copy, Check, Camera, ShieldCheck, Archive, Trash2, Eye, EyeOff } from "lucide-react";

type LocationRef = { id: string; name: string };

type Employee = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  department: string | null;
  active: boolean;
  archivedAt: string | null;
  hourlyWage: number;
  isTipped: boolean;
  photoUrl: string | null;
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
  const [resettingFor, setResettingFor] = useState<Employee | null>(null);
  const [locationFilter, setLocationFilter] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const role = (session?.user as any)?.role;
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const canAdd = isAdmin || isManager;
  const canEdit = isAdmin || isManager;

  async function load() {
    const params = new URLSearchParams();
    if (locationFilter) params.set("locationId", locationFilter);
    if (includeArchived) params.set("includeArchived", "true");
    const q = params.toString() ? `?${params.toString()}` : "";
    const [eRes, lRes] = await Promise.all([
      fetch(`/api/employees${q}`),
      fetch("/api/locations"),
    ]);
    if (eRes.ok) setEmployees((await eRes.json()).employees);
    if (lRes.ok)
      setLocations((await lRes.json()).locations.filter((l: Location) => l.active));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, includeArchived]);

  async function archiveEmployee(emp: Employee) {
    if (
      !confirm(
        `Archive ${emp.name}?\n\nThey will be deactivated and hidden from the list. ` +
          `Their records (clock-ins, shifts, etc.) are preserved. ` +
          `You can permanently delete them after 1 year of being archived (KY payroll record-keeping requirement).`
      )
    )
      return;
    const res = await fetch(`/api/employees?id=${emp.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Failed");
      return;
    }
    load();
  }

  async function permanentlyDelete(emp: Employee) {
    const confirmText = `PERMANENTLY DELETE ${emp.name}`;
    const typed = prompt(
      `This will PERMANENTLY DELETE ${emp.name} and ALL their records (clock-ins, shifts, time-off requests, swap history). ` +
        `This cannot be undone.\n\n` +
        `Type EXACTLY: ${confirmText}\n\nto confirm.`
    );
    if (typed !== confirmText) {
      if (typed !== null) alert("Confirmation text didn't match. Cancelled.");
      return;
    }
    const res = await fetch(`/api/employees?id=${emp.id}&hard=true`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Failed");
      return;
    }
    load();
  }

  async function unarchive(emp: Employee) {
    if (!confirm(`Restore ${emp.name}? They will be reactivated.`)) return;
    const res = await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id, active: true }),
    });
    if (!res.ok) {
      alert("Failed");
      return;
    }
    load();
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-10 animate-fade-in">
        <div className="flex items-baseline justify-between mb-10 flex-wrap gap-4 animate-slide-up">
          <div>
            <div className="label-eyebrow mb-3">People</div>
            <h1 className="display text-5xl text-ink">Employees</h1>
            {isManager && (
              <p className="text-sm text-smoke mt-2">
                Showing staff at your assigned location(s). You can add and edit Employees and Leads here.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <LocationFilter value={locationFilter} onChange={setLocationFilter} />
            <button
              type="button"
              onClick={() => setIncludeArchived((v) => !v)}
              className={`btn ${includeArchived ? "btn-primary" : "btn-secondary"} !text-xs`}
              title={includeArchived ? "Hide archived employees" : "Show archived employees"}
            >
              {includeArchived ? <EyeOff size={14} /> : <Eye size={14} />}
              {includeArchived ? "Hide archived" : "Show archived"}
            </button>
            {canAdd && (
              <button onClick={() => setShowAdd(true)} className="btn btn-primary">
                <UserPlus size={16} /> Add employee
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <div className="card overflow-x-auto animate-slide-up">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-smoke">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Dept</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">Wage</th>}
                  <th className="px-4 py-3 font-medium">Locations</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canEdit && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-dust">
                {employees.map((e) => (
                  <tr key={e.id} className="text-sm hover:bg-rust/5 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link
                        href={`/employees/${e.id}`}
                        className="flex items-center gap-3 hover:text-rust transition-colors"
                      >
                        {e.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={e.photoUrl}
                            alt={e.name}
                            className="w-7 h-7 rounded-full object-cover border border-dust flex-shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-rust/15 border border-dust flex items-center justify-center text-[10px] font-medium text-ink flex-shrink-0">
                            {e.name
                              .split(" ")
                              .map((p) => p[0])
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </div>
                        )}
                        <span>{e.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-smoke font-mono text-xs">{e.email}</td>
                    <td className="px-4 py-3 text-smoke">{e.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="chip">{e.role}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 font-mono text-ink">
                        ${e.hourlyWage.toFixed(2)}
                        {e.isTipped && (
                          <span className="text-xs text-smoke ml-1">T</span>
                        )}
                      </td>
                    )}
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
                      <span className={`chip ${e.archivedAt ? "chip-rust" : e.active ? "chip-moss" : "chip-rust"}`}>
                        {e.archivedAt ? "Archived" : e.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        {(isAdmin || (isManager && (e.role === "EMPLOYEE" || e.role === "LEAD"))) ? (
                          <div className="flex gap-1">
                            {!e.archivedAt && (
                              <>
                                <button
                                  onClick={() => setEditing(e)}
                                  className="btn btn-ghost !p-1.5"
                                  title="Edit"
                                >
                                  <Settings2 size={14} />
                                </button>
                                <button
                                  onClick={() => setResettingFor(e)}
                                  className="btn btn-ghost !p-1.5"
                                  title="Reset password"
                                >
                                  <KeyRound size={14} />
                                </button>
                                <button
                                  onClick={() => archiveEmployee(e)}
                                  className="btn btn-ghost !p-1.5 text-amber"
                                  title="Archive (soft delete)"
                                >
                                  <Archive size={14} />
                                </button>
                              </>
                            )}
                            {e.archivedAt && (
                              <>
                                <button
                                  onClick={() => unarchive(e)}
                                  className="btn btn-ghost !p-1.5"
                                  title="Restore"
                                >
                                  <Settings2 size={14} />
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => permanentlyDelete(e)}
                                    className="btn btn-ghost !p-1.5 text-rose"
                                    title="Permanently delete (1+ year archived only)"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        ) : null}
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
          viewerRole={role}
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
          viewerRole={role}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {resettingFor && (
        <ResetPasswordModal
          employee={resettingFor}
          onClose={() => setResettingFor(null)}
        />
      )}
    </div>
  );
}

function AddEmployeeModal({
  locations,
  viewerRole,
  onClose,
  onCreated,
}: {
  locations: Location[];
  viewerRole: "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  onClose: () => void;
  onCreated: () => void;
}) {
  const isAdmin = viewerRole === "ADMIN";
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    // Account
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
    department: "",
    // Personal
    phone: "",
    address: "",
    dateOfBirth: "",
    // Employment
    hireDate: "",
    employmentType: "UNSPECIFIED" as "W2" | "CONTRACTOR_1099" | "UNSPECIFIED",
    hourlyWage: "15.00",
    isTipped: false,
    // Emergency
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    // Notes (admin)
    notes: "",
    // Locations
    locationIds: [] as string[],
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const payload: any = {
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      department: form.department || null,
      locationIds: form.locationIds,
      // Profile
      photoUrl: photoPreview,
      phone: form.phone || null,
      address: form.address || null,
      dateOfBirth: form.dateOfBirth || null,
      hireDate: form.hireDate || null,
      employmentType: form.employmentType,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
      emergencyContactRelation: form.emergencyContactRelation || null,
    };
    if (isAdmin) {
      payload.hourlyWage = parseFloat(form.hourlyWage) || 0;
      payload.isTipped = form.isTipped;
      payload.notes = form.notes || null;
    }
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

  async function handlePhoto(file: File) {
    setPhotoErr(null);
    try {
      const dataUrl = await resizeImage(file, 400, 0.85);
      setPhotoPreview(dataUrl);
    } catch (err: any) {
      setPhotoErr(err?.message ?? "Failed to read image");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6 relative my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">New hire</div>
          <h2 className="display text-2xl text-ink">Add employee</h2>
          <p className="text-sm text-smoke mt-1">
            Fill in as much detail as you have. You can edit anything later from the employee's profile.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Photo + name */}
          <section>
            <div className="label-eyebrow mb-3">Account</div>
            <div className="flex gap-5 items-start">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover border-2 border-dust"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-rust/15 border-2 border-dust flex items-center justify-center text-smoke">
                    <Camera size={20} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="btn btn-ghost !text-xs !py-0.5"
                >
                  {photoPreview ? "Change" : "Upload"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhoto(f);
                  }}
                />
                {photoErr && <div className="text-[10px] text-rose">{photoErr}</div>}
              </div>

              <div className="flex-1 grid grid-cols-1 gap-3">
                <div>
                  <label>Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label>Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label>Temporary password *</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Share securely with employee"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label>Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="LEAD">Lead</option>
                  {isAdmin && <option value="MANAGER">Manager</option>}
                  {isAdmin && <option value="ADMIN">Admin</option>}
                </select>
              </div>
              <div>
                <label>Department</label>
                <input
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Front of house"
                />
              </div>
            </div>
          </section>

          {/* Personal */}
          <section>
            <div className="label-eyebrow mb-3">Personal information</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label>Date of birth</label>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label>Address</label>
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street, city, state, zip"
                />
              </div>
            </div>
          </section>

          {/* Employment */}
          <section>
            <div className="label-eyebrow mb-3">Employment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Hire date</label>
                <input
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
                />
              </div>
              <div>
                <label>Employment type</label>
                <select
                  value={form.employmentType}
                  onChange={(e) =>
                    setForm({ ...form, employmentType: e.target.value as any })
                  }
                >
                  <option value="UNSPECIFIED">Unspecified</option>
                  <option value="W2">W-2 Employee</option>
                  <option value="CONTRACTOR_1099">1099 Contractor</option>
                </select>
              </div>
              {isAdmin && (
                <>
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
                      />
                      <span>Tipped employee</span>
                    </label>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Emergency */}
          <section>
            <div className="label-eyebrow mb-3">Emergency contact</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Name</label>
                <input
                  value={form.emergencyContactName}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactName: e.target.value })
                  }
                />
              </div>
              <div>
                <label>Phone</label>
                <input
                  type="tel"
                  value={form.emergencyContactPhone}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactPhone: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2">
                <label>Relationship</label>
                <input
                  value={form.emergencyContactRelation}
                  onChange={(e) =>
                    setForm({ ...form, emergencyContactRelation: e.target.value })
                  }
                  placeholder="e.g. Spouse, Parent, Sibling"
                />
              </div>
            </div>
          </section>

          {/* Locations */}
          {locations.length > 0 && (
            <section>
              <div className="label-eyebrow mb-3">Locations they can work at</div>
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
            </section>
          )}

          {/* Internal notes (admin) */}
          {isAdmin && (
            <section>
              <div className="label-eyebrow mb-3">Internal notes</div>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Not visible to the employee. Optional."
              />
            </section>
          )}

          {err && (
            <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
              {err}
            </div>
          )}

          <div className="text-xs text-smoke text-center pb-2 border-t border-dust pt-4">
            <ShieldCheck size={12} className="inline mr-1" />
            Do not store SSN, tax forms, or banking info here. Use Gusto, ADP, or another
            payroll provider for those.
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button disabled={saving} className="btn btn-primary">
              {saving ? "Creating…" : "Create employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Browser-side image resize helper (used by Add modal photo upload).
async function resizeImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function EditEmployeeModal({
  employee,
  locations,
  viewerRole,
  onClose,
  onSaved,
}: {
  employee: Employee;
  locations: Location[];
  viewerRole: "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  onClose: () => void;
  onSaved: () => void;
}) {
  const isAdmin = viewerRole === "ADMIN";
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
    const payload: any = {
      id: employee.id,
      role: form.role,
      department: form.department,
      active: form.active,
      locationIds: form.locationIds,
    };
    if (isAdmin) {
      payload.hourlyWage = parseFloat(form.hourlyWage) || 0;
      payload.isTipped = form.isTipped;
    }
    await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
          <div className="label-eyebrow mb-1">Edit employee</div>
          <h2 className="display text-2xl text-ink">{employee.name}</h2>
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
                <option value="LEAD">Lead</option>
                {isAdmin && <option value="MANAGER">Manager</option>}
                {isAdmin && <option value="ADMIN">Admin</option>}
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
          {isAdmin && (
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
                    onChange={(e) => setForm({ ...form, isTipped: e.target.checked })}
                  />
                  <span>Tipped</span>
                </label>
              </div>
            </div>
          )}
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

function ResetPasswordModal({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState(generateTempPassword());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function generateTempPassword() {
    const adjs = ["Quick", "Bright", "Calm", "Bold", "Swift", "Lucky"];
    const nouns = ["Tiger", "Falcon", "River", "Forest", "Mountain", "Star"];
    const num = Math.floor(Math.random() * 900) + 100;
    return `${adjs[Math.floor(Math.random() * adjs.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${num}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (newPassword.length < 6) {
      setErr("Password must be at least 6 characters");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/employees/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: employee.id, newPassword }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    setDone(newPassword);
  }

  function copy() {
    navigator.clipboard.writeText(done ?? newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Admin · Reset password</div>
          <h2 className="display text-2xl text-ink">{employee.name}</h2>
          <p className="text-sm text-smoke mt-2">{employee.email}</p>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="card p-4 bg-moss/10 border-moss/30">
              <div className="flex items-center gap-2 text-moss mb-2">
                <Check size={16} />
                <span className="text-sm font-medium">Password reset successfully</span>
              </div>
              <div className="text-xs text-smoke mb-3">
                Share this password with {employee.name.split(" ")[0]} via secure channel
                (text, in-person, password manager). They can change it after first login.
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-ink bg-paper/60 px-3 py-2 rounded border border-dust select-all">
                  {done}
                </code>
                <button onClick={copy} className="btn btn-secondary !p-2" title="Copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label>New password</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setNewPassword(generateTempPassword())}
                  className="btn btn-secondary !px-3"
                  title="Generate new"
                >
                  ↻
                </button>
              </div>
              <div className="text-xs text-smoke mt-1">
                Auto-generated. Edit or click ↻ to regenerate.
              </div>
            </div>
            {err && (
              <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
                {err}
              </div>
            )}
            <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30">
              ⚠️ This invalidates any existing reset links and signs the user out of any
              active sessions on next request.
            </div>
            <button disabled={saving} className="btn btn-primary w-full">
              {saving ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
