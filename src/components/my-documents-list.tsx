"use client";

/**
 * Employee's documents list — pending (sign now) + completed (preview only).
 *
 * Clicking a pending row opens the DocumentSignModal (PDF preview + signature).
 * Clicking a completed row opens the signed PDF in a new tab.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import DocumentSignModal from "./document-sign-modal";

type Pending = {
  id: string;
  documentId: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  required: boolean;
};

type Completed = {
  id: string;
  documentId: string;
  title: string;
  fileName: string;
  status: "SIGNED" | "WAIVED";
  signedAt: string | null;
  signedFileUrl: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
};

export default function MyDocumentsList({
  pending,
  completed,
}: {
  pending: Pending[];
  completed: Completed[];
}) {
  const router = useRouter();
  const [signing, setSigning] = useState<Pending | null>(null);

  return (
    <div className="space-y-6">
      {pending.length > 0 ? (
        <section>
          <h2 className="display text-xl text-ink mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-amber-600" />
            Awaiting your signature ({pending.length})
          </h2>
          <div className="card divide-y divide-ink/5">
            {pending.map((p) => (
              <button
                key={p.id}
                onClick={() => setSigning(p)}
                className="w-full text-left p-4 hover:bg-ink/[0.02] flex items-center gap-3"
              >
                <FileText size={20} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{p.title}</div>
                  {p.description && (
                    <div className="text-xs text-smoke mt-0.5 line-clamp-1">
                      {p.description}
                    </div>
                  )}
                  {p.required && (
                    <span
                      className="mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                      style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626" }}
                    >
                      Required for clock-in
                    </span>
                  )}
                </div>
                <span className="btn btn-rust text-xs shrink-0">Sign now</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="card p-6 text-center">
          <CheckCircle2 size={28} className="text-green-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink">You&rsquo;re all caught up!</p>
          <p className="text-xs text-smoke mt-1">No documents awaiting your signature.</p>
        </div>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="display text-xl text-ink mb-3">Completed ({completed.length})</h2>
          <div className="card divide-y divide-ink/5">
            {completed.map((c) => (
              <div key={c.id} className="p-4 flex items-center gap-3">
                <CheckCircle2
                  size={18}
                  className={c.status === "SIGNED" ? "text-green-600 shrink-0" : "text-smoke shrink-0"}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink">{c.title}</div>
                  <div className="text-[11px] text-smoke mt-0.5">
                    {c.status === "SIGNED" ? `Signed ${c.signedAt}` : `Waived ${c.waivedAt}${c.waiveReason ? ` — ${c.waiveReason}` : ""}`}
                  </div>
                </div>
                {c.signedFileUrl && (
                  <a
                    href={c.signedFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-rust hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    View signed copy <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {signing && (
        <DocumentSignModal
          document={signing}
          onClose={() => setSigning(null)}
          onSigned={() => {
            setSigning(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
