"use client";

/**
 * Manage Roles + Tags inline. One client component for both since the CRUD
 * shape is identical.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/category-colors";

type Item = { id: string; name: string; color: string; sortOrder?: number };

export default function CategoriesManager({
  initialRoles,
  initialTags,
}: {
  initialRoles: Item[];
  initialTags: Item[];
}) {
  return (
    <div className="space-y-6">
      <Section
        title="Roles"
        subtitle="Schedule rows are grouped by role. Each role section gets its color in the header."
        endpoint="/api/roles"
        initial={initialRoles}
        kind="role"
      />
      <Section
        title="Tags"
        subtitle="Tags appear as a colored pill on the shift card. Use them for ad-hoc categorization (Delivery, Sales, Special event)."
        endpoint="/api/tags"
        initial={initialTags}
        kind="tag"
      />
    </div>
  );
}

function Section({
  title,
  subtitle,
  endpoint,
  initial,
  kind,
}: {
  title: string;
  subtitle: string;
  endpoint: string;
  initial: Item[];
  kind: "role" | "tag";
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0].value);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function single(): string {
    return kind === "role" ? "role" : "tag";
  }

  async function add() {
    setError(null);
    if (!newName.trim()) {
      setError(`${single()} name is required`);
      return;
    }
    setBusy(true);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    const created = (kind === "role" ? data.role : data.tag) as Item;
    setItems((xs) => [...xs, created]);
    setNewName("");
    setAdding(false);
    router.refresh();
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color);
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    const res = await fetch(`${endpoint}/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    const updated = (kind === "role" ? data.role : data.tag) as Item;
    setItems((xs) => xs.map((x) => (x.id === editingId ? updated : x)));
    setEditingId(null);
    router.refresh();
  }

  async function remove(item: Item) {
    if (
      !confirm(
        `Delete ${single()} "${item.name}"? Existing shifts using it will keep the name but lose the color.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`${endpoint}/${item.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to delete");
      return;
    }
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="display text-2xl text-ink">{title}</h2>
        <p className="text-xs text-smoke mt-1">{subtitle}</p>
      </div>

      {items.length === 0 && !adding && (
        <div className="text-sm text-smoke italic mb-3">No {title.toLowerCase()} yet.</div>
      )}

      <div className="space-y-2">
        {items.map((item) =>
          editingId === item.id ? (
            <div key={item.id} className="flex items-center gap-3 p-2 rounded border border-dust bg-paper">
              <ColorPicker value={editColor} onChange={setEditColor} />
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="!w-auto flex-1"
                autoFocus
              />
              <button onClick={saveEdit} disabled={busy} className="btn btn-primary !py-1.5">
                <Check size={14} /> Save
              </button>
              <button onClick={() => setEditingId(null)} className="btn btn-ghost !py-1.5">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-ink/5 group">
              <span
                className="w-7 h-7 rounded-md flex-shrink-0"
                style={{ background: item.color }}
                aria-label={item.color}
              />
              <span className="text-sm text-ink font-medium flex-1">{item.name}</span>
              <span className="text-[10px] text-smoke font-mono">{item.color}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(item)} className="btn btn-ghost !p-1.5" title="Rename / recolor">
                  <Pencil size={13} />
                </button>
                <button onClick={() => remove(item)} className="btn btn-ghost !p-1.5 text-rose" title="Delete">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {adding ? (
        <div className="mt-4 flex items-center gap-3 p-2 rounded border border-dust bg-paper">
          <ColorPicker value={newColor} onChange={setNewColor} />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`New ${single()} name`}
            className="!w-auto flex-1"
            autoFocus
          />
          <button onClick={add} disabled={busy} className="btn btn-primary !py-1.5">
            <Check size={14} /> Add
          </button>
          <button onClick={() => setAdding(false)} className="btn btn-ghost !py-1.5">
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-sm text-rust hover:underline mt-4 inline-flex items-center gap-1"
        >
          <Plus size={14} /> Add {single()}
        </button>
      )}

      {error && (
        <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30 mt-3">
          {error}
        </div>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 flex-shrink-0">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          title={c.name}
          className="w-6 h-6 rounded-md transition-all"
          style={{
            background: c.value,
            border: value === c.value ? "2px solid #1a1a1a" : "0.5px solid rgba(0,0,0,0.15)",
            transform: value === c.value ? "scale(1.1)" : "scale(1)",
          }}
        />
      ))}
    </div>
  );
}
