"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Camera, Check, AlertTriangle, RefreshCw, Delete } from "lucide-react";

type Step = "pin" | "camera" | "submitting" | "success";

const NAVY = "#0B1B33";
const NAVY_MUTED = "#6b7a90";

export default function KioskForm({
  tenantSlug,
  businessName,
}: {
  tenantSlug: string;
  businessName: string;
}) {
  const { data: session, status } = useSession();
  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [signinSubmitting, setSigninSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [clockError, setClockError] = useState<string | null>(null);
  const [openClockEntryId, setOpenClockEntryId] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState<string>("");
  const [successAction, setSuccessAction] = useState<"in" | "out" | null>(null);

  // Live clock for footer time display — refreshes every 30s
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Step: pin keypad ──────────────────────────────────────────────────
  function pressDigit(d: string) {
    setPinError(null);
    if (pin.length < 4) {
      const next = pin + d;
      setPin(next);
      if (next.length === 4) trySignin(next);
    }
  }
  function backspace() {
    setPinError(null);
    setPin((p) => p.slice(0, -1));
  }

  async function trySignin(pinValue: string) {
    setSigninSubmitting(true);
    setPinError(null);
    try {
      const res = await signIn("credentials", {
        kioskTenantSlug: tenantSlug,
        password: pinValue,
        email: "",
        redirect: false,
      });
      setSigninSubmitting(false);
      if (res?.error) {
        setPinError("PIN not recognized. Try again.");
        setPin("");
        return;
      }
      const me = await fetch("/api/clock", { method: "GET" })
        .then((r) => r.json())
        .catch(() => ({}));
      setOpenClockEntryId(me?.open?.id ?? null);

      const sess = await fetch("/api/auth/session")
        .then((r) => r.json())
        .catch(() => null);
      setSignedInName(sess?.user?.name ?? "");

      setStep("camera");
    } catch (err: any) {
      setPinError(err?.message ?? "Sign-in failed");
      setPin("");
      setSigninSubmitting(false);
    }
  }

  // ── Step: camera ──────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== "camera") return;
    let mounted = true;
    let activeStream: MediaStream | null = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        activeStream = s;
        if (!mounted) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setCameraError(
          e?.name === "NotAllowedError"
            ? "Camera permission denied. Open Settings → Safari → Camera and allow access."
            : e?.message ?? "Couldn't start camera."
        );
      }
    })();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => setCoordsError(err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }

    return () => {
      mounted = false;
      if (activeStream) activeStream.getTracks().forEach((t) => t.stop());
    };
  }, [step]);

  function captureSelfie() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth || 720;
    c.height = v.videoHeight || 720;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    setSelfie(c.toDataURL("image/jpeg", 0.7));
  }

  async function submitClock() {
    if (!selfie) {
      setClockError("Take a selfie first.");
      return;
    }
    setStep("submitting");
    setClockError(null);
    const action: "in" | "out" = openClockEntryId ? "out" : "in";
    try {
      const res = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, selfie, lat: coords?.lat, lng: coords?.lng }),
      });
      const data = await res.json();
      if (!res.ok) {
        setClockError(data.error ?? `Failed (${res.status})`);
        setStep("camera");
        return;
      }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setSuccessAction(action);
      setStep("success");
      setTimeout(async () => {
        await signOut({ redirect: false });
        setPin("");
        setSelfie(null);
        setCoords(null);
        setCoordsError(null);
        setCameraError(null);
        setOpenClockEntryId(null);
        setSignedInName("");
        setSuccessAction(null);
        setStep("pin");
      }, 3000);
    } catch (err: any) {
      setClockError(err?.message ?? "Network error");
      setStep("camera");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  // Success — keep bold green/red full-bleed (clear feedback)
  if (step === "success" && successAction) {
    const isIn = successAction === "in";
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: isIn ? "#10b981" : "#ef4444" }}
      >
        <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center mb-6">
          <Check size={72} className="text-white" />
        </div>
        <div
          className="text-4xl text-white"
          style={{ fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          Clocked {isIn ? "IN" : "OUT"}
        </div>
        {signedInName && <div className="text-white/80 mt-2 text-lg">{signedInName}</div>}
        <div className="text-sm text-white/70 mt-1 font-mono">
          {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
        <div className="text-xs text-white/60 mt-6">Returning to PIN entry…</div>
      </div>
    );
  }

  // PIN keypad — modern Apple-lock-screen style, navy + white
  if (step === "pin") {
    const timeStr = now
      .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      .toLowerCase();
    return (
      <div
        className="min-h-screen flex flex-col items-center select-none"
        style={{
          background: "white",
          color: NAVY,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', sans-serif",
          paddingTop: "max(env(safe-area-inset-top), 1rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        <div className="flex items-center gap-2 mt-12 mb-12">
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: NAVY,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            S
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em" }}>
            Shiftwork
          </span>
        </div>

        <div
          style={{
            fontSize: 11,
            color: NAVY_MUTED,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 18,
          }}
        >
          {businessName}
        </div>

        <h1
          style={{
            fontSize: 38,
            lineHeight: 1.05,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: NAVY,
            margin: 0,
            textAlign: "center",
          }}
        >
          Welcome back.
        </h1>
        <div
          style={{
            fontSize: 14,
            color: NAVY_MUTED,
            fontWeight: 400,
            marginTop: 10,
          }}
        >
          Enter your 4-digit PIN
        </div>

        <div style={{ display: "flex", gap: 22, padding: "44px 0 50px" }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: pin.length > i ? NAVY : "transparent",
                border: pin.length > i ? "none" : "1.5px solid rgba(11,27,51,0.18)",
              }}
            />
          ))}
        </div>

        {pinError && (
          <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{pinError}</div>
        )}
        {signinSubmitting && (
          <div style={{ color: NAVY_MUTED, fontSize: 13, marginBottom: 12 }}>Verifying…</div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 74px)",
            gap: 20,
            marginBottom: 24,
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => pressDigit(String(n))}
              disabled={signinSubmitting || pin.length >= 4}
              style={{
                width: 74,
                height: 74,
                borderRadius: "50%",
                border: 0,
                background: "rgba(11,27,51,0.05)",
                color: NAVY,
                fontSize: 30,
                fontWeight: 300,
                letterSpacing: "-0.02em",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => pressDigit("0")}
            disabled={signinSubmitting || pin.length >= 4}
            style={{
              width: 74,
              height: 74,
              borderRadius: "50%",
              border: 0,
              background: "rgba(11,27,51,0.05)",
              color: NAVY,
              fontSize: 30,
              fontWeight: 300,
              letterSpacing: "-0.02em",
              cursor: "pointer",
            }}
          >
            0
          </button>
          <button
            onClick={backspace}
            disabled={signinSubmitting}
            aria-label="Delete"
            style={{
              width: 74,
              height: 74,
              borderRadius: "50%",
              border: 0,
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Delete size={22} strokeWidth={1.6} style={{ color: NAVY_MUTED }} />
          </button>
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 20,
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontSize: 11,
            color: NAVY_MUTED,
            fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          }}
        >
          <span>{timeStr}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#34d399",
              }}
            />
            Live
          </span>
        </div>
      </div>
    );
  }

  // step === "camera" or "submitting" — also restyled to navy+white
  const action: "in" | "out" = openClockEntryId ? "out" : "in";
  const isClockOut = action === "out";
  return (
    <div
      className="min-h-screen flex flex-col p-5 select-none"
      style={{
        background: "white",
        color: NAVY,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Inter, 'Segoe UI', sans-serif",
      }}
    >
      <div className="text-center">
        <div
          style={{
            fontSize: 11,
            color: NAVY_MUTED,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Signed in as
        </div>
        <div style={{ fontWeight: 500, color: NAVY, marginTop: 4 }}>{signedInName}</div>
      </div>

      <div
        className="mt-4 mx-auto aspect-square w-full max-w-[320px] rounded-2xl overflow-hidden relative"
        style={{ background: "rgba(11,27,51,0.05)" }}
      >
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt="Selfie" className="w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        )}
        {cameraError && (
          <div
            className="absolute inset-0 flex items-center justify-center text-white text-xs p-4 text-center"
            style={{ background: "rgba(11,27,51,0.85)" }}
          >
            <div>
              <AlertTriangle size={24} className="mx-auto mb-2" />
              {cameraError}
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div
        className="text-center mt-2 font-mono"
        style={{ fontSize: 11, color: NAVY_MUTED }}
      >
        {coords
          ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
          : coordsError
            ? `${coordsError}`
            : "Getting location…"}
      </div>

      {clockError && (
        <div
          className="text-sm px-3 py-2 rounded mt-3 text-center"
          style={{ background: "rgba(220,38,38,0.10)", color: "#dc2626" }}
        >
          {clockError}
        </div>
      )}

      <div
        className="mt-auto pt-4"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
        }}
      >
        {!selfie ? (
          <button
            onClick={captureSelfie}
            disabled={!!cameraError}
            className="w-full rounded-2xl py-5 text-white text-lg shadow-lg active:scale-95 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            style={{ background: isClockOut ? "#ef4444" : "#10b981", fontWeight: 500 }}
          >
            <Camera size={24} /> Take selfie
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setSelfie(null)}
              disabled={step === "submitting"}
              className="flex-1 rounded-2xl py-5 active:scale-95 transition inline-flex items-center justify-center gap-2"
              style={{
                background: "white",
                border: "2px solid rgba(11,27,51,0.12)",
                color: NAVY,
                fontWeight: 500,
              }}
            >
              <RefreshCw size={20} /> Retake
            </button>
            <button
              onClick={submitClock}
              disabled={step === "submitting"}
              className="rounded-2xl py-5 text-white text-xl shadow-lg active:scale-95 transition inline-flex items-center justify-center gap-2"
              style={{
                background: isClockOut ? "#ef4444" : "#10b981",
                flex: 2,
                fontWeight: 700,
              }}
            >
              {step === "submitting" ? "…" : isClockOut ? "CLOCK OUT" : "CLOCK IN"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
