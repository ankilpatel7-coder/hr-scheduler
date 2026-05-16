"use client";

/**
 * Admin button: re-extract text from ALL documents for AI Q&A.
 * Drops into the /documents admin page.
 */

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function DocsReindexButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function reindex() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ai/docs-reindex?force=true", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Reindex failed");
      const failed = j.failed > 0 ? ` · ${j.failed} failed` : "";
      const errors = j.errors?.length > 0 ? `\nErrors: ${j.errors.join("; ")}` : "";
      setMsg({
        kind: j.failed > 0 ? "err" : "ok",
        text: `Indexed ${j.indexed} / ${j.total} document${j.total === 1 ? "" : "s"}${failed}${errors}`,
      });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={reindex}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded text-white disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          boxShadow: "0 2px 6px -1px rgba(99, 102, 241, 0.4)",
        }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {busy ? "Indexing…" : "Re-index for AI"}
      </button>
      {msg && (
        <div
          className={`flex items-start gap-2 text-xs rounded px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          <span className="whitespace-pre-wrap">{msg.text}</span>
        </div>
      )}
    </div>
  );
}
