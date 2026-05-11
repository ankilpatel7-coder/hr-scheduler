"use client";

/**
 * TemplatesBar — Save/Apply Template controls for the schedule page toolbar.
 *
 * Drop into the schedule page header:
 *
 *   import TemplatesBar from "@/components/templates-bar";
 *   <TemplatesBar
 *     weekStartIso={weekStart.toISOString()}
 *     weekEndIso={weekEnd.toISOString()}
 *     onApplied={() => router.refresh()}
 *   />
 *
 * - Save: snapshots current week as a named template.
 * - Apply: lists existing templates; selecting one shows a destructive
 *   confirmation modal, then replaces all draft shifts in this week.
 */

import { useEffect, useState } from "react";
import { Save, LayoutTemplate, Trash2, Pencil, X } from "lucide-react";

type Template = {
  id: string;
  name: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  _count: { shifts: number };
};

export default function TemplatesBar({
  weekStartIso,
  weekEndIso,
  onApplied,
}: {
  weekStartIso: string;
  weekEndIso: string;
  onApplied?: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<null | "apply" | "save" | "manage">(null);
  const [confirmingApply, setConfirmingApply] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/templates", { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setTemplates(j.templates ?? []);
    }
    setLoaded(true);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSave() {
    const name = window.prompt("Name this template:");
    if (!name || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), from: weekStartIso, to: weekEndIso }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to save template");
      setMsg(`Saved "${name.trim()}".`);
      await refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  async function handleApply(t: Template) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/templates/${t.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: weekStartIso }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to apply template");
      const houseNote =
        j.houseShiftCount > 0
          ? ` (${j.houseShiftCount} became house shifts — original employee unavailable)`
          : "";
      setMsg(
        `Applied "${t.name}": ${j.applied} new shifts, ${j.replaced} replaced.${houseNote}`,
      );
      setConfirmingApply(null);
      setOpen(null);
      onApplied?.();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  async function handleRename(t: Template) {
    const name = window.prompt("Rename template:", t.name);
    if (!name || !name.trim() || name.trim() === t.name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to rename");
      await refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(t: Template) {
    if (!window.confirm(`Delete template "${t.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete");
      }
      await refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleSave}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-ink/10 bg-white hover:bg-ink/5 disabled:opacity-50"
        title="Save the current week as a named template"
      >
        <Save size={12} />
        Save as template
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === "apply" ? null : "apply")}
          disabled={busy || templates.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-ink/10 bg-white hover:bg-ink/5 disabled:opacity-50"
          title={
            templates.length === 0
              ? "No templates saved yet — use Save first"
              : "Apply a saved template to this week"
          }
        >
          <LayoutTemplate size={12} />
          Apply template
          {templates.length > 0 && (
            <span className="ml-1 text-[10px] text-smoke">({templates.length})</span>
          )}
        </button>

        {open === "apply" && templates.length > 0 && (
          <div className="absolute right-0 mt-1 w-72 z-30 rounded-lg border border-ink/10 bg-white shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-ink/5 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.15em] text-smoke font-medium">
                Templates
              </span>
              <button
                onClick={() => setOpen(null)}
                className="text-smoke hover:text-ink"
                aria-label="Close"
              >
                <X size={12} />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center justify-between px-3 py-2 hover:bg-ink/[0.03] border-b border-ink/5 last:border-b-0"
                >
                  <button
                    onClick={() => setConfirmingApply(t)}
                    className="flex-1 text-left"
                  >
                    <div className="text-xs font-medium text-ink">{t.name}</div>
                    <div className="text-[10px] text-smoke">
                      {t._count.shifts} shifts · by {t.createdBy.name}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => handleRename(t)}
                      className="p-1 text-smoke hover:text-ink rounded"
                      title="Rename"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(t)}
                      className="p-1 text-smoke hover:text-red-600 rounded"
                      title="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {msg && (
        <span className="text-[11px] text-ink/70 ml-2 max-w-xs truncate" title={msg}>
          {msg}
        </span>
      )}

      {/* Destructive confirm modal */}
      {confirmingApply && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-medium text-ink mb-2">
              Apply &ldquo;{confirmingApply.name}&rdquo;?
            </h3>
            <p className="text-sm text-ink/70 mb-1">
              This will <strong>replace all draft shifts</strong> in the current
              week with {confirmingApply._count.shifts} shifts from this template.
            </p>
            <p className="text-xs text-smoke mb-4">
              Published shifts are not affected. Original employees who are no
              longer active become house shifts.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmingApply(null)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded border border-ink/10 hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApply(confirmingApply)}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Applying…" : "Replace week"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
