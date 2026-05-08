"use client";

import { useEffect, useState } from "react";
import { Share, Plus, X, Download } from "lucide-react";

const INSTALL_DISMISSED_KEY = "shiftwork_install_prompt_dismissed";

const NAVY = "#0B1B33";
const NAVY_MUTED = "#6b7a90";

/**
 * Install hint — slim navy bar at the bottom shown when NOT in standalone PWA
 * mode. Tapping it expands to show install instructions. App stays fully
 * usable behind the bar; once installed (display-mode: standalone) or
 * dismissed for the session, the bar never shows.
 */
export default function InstallPrompt({
  tenantSlug,
  businessName,
}: {
  tenantSlug: string;
  businessName: string;
}) {
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
    try {
      sessionStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {}
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

  // Expanded — sheet rises from bottom with numbered install steps
  if (expanded) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50"
        style={{
          background: "white",
          border: "0.5px solid rgba(11,27,51,0.10)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: "24px 22px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', sans-serif",
          color: NAVY,
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Install {businessName}
            </div>
            <div style={{ fontSize: 12, color: NAVY_MUTED, marginTop: 3 }}>
              One-tap access from your home screen
            </div>
          </div>
          <button
            onClick={() => setExpanded(false)}
            aria-label="Collapse"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: 0,
              background: "rgba(11,27,51,0.05)",
              color: NAVY_MUTED,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              cursor: "pointer",
            }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {platform === "ios" && (
          <div className="flex flex-col gap-3">
            <Step n={1}>
              Tap <Share size={13} className="inline" style={{ verticalAlign: "-2px" }} /> Share at the bottom of Safari
            </Step>
            <Step n={2}>
              Tap <Plus size={13} className="inline" style={{ verticalAlign: "-2px" }} /> &quot;Add to Home Screen&quot;
            </Step>
            <Step n={3}>Tap &quot;Add&quot; — done.</Step>
          </div>
        )}

        {platform === "android" && (
          <>
            {androidPromptEvent ? (
              <button
                onClick={androidInstall}
                style={{
                  width: "100%",
                  marginTop: 4,
                  height: 44,
                  borderRadius: 12,
                  border: 0,
                  background: NAVY,
                  color: "white",
                  fontSize: 14,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <Download size={16} /> Install now
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <Step n={1}>Tap menu (⋮) in Chrome</Step>
                <Step n={2}>Tap &quot;Install app&quot;</Step>
              </div>
            )}
          </>
        )}

        <button
          onClick={dismiss}
          style={{
            width: "100%",
            marginTop: 18,
            height: 36,
            borderRadius: 12,
            border: 0,
            background: "transparent",
            color: NAVY_MUTED,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Don&apos;t install — use in browser
        </button>
      </div>
    );
  }

  // Collapsed — slim navy bar at the bottom
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40"
      style={{
        background: NAVY,
        color: "white",
        padding: "12px 16px",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', sans-serif",
      }}
    >
      <button
        onClick={() => setExpanded(true)}
        style={{
          flex: 1,
          textAlign: "left",
          background: "transparent",
          border: 0,
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "rgba(255,255,255,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Download size={16} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>
            Install {businessName}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            One-tap access from your home screen
          </div>
        </div>
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: 0,
          background: "rgba(255,255,255,0.08)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: NAVY,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.4 }}>{children}</div>
    </div>
  );
}
