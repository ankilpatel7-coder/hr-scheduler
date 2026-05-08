/**
 * Manually re-geocode a location's address.
 *
 * POST /api/locations/[id]/geocode
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { geocodeAddress } from "@/lib/forward-geocode";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const location = await prisma.location.findUnique({ where: { id: params.id } });
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (location.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await geocodeAddress({
    address: location.address,
    addressLine1: location.addressLine1,
    city: location.city,
    state: location.locState,
    zip: location.zip,
  });

  if (!result) {
    const filled = [location.addressLine1, location.city, location.locState, location.zip]
      .filter(Boolean).length;
    if (filled < 4) {
      return NextResponse.json(
        {
          error:
            "Couldn't geocode this address. Make sure street, city, state, and ZIP are all filled in.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error:
          "OpenStreetMap couldn't find this address. Try simplifying — for example, drop 'Ext'/'Suite', use a nearby intersection, or check spelling. Then click Re-geocode again.",
      },
      { status: 422 },
    );
  }

  const updated = await prisma.location.update({
    where: { id: params.id },
    data: { lat: result.lat, lng: result.lng },
  });

  let precisionNote: string | null = null;
  if (result.precision === "city") {
    precisionNote =
      "Matched the city center, not the exact street — geofence will be approximate.";
  } else if (result.precision === "zip") {
    precisionNote =
      "Matched ZIP code center only — geofence will be approximate; consider widening the radius.";
  }

  return NextResponse.json({
    location: updated,
    matched: result.displayName,
    precision: result.precision,
    precisionNote,
  });
}
