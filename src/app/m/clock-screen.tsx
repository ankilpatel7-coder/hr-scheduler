"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Camera, Check, AlertTriangle, RefreshCw, LogOut } from "lucide-react";

export default function MobileClockScreen({
  employeeName,
  initiallyClockedIn,
  clockedInAt,
}: {
  employeeName: string;
  initiallyClockedIn: boolean;
  clockedInAt: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successAction, setSuccessAction] = useState<"in" | "out" | null>(null);

  const action: "in" | "out" = initiallyClockedIn ? "out" : "in";
  const isClockOut = action === "out";

  // Start front camera on mount
  useEffect(() => {
    let mounted = true;
    let activeStream: MediaStream | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("Your browser doesn't support camera access. Try Safari or Chrome.");
          return;
        }
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
    return () => {
      mounted = false;
      if (activeStream) activeStream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Get GPS once
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoordsError("Geolocation not supported.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setCoordsError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

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

  async function submit() {
    if (!selfie) { setError("Take a selfie first."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, selfie, lat: coords?.lat, lng: coords?.lng }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setSuccessAction(action);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setTimeout(() => router.refresh(), 2500);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  // Success screen
  if (successAction) {
    const isIn = successAction === "in";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: isIn ? "#10b981" : "#ef4444" }}>
        <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center mb-6">
          <Check size={72} className="text-white" />
        </div>
        <div className="display text-4xl text-white">Clocked {isIn ? "IN" : "OUT"}</div>
        <div className="text-white/80 mt-2">{employeeName}</div>
        <div className="text-sm text-white/70 mt-1 font-mono">
          {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-5 select-none">
      {/* Top: name + sign out */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-smoke">Signed in as</div>
          <div className="font-medium text-ink text-sm">{employeeName}</div>
          {isClockOut && clockedInAt && (
            <div className="text-[11px] text-smoke mt-0.5">
              Clocked in at {new Date(clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>
        <button onClick={() => signOut({ callbackUrl: "/m/login" })} className="text-smoke p-2" aria-label="Sign out">
          <LogOut size={20} />
        </button>
      </div>

      {/* Camera / selfie preview */}
      <div className="mt-4 mx-auto aspect-square w-full max-w-[320px] rounded-2xl overflow-hidden bg-ink/5 relative">
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt="Selfie" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/70 text-white text-xs p-4 text-center">
            <div>
              <AlertTriangle size={24} className="mx-auto mb-2" />
              {cameraError}
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {/* GPS dot */}
      <div className="text-center text-[11px] text-smoke mt-2 font-mono">
        {coords ? `📍 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
          : coordsError ? `⚠ ${coordsError}` : "Getting location…"}
      </div>

      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded mt-3 text-center">{error}</div>}

      {/* Bottom: big colored action button — pushed above iOS home indicator */}
      <div
        className="mt-auto pt-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
      >
        {!selfie ? (
          <button
            onClick={captureSelfie}
            disabled={!!cameraError}
            className="w-full rounded-2xl py-5 text-white text-lg font-medium shadow-lg active:scale-95 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            style={{ background: isClockOut ? "#ef4444" : "#10b981" }}
          >
            <Camera size={24} /> Take selfie
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setSelfie(null)}
              disabled={submitting}
              className="flex-1 rounded-2xl py-5 bg-paper border-2 border-dust text-ink font-medium active:scale-95 transition inline-flex items-center justify-center gap-2"
            >
              <RefreshCw size={20} /> Retake
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="flex-[2] rounded-2xl py-5 text-white text-xl font-bold shadow-lg active:scale-95 transition inline-flex items-center justify-center gap-2"
              style={{ background: isClockOut ? "#ef4444" : "#10b981" }}
            >
              {submitting ? "…" : isClockOut ? "CLOCK OUT" : "CLOCK IN"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
