"use client";
import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import {
  Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X, Send, Copy, Clipboard,
  Printer, CalendarPlus, AlertTriangle, Settings,
} from "lucide-react";
import Link from "next/link";
import { addDays, startOfWeek, format, isSameDay, differenceInMinutes } from "date-fns";

type LocationRef = { id: string; name: string };

type DayHours = { open?: string; close?: string; closed?: boolean };
type Hours = {
  mon?: DayHours; tue?: DayHours; wed?: DayHours; thu?: DayHours;
  fri?: DayHours; sat?: DayHours; sun?: DayHours;
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

type ShiftTag = { id: string; name: string; color: string };
type ShiftRole = { id: string; name: string; color: string; sortOrder: number };

type Shift = {
  id: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  role: string | null;
  notes: string | null;
  published: boolean;
  location: LocationRef | null;
  tag: ShiftTag | null;
  tagId: string | null;
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
  const idx = (d.getDay() + 6) % 7;
  return DAY_KEYS[idx];
}

const UNSPEC_ROLE = "Unspecified";
const DEFAULT_SECTION_COLOR = "#5F5E5A";

export default function SchedulePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [roles, setRoles] = useState<ShiftRole[]>([]);
  const [tags, setTags] = useState<ShiftTag[]>([]);
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [modalSlot, setModalSlot] = useState<{ day: Date; employeeId: string; defaultRole?: string } | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [clipboardShift, setClipboardShift] = useState<Shift | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; shift?: Shift; employeeId?: string; day?: Date } | null>(null);
  const [showCopyWeek, setShowCopyWeek] = useState(false);
  const [copyWeekRunning, setCopyWeekRunning] = useState(false);
  const [collapsedRoles, setCollapsedRoles] = useState<Set<string>>(new Set());

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
    const [eRes, sRes, lRes, rRes, tRes] = await Promise.all([
      fetch("/api/employees?schedulableOnly=true"),
      fetch(`/api/shifts?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}${locQuery}`),
      fetch("/api/locations"),
      fetch("/api/roles"),
      fetch("/api/tags"),
    ]);
    const eData = await eRes.json();
    const sData = await sRes.json();
    const lData = await lRes.json();
    const rData = rRes.ok ? await rRes.json() : { roles: [] };
    const tData = tRes.ok ? await tRes.json() : { tags: [] };
    setEmployees((eData.employees ?? []).filter((e: Employee) => e.active));
    setShifts(sData.shifts ?? []);
    setLocations((lData.locations ?? []).filter((l: Location) => l.active));
    setRoles(rData.roles ?? []);
    setTags(tData.tags ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekStart, locationFilter]);

  async function deleteShift(id: string) {
    if (!confirm("Delete this shift?")) return;
    await fetch(`/api/shifts?id=${id}`, { method: "DELETE" });
    load();
  }

  async function pasteShift(targetEmployeeId: string, targetDay: Date) {
    if (!clipboardShift) return;
    const src = clipboardShift;
    const srcStart = new Date(src.startTime);
    const srcEnd = new Date(src.endTime);
    const newStart = new Date(targetDay);
    newStart.setHours(srcStart.getHours(), srcStart.getMinutes(), 0, 0);
    const newEnd = new Date(targetDay);
    newEnd.setHours(srcEnd.getHours(), srcEnd.getMinutes(), 0, 0);
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
        tagId: src.tagId ?? undefined,
      }),
    });
    load();
  }

  async function duplicateShift(shift: Shift) {
    const start = new Date(shift.startTime);
    const end = new Date(shift.endTime);
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
        tagId: shift.tagId ?? undefined,
      }),
    });
    load();
  }

  async function copyLastWeek() {
    setCopyWeekRunning(true);
    const lastWeekStart = addDays(weekStart, -7);
    const lastWeekEnd = addDays(weekStart, 0);
    const locQuery = locationFilter ? `&locationId=${locationFilter}` : "";
    const res = await fetch(`/api/shifts?from=${lastWeekStart.toISOString()}&to=${lastWeekEnd.toISOString()}${locQuery}`);
    if (!res.ok) { setCopyWeekRunning(false); alert("Failed to fetch last week's shifts"); return; }
    const data = await res.json();
    const lastShifts: Shift[] = data.shifts ?? [];
    if (lastShifts.length === 0) {
      setCopyWeekRunning(false); setShowCopyWeek(false);
      alert("No shifts found in last week to copy."); return;
    }
    const thisWeekRes = await fetch(`/api/shifts?from=${weekStart.toISOString()}&to=${addDays(weekStart, 7).toISOString()}${locQuery}`);
    if (thisWeekRes.ok) {
      const thisData = await thisWeekRes.json();
      const existing: Shift[] = thisData.shifts ?? [];
      for (const s of existing) await fetch(`/api/shifts?id=${s.id}`, { method: "DELETE" });
    }
    let created = 0;
    for (const s of lastShifts) {
      const ns = new Date(s.startTime); const ne = new Date(s.endTime);
      ns.setDate(ns.getDate() + 7); ne.setDate(ne.getDate() + 7);
      const r = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: s.employeeId, locationId: s.location?.id ?? null,
          startTime: ns.toISOString(), endTime: ne.toISOString(),
          role: s.role ?? undefined, notes: s.notes ?? undefined,
          tagId: s.tagId ?? undefined,
        }),
      });
      if (r.ok) created++;
    }
    setCopyWeekRunning(false); setShowCopyWeek(false);
    setPublishMsg(`Copied ${created} shift${created !== 1 ? "s" : ""} from last week.`);
    setTimeout(() => setPublishMsg(null), 4000);
    load();
  }

  function printSchedule() { window.print(); }

  function weeklyHoursFor(employeeId: string): number {
    return shifts.filter((s) => s.employeeId === employeeId).reduce(
      (acc, s) => acc + differenceInMinutes(new Date(s.endTime), new Date(s.startTime)) / 60, 0
    );
  }

  async function publish() {
    const weekEnd = addDays(weekStart, 7);
    const draftCount = shifts.filter((s) => !s.published).length;
    if (draftCount === 0) {
      setPublishMsg("No draft shifts in this week.");
      setTimeout(() => setPublishMsg(null), 3000); return;
    }
    if (!confirm(`Publish ${draftCount} draft shift${draftCount > 1 ? "s" : ""}? Affected employees will get an email.`)) return;
    setPublishing(true);
    const res = await fetch("/api/shifts/publish", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: weekStart.toISOString(), to: weekEnd.toISOString(), locationId: locationFilter || null }),
    });
    const data = await res.json();
    setPublishing(false);
    if (res.ok) {
      setPublishMsg(`Published ${data.published} shift${data.published === 1 ? "" : "s"}, sent ${data.emailsSent} email${data.emailsSent === 1 ? "" : "s"}.`);
      setTimeout(() => setPublishMsg(null), 4000); load();
    } else { setPublishMsg(data.error ?? "Failed"); }
  }

  function toggleRoleCollapse(role: string) {
    setCollapsedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
  }

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  function shiftsFor(employeeId: string, day: Date, roleFilter?: string) {
    return shifts.filter((s) =>
      s.employeeId === employeeId &&
      isSameDay(new Date(s.startTime), day) &&
      (roleFilter === undefined ||
        (roleFilter === UNSPEC_ROLE ? !s.role : s.role === roleFilter))
    );
  }

  const displayedEmployees = locationFilter
    ? employees.filter((e) => e.locations.some((l) => l.location.id === locationFilter))
    : employees;
  const employeeById = new Map(displayedEmployees.map((e) => [e.id, e]));

  // Group shifts by role; each role section shows employees who have that role's shifts this week
  const roleColorMap = new Map(roles.map((r) => [r.name, r.color]));
  const sectionMap = new Map<string, Set<string>>(); // roleName -> Set<employeeId>
  for (const s of shifts) {
    const r = s.role ?? UNSPEC_ROLE;
    if (!employeeById.has(s.employeeId)) continue; // respect location filter
    if (!sectionMap.has(r)) sectionMap.set(r, new Set());
    sectionMap.get(r)!.add(s.employeeId);
  }

  // Sort sections: known roles by sortOrder, then unknown alphabetically, then "Unspecified" last
  const sectionsList = Array.from(sectionMap.keys()).sort((a, b) => {
    if (a === UNSPEC_ROLE) return 1;
    if (b === UNSPEC_ROLE) return -1;
    const ra = roles.find((r) => r.name === a);
    const rb = roles.find((r) => r.name === b);
    if (ra && rb) return ra.sortOrder - rb.sortOrder;
    if (ra) return -1;
    if (rb) return 1;
    return a.localeCompare(b);
  });

  // Employees with no shifts this week (still need to be schedulable from UI)
  const scheduledEmpIds = new Set(shifts.map((s) => s.employeeId));
  const unscheduled = displayedEmployees.filter((e) => !scheduledEmpIds.has(e.id));

  const draftCount = shifts.filter((s) => !s.published).length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">Week of</div>
            <h1 className="display text-5xl">
              {format(weekStart, "MMMM d")}
              <span className="text-smoke">&thinsp;–&thinsp;{format(addDays(weekStart, 6), "MMM d")}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {locations.length > 0 && (
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="!w-auto !py-1.5">
                <option value="">All locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <button className="btn btn-secondary !p-2" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
            <button className="btn btn-secondary" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
            <button className="btn btn-secondary !p-2" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
            <button onClick={() => setShowCopyWeek(true)} className="btn btn-secondary print:hidden" title="Copy last week's schedule into this week">
              <CalendarPlus size={14} /> Copy last week
            </button>
            <button onClick={printSchedule} className="btn btn-secondary print:hidden" title="Print this week's schedule">
              <Printer size={14} /> Print
            </button>
            <button onClick={publish} disabled={publishing || draftCount === 0} className="btn btn-rust print:hidden" title={draftCount === 0 ? "No drafts to publish" : ""}>
              <Send size={14} />
              {publishing ? "Publishing…" : draftCount > 0 ? `Publish (${draftCount})` : "Publish"}
            </button>
          </div>
        </div>

        {publishMsg && (
          <div className="mb-4 text-sm bg-moss/10 border border-moss/20 text-ink px-4 py-2 rounded">{publishMsg}</div>
        )}

        {draftCount > 0 && (
          <div className="mb-4 text-xs text-smoke flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-rust" />
            <span>Dashed = draft (not yet visible to employees)</span>
            <span className="ml-4 inline-block w-3 h-3 rounded-sm bg-ink" />
            <span>Solid = published</span>
            <Link href="settings/shift-categories" className="ml-auto text-rust hover:underline inline-flex items-center gap-1 print:hidden">
              <Settings size={12} /> Manage roles &amp; tags
            </Link>
          </div>
        )}

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <div className="space-y-3">
            {/* Role sections */}
            {sectionsList.map((roleName) => {
              const empIds = sectionMap.get(roleName)!;
              const sectionEmps = displayedEmployees.filter((e) => empIds.has(e.id));
              const color = roleColorMap.get(roleName) || DEFAULT_SECTION_COLOR;
              const collapsed = collapsedRoles.has(roleName);
              const sectionShiftCount = shifts.filter((s) => (s.role ?? UNSPEC_ROLE) === roleName).length;
              const sectionHours = shifts
                .filter((s) => (s.role ?? UNSPEC_ROLE) === roleName)
                .reduce((acc, s) => acc + differenceInMinutes(new Date(s.endTime), new Date(s.startTime)) / 60, 0);

              return (
                <div key={roleName} className="card overflow-hidden">
                  <div
                    className="px-4 py-2.5 text-white flex items-center justify-between cursor-pointer select-none"
                    style={{ background: color }}
                    onClick={() => toggleRoleCollapse(roleName)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{roleName}</span>
                      <span className="text-[11px] opacity-80 font-mono">
                        {sectionShiftCount} shift{sectionShiftCount === 1 ? "" : "s"} · {sectionHours.toFixed(1)}h
                      </span>
                    </div>
                    <span className="text-xs opacity-70">{collapsed ? "▶" : "▾"}</span>
                  </div>
                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[960px]">
                        <thead>
                          <tr className="border-b border-dust">
                            <th className="sticky left-0 bg-paper px-4 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-smoke font-medium w-48">
                              Employee
                            </th>
                            {days.map((d) => (
                              <th key={d.toISOString()} className={`px-3 py-3 text-left text-[10px] uppercase tracking-[0.15em] font-medium border-l border-dust ${isSameDay(d, new Date()) ? "bg-rust/5 text-rust" : "text-smoke"}`}>
                                <div>{format(d, "EEE")}</div>
                                <div className="display text-xl text-ink normal-case tracking-normal">{format(d, "d")}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sectionEmps.map((emp) => {
                            const empWeekHours = weeklyHoursFor(emp.id);
                            const isOT = empWeekHours > 40;
                            return (
                              <tr key={emp.id} className="border-b border-dust last:border-0">
                                <td className="sticky left-0 bg-paper px-4 py-3 align-top">
                                  <div className="font-medium text-sm">{emp.name}</div>
                                  <div className="text-[11px] text-smoke">{emp.department ?? "—"}</div>
                                  <div className={`text-[10px] mt-0.5 font-mono ${isOT ? "text-rose font-medium" : "text-smoke"}`}>
                                    {empWeekHours.toFixed(1)}h{isOT && " · OT"}
                                  </div>
                                </td>
                                {days.map((d) => {
                                  const ss = shiftsFor(emp.id, d, roleName);
                                  const empLocId = ss[0]?.location?.id ?? emp.locations[0]?.location.id;
                                  const empLoc = empLocId ? locations.find((l) => l.id === empLocId) : undefined;
                                  const dayKey = dayKeyForDate(d);
                                  const dayHours = empLoc?.hours?.[dayKey];
                                  const isClosed = !!dayHours?.closed;
                                  return (
                                    <td
                                      key={d.toISOString()}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        if (clipboardShift) setMenu({ x: e.clientX, y: e.clientY, employeeId: emp.id, day: d });
                                      }}
                                      className={`border-l border-dust p-2 align-top min-w-[130px] ${isClosed ? "bg-rose/5" : ""}`}
                                    >
                                      {isClosed && ss.length === 0 && (
                                        <div className="text-[10px] uppercase tracking-[0.15em] text-rose/70 font-medium text-center py-1">Closed</div>
                                      )}
                                      <div className="space-y-1">
                                        {ss.map((s) => (
                                          <ShiftCard
                                            key={s.id}
                                            shift={s}
                                            color={color}
                                            dayHours={dayHours}
                                            isClosedDay={isClosed}
                                            onEdit={() => setEditingShift(s)}
                                            onDelete={() => deleteShift(s.id)}
                                            onContextMenu={(e) => {
                                              e.preventDefault(); e.stopPropagation();
                                              setMenu({ x: e.clientX, y: e.clientY, shift: s });
                                            }}
                                          />
                                        ))}
                                        <button
                                          onClick={() => setModalSlot({ day: d, employeeId: emp.id, defaultRole: roleName === UNSPEC_ROLE ? undefined : roleName })}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            if (clipboardShift) setMenu({ x: e.clientX, y: e.clientY, employeeId: emp.id, day: d });
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
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unscheduled employees */}
            {unscheduled.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 text-ink bg-paper border-b border-dust flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-smoke">Unscheduled this week</span>
                    <span className="text-[11px] text-smoke">{unscheduled.length} employee{unscheduled.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px]">
                    <thead>
                      <tr className="border-b border-dust">
                        <th className="sticky left-0 bg-paper px-4 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-smoke font-medium w-48">Employee</th>
                        {days.map((d) => (
                          <th key={d.toISOString()} className={`px-3 py-3 text-left text-[10px] uppercase tracking-[0.15em] font-medium border-l border-dust ${isSameDay(d, new Date()) ? "bg-rust/5 text-rust" : "text-smoke"}`}>
                            <div>{format(d, "EEE")}</div>
                            <div className="display text-xl text-ink normal-case tracking-normal">{format(d, "d")}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unscheduled.map((emp) => (
                        <tr key={emp.id} className="border-b border-dust last:border-0">
                          <td className="sticky left-0 bg-paper px-4 py-3 align-top">
                            <div className="font-medium text-sm">{emp.name}</div>
                            <div className="text-[11px] text-smoke">{emp.department ?? "—"}</div>
                          </td>
                          {days.map((d) => (
                            <td
                              key={d.toISOString()}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (clipboardShift) setMenu({ x: e.clientX, y: e.clientY, employeeId: emp.id, day: d });
                              }}
                              className="border-l border-dust p-2 align-top min-w-[130px]"
                            >
                              <button
                                onClick={() => setModalSlot({ day: d, employeeId: emp.id })}
                                className="w-full text-xs text-smoke hover:text-ink hover:bg-dust/30 py-1 rounded border border-dashed border-dust flex items-center justify-center gap-1 print:hidden"
                              >
                                <Plus size={12} /> Add
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Empty state */}
            {sectionsList.length === 0 && unscheduled.length === 0 && (
              <div className="card p-12 text-center text-sm text-smoke italic">
                {locationFilter ? "No employees are assigned to this location yet." : "No active employees. Add employees first."}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Right-click context menu */}
      {menu && (
        <div className="fixed z-50 card p-1 min-w-[180px] shadow-lift" style={{ position: "fixed", left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.shift && (
            <>
              <button onClick={() => { setEditingShift(menu.shift!); setMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2">
                <Pencil size={13} /> Edit
              </button>
              <button onClick={() => { setClipboardShift(menu.shift!); setMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2">
                <Copy size={13} /> Copy
              </button>
              <button onClick={() => { duplicateShift(menu.shift!); setMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2">
                <Plus size={13} /> Duplicate (after this)
              </button>
              <button onClick={() => { deleteShift(menu.shift!.id); setMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-rose/10 text-rose rounded flex items-center gap-2">
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
          {menu.employeeId && menu.day && (
            <button onClick={() => { pasteShift(menu.employeeId!, menu.day!); setMenu(null); }} className="w-full text-left px-3 py-2 text-sm hover:bg-dust/40 rounded flex items-center gap-2">
              <Clipboard size={13} /> Paste here
            </button>
          )}
        </div>
      )}

      {showCopyWeek && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
          <div className="card max-w-md p-6">
            <h2 className="display text-2xl text-ink mb-2">Copy last week</h2>
            <p className="text-sm text-smoke mb-4">
              This will copy all shifts from{" "}
              <span className="font-mono text-ink">{format(addDays(weekStart, -7), "MMM d")} – {format(addDays(weekStart, -1), "MMM d")}</span>{" "}
              into <span className="font-mono text-ink">{format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d")}</span>.
            </p>
            <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30 mb-4">
              ⚠️ This will <strong>delete this week's existing shifts first</strong>, then copy last week's shifts forward by 7 days.
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCopyWeek(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={copyLastWeek} disabled={copyWeekRunning} className="btn btn-primary">
                {copyWeekRunning ? "Copying…" : "Copy and overwrite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(modalSlot || editingShift) && (
        <ShiftModal
          mode={editingShift ? "edit" : "create"}
          editingShift={editingShift ?? undefined}
          day={editingShift ? new Date(editingShift.startTime) : modalSlot!.day}
          employeeId={editingShift ? editingShift.employeeId : modalSlot!.employeeId}
          employeeName={editingShift ? editingShift.employee.name : (employees.find((e) => e.id === modalSlot!.employeeId)?.name ?? "")}
          employeeBaseLocationId={editingShift ? (editingShift.location?.id ?? "") : (employees.find((e) => e.id === modalSlot!.employeeId)?.locations[0]?.location.id ?? "")}
          existingWeeklyHours={weeklyHoursFor(editingShift ? editingShift.employeeId : modalSlot!.employeeId)}
          locations={locations}
          roles={roles}
          tags={tags}
          defaultLocationId={locationFilter}
          defaultRole={modalSlot?.defaultRole}
          onClose={() => { setModalSlot(null); setEditingShift(null); }}
          onSaved={() => { setModalSlot(null); setEditingShift(null); load(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shift card
// ─────────────────────────────────────────────────────────────────────────

function ShiftCard({
  shift, color, dayHours, isClosedDay,
  onEdit, onDelete, onContextMenu,
}: {
  shift: Shift;
  color: string;
  dayHours?: DayHours;
  isClosedDay: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const sStart = new Date(shift.startTime);
  const sEnd = new Date(shift.endTime);
  let outsideHours = false;
  if (!isClosedDay && dayHours?.open && dayHours?.close) {
    const [oh, om] = dayHours.open.split(":").map(Number);
    const [ch, cm] = dayHours.close.split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    const startMin = sStart.getHours() * 60 + sStart.getMinutes();
    const endMin = sEnd.getHours() * 60 + sEnd.getMinutes();
    if (startMin < openMin || endMin > closeMin) outsideHours = true;
  }
  const showWarn = outsideHours || isClosedDay;

  return (
    <div
      onContextMenu={onContextMenu}
      className={`px-2 py-1.5 rounded text-xs group relative text-white ${showWarn ? "ring-2 ring-amber" : ""}`}
      style={{
        background: shift.published ? color : `${color}22`,
        color: shift.published ? "white" : "#1a1a1a",
        border: shift.published ? undefined : `2px dashed ${color}80`,
      }}
    >
      <div className="font-mono">
        {format(sStart, "h:mma")}
        <span className={shift.published ? "text-white/60" : "text-smoke"}> – </span>
        {format(sEnd, "h:mma")}
      </div>
      {shift.role && (
        <div className={shift.published ? "text-white/85 truncate" : "text-smoke truncate"}>
          {shift.role}
        </div>
      )}
      {shift.tag && (
        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: `${shift.tag.color}`, color: "white" }}>
          🏷 {shift.tag.name}
        </div>
      )}
      {shift.location && (
        <div className={`truncate text-[10px] mt-0.5 ${shift.published ? "text-white/70" : "text-smoke"}`}>
          @ {shift.location.name}
        </div>
      )}

      {/* Hover actions */}
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit"
          className="px-1 py-0.5 rounded text-[11px]"
          style={{ background: shift.published ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.06)" }}>
          <Pencil size={11} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete"
          className="px-1 py-0.5 rounded text-[11px]"
          style={{ background: shift.published ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.06)" }}>
          <Trash2 size={11} />
        </button>
      </div>

      {showWarn && (
        <div className="absolute -top-1 -right-1 bg-amber text-white rounded-full p-0.5"
          title={isClosedDay ? "Scheduled on a CLOSED day" : "Scheduled outside store hours"}>
          <AlertTriangle size={10} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shift modal — create OR edit
// ─────────────────────────────────────────────────────────────────────────

function ShiftModal({
  mode, editingShift,
  day, employeeId, employeeName, employeeBaseLocationId, existingWeeklyHours,
  locations, roles, tags,
  defaultLocationId, defaultRole,
  onClose, onSaved,
}: {
  mode: "create" | "edit";
  editingShift?: Shift;
  day: Date;
  employeeId: string;
  employeeName: string;
  employeeBaseLocationId: string;
  existingWeeklyHours: number;
  locations: Location[];
  roles: ShiftRole[];
  tags: ShiftTag[];
  defaultLocationId: string;
  defaultRole?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialLocId = editingShift
    ? (editingShift.location?.id ?? "")
    : (defaultLocationId || employeeBaseLocationId || (locations[0]?.id ?? ""));
  const initialStart = editingShift ? format(new Date(editingShift.startTime), "HH:mm") : "09:00";
  const initialEnd = editingShift ? format(new Date(editingShift.endTime), "HH:mm") : "17:00";

  const [form, setForm] = useState({
    start: initialStart,
    end: initialEnd,
    role: editingShift ? (editingShift.role ?? "") : (defaultRole ?? ""),
    tagId: editingShift ? (editingShift.tagId ?? "") : "",
    notes: editingShift ? (editingShift.notes ?? "") : "",
    locationId: initialLocId,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  // For projected hours, subtract the existing shift's hours if editing
  const editingShiftHours = editingShift
    ? (new Date(editingShift.endTime).getTime() - new Date(editingShift.startTime).getTime()) / 3_600_000
    : 0;
  const projectedWeeklyHours = existingWeeklyHours - editingShiftHours + (shiftHours > 0 ? shiftHours : 0);
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

    const body: any = {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      role: form.role || null,
      tagId: form.tagId || null,
      notes: form.notes || null,
      locationId: form.locationId || null,
    };
    if (mode === "create") {
      body.employeeId = employeeId;
    }
    const res = await fetch(
      mode === "edit" ? `/api/shifts/${editingShift!.id}` : "/api/shifts",
      {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErr(d.error ?? "Failed");
      return;
    }
    onSaved();
  }

  const durationHours = Math.max(0, shiftHours);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">{format(day, "EEEE, MMMM d")}</div>
          <h2 className="display text-2xl">
            {mode === "edit" ? "Edit shift for" : "Shift for"} {employeeName}
          </h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {locations.length > 0 && (
            <div>
              <label>Location</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">No specific location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Start time</label>
              <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </div>
            <div>
              <label>End time</label>
              <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </div>
          </div>

          {durationHours >= 5 && (
            <div className="text-xs text-smoke bg-dust/30 px-3 py-2 rounded">
              📋 Kentucky requires a meal break for shifts 5+ hours. Schedule it between hours 3 and 5.
            </div>
          )}

          <div>
            <label>Role / position</label>
            {roles.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={roles.some((r) => r.name === form.role) ? form.role : ""}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="!flex-1"
                >
                  <option value="">— pick a role —</option>
                  {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
                <input
                  placeholder="or custom"
                  value={!roles.some((r) => r.name === form.role) ? form.role : ""}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="!flex-1"
                />
              </div>
            ) : (
              <input placeholder="e.g. Budtender" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            )}
          </div>

          <div>
            <label>Tag (optional)</label>
            {tags.length > 0 ? (
              <select value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })}>
                <option value="">— none —</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <div className="text-xs text-smoke italic">
                No tags yet. <Link href="settings/shift-categories" className="text-rust hover:underline">Create tags →</Link>
              </div>
            )}
          </div>

          <div>
            <label>Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {err && <div className="text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">{err}</div>}

          {(isClosedDay || outsideHours || willCauseOT) && (
            <div className="space-y-2">
              {isClosedDay && (
                <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div><strong>Location closed</strong> on {format(day, "EEEE")}.</div>
                </div>
              )}
              {outsideHours && !isClosedDay && (
                <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div><strong>Outside store hours</strong>. Open {format(day, "EEEE")}: {dayHours?.open}–{dayHours?.close}</div>
                </div>
              )}
              {willCauseOT && (
                <div className="text-xs text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div><strong>Overtime warning</strong>. {employeeName}'s weekly hours will be{" "}
                    <span className="font-mono">{projectedWeeklyHours.toFixed(1)}h</span> (over 40h triggers OT pay).
                  </div>
                </div>
              )}
            </div>
          )}

          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create shift (draft)"}
          </button>
          {mode === "create" && (
            <div className="text-xs text-smoke text-center">Shifts are created as drafts. Hit Publish to notify employees.</div>
          )}
        </form>
      </div>
    </div>
  );
}
