"use client";
import { useEffect, useState } from "react";
import { X, MapPin, Camera } from "lucide-react";
import { format } from "date-fns";

type SelfieData = {
  id: string;
  clockIn: string;
  clockOut: string | null;
  selfieIn: string | null;
  selfieOut: string | null;
  locationIn: {
    lat: number | null;
    lng: number | null;
    distanceMeters: number | null;
  };
  locationOut: {
    lat: number | null;
    lng: number | null;
    distanceMeters: number | null;
  };
  worksiteConfigured: boolean;
};

export default function SelfieVerifyModal({
  entryId,
  employeeName,
  onClose,
}: {
  entryId: string;
  employeeName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<SelfieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clock-entries/${entryId}/selfie`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(d.error ?? `Failed to load (${res.status})`);
            setLoading(false);
          }
          return;
        }
        const d = await res.json();
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to load");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-3xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 btn btn-ghost !p-1.5"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <div className="mb-5">
          <div className="label-eyebrow mb-1">Clock-in verification</div>
          <h2 className="display text-2xl text-ink">{employeeName}</h2>
        </div>

        {loading && (
          <div className="text-smoke text-sm py-8 text-center">Loading…</div>
        )}

        {error && (
          <div className="text-sm text-rose bg-rose/10 px-3 py-2 rounded border border-rose/30">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SelfiePanel
              label="Clock In"
              timestamp={data.clockIn}
              selfie={data.selfieIn}
              lat={data.locationIn.lat}
              lng={data.locationIn.lng}
              distanceMeters={data.locationIn.distanceMeters}
              worksiteConfigured={data.worksiteConfigured}
            />
            <SelfiePanel
              label="Clock Out"
              timestamp={data.clockOut}
              selfie={data.selfieOut}
              lat={data.locationOut.lat}
              lng={data.locationOut.lng}
              distanceMeters={data.locationOut.distanceMeters}
              worksiteConfigured={data.worksiteConfigured}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SelfiePanel({
  label,
  timestamp,
  selfie,
  lat,
  lng,
  distanceMeters,
  worksiteConfigured,
}: {
  label: string;
  timestamp: string | null;
  selfie: string | null;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  worksiteConfigured: boolean;
}) {
  const hasCoords = lat !== null && lng !== null;
  return (
    <div className="border border-dust rounded-lg overflow-hidden bg-paper/30">
      <div className="px-3 py-2 border-b border-dust flex items-baseline justify-between">
        <span className="label-eyebrow">{label}</span>
        {timestamp && (
          <span className="text-xs font-mono text-smoke">
            {format(new Date(timestamp), "MMM d, h:mm a")}
          </span>
        )}
      </div>
      <div className="aspect-square bg-ink/5 flex items-center justify-center relative">
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie}
            alt={`${label} selfie`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-smoke text-xs flex flex-col items-center gap-2">
            <Camera size={24} className="opacity-40" />
            <span>{timestamp ? "No selfie captured" : "Not yet"}</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2.5 text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-smoke">
          <MapPin size={11} />
          {hasCoords ? (
            <span className="font-mono text-ink">
              {lat!.toFixed(5)}, {lng!.toFixed(5)}
            </span>
          ) : (
            <span className="italic">No location captured</span>
          )}
        </div>
        {hasCoords && worksiteConfigured && distanceMeters !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-smoke">Distance from worksite:</span>
            <span
              className={`font-mono font-medium ${
                distanceMeters <= 200
                  ? "text-moss"
                  : distanceMeters <= 500
                  ? "text-amber"
                  : "text-rose"
              }`}
            >
              {distanceMeters < 1000
                ? `${distanceMeters}m`
                : `${(distanceMeters / 1000).toFixed(2)}km`}
            </span>
          </div>
        )}
        {hasCoords && !worksiteConfigured && (
          <div className="text-[11px] text-smoke italic">
            Worksite coords not configured — set WORKSITE_LAT / WORKSITE_LNG env
            vars to enable distance check.
          </div>
        )}
      </div>
    </div>
  );
}
