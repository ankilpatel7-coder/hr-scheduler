/**
 * Manually re-geocode a location's address.
 *
 * POST /api/locations/[id]/geocode
 *
 * Useful when:
 *   - The auto-geocode on save failed (Nominatim was down, address was odd)
 *   - The address didn't change but the existing lat/lng is wrong
 *   - Backfilling locations created before geocoding was wired up
 *
 * Admin-only.
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
    return NextResponse.json(
      {
        error:
          "Couldn't geocode this address. Make sure street, city, state, and ZIP are filled in.",
      },
      { status: 422 },
    );
  }

  const updated = await prisma.location.update({
    where: { id: params.id },
    data: { lat: result.lat, lng: result.lng },
  });

  return NextResponse.json({
    location: updated,
    matched: result.displayName,
  });
}
