"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import LocationFilter from "@/components/location-filter";
import { Download, Pencil, Trash2, X, ChevronDown, Plus } from "lucide-react";
import { format, startOfWeek, endOfWeek, subDays } from "date-fns";

type Entry = {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  selfieIn: string | null;
  selfieOut: string | null;
  editedBy: string | null;
  editNote: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    department: string | null;
    hourlyWage: number;
  };
};

type Employee = { id: string; name: string };

function hours(a: string, b: string | null) {
  if (!b) return 0;
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

export default function TimesheetsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [to, setTo] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [editing, setEditing] = useState<Entry | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const role = (session?.user as any)?.role;
  const isAdmin = role === "ADMIN";
  const canManage = isAdmin || role === "MANAGER";

  async function load() {
    setLoading(true);
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59").toISOString();
    const locParam = locationFilter ? `&locationId=${locationFilter}` : "";
    const res = await fetch(`/api/timesheets?from=${fromIso}&to=${toIso}${locParam}`);
    if (res.ok) {
      const d = await res.json();
      setEntries(d.entries);
    }
    if (canManage) {
      const eRes = await fetch("/api/employees");
      if (eRes.ok) {
        const d = await eRes.json();
        setEmployees(d.employees.map((e: any) => ({ id: e.id, name: e.name })));
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, from, to, locationFilter]);

  function setQuickRange(kind: "this-week" | "last-week" | "last-14") {
    if (kind === "this-week") {
      setFrom(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setTo(format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (kind === "last-week") {
      const lw = subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7);
      setFrom(format(lw, "yyyy-MM-dd"));
      setTo(format(endOfWeek(lw, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else {
      setFrom(format(subDays(new Date(), 14), "yyyy-MM-dd"));
      setTo(format(new Date(), "yyyy-MM-dd"));
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/clock-entries?id=${id}`, { method: "DELETE" });
    load();
  }

  function exportUrl(kind: "csv" | "xlsx" | "pdf") {
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59").toISOString();
    if (kind === "csv") return `/api/timesheets?from=${fromIso}&to=${toIso}&format=csv`;
    if (kind === "xlsx")
      return `/api/timesheets/export-xlsx?from=${fromIso}&to=${toIso}`;
    return `/api/timesheets/export-pdf?from=${fromIso}&to=${toIso}`;
  }

  let totalHours = 0;
  let totalPay = 0;
  let overtimeHours = 0;
  for (const e of entries) {
    const h = hours(e.clockIn, e.clockOut);
    totalHours += h;
    if (isAdmin) totalPay += h * (e.user.hourlyWage ?? 0);
  }
  const byUser = new Map<string, number>();
  for (const e of entries) {
    const h = hours(e.clockIn, e.clockOut);
    byUser.set(e.user.id, (byUser.get(e.user.id) ?? 0) + h);
  }
  for (const h of byUser.values()) {
    if (h > 40) overtimeHours += h - 40;
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-10 animate-fade-in">
        <div className="flex items-baseline justify-between mb-8 flex-wrap gap-4 animate-slide-up">
          <div>
            <div className="label-eyebrow mb-3">Hours and pay</div>
            <h1 className="display text-5xl text-ink">Timesheets</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <LocationFilter value={locationFilter} onChange={setLocationFilter} />
            {isAdmin && (
              <button
                onClick={() => setShowAdd(true)}
                className="btn btn-secondary"
              >
                <Plus size={16} /> Manual entry
              </button>
            )}
            {canManage && (
              <div className="relative">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  className="btn btn-primary"
                >
                  <Download size={16} /> Export <ChevronDown size={14} />
                </button>
                {exportOpen && (
                  <div
                    className="absolute right-0 mt-2 card p-1 z-30 min-w-[180px]"
                    onMouseLeave={() => setExportOpen(false)}
                  >
                    <a
                      href={exportUrl("csv")}
                      className="block px-3 py-2 text-sm hover:bg-rust/10 hover:text-ink rounded text-smoke transition-colors"
                    >
                      CSV (.csv)
                    </a>
                    {isAdmin && (
                      <>
                        <a
                          href={exportUrl("xlsx")}
                          className="block px-3 py-2 text-sm hover:bg-rust/10 hover:text-ink rounded text-smoke transition-colors"
                        >
                          Excel (.xlsx)
                        </a>
                        <a
                          href={exportUrl("pdf")}
                          className="block px-3 py-2 text-sm hover:bg-rust/10 hover:text-ink rounded text-smoke transition-colors"
                        >
                          PDF (.pdf)
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card p-4 mb-6 flex items-end gap-3 flex-wrap animate-slide-up">
          <div>
            <label>From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="!w-auto"
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="!w-auto"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setQuickRange("this-week")}
              className="btn btn-secondary !py-1"
            >
              This week
            </button>
            <button
              onClick={() => setQuickRange("last-week")}
              className="btn btn-secondary !py-1"
            >
              Last week
            </button>
            <button
              onClick={() => setQuickRange("last-14")}
              className="btn btn-secondary !py-1"
            >
              Last 14 days
            </button>
          </div>
        </div>

        <div className={`grid gap-4 mb-6 ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
          <SummaryCard label="Total hours" value={totalHours.toFixed(1)} unit="hrs" />
          {isAdmin && (
            <SummaryCard
              label="Estimated pay"
              value={`$${totalPay.toFixed(2)}`}
              unit=""
            />
          )}
          <SummaryCard
            label="Overtime hours"
            value={overtimeHours.toFixed(1)}
            unit="hrs"
            warn={overtimeHours > 0}
          />
        </div>

        {loading ? (
          <div className="text-smoke">Loading…</div>
        ) : (
          <div className="card overflow-x-auto animate-slide-up">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-smoke">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Clock In</th>
                  <th className="px-4 py-3 font-medium">Clock Out</th>
                  <th className="px-4 py-3 font-medium text-right">Hours</th>
                  {isAdmin && <th className="px-4 py-3 font-medium text-right">Pay</th>}
                  <th className="px-4 py-3 font-medium">Edited</th>
                  {canManage && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-dust">
                {entries.map((e) => {
                  const h = hours(e.clockIn, e.clockOut);
                  const pay = h * (e.user.hourlyWage ?? 0);
                  return (
                    <tr key={e.id} className="text-sm hover:bg-rust/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{e.user.name}</div>
                        <div className="text-[11px] text-smoke">
                          {e.user.department ?? "—"}
                          {isAdmin && (
                            <>
                              {" · "}
                              <span className="font-mono">
                                ${e.user.hourlyWage.toFixed(2)}/hr
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">
                        {format(new Date(e.clockIn), "MMM d, h:mma")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">
                        {e.clockOut ? (
                          format(new Date(e.clockOut), "MMM d, h:mma")
                        ) : (
                          <span className="chip chip-rust">In progress</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-glow">
                        {h.toFixed(2)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right font-mono text-ink">
                          ${pay.toFixed(2)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs">
                        {e.editedBy ? (
                          <span className="chip chip-rust" title={e.editNote ?? ""}>
                            edited
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setEditing(e)}
                              className="btn btn-ghost !p-1.5"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteEntry(e.id)}
                              className="btn btn-ghost !p-1.5 text-rose"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {entries.length === 0 && (
              <div className="p-8 text-center text-sm text-smoke italic">
                No clock entries in this date range.
              </div>
            )}
          </div>
        )}
      </main>

      {editing && (
        <EditEntryModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {showAdd && (
        <AddEntryModal
          employees={employees}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value: string;
  unit: string;
  warn?: boolean;
}) {
  return (
    <div
      className="card p-5"
      style={
        warn
          ? {
              borderColor: "rgba(245, 158, 11, 0.5)",
              background:
                "linear-gradient(180deg, rgba(245,158,11,0.08) 0%, #ffffff 100%)",
            }
          : undefined
      }
    >
      <div className="label-eyebrow mb-2">{label}</div>
      <div className="display text-3xl text-ink tabular-nums">
        {value}
        {unit && <span className="text-smoke text-base ml-1 font-sans">{unit}</span>}
      </div>
    </div>
  );
}

function EditEntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clockIn, setClockIn] = useState(
    format(new Date(entry.clockIn), "yyyy-MM-dd'T'HH:mm")
  );
  const [clockOut, setClockOut] = useState(
    entry.clockOut ? format(new Date(entry.clockOut), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/clock-entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entry.id,
        clockIn: new Date(clockIn).toISOString(),
        clockOut: clockOut ? new Date(clockOut).toISOString() : null,
        editNote: note,
      }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Adjust entry</div>
          <h2 className="display text-2xl text-ink">{entry.user.name}</h2>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Clock in</label>
            <input
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Clock out</label>
            <input
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
            />
            <div className="text-xs text-smoke mt-1">
              Leave blank if employee is still clocked in.
            </div>
          </div>
          <div>
            <label>Reason for adjustment</label>
            <textarea
              rows={2}
              required
              placeholder="e.g. Forgot to clock out — verified shift end with manager"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30">
            ⚠️ This will be marked as an edited entry on payroll exports.
          </div>
          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Save adjustment"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddEntryModal({
  employees,
  onClose,
  onSaved,
}: {
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [userId, setUserId] = useState("");
  const [clockInDate, setClockInDate] = useState(today);
  const [clockInTime, setClockInTime] = useState("09:00");
  const [clockOutDate, setClockOutDate] = useState(today);
  const [clockOutTime, setClockOutTime] = useState("17:00");
  const [hasOut, setHasOut] = useState(true);
  const [note, setNote] = useState("Added manually by admin");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userId) {
      setErr("Pick an employee");
      return;
    }
    const inIso = new Date(`${clockInDate}T${clockInTime}`).toISOString();
    const outIso = hasOut ? new Date(`${clockOutDate}T${clockOutTime}`).toISOString() : null;
    if (outIso && new Date(outIso) <= new Date(inIso)) {
      setErr("Clock out must be after clock in");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/clock-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        clockIn: inIso,
        clockOut: outIso,
        editNote: note,
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
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 btn btn-ghost !p-1.5">
          <X size={16} />
        </button>
        <div className="mb-6">
          <div className="label-eyebrow mb-1">Manual time entry</div>
          <h2 className="display text-2xl text-ink">Add clock-in / out</h2>
          <p className="text-sm text-smoke mt-2">
            For when an employee forgot to clock in or you're entering paper records.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label>Employee</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            >
              <option value="">Select an employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label>Clock in date</label>
              <input
                type="date"
                value={clockInDate}
                onChange={(e) => setClockInDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Clock in time</label>
              <input
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 !mb-2">
              <input
                type="checkbox"
                checked={hasOut}
                onChange={(e) => setHasOut(e.target.checked)}
              />
              <span className="!text-xs">Add clock out (uncheck if still on shift)</span>
            </label>
            {hasOut && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="date"
                    value={clockOutDate}
                    onChange={(e) => setClockOutDate(e.target.value)}
                  />
                </div>
                <div>
                  <input
                    type="time"
                    value={clockOutTime}
                    onChange={(e) => setClockOutTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label>Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paper timesheet from 10/14"
            />
          </div>

          {err && (
            <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
              {err}
            </div>
          )}

          <div className="text-xs text-amber bg-amber/10 px-3 py-2 rounded border border-amber/30">
            ⚠️ Manual entries are flagged as edited on payroll exports.
          </div>

          <button disabled={saving} className="btn btn-primary w-full">
            {saving ? "Saving…" : "Add entry"}
          </button>
        </form>
      </div>
    </div>
  );
}
