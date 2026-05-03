/**
 * v12.1: TENANT-SCOPED clock-in/out API.
 * Uses session.user.tenantId; staff users always belong to their tenant.
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

  const geo = checkGeofence(lat, lng);
  if (!geo.ok) {
    return NextResponse.json({ error: geo.reason }, { status: 403 });
  }

  if (action === "in") {
    const open = await prisma.clockEntry.findFirst({
      where: { userId, tenantId, clockOut: null },
    });
    if (open) {
      return NextResponse.json({ error: "You already have an open shift. Clock out first." }, { status: 409 });
    }
    const entry = await prisma.clockEntry.create({
      data: {
        userId,
        tenantId,
        clockIn: new Date(),
        selfieIn: selfie,
        latIn: lat,
        lngIn: lng,
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
    const entry = await prisma.clockEntry.update({
      where: { id: open.id },
      data: {
        clockOut: new Date(),
        selfieOut: selfie,
        latOut: lat,
        lngOut: lng,
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
