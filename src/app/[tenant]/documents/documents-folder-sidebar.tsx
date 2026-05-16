"use client";

/**
 * Folder tree sidebar — nested folders with expand/collapse, kebab menu,
 * and document counts.
 *
 * Selecting "All", "Unfiled", or a specific folder filters the main list.
 * The kebab menu on each folder opens rename / color / delete actions.
 */

import { useState, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Plus,
  Files,
  Archive,
} from "lucide-react";

export type FolderNode = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  documentCount: number;
};

type FolderTreeProps = {
  folders: FolderNode[];
  selectedId: string | "all" | "unfiled";
  onSelect: (id: string | "all" | "unfiled") => void;
  onNewFolder: (parentId: string | null) => void;
  onEditFolder: (folder: FolderNode) => void;
  onDeleteFolder: (folder: FolderNode) => void;
  totalDocs: number;
  unfiledCount: number;
};

type TreeNode = FolderNode & { children: TreeNode[] };

function buildTree(folders: FolderNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  folders.forEach((f) => byId.set(f.id, { ...f, children: [] }));
  const roots: TreeNode[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      a.sortOrder !== b.sortOrder
        ? a.sortOrder - b.sortOrder
        : a.name.localeCompare(b.name),
    );
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export default function FolderSidebar({
  folders,
  selectedId,
  onSelect,
  onNewFolder,
  onEditFolder,
  onDeleteFolder,
  totalDocs,
  unfiledCount,
}: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(folders.map((f) => f.id)),
  );
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="w-full md:w-64 shrink-0">
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Folders
          </h2>
          <button
            type="button"
            onClick={() => onNewFolder(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
            title="New folder"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>

        <nav className="py-2">
          <FolderRow
            label="All documents"
            count={totalDocs}
            icon={<Files className="w-4 h-4" />}
            active={selectedId === "all"}
            onClick={() => onSelect("all")}
            indent={0}
          />
          <FolderRow
            label="Unfiled"
            count={unfiledCount}
            icon={<Archive className="w-4 h-4" />}
            active={selectedId === "unfiled"}
            onClick={() => onSelect("unfiled")}
            indent={0}
          />
          {folders.length > 0 && (
            <div className="my-1 mx-3 border-t border-slate-100" />
          )}
          {tree.map((node) => (
            <TreeBranch
              key={node.id}
              node={node}
              indent={0}
              expanded={expanded}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              selectedId={selectedId}
              onToggle={toggle}
              onSelect={onSelect}
              onNewSub={(pid) => onNewFolder(pid)}
              onEdit={onEditFolder}
              onDelete={onDeleteFolder}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}

function FolderRow({
  label,
  count,
  icon,
  active,
  onClick,
  indent,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  indent: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${
        active
          ? "bg-emerald-50 text-emerald-900 font-medium"
          : "text-slate-700 hover:bg-slate-50"
      }`}
      style={{ paddingLeft: `${12 + indent * 16}px` }}
    >
      <span className="text-slate-400">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums text-slate-400">{count}</span>
    </button>
  );
}

function TreeBranch({
  node,
  indent,
  expanded,
  menuOpenId,
  setMenuOpenId,
  selectedId,
  onToggle,
  onSelect,
  onNewSub,
  onEdit,
  onDelete,
}: {
  node: TreeNode;
  indent: number;
  expanded: Set<string>;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  selectedId: string | "all" | "unfiled";
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onNewSub: (parentId: string) => void;
  onEdit: (folder: FolderNode) => void;
  onDelete: (folder: FolderNode) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const isActive = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 transition ${
          isActive
            ? "bg-emerald-50 text-emerald-900 font-medium"
            : "text-slate-700 hover:bg-slate-50"
        }`}
        style={{ paddingLeft: `${4 + indent * 16}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className="p-1 text-slate-400 hover:text-slate-700"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )
          ) : (
            <span className="inline-block w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex-1 flex items-center gap-2 py-1.5 text-sm text-left min-w-0"
        >
          {node.color ? (
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: node.color }}
              aria-hidden
            />
          ) : isExpanded && hasChildren ? (
            <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          <span className="flex-1 truncate">{node.name}</span>
          <span className="text-xs tabular-nums text-slate-400">
            {node.documentCount}
          </span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenId(menuOpenId === node.id ? null : node.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition"
            aria-label="Folder actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpenId === node.id && (
            <>
              <button
                type="button"
                onClick={() => setMenuOpenId(null)}
                className="fixed inset-0 z-30 cursor-default"
                aria-label="Close menu"
              />
              <div className="absolute right-0 top-7 z-40 w-44 rounded-lg bg-white shadow-lg ring-1 ring-slate-200 py-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    onNewSub(node.id);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                >
                  New subfolder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    onEdit(node);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                >
                  Rename / color
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    onDelete(node);
                  }}
                  className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50"
                >
                  Delete folder
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              indent={indent + 1}
              expanded={expanded}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
              onNewSub={onNewSub}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
