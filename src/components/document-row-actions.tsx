"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";

export default function DocumentRowActions({
  documentId,
  fileUrl,
}: {
  documentId: string;
  fileUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!window.confirm("Archive this document? Existing signatures stay; new clock-ins won't be blocked by it.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Delete failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 text-smoke hover:text-ink rounded"
        title="Open original PDF"
      >
        <ExternalLink size={13} />
      </a>
      <button
        onClick={del}
        disabled={busy}
        className="p-1.5 text-smoke hover:text-red-600 rounded disabled:opacity-50"
        title="Archive document"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
