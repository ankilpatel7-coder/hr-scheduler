"use client";

/**
 * Document signing modal — PDF preview (iframe) + signature canvas.
 *
 * Uses react-signature-canvas for the drawing area. Submits the drawn
 * signature as a PNG data URL to /api/documents/[id]/sign which merges
 * it into the PDF and persists the signed copy.
 */

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { X, Save, Eraser, AlertCircle } from "lucide-react";

// react-signature-canvas is a client-only lib (uses HTMLCanvasElement).
// next/dynamic with ssr:false avoids server-side import errors.
const SignatureCanvas = dynamic(() => import("react-signature-canvas"), {
  ssr: false,
});

type DocLite = {
  documentId: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
};

export default function DocumentSignModal({
  document,
  onClose,
  onSigned,
}: {
  document: DocLite;
  onClose: () => void;
  onSigned: () => void;
}) {
  const sigRef = useRef<any>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function clear() {
    sigRef.current?.clear();
  }

  async function save() {
    setErr(null);
    if (!acknowledged) {
      setErr("Please confirm you've read the document.");
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty?.()) {
      setErr("Please draw your signature in the box below.");
      return;
    }
    setBusy(true);
    try {
      // Get trimmed canvas — react-signature-canvas v1.x:
      //   getTrimmedCanvas() exists; toDataURL("image/png") on it
      const canvas =
        sigRef.current.getTrimmedCanvas?.() ?? sigRef.current.getCanvas();
      const dataUrl = canvas.toDataURL("image/png");

      const res = await fetch(`/api/documents/${document.documentId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureImage: dataUrl }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Sign failed");
      onSigned();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-center p-3 md:p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-ink/10 shrink-0">
          <div className="min-w-0">
            <h2 className="display text-xl text-ink truncate">{document.title}</h2>
            {document.description && (
              <p className="text-xs text-smoke mt-0.5 line-clamp-2">{document.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 text-smoke hover:text-ink rounded shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* PDF preview */}
        <div className="flex-1 min-h-0 bg-paper">
          <iframe
            src={document.fileUrl}
            title={document.title}
            className="w-full h-full"
            style={{ minHeight: 380, border: "none" }}
          />
        </div>

        {/* Signature area */}
        <div className="border-t border-ink/10 p-4 shrink-0 space-y-3">
          <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="w-4 h-4"
            />
            I have read and agree to the contents of this document.
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-ink">Draw your signature</label>
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-1 text-xs text-smoke hover:text-ink"
              >
                <Eraser size={12} /> Clear
              </button>
            </div>
            <div
              className="border-2 border-dashed rounded bg-white"
              style={{ borderColor: "#cbd5e1" }}
            >
              {/* Fixed pixel canvas — works on touch + mouse */}
              <SignatureCanvas
                ref={sigRef}
                penColor="#0f172a"
                canvasProps={{
                  width: 800,
                  height: 140,
                  className: "w-full",
                  style: { width: "100%", height: 140, touchAction: "none" },
                }}
              />
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle size={13} />
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded border border-ink/10 hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !acknowledged}
              className="btn btn-rust inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save size={14} /> {busy ? "Saving signature…" : "Sign & save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
