"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Check, AlertTriangle, RefreshCw } from "lucide-react";

export default function MobileClockForm({
  initiallyClockedIn,
  clockedInAt,
}: {
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
  const [success, setSuccess] = useState<string | null>(null);

  const action = initiallyClockedIn ? "out" : "in";

  // Start front camera
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!mounted) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch (e: any) {
        setCameraError(e?.message ?? "Camera access denied. Enable camera permission in Settings.");
      }
    })();
    return () => {
      mounted = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoordsError("Geolocation not supported on this device.");
      return;
    }
    const id = navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setCoordsError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  function captureSelfie() {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Mirror the image so user sees what they expect
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    const data = c.toDataURL("image/jpeg", 0.7);
    setSelfie(data);
  }

  function retakeSelfie() {
    setSelfie(null);
  }

  async function submit() {
    if (!selfie) { setError("Take a selfie first."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          selfie,
          lat: coords?.lat,
          lng: coords?.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      setSuccess(action === "in" ? "✓ Clocked IN" : "✓ Clocked OUT");
      // Stop camera
      if (stream) stream.getTracks().forEach((t) => t.stop());
      // Bounce back to home after 2 sec
      setTimeout(() => router.push("/m"), 2000);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center mb-6 animate-pulse">
          <Check size={64} className="text-white" />
        </div>
        <div className="display text-3xl text-ink">{success}</div>
        <div className="text-sm text-smoke mt-2">{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-6">
      <Link href="/m" className="text-smoke hover:text-ink text-sm inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Cancel
      </Link>

      <div className="text-center mt-4">
        <h1 className="display text-2xl text-ink">
          Clock {action === "in" ? "IN" : "OUT"}
        </h1>
        {clockedInAt && (
          <div className="text-xs text-smoke mt-1">
            Clocked in at {new Date(clockedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>

      {/* Camera preview / selfie */}
      <div className="mt-6 mx-auto aspect-square w-full max-w-[280px] rounded-2xl overflow-hidden bg-ink/5 relative">
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selfie} alt="Selfie" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/40 text-white text-xs p-4 text-center">
            <div>
              <AlertTriangle size={20} className="mx-auto mb-2" />
              {cameraError}
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {/* GPS status */}
      <div className="text-center text-[11px] text-smoke mt-3 font-mono">
        {coords
          ? `📍 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
          : coordsError
          ? `⚠ ${coordsError}`
          : "Getting location…"}
      </div>

      {error && <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded mt-3 text-center">{error}</div>}

      {/* Action buttons */}
      <div className="mt-auto pt-6">
        {!selfie ? (
          <button
            onClick={captureSelfie}
            disabled={!!cameraError}
            className="w-full btn btn-primary !py-4 !text-base"
          >
            <Camera size={20} /> Take selfie
          </button>
        ) : (
          <div className="flex gap-3">
            <button onClick={retakeSelfie} disabled={submitting} className="btn btn-secondary flex-1 !py-4">
              <RefreshCw size={16} /> Retake
            </button>
            <button onClick={submit} disabled={submitting} className={`flex-1 !py-4 btn ${action === "out" ? "btn-rust" : "btn-primary"}`}>
              {submitting ? "…" : action === "in" ? "Clock IN" : "Clock OUT"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
