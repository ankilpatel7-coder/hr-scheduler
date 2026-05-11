"use client";

/**
 * Multi-select employee dropdown — popover with checkboxes.
 *
 * Usage:
 *   <EmployeeMultiSelect
 *     employees={employees}
 *     selectedIds={selectedIds}
 *     onChange={(ids) => setSelectedIds(ids)}
 *   />
 *
 * Renders a button that shows "All employees" or "N employees" with chips,
 * opens a popover with a search input + checkbox list. Click outside or
 * "Done" to close.
 */

import { useState, useRef, useEffect } from "react";
import { Users, X, Check, ChevronDown } from "lucide-react";

type Employee = { id: string; name: string };

export default function EmployeeMultiSelect({
  employees,
  selectedIds,
  onChange,
  className,
  placeholder = "All employees",
}: {
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selectedSet = new Set(selectedIds);
  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange(employees.map((e) => e.id));
  }
  function clearAll() {
    onChange([]);
  }

  const label =
    selectedIds.length === 0
      ? placeholder
      : selectedIds.length === employees.length
      ? `All ${employees.length} employees`
      : selectedIds.length === 1
      ? employees.find((e) => e.id === selectedIds[0])?.name ?? "1 employee"
      : `${selectedIds.length} employees`;

  return (
    <div ref={ref} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-sm rounded border border-ink/10 px-3 py-2 bg-white hover:bg-ink/[0.02] min-w-[180px]"
      >
        <Users size={13} className="text-smoke shrink-0" />
        <span className={`flex-1 text-left truncate ${selectedIds.length === 0 ? "text-smoke" : "text-ink"}`}>
          {label}
        </span>
        {selectedIds.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="text-smoke hover:text-ink shrink-0 cursor-pointer"
            aria-label="Clear selection"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={12} className="text-smoke shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 left-0 w-72 rounded-lg border border-ink/10 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-ink/5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              autoFocus
              className="w-full text-sm rounded border border-ink/10 px-2 py-1 bg-white"
            />
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 border-b border-ink/5 text-[11px]">
            <button
              type="button"
              onClick={selectAll}
              className="text-rust hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-smoke hover:text-ink"
            >
              Clear
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-smoke italic text-center">
                No matches.
              </div>
            ) : (
              filtered.map((e) => {
                const selected = selectedSet.has(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggle(e.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-ink/[0.03] cursor-pointer text-sm text-left"
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selected
                          ? "bg-rust border-rust text-white"
                          : "border-ink/20 bg-white"
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

          <div className="border-t border-ink/5 p-2 flex justify-between items-center bg-paper">
            <span className="text-[11px] text-smoke">
              {selectedIds.length} of {employees.length} selected
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-rust hover:underline"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
