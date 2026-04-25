"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/navbar";
import { Download, Pencil, Trash2, X, ChevronDown } from "lucide-react";
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

function hours(a: string, b: string | null) {
  if (!b) return 0;
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

export default function TimesheetsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(
    format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [to, setTo] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [editing, setEditing] = useState<Entry | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const role = (session?.user as any)?.role;
  const canManage = role === "ADMIN" || role === "MANAGER";

  async function load() {
    setLoading(true);
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59").toISOString();
    const res = await fetch(`/api/timesheets?from=${fromIso}&to=${toIso}`);
    if (res.ok) {
      const d = await res.json();
      setEntries(d.entries);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, from, to]);

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

  // Totals
  let totalHours = 0;
  let totalPay = 0;
  let overtimeHours = 0;
  for (const e of entries) {
    const h = hours(e.clockIn, e.clockOut);
    totalHours += h;
    totalPay += h * (e.user.hourlyWage ?? 0);
  }
  // Rough OT estimate: hours beyond 40/wk per employee
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
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
              Hours and pay
            </div>
            <h1 className="display text-5xl">Timesheets</h1>
          </div>
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
                    className="block px-3 py-2 text-sm hover:bg-dust/40 rounded"
                  >
                    CSV (.csv)
                  </a>
                  <a
                    href={exportUrl("xlsx")}
                    className="block px-3 py-2 text-sm hover:bg-dust/40 rounded"
                  >
                    Excel (.xlsx)
                  </a>
                  <a
                    href={exportUrl("pdf")}
                    className="block px-3 py-2 text-sm hover:bg-dust/40 rounded"
                  >
                    PDF (.pdf)
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card p-4 mb-6 flex items-end gap-3 flex-wrap">
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

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <SummaryCard
            label="Total hours"
            value={totalHours.toFixed(1)}
            unit="hrs"
          />
          <SummaryCard
            label="Estimated pay"
            value={`$${totalPay.toFixed(2)}`}
            unit=""
          />
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
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-dust/30">
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-smoke">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Clock In</th>
                  <th className="px-4 py-3 font-medium">Clock Out</th>
                  <th className="px-4 py-3 font-medium text-right">Hours</th>
                  <th className="px-4 py-3 font-medium text-right">Pay</th>
                  <th className="px-4 py-3 font-medium">Edited</th>
                  {canManage && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-dust">
                {entries.map((e) => {
                  const h = hours(e.clockIn, e.clockOut);
                  const pay = h * (e.user.hourlyWage ?? 0);
                  return (
                    <tr key={e.id} className="text-sm">
                      <td className="px-4 py-3">
                        <div className="font-medium">{e.user.name}</div>
                        <div className="text-[11px] text-smoke">
                          {e.user.department ?? "—"} ·{" "}
                          <span className="font-mono">
                            ${e.user.hourlyWage.toFixed(2)}/hr
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {format(new Date(e.clockIn), "MMM d, h:mma")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {e.clockOut ? (
                          format(new Date(e.clockOut), "MMM d, h:mma")
                        ) : (
                          <span className="chip chip-rust">In progress</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {h.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        ${pay.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {e.editedBy ? (
                          <span
                            className="chip chip-rust"
                            title={e.editNote ?? ""}
                          >
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
                              className="btn btn-ghost !p-1.5 text-rust"
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
    <div className={`card p-5 ${warn ? "border-rust/40 bg-rust/5" : ""}`}>
      <div className="text-[10px] tracking-[0.2em] uppercase text-smoke mb-2">
        {label}
      </div>
      <div className="display text-3xl">
        {value}
        {unit && <span className="text-smoke text-base ml-1">{unit}</span>}
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
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-1">
            Adjust entry
          </div>
          <h2 className="display text-2xl">{entry.user.name}</h2>
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
          <div className="text-xs text-smoke bg-dust/30 px-3 py-2 rounded">
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
