"use client";

/**
 * Main client component for /[tenant]/documents (admin).
 *
 * Renders the folder sidebar + filtered document list + bulk action bar +
 * folder/doc modals. Calls /api/document-folders and /api/documents/bulk.
 *
 * State only — no drag-and-drop yet (Phase 3 wires @dnd-kit).
 */

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Upload,
  CheckSquare,
  Square,
  X,
  FolderInput,
  ArchiveX,
  Star,
  StarOff,
  MoreHorizontal,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import FolderSidebar, { FolderNode } from "./documents-folder-sidebar";
import DocumentUploadForm from "@/components/document-upload-form";
import DocsReindexButton from "@/components/docs-reindex-button";

export type DocRow = {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  required: boolean;
  version: number;
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
  uploadedByName: string;
  createdAt: string;
  total: number;
  signed: number;
  waived: number;
  pending: number;
};

export default function DocumentsClient({
  tenantSlug,
  initialFolders,
  initialDocs,
}: {
  tenantSlug: string;
  initialFolders: FolderNode[];
  initialDocs: DocRow[];
}) {
  const router = useRouter();

  // --- filter state ---
  const [selectedFolderId, setSelectedFolderId] = useState<
    string | "all" | "unfiled"
  >("all");
  const [search, setSearch] = useState("");

  // --- selection state ---
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // --- modal state ---
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState<{
    parentId: string | null;
  } | null>(null);
  const [editFolder, setEditFolder] = useState<FolderNode | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<FolderNode | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [replaceDoc, setReplaceDoc] = useState<DocRow | null>(null);
  const [docMenuId, setDocMenuId] = useState<string | null>(null);

  // --- derived ---
  const unfiledCount = useMemo(
    () => initialDocs.filter((d) => !d.folderId).length,
    [initialDocs],
  );

  const visibleDocs = useMemo(() => {
    let list = initialDocs;
    if (selectedFolderId === "unfiled") list = list.filter((d) => !d.folderId);
    else if (selectedFolderId !== "all")
      list = list.filter((d) => d.folderId === selectedFolderId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) => d.title.toLowerCase().includes(q));
    }
    return list;
  }, [initialDocs, selectedFolderId, search]);

  // ---- bulk actions ----
  const allVisibleSelected =
    visibleDocs.length > 0 && visibleDocs.every((d) => selected.has(d.id));

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleDocs.forEach((d) => next.delete(d.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleDocs.forEach((d) => next.add(d.id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelected(new Set());

  const bulkAction = async (
    action: "archive" | "setRequired",
    extra?: { required?: boolean },
  ) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action === "archive") {
      if (!confirm(`Archive ${ids.length} document(s)?`)) return;
    }
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action, ...extra }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      clearSelection();
      router.refresh();
    } catch (e: any) {
      alert(`Bulk action failed: ${e.message}`);
    }
  };

  const bulkMoveTo = async (folderId: string | null) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "move", folderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      clearSelection();
      setMoveModalOpen(false);
      router.refresh();
    } catch (e: any) {
      alert(`Move failed: ${e.message}`);
    }
  };

  // ---- folder actions ----
  const createFolder = async (data: {
    name: string;
    parentId: string | null;
    color: string | null;
  }) => {
    const res = await fetch("/api/document-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    setShowNewFolder(null);
    router.refresh();
  };

  const updateFolder = async (
    id: string,
    data: { name?: string; color?: string | null },
  ) => {
    const res = await fetch(`/api/document-folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    setEditFolder(null);
    router.refresh();
  };

  const deleteFolderAction = async (id: string) => {
    const res = await fetch(`/api/document-folders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Delete failed: ${err.error ?? res.status}`);
      return;
    }
    setDeleteFolder(null);
    if (selectedFolderId === id) setSelectedFolderId("all");
    router.refresh();
  };

  // ---- folder name for header ----
  const headerLabel =
    selectedFolderId === "all"
      ? "All documents"
      : selectedFolderId === "unfiled"
        ? "Unfiled"
        : (initialFolders.find((f) => f.id === selectedFolderId)?.name ??
          "Folder");

  return (
    <div>
      <Link
        href={`/${tenantSlug}/dashboard`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload, organize, and track signatures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DocsReindexButton />
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            <Upload className="w-4 h-4" /> Upload document
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <FolderSidebar
          folders={initialFolders}
          selectedId={selectedFolderId}
          onSelect={setSelectedFolderId}
          onNewFolder={(parentId) => setShowNewFolder({ parentId })}
          onEditFolder={(f) => setEditFolder(f)}
          onDeleteFolder={(f) => setDeleteFolder(f)}
          totalDocs={initialDocs.length}
          unfiledCount={unfiledCount}
        />

        <section className="flex-1 min-w-0">
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-slate-800 text-lg flex-1 min-w-0 truncate">
                {headerLabel}
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {visibleDocs.length} doc{visibleDocs.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search docs…"
                  className="pl-8 pr-3 py-1.5 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-emerald-500 focus:outline-none w-56"
                />
              </div>
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-3 text-sm flex-wrap">
                <span className="font-medium text-emerald-900">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => setMoveModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white ring-1 ring-emerald-200 text-emerald-800 hover:bg-emerald-100"
                >
                  <FolderInput className="w-3.5 h-3.5" /> Move to folder
                </button>
                <button
                  type="button"
                  onClick={() => bulkAction("setRequired", { required: true })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white ring-1 ring-emerald-200 text-emerald-800 hover:bg-emerald-100"
                >
                  <Star className="w-3.5 h-3.5" /> Mark required
                </button>
                <button
                  type="button"
                  onClick={() => bulkAction("setRequired", { required: false })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white ring-1 ring-emerald-200 text-emerald-800 hover:bg-emerald-100"
                >
                  <StarOff className="w-3.5 h-3.5" /> Mark optional
                </button>
                <button
                  type="button"
                  onClick={() => bulkAction("archive")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white ring-1 ring-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  <ArchiveX className="w-3.5 h-3.5" /> Archive
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
            )}

            {/* Doc list */}
            {visibleDocs.length === 0 ? (
              <div className="px-6 py-16 text-center text-slate-500">
                {search.trim()
                  ? `No documents match "${search}".`
                  : selectedFolderId === "unfiled"
                    ? "No unfiled documents."
                    : "No documents in this folder yet."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                <li className="px-4 py-2 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    aria-label={
                      allVisibleSelected ? "Deselect all" : "Select all"
                    }
                  >
                    {allVisibleSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <span className="flex-1">Document</span>
                  <span className="w-28 text-right hidden sm:inline">
                    Sigs
                  </span>
                  <span className="w-28 text-right hidden md:inline">
                    Uploaded
                  </span>
                  <span className="w-10" />
                </li>
                {visibleDocs.map((d) => (
                  <li
                    key={d.id}
                    className={`px-4 py-3 flex items-center gap-3 group ${
                      selected.has(d.id) ? "bg-emerald-50/50" : "hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelected(d.id)}
                      aria-label={selected.has(d.id) ? "Deselect" : "Select"}
                    >
                      {selected.has(d.id) ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/${tenantSlug}/documents/${d.id}`}
                        className="font-medium text-slate-900 hover:text-emerald-700 truncate block"
                      >
                        {d.title}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        {d.version > 1 && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                            v{d.version}
                          </span>
                        )}
                        {d.required && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                            Required
                          </span>
                        )}
                        {d.folderName && selectedFolderId === "all" && (
                          <span
                            className="px-1.5 py-0.5 rounded text-white font-medium"
                            style={{
                              backgroundColor: d.folderColor ?? "#64748b",
                            }}
                          >
                            {d.folderName}
                          </span>
                        )}
                        <span className="truncate">{d.fileName}</span>
                      </div>
                    </div>
                    <div className="w-28 text-right text-xs hidden sm:block">
                      <span className="font-medium text-slate-900">
                        {d.signed}/{d.total}
                      </span>
                      {d.pending > 0 && (
                        <span className="text-amber-600 ml-1">
                          ({d.pending} pending)
                        </span>
                      )}
                    </div>
                    <div className="w-28 text-right text-xs text-slate-500 hidden md:block">
                      {format(new Date(d.createdAt), "MMM d, yyyy")}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setDocMenuId(docMenuId === d.id ? null : d.id)
                        }
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        aria-label="Document actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {docMenuId === d.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => setDocMenuId(null)}
                            className="fixed inset-0 z-30 cursor-default"
                            aria-label="Close menu"
                          />
                          <div className="absolute right-0 top-7 z-40 w-48 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 py-1 text-sm">
                            <a
                              href={d.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Open PDF
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                setDocMenuId(null);
                                setReplaceDoc(d);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                            >
                              Replace with new version
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDocMenuId(null);
                                setSelected(new Set([d.id]));
                                setMoveModalOpen(true);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                            >
                              Move to folder
                            </button>
                            <div className="my-1 border-t border-slate-100" />
                            <button
                              type="button"
                              onClick={() => {
                                setDocMenuId(null);
                                setSelected(new Set([d.id]));
                                bulkAction("archive");
                              }}
                              className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50"
                            >
                              Archive
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ---------------- Modals ---------------- */}

      {showUpload && (
        <Modal onClose={() => setShowUpload(false)} title="Upload document">
          <DocumentUploadForm />
          <p className="mt-3 text-xs text-slate-500">
            After upload, refresh to see the new document.
          </p>
        </Modal>
      )}

      {showNewFolder && (
        <FolderFormModal
          title="New folder"
          parentId={showNewFolder.parentId}
          onClose={() => setShowNewFolder(null)}
          onSubmit={(data) => createFolder(data)}
        />
      )}

      {editFolder && (
        <FolderFormModal
          title="Rename folder"
          initial={editFolder}
          parentId={editFolder.parentId}
          onClose={() => setEditFolder(null)}
          onSubmit={(data) =>
            updateFolder(editFolder.id, { name: data.name, color: data.color })
          }
        />
      )}

      {deleteFolder && (
        <Modal
          onClose={() => setDeleteFolder(null)}
          title={`Delete "${deleteFolder.name}"?`}
        >
          <p className="text-sm text-slate-600">
            Documents inside become <strong>unfiled</strong>, not deleted.
            Child folders are also deleted.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteFolder(null)}
              className="px-3 py-1.5 text-sm rounded ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => deleteFolderAction(deleteFolder.id)}
              className="px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete folder
            </button>
          </div>
        </Modal>
      )}

      {moveModalOpen && (
        <MoveToFolderModal
          folders={initialFolders}
          onClose={() => setMoveModalOpen(false)}
          onPick={(id) => bulkMoveTo(id)}
        />
      )}

      {replaceDoc && (
        <ReplaceDocModal
          doc={replaceDoc}
          onClose={() => setReplaceDoc(null)}
          onDone={() => {
            setReplaceDoc(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* =================== shared modal shell =================== */

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =================== folder form (new + edit) =================== */

function FolderFormModal({
  title,
  parentId,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  parentId: string | null;
  initial?: { name: string; color: string | null };
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    parentId: string | null;
    color: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        name: name.trim(),
        parentId,
        color: color.trim() || null,
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const presets = [
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#64748b",
  ];

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-1.5 rounded-lg ring-1 ring-slate-200 focus:ring-emerald-500 focus:outline-none"
            placeholder="e.g. Onboarding"
            maxLength={80}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">
            Color (optional)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#10b981"
              className="px-3 py-1.5 rounded-lg ring-1 ring-slate-200 focus:ring-emerald-500 focus:outline-none w-32 text-sm font-mono"
              pattern="^#[0-9a-fA-F]{6}$"
            />
            <div className="flex gap-1.5">
              {presets.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded ring-2 transition ${
                    color.toLowerCase() === c
                      ? "ring-slate-900"
                      : "ring-transparent hover:ring-slate-300"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Pick ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 inline-flex items-center gap-1"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* =================== move-to-folder picker =================== */

function MoveToFolderModal({
  folders,
  onClose,
  onPick,
}: {
  folders: FolderNode[];
  onClose: () => void;
  onPick: (id: string | null) => void;
}) {
  return (
    <Modal onClose={onClose} title="Move to folder">
      <div className="max-h-80 overflow-auto -mx-2">
        <button
          type="button"
          onClick={() => onPick(null)}
          className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-sm"
        >
          📂 Unfiled (root)
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick(f.id)}
            className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-sm flex items-center gap-2"
          >
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: f.color ?? "#cbd5e1" }}
            />
            {f.name}
            <span className="text-xs text-slate-400 ml-auto">
              {f.documentCount}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* =================== replace doc (new version) =================== */

function ReplaceDocModal({
  doc,
  onClose,
  onDone,
}: {
  doc: DocRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("Pick a file");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/documents/${doc.id}/replace`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Replace "${doc.title}"`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-600">
          Uploads a new PDF as version <strong>{doc.version + 1}</strong> of this
          document. Already-signed signatures stay tied to the old version for
          the audit trail. Pending signatures move to the new version.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
        />
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 inline-flex items-center gap-1"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Upload new version
          </button>
        </div>
      </form>
    </Modal>
  );
}
