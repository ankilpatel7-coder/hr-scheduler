"use client";

/**
 * Client-side list with rename/delete for the templates management page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

type Row = {
  id: string;
  name: string;
  shiftCount: number;
  createdAt: string;
  createdByName: string;
};

export default function TemplatesAdminList({
  tenantSlug: _tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: Row[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function handleRename(t: Row) {
    const name = window.prompt("Rename template:", t.name);
    if (!name || !name.trim() || name.trim() === t.name) return;
    setBusy(t.id);
    try {
      const res = await fetch(`/api/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Rename failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(t: Row) {
    if (!window.confirm(`Delete template "${t.name}"? This can't be undone.`)) return;
    setBusy(t.id);
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Delete failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card divide-y divide-ink/5">
      {initial.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink/[0.02]"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{t.name}</div>
            <div className="text-[11px] text-smoke">
              {t.shiftCount} shifts · created {t.createdAt} by {t.createdByName}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleRename(t)}
              disabled={busy === t.id}
              className="p-1.5 text-smoke hover:text-ink rounded disabled:opacity-50"
              title="Rename"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => handleDelete(t)}
              disabled={busy === t.id}
              className="p-1.5 text-smoke hover:text-red-600 rounded disabled:opacity-50"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
