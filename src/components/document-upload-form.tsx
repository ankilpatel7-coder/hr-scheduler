"use client";

/**
 * Admin upload form for documents v2 — flexible assignment.
 *
 * Admin can assign the document to:
 *   - All active employees (default)
 *   - Employees at specific locations
 *   - Specific employees individually
 *   - Any combination of the above (union)
 */

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle, CheckCircle2, Users, MapPin, Search, Check } from "lucide-react";

type Employee = { id: string; name: string; active: boolean; locations?: { id: string; name: string }[] };
type Location = { id: string; name: string };
type AssignMode = "all" | "custom";

export default function DocumentUploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(true);
  // requireSignature=true → existing signing flow. false → personal/view-only
  // (paystubs, personal HR docs). Personal docs never block clock-in and
  // are NOT in the employee's "to sign" list.
  const [requireSignature, setRequireSignature] = useState(true);

  // Assignment
  const [mode, setMode] = useState<AssignMode>("all");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/employees?activeOnly=true", { cache: "no-store" }).then((r) => r.ok ? r.json() : { employees: [] }),
      fetch("/api/locations", { cache: "no-store" }).then((r) => r.ok ? r.json() : { locations: [] }),
    ]).then(([eRes, lRes]) => {
      if (cancelled) return;
      const emps: Employee[] = (eRes.employees ?? [])
        .filter((e: any) => e.role !== "ADMIN" && e.active)
        .map((e: any) => ({
          id: e.id,
          name: e.name || e.email,
          active: e.active,
          locations: e.locations?.map((l: any) => l.location ?? l) ?? [],
        }));
      setEmployees(emps);
      setLocations(lRes.locations ?? []);
    });
    return () => { cancelled = true; };
  }, []);

  // Effective recipient set: union of (selected employees) + (employees at any selected location)
  const effectiveSet = new Set<string>();
  if (mode === "all") {
    employees.forEach((e) => effectiveSet.add(e.id));
  } else {
    selectedEmpIds.forEach((id) => effectiveSet.add(id));
    if (selectedLocIds.length > 0) {
      const locSet = new Set(selectedLocIds);
      for (const e of employees) {
        if (e.locations?.some((l) => locSet.has(l.id))) {
          effectiveSet.add(e.id);
        }
      }
    }
  }
  const effectiveCount = effectiveSet.size;

  function toggleEmp(id: string) {
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleLoc(id: string) {
    setSelectedLocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function selectAllEmps() {
    setSelectedEmpIds(employees.map((e) => e.id));
  }
  function clearEmps() {
    setSelectedEmpIds([]);
  }

  const filteredEmps = employees.filter((e) =>
    e.name.toLowerCase().includes(empSearch.toLowerCase()),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ kind: "err", text: "Pick a PDF file first." });
      return;
    }
    if (!title.trim()) {
      setMsg({ kind: "err", text: "Title is required." });
      return;
    }
    if (effectiveCount === 0) {
      setMsg({ kind: "err", text: "Pick at least one recipient (or switch to All)." });
      return;
    }

    setBusy(true);
    setMsg(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("required", String(required));
    fd.append("requireSignature", String(requireSignature));
    fd.append("assignMode", mode);
    if (mode === "custom") {
      fd.append("employeeIds", selectedEmpIds.join(","));
      fd.append("locationIds", selectedLocIds.join(","));
    }

    try {
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      setMsg({
        kind: "ok",
        text: `Uploaded. ${j.employeesAssigned} employee${j.employeesAssigned === 1 ? "" : "s"} assigned to sign.`,
      });
      setTitle("");
      setDescription("");
      setRequired(true);
      setRequireSignature(true);
      setMode("all");
      setSelectedEmpIds([]);
      setSelectedLocIds([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div>
        <h2 className="display text-xl text-ink mb-1">Upload new document</h2>
        <p className="text-xs text-smoke">PDF only, up to 10MB.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Employee Handbook 2026"
          className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink mb-1">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Brief summary"
          className="w-full text-sm rounded border border-ink/10 px-3 py-2 bg-white"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink mb-1">PDF file</label>
        <input
          type="file"
          ref={fileRef}
          accept="application/pdf"
          className="w-full text-xs"
        />
      </div>

      {/* === Mode: signed vs personal === */}
      <div>
        <label className="block text-xs font-medium text-ink mb-2">Mode</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setRequireSignature(true);
              setRequired(true);
            }}
            className={`text-left rounded border px-3 py-2 transition ${
              requireSignature
                ? "border-rust bg-rust/5 ring-2 ring-rust/30"
                : "border-ink/10 hover:bg-ink/5"
            }`}
          >
            <div className="font-medium text-ink">Requires signature</div>
            <div className="text-[11px] text-smoke mt-0.5">
              Employees must e-sign. Can block clock-in.
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setRequireSignature(false);
              setRequired(false);
              setMode("custom");
            }}
            className={`text-left rounded border px-3 py-2 transition ${
              !requireSignature
                ? "border-rust bg-rust/5 ring-2 ring-rust/30"
                : "border-ink/10 hover:bg-ink/5"
            }`}
          >
            <div className="font-medium text-ink">Personal — view only</div>
            <div className="text-[11px] text-smoke mt-0.5">
              No signature. Only the assigned employee can see it (e.g. paystubs).
            </div>
          </button>
        </div>
      </div>

      {/* === Assignment === */}
      <div className="border-t border-ink/10 pt-4 -mx-5 px-5">
        <label className="block text-xs font-medium text-ink mb-2">Assign to</label>
        <div className="inline-flex border border-ink/10 rounded overflow-hidden text-xs mb-3">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`px-3 py-1.5 font-medium ${
              mode === "all" ? "bg-rust text-white" : "bg-white hover:bg-ink/5"
            }`}
          >
            All active employees ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`px-3 py-1.5 font-medium border-l border-ink/10 ${
              mode === "custom" ? "bg-rust text-white" : "bg-white hover:bg-ink/5"
            }`}
          >
            Custom selection
          </button>
        </div>

        {mode === "custom" && (
          <div className="space-y-3">
            {/* Locations */}
            {locations.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-smoke font-semibold mb-1.5">
                  <MapPin size={11} /> By location (everyone assigned to these)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {locations.map((l) => {
                    const selected = selectedLocIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => toggleLoc(l.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition ${
                          selected
                            ? "bg-rust text-white border-rust"
                            : "bg-white text-ink border-ink/10 hover:bg-ink/5"
                        }`}
                      >
                        {selected && <Check size={11} strokeWidth={3} />}
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Individual employees */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-smoke font-semibold">
                  <Users size={11} /> Individual employees
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={selectAllEmps} className="text-rust hover:underline">
                    Select all
                  </button>
                  <span className="text-dust">·</span>
                  <button type="button" onClick={clearEmps} className="text-smoke hover:text-ink">
                    Clear
                  </button>
                </div>
              </div>

              <div className="relative mb-2">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-smoke" />
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full text-sm rounded border border-ink/10 pl-7 pr-3 py-1.5 bg-white"
                />
              </div>

              <div className="border border-ink/10 rounded max-h-44 overflow-y-auto bg-white">
                {filteredEmps.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-smoke italic text-center">
                    {employees.length === 0 ? "No active employees." : "No matches."}
                  </div>
                ) : (
                  filteredEmps.map((e) => {
                    const selected = selectedEmpIds.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() => toggleEmp(e.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-ink/[0.03] cursor-pointer text-sm text-left"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            selected ? "bg-rust border-rust text-white" : "border-ink/20 bg-white"
                          }`}
                        >
                          {selected && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className="truncate">{e.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <div className="text-[11px] text-smoke mt-3">
          <strong className="text-ink">{effectiveCount}</strong> recipient
          {effectiveCount === 1 ? "" : "s"} will be assigned to sign.
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-ink cursor-pointer pt-2 border-t border-ink/10">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="w-4 h-4"
        />
        Required (blocks clock-in until signed)
      </label>

      <button
        type="submit"
        disabled={busy || effectiveCount === 0}
        className="btn btn-rust inline-flex items-center gap-1.5 w-full justify-center disabled:opacity-50"
      >
        <Upload size={14} /> {busy ? "Uploading…" : "Upload document"}
      </button>

      {msg && (
        <div
          className={`flex items-center gap-2 text-xs rounded px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {msg.text}
        </div>
      )}
    </form>
  );
}
