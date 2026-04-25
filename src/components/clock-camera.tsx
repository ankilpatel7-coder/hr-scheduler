"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

export default function ClockCamera({
  onCapture,
  capturedImage,
  onRetake,
}: {
  onCapture: (dataUrl: string) => void;
  capturedImage: string | null;
  onRetake: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (capturedImage) {
      stop();
      return;
    }
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedImage]);

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        setReady(true);
        setError(null);
      }
    } catch (e: any) {
      setError(
        e?.name === "NotAllowedError"
          ? "Camera access denied. Enable it in your browser settings."
          : "Couldn't open camera. Try a different device."
      );
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }

  function snap() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror so selfie looks natural
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    onCapture(dataUrl);
  }

  if (capturedImage) {
    return (
      <div className="space-y-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-ink">
          <img
            src={capturedImage}
            alt="Captured selfie"
            className="w-full h-full object-cover"
          />
        </div>
        <button onClick={onRetake} className="btn btn-secondary w-full">
          <RefreshCw size={16} /> Retake
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-ink">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-paper/60 text-sm">
            Starting camera…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-paper text-sm p-6 text-center">
            {error}
          </div>
        )}
      </div>
      <button
        onClick={snap}
        disabled={!ready}
        className="btn btn-primary w-full"
      >
        <Camera size={16} /> Capture Selfie
      </button>
    </div>
  );
}
