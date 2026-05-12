"use client";

/**
 * Admin upload form for documents. PDF only, max 10MB.
 */

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";

export default function DocumentUploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

    setBusy(true);
    setMsg(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    fd.append("required", String(required));

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
    <form onSubmit={submit} className="card p-5 space-y-3">
      <h2 className="display text-xl text-ink mb-1">Upload new document</h2>
      <p className="text-xs text-smoke mb-3">
        PDF only, up to 10MB. Will be assigned to all active employees.
      </p>

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

      <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
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
        disabled={busy}
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
