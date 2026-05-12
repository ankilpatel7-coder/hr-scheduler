/**
 * v12.3: TENANT-SCOPED clock-in/out API with reverse geocoding.
 * On clock-in/out, lat/lng are reverse-geocoded to a human address via
 * OpenStreetMap Nominatim (free, rate-limited). The address is stored on
 * the clock entry so admins see it without needing to look up coordinates.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getServerAuth } from "@/lib/auth";
import { haversineMeters } from "@/lib/utils";

const schema = z.object({
  action: z.enum(["in", "out"]),
  selfie: z.string().min(20),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

function checkGeofence(lat?: number, lng?: number) {
  const wLat = process.env.WORKSITE_LAT ? parseFloat(process.env.WORKSITE_LAT) : null;
  const wLng = process.env.WORKSITE_LNG ? parseFloat(process.env.WORKSITE_LNG) : null;
  const radius = parseInt(process.env.WORKSITE_RADIUS_METERS ?? "200", 10);
  if (wLat === null || wLng === null || isNaN(wLat) || isNaN(wLng)) return { ok: true };
  if (lat === undefined || lng === undefined) {
    return { ok: false, reason: "Location required for this worksite" };
  }
  const dist = haversineMeters(wLat, wLng, lat, lng);
  if (dist > radius) {
    return { ok: false, reason: `You are ~${Math.round(dist)}m from the worksite` };
  }
  return { ok: true };
}

/**
 * Reverse-geocode lat/lng to a human-readable address.
 * Uses OpenStreetMap Nominatim — free, no API key, rate-limited to 1 req/sec.
 * Returns null on failure (network error, rate limit, etc.) — clock-in still succeeds
 * but address won't be stored.
 *
 * Nominatim usage policy requires a User-Agent identifying the app:
 *   https://operations.osmfoundation.org/policies/nominatim/
 */
async function reverseGeocode(lat?: number, lng?: number): Promise<string | null> {
  if (lat === undefined || lng === undefined) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Shiftwork-HR-Scheduler/1.0 (contact: ankilpatel.business@gmail.com)" },
      // Short timeout — don't block clock-in for slow geocoding
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Prefer concise format: "1900 Murphy Ave Ext, Ferguson, KY 42533, USA"
    const addr = data.address || {};
    const parts = [
      [addr.house_number, addr.road].filter(Boolean).join(" "),
      addr.city || addr.town || addr.village || addr.hamlet,
      addr.state,
      addr.postcode,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  const isSuperAdmin = (session.user as any).superAdmin === true;
  if (isSuperAdmin || !tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { action, selfie, lat, lng } = parsed.data;

  // Look up tenant approval policy — when requireClockApproval=false,
  // clock entries are auto-approved.
  const tenantCfg = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { requireClockApproval: true },
  });
  const autoApprove = tenantCfg?.requireClockApproval === false;
  const approvalFields = autoApprove
    ? {
        approvalStatus: "APPROVED" as const,
        approvedById: userId,
        approvedAt: new Date(),
        approvalNote: "Auto-approved (tenant has approval disabled)",
      }
    : {};

  const geo = checkGeofence(lat, lng);
  if (!geo.ok) {
    return NextResponse.json({ error: geo.reason }, { status: 403 });
  }

  // Reverse-geocode in parallel with DB lookup to save time
  const addressPromise = reverseGeocode(lat, lng);

  if (action === "in") {
    // Gate: block clock-in until every required+active document is signed.
    // Returns 403 with the list so the client can route the user to /my-documents.
    // Note: PENDING document signatures
    const docBlockers = await prisma.documentSignature.findMany({
      where: {
        employeeId: userId,
        status: "PENDING",
        document: { tenantId, active: true, required: true },
      },
      select: { document: { select: { id: true, title: true } } },
    });
    if (docBlockers.length > 0) {
      return NextResponse.json(
        {
          error: `You have ${docBlockers.length} required document${docBlockers.length === 1 ? "" : "s"} to sign before clocking in.`,
          blockedBy: docBlockers.map((b) => ({ documentId: b.document.id, title: b.document.title })),
        },
        { status: 403 },
      );
    }

    const open = await prisma.clockEntry.findFirst({
      where: { userId, tenantId, clockOut: null },
    });
    if (open) {
      return NextResponse.json({ error: "You already have an open shift. Clock out first." }, { status: 409 });
    }
    const address = await addressPromise;
    const entry = await prisma.clockEntry.create({
      data: {
        userId,
        tenantId,
        clockIn: new Date(),
        selfieIn: selfie,
        latIn: lat,
        lngIn: lng,
        addressIn: address,
        ...approvalFields,
      },
    });
    return NextResponse.json({ entry });
  } else {
    const open = await prisma.clockEntry.findFirst({
      where: { userId, tenantId, clockOut: null },
      orderBy: { clockIn: "desc" },
    });
    if (!open) {
      return NextResponse.json({ error: "No open shift to clock out of" }, { status: 404 });
    }
    const address = await addressPromise;
    const entry = await prisma.clockEntry.update({
      where: { id: open.id },
      data: {
        clockOut: new Date(),
        selfieOut: selfie,
        latOut: lat,
        lngOut: lng,
        addressOut: address,
        ...approvalFields,
      },
    });
    return NextResponse.json({ entry });
  }
}

export async function GET() {
  const session = await getServerAuth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) {
    return NextResponse.json({ open: null });
  }
  const open = await prisma.clockEntry.findFirst({
    where: { userId, tenantId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  return NextResponse.json({ open });
}
