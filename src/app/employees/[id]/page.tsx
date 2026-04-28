"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/navbar";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  DollarSign,
  AlertTriangle,
  Camera,
  Edit3,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

type Profile = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "LEAD" | "EMPLOYEE";
  department: string | null;
  active: boolean;
  hourlyWage: number;
  isTipped: boolean;
  photoUrl: string | null;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  hireDate: string | null;
  employmentType: "W2" | "CONTRACTOR_1099" | "UNSPECIFIED";
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  notes: string | null;
  locations: { location: { id: string; name: string } }[];
};

export default function EmployeeProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [canEditAll, setCanEditAll] = useState(false);
  const [canEditSelf, setCanEditSelf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [recent, setRecent] = useState<{ shifts: any[]; clockEntries: any[] }>({
    shifts: [],
    clockEntries: [],
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/employees/${id}`);
    if (res.ok) {
      const d = await res.json();
      setProfile(d.user);
      setCanEditAll(d.canEditAll);
      setCanEditSelf(d.canEditSelf);
    } else {
      router.push("/employees");
    }
    // Recent activity
    const past = new Date(Date.now() - 30 * 86400_000).toISOString();
    const future = new Date(Date.now() + 60 * 86400_000).toISOString();
    const [sRes, cRes] = await Promise.all([
      fetch(`/api/shifts?from=${past}&to=${future}`),
      fetch(`/api/timesheets?from=${past}&to=${new Date().toISOString()}&employeeId=${id}`),
    ]);
    const sData = sRes.ok ? await sRes.json() : { shifts: [] };
    const cData = cRes.ok ? await cRes.json() : { entries: [] };
    setRecent({
      shifts: (sData.shifts ?? []).filter((s: any) => s.employeeId === id).slice(0, 10),
      clockEntries: (cData.entries ?? []).slice(0, 10),
    });
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const role = (session?.user as any)?.role;
  const isAdmin = role === "ADMIN";

  if (loading || !profile) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 py-16 text-center text-smoke">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10 animate-fade-in">
        <Link
          href={isAdmin || role === "MANAGER" ? "/employees" : "/dashboard"}
          className="inline-flex items-center gap-2 text-sm text-smoke hover:text-rust transition-colors mb-8"
        >
          <ArrowLeft size={14} /> Back
        </Link>

        {/* Hero */}
        <div className="card p-7 mb-6 animate-slide-up">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <PhotoBlock
              profile={profile}
              canEdit={canEditAll || canEditSelf}
              onUpdated={load}
            />
            <div className="flex-1 min-w-0">
              <div className="label-eyebrow mb-2 flex items-center gap-2">
                <span>{profile.role}</span>
                {profile.active ? (
                  <span className="chip chip-moss text-[9px]">active</span>
                ) : (
                  <span className="chip chip-rust text-[9px]">inactive</span>
                )}
              </div>
              <h1 className="display text-4xl text-ink mb-2">{profile.name}</h1>
              <div className="text-smoke text-sm flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Mail size={13} /> {profile.email}
                </span>
                {profile.phone && (
                  <>
                    <span className="text-smoke">·</span>
                    <span className="flex items-center gap-1.5">
                      <Phone size={13} /> {profile.phone}
                    </span>
                  </>
                )}
                {profile.department && (
                  <>
                    <span className="text-smoke">·</span>
                    <span>{profile.department}</span>
                  </>
                )}
              </div>

              {profile.locations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {profile.locations.map((l) => (
                    <span key={l.location.id} className="chip text-[10px]">
                      <MapPin size={10} className="inline mr-1" />
                      {l.location.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {(canEditAll || canEditSelf) && (
                <button
                  onClick={() => setEditing(true)}
                  className="btn btn-secondary"
                >
                  <Edit3 size={14} /> Edit
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Personal info */}
          <Card title="Personal information">
            <Field
              icon={<Calendar size={14} />}
              label="Date of birth"
              value={
                profile.dateOfBirth
                  ? format(new Date(profile.dateOfBirth), "MMM d, yyyy")
                  : null
              }
            />
            <Field
              icon={<MapPin size={14} />}
              label="Address"
              value={profile.address}
              multiline
            />
          </Card>

          {/* Emergency contact */}
          <Card title="Emergency contact">
            <Field label="Name" value={profile.emergencyContactName} />
            <Field
              icon={<Phone size={14} />}
              label="Phone"
              value={profile.emergencyContactPhone}
            />
            <Field label="Relationship" value={profile.emergencyContactRelation} />
          </Card>

          {/* Employment */}
          <Card title="Employment">
            <Field
              icon={<Calendar size={14} />}
              label="Hire date"
              value={
                profile.hireDate
                  ? format(new Date(profile.hireDate), "MMM d, yyyy")
                  : null
              }
            />
            <Field
              icon={<Briefcase size={14} />}
              label="Employment type"
              value={
                profile.employmentType === "W2"
                  ? "W-2 Employee"
                  : profile.employmentType === "CONTRACTOR_1099"
                  ? "1099 Contractor"
                  : null
              }
            />
            {isAdmin && (
              <Field
                icon={<DollarSign size={14} />}
                label="Hourly wage"
                value={
                  profile.hourlyWage > 0
                    ? `$${profile.hourlyWage.toFixed(2)}/hr${profile.isTipped ? " (tipped)" : ""}`
                    : null
                }
              />
            )}
          </Card>

          {/* Admin notes */}
          {isAdmin && (
            <Card title="Internal notes" subtitle="Admin only — not shown to employee">
              {profile.notes ? (
                <div className="text-sm text-ink whitespace-pre-wrap">
                  {profile.notes}
                </div>
              ) : (
                <div className="text-sm text-smoke italic">No notes</div>
              )}
            </Card>
          )}
        </div>

        {/* Recent shifts */}
        <div className="mt-6">
          <Card title="Recent shifts">
            {recent.shifts.length === 0 ? (
              <div className="text-sm text-smoke italic">No recent shifts.</div>
            ) : (
              <ul className="divide-y divide-dust">
                {recent.shifts.map((s: any) => (
                  <li
                    key={s.id}
                    className="py-2 flex items-baseline justify-between gap-2 flex-wrap"
                  >
                    <div>
                      <div className="text-sm text-ink">
                        {format(new Date(s.startTime), "EEE, MMM d")}
                      </div>
                      <div className="font-mono text-xs text-smoke">
                        {format(new Date(s.startTime), "h:mma")} –{" "}
                        {format(new Date(s.endTime), "h:mma")}
                        {s.location && ` · ${s.location.name}`}
                      </div>
                    </div>
                    <span
                      className={`chip text-[9px] ${
                        s.published ? "chip-moss" : "chip-rust"
                      }`}
                    >
                      {s.published ? "published" : "draft"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Recent timesheets */}
        {(isAdmin || role === "MANAGER" || canEditSelf) && (
          <div className="mt-6">
            <Card title="Recent clock activity">
              {recent.clockEntries.length === 0 ? (
                <div className="text-sm text-smoke italic">No recent entries.</div>
              ) : (
                <ul className="divide-y divide-dust">
                  {recent.clockEntries.map((e: any) => (
                    <li
                      key={e.id}
                      className="py-2 flex items-baseline justify-between gap-2 flex-wrap"
                    >
                      <div>
                        <div className="font-mono text-xs text-ink">
                          {format(new Date(e.clockIn), "MMM d, h:mma")}
                          <span className="text-smoke">
                            {" – "}
                            {e.clockOut
                              ? format(new Date(e.clockOut), "h:mma")
                              : "..."}
                          </span>
                        </div>
                      </div>
                      {e.editedBy && (
                        <span className="chip chip-rust text-[9px]">edited</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </main>

      {editing && (
        <EditModal
          profile={profile}
          isAdmin={isAdmin}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6 animate-slide-up">
      <div className="label-eyebrow mb-1">{title}</div>
      {subtitle && <div className="text-xs text-smoke mb-3">{subtitle}</div>}
      <div className="space-y-3 mt-3">{children}</div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  multiline,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-smoke mb-0.5 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      {value ? (
        <div className={`text-sm text-ink ${multiline ? "whitespace-pre-wrap" : ""}`}>
          {value}
        </div>
      ) : (
        <div className="text-sm text-smoke italic">Not set</div>
      )}
    </div>
  );
}

function PhotoBlock({
  profile,
  canEdit,
  onUpdated,
}: {
  profile: Profile;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    setUploading(true);
    try {
      // Resize / compress in browser to stay well under DB size limits
      const dataUrl = await resizeImage(file, 400, 0.85);
      const res = await fetch("/api/employees/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: profile.id, photoUrl: dataUrl }),
      });
      if (!res.ok) {
        const d = await res.json();
        setErr(d.error ?? "Upload failed");
      } else {
        onUpdated();
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to read image");
    }
    setUploading(false);
  }

  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <div className="relative">
        {profile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoUrl}
            alt={profile.name}
            className="w-28 h-28 rounded-full object-cover border-2 border-dust"
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-rust/15 border border-rust/40 flex items-center justify-center text-3xl font-display text-ink">
            {profile.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
        )}
        {canEdit && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-rust text-white flex items-center justify-center hover:bg-glow transition-colors"
            title="Change photo"
          >
            <Camera size={14} />
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {uploading && <div className="text-xs text-smoke">Uploading…</div>}
      {err && <div className="text-xs text-rose">{err}</div>}
    </div>
  );
}

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

function EditModal({
  profile,
  isAdmin,
  onClose,
  onSaved,
}: {
  profile: Profile;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: profile.name,
    department: profile.department ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    dateOfBirth: profile.dateOfBirth
      ? new Date(profile.dateOfBirth).toISOString().slice(0, 10)
      : "",
    hireDate: profile.hireDate
      ? new Date(profile.hireDate).toISOString().slice(0, 10)
      : "",
    employmentType: profile.employmentType,
    hourlyWage: profile.hourlyWage.toString(),
    isTipped: profile.isTipped,
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactPhone: profile.emergencyContactPhone ?? "",
    emergencyContactRelation: profile.emergencyContactRelation ?? "",
    notes: profile.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const body: any = {
      phone: form.phone || null,
      address: form.address || null,
      dateOfBirth: form.dateOfBirth || null,
      emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null,
      emergencyContactRelation: form.emergencyContactRelation || null,
    };
    if (isAdmin) {
      body.name = form.name;
      body.department = form.department || null;
      body.hireDate = form.hireDate || null;
      body.employmentType = form.employmentType;
      body.hourlyWage = parseFloat(form.hourlyWage) || 0;
      body.isTipped = form.isTipped;
      body.notes = form.notes || null;
    }
    const res = await fetch(`/api/employees/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6 overflow-y-auto">
      <div className="card w-full max-w-2xl p-6 my-auto">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="label-eyebrow mb-1">Edit profile</div>
            <h2 className="display text-2xl text-ink">{profile.name}</h2>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Personal */}
          <section>
            <div className="label-eyebrow mb-3">Personal</div>
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <div className="col-span-2">
                  <label>Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              )}
              <div>
                <label>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
                />
              </div>
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

          {/* Employment (admin) */}
          {isAdmin && (
            <section>
              <div className="label-eyebrow mb-3">Employment (admin only)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label>Department</label>
                  <input
                    value={form.department}
                    onChange={(e) =>
                      setForm({ ...form, department: e.target.value })
                    }
                  />
                </div>
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
                <div>
                  <label>Hourly wage</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.hourlyWage}
                    onChange={(e) =>
                      setForm({ ...form, hourlyWage: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-2">
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
                <div className="col-span-2">
                  <label>Internal notes</label>
                  <textarea
                    rows={3}
                    placeholder="Not visible to the employee"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
            </section>
          )}

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

          <div className="text-xs text-smoke text-center pt-2">
            <ShieldCheck size={12} className="inline mr-1" />
            SSN, tax forms, and direct deposit are managed in your payroll
            provider (Gusto, Wave, ADP) — not here.
          </div>
        </form>
      </div>
    </div>
  );
}
