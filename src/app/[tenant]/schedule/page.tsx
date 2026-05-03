"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { Plus, Trash2, ChevronLeft, ChevronRight, X, Send, Copy, Clipboard, Printer, CalendarPlus, AlertTriangle } from "lucide-react";
import { addDays, startOfWeek, format, isSameDay, differenceInMinutes } from "date-fns";

type LocationRef = { id: string; name: string };

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

type Location = {
  id: string;
  name: string;
  active: boolean;
  hours?: Hours | null;
};

const DAY_KEYS: (keyof Hours)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
function dayKeyForDate(d: Date): keyof Hours {
  // date-fns getDay: 0=Sun .. 6=Sat. We want mon-first.
  const idx = (d.getDay() + 6) % 7;
  return DAY_KEYS[idx];
}

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
  // Copy/paste clipboard for shifts (in-memory only)
  const [clipboardShift, setClipboardShift] = useState<Shift | null>(null);
  // Right-click context menu state
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    shift?: Shift;
    employeeId?: string;
    day?: Date;
  } | null>(null);
  // Copy last week dialog
  const [showCopyWeek, setShowCopyWeek] = useState(false);
  const [copyWeekRunning, setCopyWeekRunning] = useState(false);

  // Close context menu on any click anywhere
  useEffect(() => {
    if (!menu) return;
    function close() { setMenu(null); }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

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

  // Paste a copied shift onto a (employeeId, day) slot — preserves the time-of-day from the source
  async function pasteShift(targetEmployeeId: string, targetDay: Date) {
    if (!clipboardShift) return;
    const src = clipboardShift;
    const srcStart = new Date(src.startTime);
    const srcEnd = new Date(src.endTime);
    const newStart = new Date(targetDay);
    newStart.setHours(srcStart.getHours(), srcStart.getMinutes(), 0, 0);
    const newEnd = new Date(targetDay);
    newEnd.setHours(srcEnd.getHours(), srcEnd.getMinutes(), 0, 0);
    // Handle overnight shifts
    if (newEnd <= newStart) newEnd.setDate(newEnd.getDate() + 1);

    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: targetEmployeeId,
        locationId: src.location?.id ?? null,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        role: src.role ?? undefined,
        notes: src.notes ?? undefined,
      }),
    });
    load();
  }

  // Duplicate to the same employee/day
  async function duplicateShift(shift: Shift) {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
    // Bump by 1 hour to avoid an exact duplicate sitting on top of original
    const newStart = new Date(end);
    const newEnd = new Date(end.getTime() + (end.getTime() - start.getTime()));
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: shift.employeeId,
        locationId: shift.location?.id ?? null,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        role: shift.role ?? undefined,
        notes: shift.notes ?? undefined,
      }),
    });
    load();
  }

  async function copyLastWeek() {
    setCopyWeekRunning(true);
    const lastWeekStart = addDays(weekStart, -7);
    const lastWeekEnd = addDays(weekStart, 0);
    const locQuery = locationFilter ? `&locationId=${locationFilter}` : "";
    const res = await fetch(
      `/api/shifts?from=${lastWeekStart.toISOString()}&to=${lastWeekEnd.toISOString()}${locQuery}`
    );
    if (!res.ok) {
      setCopyWeekRunning(false);
      alert("Failed to fetch last week's shifts");
      return;
    }
    const data = await res.json();
    const lastShifts: Shift[] = data.shifts ?? [];
    if (lastShifts.length === 0) {
      setCopyWeekRunning(false);
      setShowCopyWeek(false);
      alert("No shifts found in last week to copy.");
      return;
    }

    // Delete this week's existing shifts (since user chose 'overwrite')
    const thisWeekRes = await fetch(
      `/api/shifts?from=${weekStart.toISOString()}&to=${addDays(weekStart, 7).toISOString()}${locQuery}`
    );
    if (thisWeekRes.ok) {
      const thisData = await thisWeekRes.json();
      const existing: Shift[] = thisData.shifts ?? [];
      for (const s of existing) {
        await fetch(`/api/shifts?id=${s.id}`, { method: "DELETE" });
      }
    }

    // Create new shifts shifted forward by 7 days
    let created = 0;
    for (const s of lastShifts) {
      const ns = new Date(s.startTime);
      const ne = new Date(s.endTime);
      ns.setDate(ns.getDate() + 7);
      ne.setDate(ne.getDate() + 7);
      const r = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: s.employeeId,
          locationId: s.location?.id ?? null,
          startTime: ns.toISOString(),
          endTime: ne.toISOString(),
          role: s.role ?? undefined,
          notes: s.notes ?? undefined,
        }),
      });
      if (r.ok) created++;
    }
    setCopyWeekRunning(false);
    setShowCopyWeek(false);
    setPublishMsg(`Copied ${created} shift${created !== 1 ? "s" : ""} from last week.`);
    setTimeout(() => setPublishMsg(null), 4000);
    load();
  }

  function printSchedule() {
    window.print();
  }

  // Calculate weekly total hours for an employee in the current week (used by warning indicators)
  function weeklyHoursFor(employeeId: string): number {
    return shifts
      .filter((s) => s.employeeId === employeeId)
      .reduce(
        (acc, s) =>
          acc +
          differenceInMinutes(new Date(s.endTime), new Date(s.startTime)) / 60,
        0
      );
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
              onClick={() => setShowCopyWeek(true)}
              className="btn btn-secondary print:hidden"
              title="Copy last week's schedule into this week"
            >
              <CalendarPlus size={14} /> Copy last week
            </button>
            <button
              onClick={printSchedule}
              className="btn btn-secondary print:hidden"
              title="Print this week's schedule"
            >
              <Printer size={14} /> Print
            </button>
            <button
              onClick={publish}
              disabled={publishing || draftCount === 0}
              className="btn btn-rust print:hidden"
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
                {displayedEmployees.map((emp) => {
                  const empWeekHours = weeklyHoursFor(emp.id);
                  const isOT = empWeekHours > 40;
                  return (
                  <tr key={emp.id} className="border-b border-dust last:border-0">
                    <td className="sticky left-0 bg-paper px-4 py-3 align-top">
                      <div className="font-medium text-sm">{emp.name}</div>
                      <div className="text-[11px] text-smoke">
                        {emp.department ?? "—"}
                      </div>
                      <div className={`text-[10px] mt-0.5 font-mono ${isOT ? "text-rose font-medium" : "text-smoke"}`}>
                        {empWeekHours.toFixed(1)}h{isOT && " · OT"}
                      </div>
                    </td>
                    {days.map((d) => {
                      const ss = shiftsFor(emp.id, d);
                      // Determine if any of this employee's locations is closed on this day.
                      // We pick the location used in shifts if any, otherwise first assigned location.
                      const empLocId = ss[0]?.location?.id ?? emp.locations[0]?.location.id;
                      const empLoc = empLocId
                        ? locations.find((l) => l.id === empLocId)
                        : undefined;
                      const dayKey = dayKeyForDate(d);
                      const dayHours = empLoc?.hours?.[dayKey];
                      const isClosed = !!dayHours?.closed;

                      return (
                        <td
                          key={d.toISOString()} onContextMenu={(e) => { e.preventDefault(); if (clipboardShift) { setMenu({ x: e.clientX, y: e.clientY, employeeId: emp.id, day: d }); } }}
                          className={`border-l border-dust p-2 align-top min-w-[130px] ${
                            isClosed ? "bg-rose/5" : ""
                          }`}
                        >
                          {isClosed && ss.length === 0 && (
                            <div className="text-[10px] uppercase tracking-[0.15em] text-rose/70 font-medium text-center py-1">
                              Closed
                            </div>
                          )}
                          <div className="space-y-1">
                            {ss.map((s) => {
                              // Compute scheduled-outside-hours warning
                              const sStart = new Date(s.startTime);
                              const sEnd = new Date(s.endTime);
                              let outsideHours = false;
                              if (!isClosed && dayHours?.open && dayHours?.close) {
                                const [oh, om] = dayHours.open.split(":").map(Number);
                                const [ch, cm] = dayHours.close.split(":").map(Number);
                                const openMin = oh * 60 + om;
                                const closeMin = ch * 60 + cm;
                                const startMin = sStart.getHours() * 60 + sStart.getMinutes();
                                const endMin = sEnd.getHours() * 60 + sEnd.getMinutes();
                                if (startMin < openMin || endMin > closeMin) outsideHours = true;
                              }
                              const showClosedWarn = isClosed;
                              const showWarn = outsideHours || showClosedWarn;
                              return (
                              <div
                                key={s.id}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, shift: s });
                                }}
                                className={`px-2 py-1.5 rounded text-xs group relative ${
                                  s.published
                                    ? "bg-rust text-white"
                                    : "bg-rust/5 text-ink border-2 border-dashed border-rust/40"
                                } ${showWarn ? "ring-2 ring-amber" : ""}`}
                              >
                                <div className="font-mono">
                                  {format(new Date(s.startTime), "h:mma")}
                                  <span
                                    className={
                                      s.published
                                        ? "text-white/60"
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
                                        ? "text-white/80 truncate"
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
                                        ? "text-white/70 truncate text-[10px]"
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
                                      ? "text-white/80 hover:text-white"
                                      : "text-smoke hover:text-rust"
                                  }`}
                                >
                                  <Trash2 size={12} />
                                </button>
                                {showWarn && (
                                  <div
                                    className="absolute -top-1 -right-1 bg-amber text-white rounded-full p-0.5"
                                    title={
                                      isClosed
                                        ? "Scheduled on a CLOSED day"
                                        : "Scheduled outside store hours"
                                    }
                                  >
                                    <AlertTriangle size={10} />
                                  </div>
                                )}
                              </div>
                              );
                            })}
                            <button
                              onClick={() =>
                                setModalSlot({ day: d, employeeId: emp.id })
                              }
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (clipboardShift) {
                                  setMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    employeeId: emp.id,
                                    day: d,
                                  });
                                }
                              }}
                              className="w-full text-xs text-smoke hover:text-ink hover:bg-dust/30 py-1 rounded border border-dashed border-dust flex items-center justify-center gap-1 print:hidden"
                            >
                              <Plus size={12} /> Add
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
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

      {/* Right-click context menu */}
      {menu && (
        <div
          className="fixed z-50 card p-1 min-w-[180px] shadow-lift"
          style={{ position: 'fixed', left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.shift && (
            <>
              <button
                onClick={() => {
                  setClipboardShift(menu.shift!);
                  setMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2"
              >
                <Copy size={13} /> Copy
              </button>
              <button
                onClick={() => {
                  duplicateShift(menu.shift!);
                  setMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2"
              >
                <Plus size={13} /> Duplicate (after this)
              </button>
              <button
                onClick={() => {
                  deleteShift(menu.shift!.id);
                  setMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-rose/10 text-rose rounded flex items-center gap-2"
              >
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
          {menu.employeeId && menu.day && (
            <button
              onClick={() => {
                pasteShift(menu.employeeId!, menu.day!);
                setMenu(null);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2"
            >
              <Clipboard size={13} /> Paste here
            </button>
          )}
        </div>
      )}

      {/* Copy last week confirmation */}
      {showCopyWeek && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
          <div className="card max-w-md p-6">
            <h2 className="display text-2xl text-ink mb-2">Copy last week</h2>
            <p className="text-sm text-smoke mb-4">
              This will copy all shifts from{" "}
              <span className="font-mono text-ink">
                {format(addDays(weekStart, -7), "MMM d")} – {format(addDays(weekStart, -1), "MMM d")}
              </span>{" "}
              into{" "}
              <span className="font-mono text-ink">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d")}
              </span>
              .
            </p>
            <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30 mb-4">
              ⚠️ This will <strong>delete this week's existing shifts first</strong>, then copy
              last week's shifts forward by 7 days.
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCopyWeek(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={copyLastWeek}
                disabled={copyWeekRunning}
                className="btn btn-primary"
              >
                {copyWeekRunning ? "Copying…" : "Copy and overwrite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalSlot && (
        <AddShiftModal
          day={modalSlot.day}
          employeeId={modalSlot.employeeId}
          employeeName={
            employees.find((e) => e.id === modalSlot.employeeId)?.name ?? ""
          }
          employeeBaseLocationId={
            employees.find((e) => e.id === modalSlot.employeeId)?.locations[0]?.location.id ?? ""
          }
          existingWeeklyHours={weeklyHoursFor(modalSlot.employeeId)}
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
  employeeBaseLocationId,
  existingWeeklyHours,
  locations,
  defaultLocationId,
  onClose,
  onCreated,
}: {
  day: Date;
  employeeId: string;
  employeeName: string;
  employeeBaseLocationId: string;
  existingWeeklyHours: number;
  locations: Location[];
  defaultLocationId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  // Priority for location: explicit filter > employee's base location > first location
  const initialLocId =
    defaultLocationId || employeeBaseLocationId || (locations[0]?.id ?? "");
  const [form, setForm] = useState({
    start: "09:00",
    end: "17:00",
    role: "",
    notes: "",
    locationId: initialLocId,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Compute warnings: outside store hours, overtime
  const dayKey = dayKeyForDate(day);
  const selectedLoc = locations.find((l) => l.id === form.locationId);
  const dayHours = selectedLoc?.hours?.[dayKey];
  const isClosedDay = !!dayHours?.closed;
  const [sH, sM] = form.start.split(":").map(Number);
  const [eH, eM] = form.end.split(":").map(Number);
  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  const shiftHours = (endMin - startMin) / 60;
  let outsideHours = false;
  if (!isClosedDay && dayHours?.open && dayHours?.close) {
    const [oh, om] = dayHours.open.split(":").map(Number);
    const [ch, cm] = dayHours.close.split(":").map(Number);
    if (startMin < oh * 60 + om || endMin > ch * 60 + cm) outsideHours = true;
  }
  const projectedWeeklyHours = existingWeeklyHours + (shiftHours > 0 ? shiftHours : 0);
  const willCauseOT = projectedWeeklyHours > 40;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    const [startH, startM] = form.start.split(":").map(Number);
    const [endH, endM] = form.end.split(":").map(Number);
    const startTime = new Date(day);
    startTime.setHours(startH, startM, 0, 0);
    const endTime = new Date(day);
    endTime.setHours(endH, endM, 0, 0);
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

  // Kentucky break-reminder hint — uses shiftHours computed above
  const durationHours = Math.max(0, shiftHours);

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

          {/* Warnings */}
          {(isClosedDay || outsideHours || willCauseOT) && (
            <div className="space-y-2">
              {isClosedDay && (
                <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Location closed</strong> on {format(day, "EEEE")}. You can still
                    schedule, but this is outside your set business hours.
                  </div>
                </div>
              )}
              {outsideHours && !isClosedDay && (
                <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Outside store hours</strong>. Open hours for {format(day, "EEEE")}
                    : {dayHours?.open}–{dayHours?.close}
                  </div>
                </div>
              )}
              {willCauseOT && (
                <div className="text-xs text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Overtime warning</strong>. {employeeName}'s weekly hours will be{" "}
                    <span className="font-mono">{projectedWeeklyHours.toFixed(1)}h</span>
                    {" "}(over 40h triggers OT pay).
                  </div>
                </div>
              )}
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
