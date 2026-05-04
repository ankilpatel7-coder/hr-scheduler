"use client";

import { useEffect, useState } from "react";
import { Share, Plus, X } from "lucide-react";

const INSTALL_DISMISSED_KEY = "shiftwork_install_prompt_dismissed";

/**
 * Install prompt overlay shown on first visit when the page is NOT running
 * in standalone (PWA) mode. Visually instructs iOS users to "Add to Home Screen".
 * On Android, listens for beforeinstallprompt and offers a one-tap install.
 *
 * Once installed, the page opens in standalone mode and this prompt never shows.
 */
export default function InstallPrompt({ tenantSlug, businessName }: { tenantSlug: string; businessName: string }) {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [androidPromptEvent, setAndroidPromptEvent] = useState<any>(null);

  useEffect(() => {
    // Already installed (standalone mode)?
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // User dismissed previously?
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

    // Android: capture the install prompt event
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
  }

  async function androidInstall() {
    if (!androidPromptEvent) return;
    androidPromptEvent.prompt();
    const choice = await androidPromptEvent.userChoice;
    if (choice.outcome === "accepted") setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex flex-col items-center justify-center p-6">
      <div className="bg-paper rounded-2xl max-w-sm w-full p-6 relative">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-smoke hover:text-ink p-1"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-4">
          <div className="inline-block w-16 h-16 rounded-2xl bg-rust flex items-center justify-center mb-3">
            <span className="display text-3xl font-bold text-white">S</span>
          </div>
          <h2 className="display text-xl text-ink">Install {businessName} clock-in</h2>
          <p className="text-xs text-smoke mt-1">
            Add to your home screen so you can clock in with one tap.
          </p>
        </div>

        {platform === "ios" && (
          <ol className="space-y-3 my-6 text-sm text-ink">
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">1</span>
              <div>
                Tap the <span className="inline-flex items-center gap-1 font-medium">Share <Share size={14} className="inline" /></span> button at the bottom of Safari
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">2</span>
              <div>
                Scroll down and tap <span className="inline-flex items-center gap-1 font-medium"><Plus size={14} className="inline" /> &quot;Add to Home Screen&quot;</span>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">3</span>
              <div>
                Tap <span className="font-medium">&quot;Add&quot;</span> in the top-right corner
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">4</span>
              <div>
                Open the new icon from your home screen — done!
              </div>
            </li>
          </ol>
        )}

        {platform === "android" && (
          <div className="my-6">
            {androidPromptEvent ? (
              <button
                onClick={androidInstall}
                className="w-full btn btn-primary !py-3"
              >
                Install app
              </button>
            ) : (
              <ol className="space-y-3 text-sm text-ink">
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">1</span>
                  <div>Tap the menu (⋮) in the top-right of Chrome</div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">2</span>
                  <div>Tap <span className="font-medium">&quot;Install app&quot;</span> or <span className="font-medium">&quot;Add to Home screen&quot;</span></div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-rust text-white text-xs flex items-center justify-center font-bold">3</span>
                  <div>Open the new icon from your home screen</div>
                </li>
              </ol>
            )}
          </div>
        )}

        <button
          onClick={dismiss}
          className="w-full text-xs text-smoke hover:text-ink py-2"
        >
          Skip for now (use in browser)
        </button>
      </div>

      {/* Visual arrow pointing to bottom share button on iOS */}
      {platform === "ios" && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 text-white text-center">
          <div className="text-3xl animate-bounce">↓</div>
          <div className="text-xs">Tap Share to begin</div>
        </div>
      )}
    </div>
  );
}
