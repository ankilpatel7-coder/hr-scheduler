import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, getScopedEmployeeIds } from "@/lib/guards";
import { haversineMeters } from "@/lib/utils";

/**
 * GET /api/clock-entries/[id]/selfie
 * Returns the in/out selfies (base64 data URLs) plus lat/lng coords and
 * pre-computed distance-from-worksite (meters) for verification.
 *
 * Auth: ADMIN, MANAGER (within their location scope), or the entry's owner.
 * Returned as a separate endpoint so the timesheets list query stays light —
 * selfies are large base64 strings and only need to be fetched on click.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const entry = await prisma.clockEntry.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      userId: true,
      clockIn: true,
      clockOut: true,
      selfieIn: true,
      selfieOut: true,
      latIn: true,
      lngIn: true,
      latOut: true,
      lngOut: true,
    },
  });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Permission: own entry, or ADMIN, or MANAGER within their scope
  const isOwn = entry.userId === auth.userId;
  if (!isOwn && auth.role !== "ADMIN") {
    if (auth.role === "MANAGER") {
      const scoped = await getScopedEmployeeIds(auth.userId, "MANAGER");
      if (!scoped || !scoped.includes(entry.userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // LEAD/EMPLOYEE viewing someone else
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Compute distance from configured worksite (if set in env), in meters.
  // The clock route uses these same env vars for geofencing.
  const wLat = process.env.WORKSITE_LAT
    ? parseFloat(process.env.WORKSITE_LAT)
    : null;
  const wLng = process.env.WORKSITE_LNG
    ? parseFloat(process.env.WORKSITE_LNG)
    : null;
  const worksiteSet =
    wLat !== null && wLng !== null && !isNaN(wLat) && !isNaN(wLng);

  function distanceFor(lat: number | null, lng: number | null): number | null {
    if (!worksiteSet || lat === null || lng === null) return null;
    return Math.round(haversineMeters(wLat!, wLng!, lat, lng));
  }

  return NextResponse.json({
    id: entry.id,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    selfieIn: entry.selfieIn,
    selfieOut: entry.selfieOut,
    locationIn: {
      lat: entry.latIn,
      lng: entry.lngIn,
      distanceMeters: distanceFor(entry.latIn, entry.lngIn),
    },
    locationOut: {
      lat: entry.latOut,
      lng: entry.lngOut,
      distanceMeters: distanceFor(entry.latOut, entry.lngOut),
    },
    worksiteConfigured: worksiteSet,
  });
}
