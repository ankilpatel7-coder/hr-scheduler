"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import BreakControls from "@/components/break-controls";
import ClockCamera from "@/components/clock-camera";
import PendingDocsBanner from "@/components/pending-docs-banner";
import { MapPin, CheckCircle2, AlertTriangle, RefreshCw, Loader2, FileText } from "lucide-react";

type OpenEntry = {
  id: string;
  clockIn: string;
} | null;

type LocStatus =
  | { state: "idle" }
  | { state: "requesting" }
  | { state: "captured"; lat: number; lng: number; accuracyMeters: number }
  | { state: "denied"; message: string }
  | { state: "error"; message: string };

export default function ClockPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selfie, setSelfie] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenEntry>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedDocs, setBlockedDocs] = useState<Array<{ documentId: string; title: string }>>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [loc, setLoc] = useState<LocStatus>({ state: "idle" });
  const [now, setNow] = useState(new Date());
  const [submitWithoutGps, setSubmitWithoutGps] = useState(false);
  const [readyToClockOut, setReadyToClockOut] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/api/clock")
      .then((r) => r.json())
      .then((d) => {
        setOpen(d.open);
        setLoading(false);
      });
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLoc({ state: "error", message: "Your browser doesn't support geolocation." });
      return;
    }
    setLoc({ state: "requesting" });

    // Two-phase strategy: ask for a fast (low-accuracy / WiFi-only) fix
    // first so we have SOMETHING quickly, then upgrade to a high-accuracy
    // fix in the background. If the user submits before the upgrade lands,
    // the low-accuracy fix is still better than nothing.
    let resolved = false;

    function onSuccess(pos: GeolocationPosition) {
      if (resolved && pos.coords.accuracy > 200) return; // ignore worse upgrade
      resolved = true;
      setLoc({
        state: "captured",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
      });
    }

    function onError(err: GeolocationPositionError) {
      if (resolved) return;
      const isDenied = err.code === err.PERMISSION_DENIED;
      const isTimeout = err.code === err.TIMEOUT;
      if (isDenied) {
        setLoc({
          state: "denied",
          message:
            "Location permission denied. Click the location icon in your browser's address bar to allow, then click Try again.",
        });
      } else if (isTimeout) {
        setLoc({
          state: "error",
          message: "Location lookup timed out. Click Try again, or proceed without GPS.",
        });
      } else {
        setLoc({
          state: "error",
          message: err.message || "Couldn't get location.",
        });
      }
    }

    // Phase 1: fast / network-based fix
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 60_000,
    });

    // Phase 2: high-accuracy upgrade (fires after; replaces if better)
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      // Don't override the user-visible state with errors from the upgrade
      // attempt — phase 1 may have already succeeded.
      () => {},
      {
        enableHighAccuracy: true,
        timeout: 25_000,
        maximumAge: 60_000,
      },
    );
  }, []);

  // Try once on mount. If the browser silently blocks (e.g., insecure context
  // or no recent user gesture), the user can click Try again.
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  async function submit() {
    if (!selfie) return;
    if (loc.state !== "captured" && !submitWithoutGps) {
      setError(
        "We don't have your location yet. Wait a moment, click Try again, or check 'Submit without GPS' below.",
      );
      return;
    }
    setError(null);
    setError(null);
    setBlockedDocs([]);
    setSubmitting(true);
    const body: any = { action: open ? "out" : "in", selfie };
    if (loc.state === "captured") {
      body.lat = loc.lat;
      body.lng = loc.lng;
    }
    const res = await fetch("/api/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      setBlockedDocs(Array.isArray(data.blockedBy) ? data.blockedBy : []);
      return;
    }
    setSuccess(open ? "Clocked out." : "Clocked in.");
    setBlockedDocs([]);
    setSelfie(null);
    setOpen(open ? null : { id: data.entry.id, clockIn: data.entry.clockIn });
    setSubmitWithoutGps(false);
    setReadyToClockOut(false);
    setTimeout(() => setSuccess(null), 3000);
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen"><div className="max-w-3xl mx-auto px-6 py-16 text-center text-smoke">
          Loading…
        </div>
      </div>
    );
  }

  const elapsed = open
    ? Math.floor((now.getTime() - new Date(open.clockIn).getTime()) / 1000)
    : 0;
  const hh = Math.floor(elapsed / 3600);
  const mm = Math.floor((elapsed % 3600) / 60);
  const ss = elapsed % 60;

  return (
    <div className="min-h-screen"><main className="max-w-3xl mx-auto px-6 py-10">
        <PendingDocsBanner />
        
        {blockedDocs.length > 0 && (
          <div
            className="card p-5 mb-6 border-l-4"
            style={{ borderLeftColor: "#d97706", background: "rgba(245,158,11,0.06)" }}
          >
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(245,158,11,0.18)", color: "#d97706" }}
              >
                <FileText size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink">
                  Sign {blockedDocs.length} document{blockedDocs.length === 1 ? "" : "s"} to unlock clock-in
                </div>
                <ul className="text-xs text-smoke mt-1 list-disc pl-4 space-y-0.5">
                  {blockedDocs.map((d) => (
                    <li key={d.documentId}>{d.title}</li>
                  ))}
                </ul>
                <Link
                  href={`/${(typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "")}/my-documents`}
                  className="btn btn-rust inline-flex items-center gap-1.5 mt-3"
                >
                  <FileText size={14} /> Open My Documents →
                </Link>
              </div>
            </div>
          </div>
        )}

<div className="mb-8">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
            {open ? "On the clock" : "Ready to start"}
          </div>
          <h1 className="display text-5xl">{open ? "Clock out" : "Clock in"}</h1>
        </div>

        {open && (
          <div className="card p-6 mb-6 bg-ink text-paper border-ink">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase text-paper/60 mb-2">
                  Elapsed
                </div>
                <div className="display text-5xl font-mono tabular-nums tracking-tight">
                  {String(hh).padStart(2, "0")}:
                  {String(mm).padStart(2, "0")}:
                  {String(ss).padStart(2, "0")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] tracking-[0.3em] uppercase text-paper/60 mb-2">
                  Started
                </div>
                <div className="font-mono text-paper/90 text-sm">
                  {new Date(open.clockIn).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {open && <BreakControls />}

        {open && !readyToClockOut && (
          <div className="mt-6">
            <button
              onClick={() => setReadyToClockOut(true)}
              className="w-full card p-6 text-left hover:border-rust transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
                    When you're done
                  </div>
                  <div className="display text-2xl text-ink">Ready to clock out</div>
                  <div className="text-sm text-smoke mt-1">
                    We'll snap a quick selfie + confirm your location to finish your shift.
                  </div>
                </div>
                <div className="text-rust group-hover:translate-x-1 transition-transform text-2xl">
                  →
                </div>
              </div>
            </button>
          </div>
        )}

        {(!open || readyToClockOut) && (
        <>
        {open && readyToClockOut && (
          <div className="mt-6 mb-2 flex items-center justify-between">
            <div className="text-sm text-smoke">
              Take your clock-out selfie below.
            </div>
            <button
              onClick={() => { setReadyToClockOut(false); setSelfie(null); }}
              className="text-xs text-rust hover:underline"
            >
              ← Back to break controls
            </button>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card p-6">
            <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-3">
              Step 1 · Verify
            </div>
            <h2 className="display text-xl mb-4">Snap a selfie</h2>
            <ClockCamera
              onCapture={setSelfie}
              capturedImage={selfie}
              onRetake={() => setSelfie(null)}
            />
          </div>

          <div className="space-y-6">
            <div
              className="card p-6"
              style={
                loc.state === "denied" || loc.state === "error"
                  ? { borderColor: "rgba(245, 158, 11, 0.45)", background: "rgba(245,158,11,0.05)" }
                  : loc.state === "captured"
                    ? { borderColor: "rgba(16,185,129,0.30)", background: "rgba(16,185,129,0.04)" }
                    : undefined
              }
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] tracking-[0.3em] uppercase text-smoke">
                  Step 2 · Location
                </div>
                {(loc.state === "denied" || loc.state === "error") && (
                  <button
                    onClick={requestLocation}
                    className="btn btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> Try again
                  </button>
                )}
                {loc.state === "captured" && (
                  <button
                    onClick={requestLocation}
                    className="text-xs text-smoke hover:text-ink inline-flex items-center gap-1"
                    title="Refresh location"
                  >
                    <RefreshCw size={12} />
                  </button>
                )}
              </div>

              {loc.state === "idle" && (
                <div className="flex items-center gap-3">
                  <MapPin size={20} className="text-smoke" />
                  <div className="text-sm text-smoke">Preparing…</div>
                </div>
              )}

              {loc.state === "requesting" && (
                <div className="flex items-center gap-3">
                  <Loader2 size={20} className="text-smoke animate-spin" />
                  <div>
                    <div className="text-sm font-medium">Getting your location…</div>
                    <div className="text-xs text-smoke">
                      If your browser asks for permission, click Allow.
                    </div>
                  </div>
                </div>
              )}

              {loc.state === "captured" && (
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} style={{ color: "#10b981" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Location captured</div>
                    <div className="text-xs font-mono text-smoke">
                      {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                      <span className="ml-2 text-[10px]">
                        ±{Math.round(loc.accuracyMeters)}m
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(loc.state === "denied" || loc.state === "error") && (
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} style={{ color: "#d97706" }} className="mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-ink leading-snug">{loc.message}</div>
                </div>
              )}
            </div>

            <div className="card p-6">
              <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-3">
                Step 3 · Submit
              </div>
              <button
                onClick={submit}
                disabled={!selfie || submitting}
                className={`btn w-full ${open ? "btn-rust" : "btn-primary"}`}
              >
                {submitting ? "Submitting…" : open ? "Clock out now" : "Clock in now"}
              </button>

              {(loc.state === "denied" || loc.state === "error") && (
                <label className="flex items-center gap-2 mt-3 text-xs text-smoke cursor-pointer">
                  <input
                    type="checkbox"
                    checked={submitWithoutGps}
                    onChange={(e) => setSubmitWithoutGps(e.target.checked)}
                  />
                  <span>Submit without GPS (entry will be flagged on the timesheet)</span>
                </label>
              )}

              {error && (
                <div className="mt-3 text-sm text-rust bg-rust/10 px-3 py-2 rounded border border-rust/20">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-3 text-sm text-moss bg-moss/10 px-3 py-2 rounded border border-moss/20 flex items-center gap-2">
                  <CheckCircle2 size={14} /> {success}
                </div>
              )}
            </div>
          </div>
        </div>
        </>
        )}
      </main>
    </div>
  );
}
