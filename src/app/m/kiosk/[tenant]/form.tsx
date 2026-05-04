"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Camera, Check, AlertTriangle, RefreshCw, Delete } from "lucide-react";

type Step = "pin" | "camera" | "submitting" | "success";

export default function KioskForm({ tenantSlug, businessName }: { tenantSlug: string; businessName: string }) {
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
        email: "", // not used in kiosk mode
        redirect: false,
      });
      setSigninSubmitting(false);
      if (res?.error) {
        setPinError("PIN not recognized. Try again.");
        setPin("");
        return;
      }
      // Sign-in succeeded. Fetch current user info + clock state to know IN or OUT.
      const me = await fetch("/api/clock", { method: "GET" }).then((r) => r.json()).catch(() => ({}));
      setOpenClockEntryId(me?.open?.id ?? null);

      // Get user name for display
      const sess = await fetch("/api/auth/session").then((r) => r.json()).catch(() => null);
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
        if (!mounted) { s.getTracks().forEach((t) => t.stop()); return; }
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
    if (!selfie) { setClockError("Take a selfie first."); return; }
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
      // After 3 seconds, auto-signout and reset to PIN keypad for next employee
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
  if (step === "success" && successAction) {
    const isIn = successAction === "in";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: isIn ? "#10b981" : "#ef4444" }}>
        <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center mb-6">
          <Check size={72} className="text-white" />
        </div>
        <div className="display text-4xl text-white">Clocked {isIn ? "IN" : "OUT"}</div>
        {signedInName && <div className="text-white/80 mt-2 text-lg">{signedInName}</div>}
        <div className="text-sm text-white/70 mt-1 font-mono">
          {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
        <div className="text-xs text-white/60 mt-6">Returning to PIN entry…</div>
      </div>
    );
  }

  if (step === "pin") {
    const digits = ["1","2","3","4","5","6","7","8","9","","0",""];
    return (
      <div className="min-h-screen flex flex-col items-center justify-between p-6 select-none">
        <div className="w-full max-w-xs mt-12">
          <div className="text-center mb-2">
            <div className="text-xs text-smoke uppercase tracking-[0.2em]">{businessName}</div>
            <h1 className="display text-2xl text-ink mt-2">Enter your 4-digit PIN</h1>
          </div>
          <div className="flex justify-center gap-4 my-8">
            {[0,1,2,3].map((i) => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 ${pin.length > i ? "bg-ink border-ink" : "border-dust"}`} />
            ))}
          </div>
          {pinError && <div className="text-sm text-rose text-center mb-2">{pinError}</div>}
          {signinSubmitting && <div className="text-sm text-smoke text-center">Verifying…</div>}
        </div>

        <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-8">
          {digits.map((d, i) => {
            if (d === "" && i === 9) return <div key={i} />;
            if (d === "" && i === 11) {
              return (
                <button key={i} onClick={backspace} disabled={signinSubmitting}
                  className="aspect-square rounded-full bg-paper border border-dust flex items-center justify-center hover:bg-dust/40 active:bg-dust"
                  aria-label="Delete">
                  <Delete size={22} className="text-smoke" />
                </button>
              );
            }
            return (
              <button key={i} onClick={() => pressDigit(d)} disabled={signinSubmitting || pin.length >= 4}
                className="aspect-square rounded-full bg-paper border border-dust text-2xl font-mono text-ink hover:bg-dust/40 active:bg-dust disabled:opacity-40">
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // step === "camera" or "submitting"
  const action: "in" | "out" = openClockEntryId ? "out" : "in";
  const isClockOut = action === "out";
  return (
    <div className="min-h-screen flex flex-col p-5 select-none">
      <div className="text-center">
        <div className="text-xs text-smoke">Signed in as</div>
        <div className="font-medium text-ink">{signedInName}</div>
      </div>

      <div className="mt-4 mx-auto aspect-square w-full max-w-[320px] rounded-2xl overflow-hidden bg-ink/5 relative">
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt="Selfie" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/70 text-white text-xs p-4 text-center">
            <div><AlertTriangle size={24} className="mx-auto mb-2" />{cameraError}</div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div className="text-center text-[11px] text-smoke mt-2 font-mono">
        {coords ? `📍 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
          : coordsError ? `⚠ ${coordsError}` : "Getting location…"}
      </div>

      {clockError && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded mt-3 text-center">{clockError}</div>}

      <div className="mt-auto pt-4">
        {!selfie ? (
          <button onClick={captureSelfie} disabled={!!cameraError}
            className="w-full rounded-2xl py-5 text-white text-lg font-medium shadow-lg active:scale-95 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            style={{ background: isClockOut ? "#ef4444" : "#10b981" }}>
            <Camera size={24} /> Take selfie
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={() => setSelfie(null)} disabled={step === "submitting"}
              className="flex-1 rounded-2xl py-5 bg-paper border-2 border-dust text-ink font-medium active:scale-95 transition inline-flex items-center justify-center gap-2">
              <RefreshCw size={20} /> Retake
            </button>
            <button onClick={submitClock} disabled={step === "submitting"}
              className="flex-[2] rounded-2xl py-5 text-white text-xl font-bold shadow-lg active:scale-95 transition inline-flex items-center justify-center gap-2"
              style={{ background: isClockOut ? "#ef4444" : "#10b981" }}>
              {step === "submitting" ? "…" : isClockOut ? "CLOCK OUT" : "CLOCK IN"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
