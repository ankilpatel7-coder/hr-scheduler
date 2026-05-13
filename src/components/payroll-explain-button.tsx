"use client";

/**
 * "Explain my pay" button — shows on a paystub page. Opens a modal,
 * streams a friendly explanation from Gemini.
 */

import { useState } from "react";
import { Sparkles, X, Loader2, AlertCircle } from "lucide-react";

export default function PayrollExplainButton({ payStubId }: { payStubId: string }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function fetchExplanation() {
    setLoading(true);
    setErr(null);
    setExplanation(null);
    try {
      const res = await fetch("/api/ai/payroll-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payStubId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI request failed");
      setExplanation(j.explanation);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openAndFetch() {
    setOpen(true);
    if (!explanation && !loading) fetchExplanation();
  }

  return (
    <>
      <button
        type="button"
        onClick={openAndFetch}
        className="btn btn-secondary inline-flex items-center gap-1.5"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
          color: "white",
          borderColor: "transparent",
        }}
      >
        <Sparkles size={14} /> Explain my pay
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-ink/10">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    boxShadow: "0 2px 6px -1px rgba(99, 102, 241, 0.4)",
                  }}
                >
                  <Sparkles size={14} className="text-white" />
                </span>
                <div>
                  <h2 className="display text-lg text-ink">Your paystub, explained</h2>
                  <div className="text-[10px] text-smoke uppercase tracking-wider">
                    AI · Gemini Flash
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-smoke hover:text-ink rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading && (
                <div className="flex items-center gap-2 text-smoke text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Reading your numbers and writing an explanation…
                </div>
              )}
              {err && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium mb-1">Couldn&rsquo;t generate explanation</div>
                    <div className="text-xs">{err}</div>
                    <button
                      onClick={fetchExplanation}
                      className="mt-2 text-xs text-rust hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {explanation && (
                <div
                  className="prose prose-sm max-w-none text-sm leading-relaxed text-ink"
                  dangerouslySetInnerHTML={{ __html: simpleMd(explanation) }}
                />
              )}
            </div>

            <div className="border-t border-ink/10 p-3 text-[10px] text-smoke text-center">
              AI-generated explanation. For official questions about your pay, contact your payroll administrator.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Tiny markdown → HTML converter (just enough for what Gemini outputs)
function simpleMd(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .split(/\n\n+/)
    .map((block) => {
      // Bullet list?
      if (/^[*-]\s/.test(block.trim())) {
        const items = block
          .split(/\n/)
          .filter((l) => l.trim())
          .map((l) => `<li>${l.replace(/^[*-]\s*/, "")}</li>`)
          .join("");
        return `<ul class="list-disc pl-5 space-y-1 my-2">${items}</ul>`;
      }
      // Numbered list?
      if (/^\d+\.\s/.test(block.trim())) {
        const items = block
          .split(/\n/)
          .filter((l) => l.trim())
          .map((l) => `<li>${l.replace(/^\d+\.\s*/, "")}</li>`)
          .join("");
        return `<ol class="list-decimal pl-5 space-y-1 my-2">${items}</ol>`;
      }
      return `<p class="my-2">${block.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}
