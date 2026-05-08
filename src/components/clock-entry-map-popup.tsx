"use client";

/**
 * Modal showing the clock-in (or clock-out) location of a single ClockEntry,
 * with embedded OpenStreetMap, the store address for context, and the
 * "At location / Outside · X mi" status pill.
 *
 * Toggle in the header flips between the IN view and OUT view (when both
 * exist).
 *
 * Usage:
 *   const [open, setOpen] = useState<{ entry: any; which: "in" | "out" } | null>(null);
 *   {open && <ClockEntryMapPopup entry={open.entry} initial={open.which} onClose={() => setOpen(null)} />}
 */

import { X, ExternalLink, MapPin, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

type GeoSide = {
  closestLocation: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    geofenceRadiusMeters: number;
  } | null;
  distanceMeters: number | null;
  distanceMiles: number | null;
  isInside: boolean | null;
};

type Entry = {
  id: string;
  clockIn: string;
  clockOut: string | null;
  latIn: number | null;
  lngIn: number | null;
  latOut: number | null;
  lngOut: number | null;
  addressIn: string | null;
  addressOut: string | null;
  user: { name: string };
  geofence?: { in: GeoSide; out: GeoSide };
};

export default function ClockEntryMapPopup({
  entry,
  initial,
  onClose,
}: {
  entry: Entry;
  initial: "in" | "out";
  onClose: () => void;
}) {
  const [side, setSide] = useState<"in" | "out">(initial);
  const hasOut = !!entry.clockOut && entry.latOut != null && entry.lngOut != null;

  const lat = side === "in" ? entry.latIn : entry.latOut;
  const lng = side === "in" ? entry.lngIn : entry.lngOut;
  const address = side === "in" ? entry.addressIn : entry.addressOut;
  const ts = side === "in" ? entry.clockIn : entry.clockOut!;
  const geo = side === "in" ? entry.geofence?.in : entry.geofence?.out;

  if (lat == null || lng == null) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      >
        <div
          className="bg-paper rounded-2xl p-6 max-w-md text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm text-smoke italic">
            No coordinates were captured for this clock-{side}.
          </div>
          <button onClick={onClose} className="btn btn-secondary mt-4">
            Close
          </button>
        </div>
      </div>
    );
  }

  // Build the OSM embed URL — small bbox around the point so the pin is centered
  const delta = 0.01; // ~ 1km, gives a comfortable zoom for street view
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const externalUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`;
  const googleUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  const status = geo?.isInside;
  const distMi = geo?.distanceMiles ?? null;
  const storeName = geo?.closestLocation?.name ?? "Store";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-2xl overflow-hidden w-full max-w-lg"
        style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-dust flex items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow mb-1">
              Clock-{side} location
            </div>
            <div className="display text-xl text-ink">
              {entry.user.name} · {format(new Date(ts), "EEE, MMM d")}
            </div>
            <div className="text-xs text-smoke font-mono mt-0.5">
              {format(new Date(ts), "h:mm:ss a 'ET'")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasOut && (
              <div className="inline-flex border border-dust rounded-full overflow-hidden text-[11px]">
                <button
                  onClick={() => setSide("in")}
                  className={`px-3 py-1 ${side === "in" ? "bg-ink text-white" : "bg-paper text-smoke"}`}
                >
                  In
                </button>
                <button
                  onClick={() => setSide("out")}
                  className={`px-3 py-1 ${side === "out" ? "bg-ink text-white" : "bg-paper text-smoke"}`}
                >
                  Out
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-ink/5 text-smoke hover:bg-ink/10 flex items-center justify-center"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Map */}
        <iframe
          src={mapSrc}
          width="100%"
          height="240"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, display: "block" }}
          title={`Map of clock-${side} location`}
        />

        {/* Status banner */}
        {geo && status != null && (
          <div
            className="px-5 py-3 flex items-center gap-3 border-b border-dust"
            style={{
              background: status ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)",
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                color: status ? "#059669" : "#92400e",
                background: status ? "rgba(16,185,129,0.14)" : "rgba(245,158,11,0.18)",
              }}
            >
              {status ? (
                <>
                  <MapPin size={12} /> At location
                </>
              ) : (
                <>
                  <AlertTriangle size={12} /> Outside location
                </>
              )}
            </span>
            <span className="text-xs font-mono" style={{ color: status ? "#059669" : "#92400e" }}>
              {distMi != null ? `${distMi.toFixed(2)} mi from ${storeName}` : ""}
            </span>
          </div>
        )}

        {/* Addresses */}
        <div className="px-5 py-4">
          <div>
            <div className="label-eyebrow mb-1">Clock-{side} address</div>
            <div className="text-sm text-ink leading-snug">
              {address ?? <span className="text-smoke italic">Reverse-geocode unavailable</span>}
            </div>
            <div className="text-[11px] text-smoke font-mono mt-1.5">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </div>
          </div>

          {/* Action links */}
          <div className="flex gap-2 mt-4 pt-3 border-t border-dust">
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-9 rounded-lg border border-dust text-sm font-medium inline-flex items-center justify-center gap-1.5 text-ink hover:bg-ink/5"
            >
              <ExternalLink size={13} /> Google Maps
            </a>
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-9 rounded-lg border border-dust text-sm font-medium inline-flex items-center justify-center gap-1.5 text-ink hover:bg-ink/5"
            >
              <ExternalLink size={13} /> OpenStreetMap
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
