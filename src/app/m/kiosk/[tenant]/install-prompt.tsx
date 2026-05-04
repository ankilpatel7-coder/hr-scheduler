"use client";

import { useEffect, useState } from "react";
import { Share, Plus, X, Download } from "lucide-react";

const INSTALL_DISMISSED_KEY = "shiftwork_install_prompt_dismissed";

/**
 * Install hint — small bottom banner (not blocking) shown when NOT in standalone PWA mode.
 * Tapping it expands to show install instructions. App is fully usable without dismissing.
 *
 * Once installed (display-mode: standalone), this never shows.
 */
export default function InstallPrompt({ tenantSlug, businessName }: { tenantSlug: string; businessName: string }) {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [androidPromptEvent, setAndroidPromptEvent] = useState<any>(null);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    try {
      if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return;
    } catch {}

    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) {
      setPlatform("ios");
      setShow(true);
    } else if (/Android/.test(ua)) {
      setPlatform("android");
      setShow(true);
    }

    const handler = (e: any) => {
      e.preventDefault();
      setAndroidPromptEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    try { sessionStorage.setItem(INSTALL_DISMISSED_KEY, "1"); } catch {}
    setShow(false);
    setExpanded(false);
  }

  async function androidInstall() {
    if (!androidPromptEvent) return;
    androidPromptEvent.prompt();
    const choice = await androidPromptEvent.userChoice;
    if (choice.outcome === "accepted") setShow(false);
  }

  if (!show) return null;

  // Expanded view (after user taps the banner) — shows full install instructions
  if (expanded) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 bg-paper border-t border-dust shadow-2xl rounded-t-2xl p-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-medium text-ink text-sm">Install {businessName}</div>
            <div className="text-[11px] text-smoke">One-tap access from your home screen</div>
          </div>
          <button onClick={() => setExpanded(false)} className="text-smoke p-1" aria-label="Collapse">
            <X size={18} />
          </button>
        </div>

        {platform === "ios" && (
          <ol className="space-y-2 text-sm text-ink">
            <li className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-rust text-white text-[11px] flex items-center justify-center font-bold">1</span>
              <div>Tap <Share size={13} className="inline" /> Share at the bottom of Safari</div>
            </li>
            <li className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-rust text-white text-[11px] flex items-center justify-center font-bold">2</span>
              <div>Tap <Plus size={13} className="inline" /> &quot;Add to Home Screen&quot;</div>
            </li>
            <li className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-rust text-white text-[11px] flex items-center justify-center font-bold">3</span>
              <div>Tap &quot;Add&quot; in top-right corner</div>
            </li>
          </ol>
        )}

        {platform === "android" && (
          <>
            {androidPromptEvent ? (
              <button onClick={androidInstall} className="w-full btn btn-primary !py-3">
                <Download size={16} /> Install now
              </button>
            ) : (
              <ol className="space-y-2 text-sm text-ink">
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-rust text-white text-[11px] flex items-center justify-center font-bold">1</span>
                  <div>Tap menu (⋮) in Chrome</div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-rust text-white text-[11px] flex items-center justify-center font-bold">2</span>
                  <div>Tap &quot;Install app&quot;</div>
                </li>
              </ol>
            )}
          </>
        )}

        <button onClick={dismiss} className="w-full text-[11px] text-smoke hover:text-ink py-2 mt-3">
          Don&apos;t install — use in browser
        </button>
      </div>
    );
  }

  // Collapsed bottom banner — small strip, doesn't block the app
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 bg-rust text-white px-4 py-2 flex items-center justify-between shadow-lg"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-sm font-medium flex-1 text-left active:opacity-80"
      >
        <Download size={16} /> Install {businessName} for one-tap access
      </button>
      <button onClick={dismiss} className="text-white/80 hover:text-white p-1" aria-label="Dismiss">
        <X size={18} />
      </button>
    </div>
  );
}
