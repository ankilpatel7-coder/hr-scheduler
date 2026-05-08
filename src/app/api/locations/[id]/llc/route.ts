/**
 * LLC / payroll-issuer info per location.
 * GET/PATCH the legal name, address, EIN, etc. for a single location.
 * Used by paystub generation to print the correct payer info.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { geocodeAddress } from "@/lib/forward-geocode";
import { isValidTimezone } from "@/lib/timezones";

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT",
  "NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

const llcSchema = z.object({
  legalName: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  locState: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  federalEIN: z.string().nullable().optional(),
  stateTaxId: z.string().nullable().optional(),
  geofenceRadiusMeters: z.number().int().min(50).max(50_000).optional(),
  timezone: z.string().optional(),
});

const ADDRESS_FIELDS = ["addressLine1", "city", "locState", "zip"] as const;
function addressChanged(prev: any, next: any) {
  return ADDRESS_FIELDS.some((f) => f in next && (next[f] ?? null) !== (prev[f] ?? null));
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
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

  return NextResponse.json({ location });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireRole(["ADMIN"]);
  if ("error" in auth) return auth.error;
  if (auth.isSuperAdmin || !auth.tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = llcSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const location = await prisma.location.findUnique({ where: { id: params.id } });
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (location.tenantId !== auth.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: any = {};
  for (const k of ["legalName", "addressLine1", "addressLine2", "city", "zip", "phone", "stateTaxId"] as const) {
    if (k in parsed.data) data[k] = (parsed.data as any)[k]?.trim() || null;
  }
  if ("locState" in parsed.data) {
    const v = parsed.data.locState ? String(parsed.data.locState).toUpperCase() : null;
    if (v && !VALID_STATES.has(v)) {
      return NextResponse.json({ error: "Invalid state code" }, { status: 400 });
    }
    data.locState = v;
  }
  if ("federalEIN" in parsed.data) {
    data.federalEIN = parsed.data.federalEIN ? String(parsed.data.federalEIN).replace(/\D/g, "") : null;
    if (data.federalEIN && data.federalEIN.length !== 9) {
      return NextResponse.json({ error: "Federal EIN must be 9 digits" }, { status: 400 });
    }
  }
  if ("geofenceRadiusMeters" in parsed.data && parsed.data.geofenceRadiusMeters != null) {
    data.geofenceRadiusMeters = parsed.data.geofenceRadiusMeters;
  }
  if ("timezone" in parsed.data && parsed.data.timezone) {
    if (!isValidTimezone(parsed.data.timezone)) {
      return NextResponse.json({ error: `Invalid timezone '${parsed.data.timezone}'.` }, { status: 400 });
    }
    data.timezone = parsed.data.timezone;
  }

  // Detect whether the address changed; if so, re-geocode after the update.
  // We do the update first so the new fields are written even if geocoding
  // fails or times out. Geocoding errors are non-fatal — lat/lng just stays
  // null and geofencing falls back to "unknown" for that location.
  const willChangeAddress = addressChanged(location, data);
  const updated = await prisma.location.update({ where: { id: params.id }, data });

  let geocoded = updated;
  if (willChangeAddress) {
    const result = await geocodeAddress({
      address: updated.address,
      addressLine1: updated.addressLine1,
      city: updated.city,
      state: updated.locState,
      zip: updated.zip,
    });
    if (result) {
      geocoded = await prisma.location.update({
        where: { id: params.id },
        data: { lat: result.lat, lng: result.lng },
      });
    }
  }

  return NextResponse.json({ location: geocoded });
}
