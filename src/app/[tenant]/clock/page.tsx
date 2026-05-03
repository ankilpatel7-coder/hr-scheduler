"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/navbar";
import ClockCamera from "@/components/clock-camera";
import { MapPin, CheckCircle2 } from "lucide-react";

type OpenEntry = {
  id: string;
  clockIn: string;
} | null;

export default function ClockPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selfie, setSelfie] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenEntry>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [now, setNow] = useState(new Date());

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

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  async function submit() {
    if (!selfie) return;
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: open ? "out" : "in",
        selfie,
        ...(location ?? {}),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    setSuccess(open ? "Clocked out." : "Clocked in.");
    setSelfie(null);
    setOpen(open ? null : { id: data.entry.id, clockIn: data.entry.clockIn });
    setTimeout(() => setSuccess(null), 3000);
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center text-smoke">
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
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-2">
            {open ? "On the clock" : "Ready to start"}
          </div>
          <h1 className="display text-5xl">
            {open ? "Clock out" : "Clock in"}
          </h1>
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
            <div className="card p-6">
              <div className="text-[10px] tracking-[0.3em] uppercase text-smoke mb-3">
                Step 2 · Location
              </div>
              <div className="flex items-center gap-3">
                <MapPin
                  size={20}
                  className={location ? "text-moss" : "text-smoke"}
                />
                <div className="flex-1">
                  {location ? (
                    <div>
                      <div className="text-sm font-medium">Location captured</div>
                      <div className="text-xs font-mono text-smoke">
                        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-smoke">
                      Optional — allow location if your worksite requires it
                    </div>
                  )}
                </div>
              </div>
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
                {submitting
                  ? "Submitting…"
                  : open
                  ? "Clock out now"
                  : "Clock in now"}
              </button>
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
      </main>
    </div>
  );
}
