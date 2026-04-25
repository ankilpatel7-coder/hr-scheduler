"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { Plus, Trash2, ChevronLeft, ChevronRight, X, Send } from "lucide-react";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";

type LocationRef = { id: string; name: string };

type Employee = {
  id: string;
  name: string;
  department: string | null;
  role: string;
  active: boolean;
  hourlyWage: number;
  locations: { location: LocationRef }[];
};

type Shift = {
  id: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  role: string | null;
  notes: string | null;
  published: boolean;
  location: LocationRef | null;
  employee: { id: string; name: string; department: string | null; hourlyWage: number };
};

type Location = { id: string; name: string; active: boolean };

export default function SchedulePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [modalSlot, setModalSlot] = useState<{ day: Date; employeeId: string } | null>(
    null
  );
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  async function load() {
    setLoading(true);
    const weekEnd = addDays(weekStart, 7);
    const locQuery = locationFilter ? `&locationId=${locationFilter}` : "";
    const [eRes, sRes, lRes] = await Promise.all([
      fetch("/api/employees"),
      fetch(
        `/api/shifts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}${locQuery}`
      ),
      fetch("/api/locations"),
    ]);
    const eData = await eRes.json();
    const sData = await sRes.json();
    const lData = await lRes.json();
    setEmployees((eData.employees ?? []).filter((e: Employee) => e.active));
    setShifts(sData.shifts ?? []);
    setLocations((lData.locations ?? []).filter((l: Location) => l.active));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, locationFilter]);

  async function deleteShift(id: string) {
    if (!confirm("Delete this shift?")) return;
    await fetch(`/api/shifts?id=${id}`, { method: "DELETE" });
    load();
  }

  async function publish() {
    const weekEnd = addDays(weekStart, 7);
    const draftCount = shifts.filter((s) => !s.published).length;
    if (draftCount === 0) {
      setPublishMsg("No draft shifts in this week.");
      setTimeout(() => setPublishMsg(null), 3000);
      return;
    }
    if (
      !confirm(
        `Publish ${draftCount} draft shift${draftCount > 1 ? "s" : ""}? Affected employees will get an email.`
      )
    )
      return;

    setPublishing(true);
    const res = await fetch("/api/shifts/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
        locationId: locationFilter || null,
      }),
    });
    const data = await res.json();
    setPublishing(false);
    if (res.ok) {
      setPublishMsg(
        `Published ${data.published} shift${data.published === 1 ? "" : "s"}, sent ${data.emailsSent} email${
          data.emailsSent === 1 ? "" : "s"
        }.`
      );
      setTimeout(() => setPublishMsg(null), 4000);
      load();
    } else {
      setPublishMsg(data.error ?? "Failed");
    }
  }

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  function shiftsFor(employeeId: string, day: Date) {
    return shifts.filter(
      (s) =>
        s.employeeId === employeeId && isSameDay(new Date(s.startTime), day)
    );
  }

  // Filter employees based on location if filter is active
  const displayedEmployees = locationFilter
    ? employees.filter((e) =>
        e.locations.some((l) => l.location.id === locationFilter)
      )
    : employees;

  const draftCount = shifts.filter((s) => !s.published).length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              Week of
            </div>
            <h1 className="display text-5xl">
              {format(weekStart, "MMMM d")}
              <span className="text-smoke">
                &thinsp;–&thinsp;{format(addDays(weekStart, 6), "MMM d")}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {locations.length > 0 && (
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="!w-auto !py-1.5"
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn-secondary !p-2"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="btn btn-secondary"
              onClick={() =>
                setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
            >
              Today
            </button>
            <button
              className="btn btn-secondary !p-2"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={publish}
              disabled={publishing || draftCount === 0}
              className="btn btn-rust"
              title={draftCount === 0 ? "No drafts to publish" : ""}
            >
              <Send size={14} />
              {publishing
                ? "Publishing…"
                : draftCount > 0
                ? `Publish (${draftCount})`
                : "Publish"}
            </button>
          </div>
        </div>

        {publishMsg && (
          <div className="mb-4 text-sm bg-moss/10 border border-moss/20 text-ink px-4 py-2 rounded">
            {publishMsg}
          </div>
        )}

        {draftCount > 0 && (
          <div className="mb-4 text-xs text-smoke flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-rust" />
            <span>Dashed = draft (not yet visible to employees)</span>
            <span className="ml-4 inline-block w-3 h-3 rounded-sm bg-ink" />
            <span>Solid = published</span>
          </div>
        )}

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="border-b border-dust">
                  <th className="sticky left-0 bg-paper px-4 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-smoke font-medium w-48">
                    Employee
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.toISOString()}
                      className={`px-3 py-3 text-left text-[10px] uppercase tracking-[0.15em] font-medium border-l border-dust ${
                        isSameDay(d, new Date())
                          ? "bg-rust/5 text-rust"
                          : "text-smoke"
                      }`}
                    >
                      <div>{format(d, "EEE")}</div>
                      <div className="display text-xl text-ink normal-case tracking-normal">
                        {format(d, "d")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b border-dust last:border-0">
                    <td className="sticky left-0 bg-paper px-4 py-3 align-top">
                      <div className="font-medium text-sm">{emp.name}</div>
                      <div className="text-[11px] text-smoke">
                        {emp.department ?? "—"}
                      </div>
                    </td>
                    {days.map((d) => {
                      const ss = shiftsFor(emp.id, d);
                      return (
                        <td
                          key={d.toISOString()}
                          className="border-l border-dust p-2 align-top min-w-[130px]"
                        >
                          <div className="space-y-1">
                            {ss.map((s) => (
                              <div
                                key={s.id}
                                className={`px-2 py-1.5 rounded text-xs group relative ${
                                  s.published
                                    ? "bg-ink text-paper"
                                    : "bg-paper text-ink border-2 border-dashed border-rust"
                                }`}
                              >
                                <div className="font-mono">
                                  {format(new Date(s.startTime), "h:mma")}
                                  <span
                                    className={
                                      s.published
                                        ? "text-paper/50"
                                        : "text-smoke"
                                    }
                                  >
                                    {" "}
                                    –{" "}
                                  </span>
                                  {format(new Date(s.endTime), "h:mma")}
                                </div>
                                {s.role && (
                                  <div
                                    className={
                                      s.published
                                        ? "text-paper/70 truncate"
                                        : "text-smoke truncate"
                                    }
                                  >
                                    {s.role}
                                  </div>
                                )}
                                {s.location && (
                                  <div
                                    className={
                                      s.published
                                        ? "text-paper/60 truncate text-[10px]"
                                        : "text-smoke truncate text-[10px]"
                                    }
                                  >
                                    @ {s.location.name}
                                  </div>
                                )}
                                <button
                                  onClick={() => deleteShift(s.id)}
                                  className={`absolute top-1 right-1 opacity-0 group-hover:opacity-100 ${
                                    s.published
                                      ? "text-paper/70 hover:text-rust"
                                      : "text-smoke hover:text-rust"
                                  }`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() =>
                                setModalSlot({ day: d, employeeId: emp.id })
                              }
                              className="w-full text-xs text-smoke hover:text-ink hover:bg-dust/30 py-1 rounded border border-dashed border-dust flex items-center justify-center gap-1"
                            >
                              <Plus size={12} /> Add
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {displayedEmployees.length === 0 && (
              <div className="p-8 text-center text-sm text-smoke italic">
                {locationFilter
                  ? "No employees are assigned to this location yet."
                  : "No active employees. Add employees first."}
              </div>
            )}
          </div>
        )}
      </main>

      {modalSlot && (
        <AddShiftModal
          day={modalSlot.day}
          employeeId={modalSlot.employeeId}
          employeeName={
            employees.find((e) => e.id === modalSlot.employeeId)?.name ?? ""
          }
          locations={locations}
          defaultLocationId={locationFilter}
          onClose={() => setModalSlot(null)}
          onCreated={() => {
            setModalSlot(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddShiftModal({
  day,
  employeeId,
  employeeName,
  locations,
  defaultLocationId,
  onClose,
  onCreated,
}: {
  day: Date;
  employeeId: string;
  employeeName: string;
  locations: Location[];
  defaultLocationId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    start: "09:00",
    end: "17:00",
    role: "",
    notes: "",
    locationId: defaultLocationId || (locations[0]?.id ?? ""),
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const [sH, sM] = form.start.split(":").map(Number);
    const [eH, eM] = form.end.split(":").map(Number);
    const startTime = new Date(day);
    startTime.setHours(sH, sM, 0, 0);
    const endTime = new Date(day);
    endTime.setHours(eH, eM, 0, 0);
    if (endTime <= startTime) endTime.setDate(endTime.getDate() + 1);
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        role: form.role || undefined,
        notes: form.notes || undefined,
        locationId: form.locationId || null,
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

  // Kentucky break-reminder hint
  const [sH, sM] = form.start.split(":").map(Number);
  const [eH, eM] = form.end.split(":").map(Number);
  const durationHours =
    Math.max(0, (eH * 60 + (eM || 0) - sH * 60 - (sM || 0))) / 60;

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            {format(day, "EEEE, MMMM d")}
          </div>
          <h2 className="display text-2xl">Shift for {employeeName}</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {locations.length > 0 && (
            <div>
              <label>Location</label>
              <select
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              >
                <option value="">No specific location</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Start time</label>
              <input
                type="time"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
              />
            </div>
            <div>
              <label>End time</label>
              <input
                type="time"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
              />
            </div>
          </div>
          {durationHours >= 5 && (
            <div className="text-xs text-smoke bg-dust/30 px-3 py-2 rounded">
              📋 Kentucky requires a meal break for shifts 5+ hours. Schedule it
              between hours 3 and 5.
            </div>
          )}
          <div>
            <label>Role / position (optional)</label>
            <input
              placeholder="e.g. Floor Associate"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            />
          </div>
          <div>
            <label>Notes (optional)</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {err && (
            <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
              {err}
            </div>
          )}
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Create shift (draft)"}
          </button>
          <div className="text-xs text-smoke text-center">
            Shifts are created as drafts. Hit Publish to notify employees.
          </div>
        </form>
      </div>
    </div>
  );
}
