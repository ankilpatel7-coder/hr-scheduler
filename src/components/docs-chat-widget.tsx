"use client";

/**
 * Floating "Ask AI" chat widget for /my-documents and /documents pages.
 * Calls /api/ai/docs-chat. Cites which docs the answer came from.
 */

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2, AlertCircle, FileText } from "lucide-react";

type Msg = {
  role: "user" | "ai";
  text: string;
  sources?: { documentId: string; title: string }[];
};

export default function DocsChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      text: "Hi! Ask me anything about your company's documents. For example: *What's our PTO policy?* or *How do I request time off?*",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/docs-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI request failed");
      setMessages((m) => [...m, { role: "ai", text: j.answer, sources: j.sources }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "ai", text: `⚠ ${e.message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-white font-medium shadow-2xl hover:scale-105 transition print:hidden"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
            boxShadow: "0 8px 24px -4px rgba(99, 102, 241, 0.5), 0 2px 4px rgba(15, 23, 42, 0.1)",
          }}
          aria-label="Open AI assistant"
        >
          <Sparkles size={16} />
          <span className="text-sm">Ask AI</span>
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-6 right-6 z-40 w-[400px] max-w-[92vw] max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden print:hidden"
          style={{
            background: "white",
            border: "1px solid rgba(15,23,42,0.08)",
            boxShadow: "0 16px 48px -8px rgba(15, 23, 42, 0.25), 0 4px 8px rgba(15, 23, 42, 0.08)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-3 text-white"
            style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} />
              <div>
                <div className="text-sm font-semibold leading-tight">Document Assistant</div>
                <div className="text-[10px] opacity-80 uppercase tracking-wider">AI · Gemini</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white p-1 rounded"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-paper" style={{ minHeight: 240 }}>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "text-white"
                      : "bg-white text-ink border border-ink/[0.06]"
                  }`}
                  style={
                    m.role === "user"
                      ? { background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }
                      : undefined
                  }
                >
                  <div
                    className="leading-snug"
                    dangerouslySetInnerHTML={{ __html: tinyMd(m.text) }}
                  />
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-ink/[0.08] flex flex-wrap gap-1">
                      {m.sources.slice(0, 5).map((s) => (
                        <span
                          key={s.documentId}
                          className="inline-flex items-center gap-1 text-[10px] text-smoke bg-ink/[0.04] px-1.5 py-0.5 rounded"
                          title={s.title}
                        >
                          <FileText size={9} />
                          {s.title.length > 30 ? s.title.slice(0, 30) + "…" : s.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-ink/[0.06] rounded-xl px-3 py-2 text-sm text-smoke inline-flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-ink/[0.06] p-2 flex items-center gap-2 bg-white">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about your documents…"
              disabled={busy}
              className="flex-1 text-sm rounded-lg border border-ink/10 px-3 py-2 bg-white disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="p-2 rounded-lg text-white disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              }}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function tinyMd(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\* (.+)$/gm, "• $1")
    .replace(/\n/g, "<br/>");
}
